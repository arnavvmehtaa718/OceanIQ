/**
 * OceanIQ — port feasibility engine.
 *
 * `checkPortCompatibility(scenario, vessel)` evaluates physical constraints,
 * cargo handling, congestion and berth availability for a candidate discharge
 * port, and names a better alternative when the port is not usable.
 */

import { clamp, mapRange, riskLevelOf, round1 } from "./shared";
import {
  PORTS,
  congestionLabel,
  getPort,
  projectWaitingTime,
  type PortReference,
} from "@/lib/reference/ports";
import {
  VESSEL_REFERENCE,
  VESSEL_ORDER,
  type VesselClass,
} from "@/lib/reference/corridors";
import { getCargo, type CargoType } from "@/lib/reference/cargo";
import type {
  PortAssessment,
  PortCompatibility,
  PortConstraintCheck,
  ProcurementScenario,
} from "@/lib/types";

/**
 * Placeholder start for the waiting series when no forecast date is threaded in.
 * The pipeline always passes the first forward week from the model's exogenous
 * projection, so this only matters for direct unit calls.
 */
const SERIES_START = "2026-10-02";

export interface PortEvaluationInput {
  port: PortReference;
  vessel: VesselClass;
  cargo: CargoType;
  quantityPerVoyage: number;
  /** Congestion projected at the planned arrival, 0-100. */
  projectedCongestion: number;
  /** ISO date of the first forward week, used to label the waiting series. */
  fromDate?: string;
  /** Number of forward weeks in the waiting series. */
  horizonWeeks?: number;
}

/**
 * Build the forward waiting-time path from the same projection the cost engine
 * charges with, so the chart and the cost line cannot disagree.
 */
function waitingSeries(
  port: PortReference,
  fromDate: string,
  horizonWeeks: number,
): { week: number; date: string; waitingDays: number; congestion: number }[] {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const points: { week: number; date: string; waitingDays: number; congestion: number }[] = [];
  for (let week = 0; week <= horizonWeeks; week++) {
    const d = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const waitingDays = projectWaitingTime(port, week);
    // Congestion implied by the waiting time, through the port's own base.
    const implied =
      port.waitingBase > 0
        ? clamp((waitingDays / port.waitingBase) * port.congestionBase, 0, 100)
        : 0;
    points.push({
      week,
      date: d.toISOString().slice(0, 10),
      waitingDays: round1(waitingDays),
      congestion: Math.round(implied),
    });
  }
  return points;
}

function constraint(
  name: string,
  required: number,
  limit: number,
  unit: string,
  tolerance = 0,
): PortConstraintCheck {
  const margin = round1(limit - required);
  const status: PortConstraintCheck["status"] =
    required <= limit + tolerance ? "Pass" : required <= limit * 1.06 ? "Restricted" : "Fail";
  return { name, required: round1(required), limit: round1(limit), unit, status, margin };
}

export function checkPortCompatibility(input: PortEvaluationInput): PortCompatibility {
  const { port, vessel, cargo, quantityPerVoyage } = input;
  const v = VESSEL_REFERENCE[vessel];
  const c = getCargo(cargo);

  const checks: PortConstraintCheck[] = [
    constraint("Max draft", v.draft, port.maxDraft, "m", 0.15),
    constraint("Length overall", v.loa, port.maxLOA, "m", 3),
    constraint("Beam", v.beam, port.maxBeam, "m", 1),
    constraint(
      "Cargo handling rate",
      quantityPerVoyage / 2.2,
      port.cargoHandlingCapacity,
      "t/day",
    ),
  ];

  // Cargo throughput has to be able to lift the parcel inside a workable
  // window; treat a tight rate as Restricted rather than a hard Fail.
  const handlingDays = quantityPerVoyage / Math.max(1, port.cargoHandlingCapacity * c.handlingFactor);
  const handlingStatus: PortConstraintCheck["status"] =
    handlingDays <= 2.2 ? "Pass" : handlingDays <= 3.4 ? "Restricted" : "Fail";
  checks[3] = {
    name: "Discharge window",
    required: round1(handlingDays),
    limit: 2.2,
    unit: "days",
    status: handlingStatus,
    margin: round1(2.2 - handlingDays),
  };

  const congestion = clamp(input.projectedCongestion, 0, 100);
  const waitingNow = projectWaitingTime(port, 0);
  const waitingProjected = projectWaitingTime(port, 6);

  const constraints: string[] = [];
  const warnings: string[] = [];

  // --- physical constraints -------------------------------------------------
  const draftCheck = checks[0];
  if (draftCheck.status !== "Pass") {
    constraints.push(
      `${v.type} needs ${v.draft}m draft; ${port.name} is limited to ${port.maxDraft}m.`,
    );
  }
  const loaCheck = checks[1];
  if (loaCheck.status !== "Pass") {
    constraints.push(
      `${v.type} is ${v.loa}m LOA; ${port.name} accommodates up to ${port.maxLOA}m.`,
    );
  }
  const beamCheck = checks[2];
  if (beamCheck.status !== "Pass") {
    constraints.push(`${v.type} is ${v.beam}m beam against a ${port.maxBeam}m limit at ${port.name}.`);
  }
  if (handlingStatus !== "Pass") {
    constraints.push(
      `Discharging ${quantityPerVoyage.toLocaleString()} t at ${port.name} takes about ${round1(handlingDays)} days, above the 2.2-day working assumption.`,
    );
  }

  // --- congestion -----------------------------------------------------------
  if (congestion >= 70) {
    warnings.push(
      `Projected berth congestion of ${Math.round(congestion)}% at ${port.name} implies roughly ${round1(waitingProjected)} days of anchorage waiting per call.`,
    );
  } else if (congestion >= 50) {
    warnings.push(
      `Moderate congestion at ${port.name} (${Math.round(congestion)}%); budget about ${round1(waitingProjected)} days of waiting.`,
    );
  }
  if (port.berthsAvailable <= 2) {
    warnings.push(
      `Only ${port.berthsAvailable} of ${port.totalBerths} berths are free in the reference baseline at ${port.name}.`,
    );
  }
  if (checks[0].margin > 0 && checks[0].margin < 0.6) {
    warnings.push(
      `Draft margin is thin (${checks[0].margin}m). Ballast and tidal windows must be planned before berthing.`,
    );
  }
  if (!port.suitableVessels.includes(vessel)) {
    warnings.push(
      `${v.type} is not on the reference suitability list for ${port.name} (${port.suitableVessels.join(", ")}).`,
    );
  }

  // --- score ----------------------------------------------------------------
  const physicalScore =
    checks.reduce((acc, k) => acc + (k.status === "Pass" ? 25 : k.status === "Restricted" ? 11 : 0), 0);
  const congestionScore = 40 * (1 - congestion / 100);
  const berthScore =
    10 * mapRange(port.berthsAvailable, 0, Math.max(1, port.totalBerths - 2), 0, 1);
  const suitabilityScore = port.suitableVessels.includes(vessel) ? 25 : 10;

  const score = Math.round(clamp(physicalScore * 0.55 + congestionScore * 0.7 + berthScore + suitabilityScore, 0, 100));

  const status: PortCompatibility["status"] =
    checks.some((k) => k.status === "Fail")
      ? "Incompatible"
      : checks.some((k) => k.status === "Restricted") || congestion >= 65
        ? "Conditional"
        : "Compatible";

  const berthUtilisationPercent = Math.round(
    clamp(((port.totalBerths - port.berthsAvailable) / port.totalBerths) * 100 + (congestion - port.congestionBase) * 0.25, 5, 99),
  );

  return {
    name: port.name,
    state: port.state,
    lat: port.lat,
    lon: port.lon,
    congestion: Math.round(congestion),
    congestionLabel: congestionLabel(congestion),
    congestionTrend: round1(congestion - port.congestionBase),
    waitingTime: round1(waitingNow),
    waitingTimeProjected: round1(waitingProjected),
    waitingSeries: waitingSeries(port, input.fromDate ?? SERIES_START, input.horizonWeeks ?? 8),
    maxDraft: port.maxDraft,
    maxLOA: port.maxLOA,
    maxBeam: port.maxBeam,
    cargoHandlingCapacity: port.cargoHandlingCapacity,
    berthsAvailable: port.berthsAvailable,
    totalBerths: port.totalBerths,
    suitableVessels: port.suitableVessels as VesselClass[],
    status,
    score,
    riskLevel: riskLevelOf(congestion),
    checks,
    constraints,
    warnings,
    alternative: null,
    berthUtilisationPercent,
  };
}

/** Convenience wrapper matching the documented engine signature. */
export function checkPortCompatibilityForScenario(
  scenario: ProcurementScenario,
  vessel: VesselClass,
  projectedCongestion: number,
): PortCompatibility {
  const port = getPort(scenario.dischargePort);
  return checkPortCompatibility({
    port,
    vessel,
    cargo: scenario.cargo,
    quantityPerVoyage: scenario.quantity,
    projectedCongestion,
  });
}

/**
 * Evaluate every candidate discharge port for the recommended vessel, rank the
 * alternatives and attach a named fallback to each incompatible port.
 */
export function assessPorts(
  scenario: ProcurementScenario,
  vessel: VesselClass,
  congestionByPort: Record<string, number>,
  series?: { fromDate?: string; horizonWeeks?: number },
): PortAssessment {
  const evaluated = PORTS.map((port) =>
    checkPortCompatibility({
      port,
      vessel,
      cargo: scenario.cargo,
      quantityPerVoyage: scenario.quantity,
      projectedCongestion: congestionByPort[port.name] ?? port.congestionBase,
      fromDate: series?.fromDate,
      horizonWeeks: series?.horizonWeeks,
    }),
  ).sort((a, b) => b.score - a.score);

  const best = evaluated[0];
  const selectedRaw = evaluated.find((p) => p.name === scenario.dischargePort) ?? evaluated[0];
  const selected: PortCompatibility =
    selectedRaw.status === "Incompatible"
      ? {
          ...selectedRaw,
          alternative: best && best.name !== selectedRaw.name
            ? {
                name: best.name,
                reason: `${best.name} clears every physical constraint for this parcel and scores ${best.score}/100 against ${selectedRaw.score}/100 at ${selectedRaw.name}.`,
              }
            : null,
        }
      : selectedRaw;

  return {
    selected,
    all: PORTS.map((p) => evaluated.find((e) => e.name === p.name)!).filter(Boolean),
    bestAlternative: {
      name: best.name,
      score: best.score,
      reason: best.name === selected.name
        ? `Already the strongest candidate: ${best.score}/100 feasibility with ${best.checks.filter((c) => c.status === "Pass").length}/4 constraints clear.`
        : `${best.name} scores ${best.score}/100 on feasibility versus ${selected.score}/100 at ${selected.name}.`,
    },
  };
}

/** Fastest feasible vessel class for a port — used to explain the fallback. */
export function feasibleVesselFor(port: PortReference, cargo: CargoType): VesselClass | null {
  for (const type of [...VESSEL_ORDER].reverse()) {
    const v = VESSEL_REFERENCE[type];
    if (v.draft <= port.maxDraft && v.loa <= port.maxLOA && v.beam <= port.maxBeam) {
      const c = getCargo(cargo);
      if (port.cargoHandlingCapacity * c.handlingFactor >= 40000) return type;
    }
  }
  return null;
}