/**
 * OceanIQ — vessel optimisation engine.
 *
 * `recommendVessel(scenario, forecast, port)` scores every vessel class on
 * parcel fit, port feasibility, freight outlook and all-in cost, then returns
 * the recommended pick plus the runner-up with an explicit rationale.
 */

import { clamp, formatUSD, mapRange, round, round1 } from "./shared";
import {
  VESSEL_AVAILABILITY,
  VESSEL_AVAILABILITY_INDEX,
  VESSEL_ORDER,
  VESSEL_REFERENCE,
  dwtLabel,
  greatCircleNm,
  getLoadingPort,
  transitDays,
  type VesselClass,
} from "@/lib/reference/corridors";
import { getPort } from "@/lib/reference/ports";
import { getCargo } from "@/lib/reference/cargo";
import type {
  FreightForecast,
  PortCompatibility,
  ProcurementScenario,
  VesselEvaluation,
  VesselRecommendation,
} from "@/lib/types";

export interface VesselEvaluationInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  port: PortCompatibility;
  /** Great-circle distance for the corridor, nm. */
  distanceNm: number;
  /** Congestion exposure applied to waiting cost, 0-100. */
  congestion: number;
}

/** All-in per-voyage cost estimate used to rank the classes. */
export function estimateVoyageCost(
  type: VesselClass,
  distanceNm: number,
  quantity: number,
  cargoHandlingFactor: number,
  port: PortCompatibility,
  ratePerDay: number,
  congestion: number,
): { freight: number; fuel: number; portCharges: number; waiting: number; total: number } {
  const v = VESSEL_REFERENCE[type];
  const transit = transitDays(distanceNm, v.serviceSpeed);
  const portDays = 3.4 + quantity / Math.max(1, port.cargoHandlingCapacity * cargoHandlingFactor);
  const voyageDays = transit + portDays;

  const freight = ratePerDay * voyageDays;
  const fuel = ratePerDay * voyageDays * 0.145 * v.fuelIndex;
  const portCharges = port.cargoHandlingCapacity * 0 + 96_000 * cargoHandlingFactor * (0.55 + distanceNm / 12_000);
  const waiting = (port.waitingTime + (congestion - port.congestion) * 0.02) * v.dailyRate * 0.55;

  return {
    freight: round(freight),
    fuel: round(fuel),
    portCharges: round(portCharges),
    waiting: round(waiting),
    total: round(freight + fuel + portCharges + waiting),
  };
}

/** Implied reference rate for a class on a corridor, USD/day. */
export function impliedRateFor(type: VesselClass, distanceNm: number, forecast: FreightForecast): number {
  const v = VESSEL_REFERENCE[type];
  const sizeFactor = v.payload / VESSEL_REFERENCE.Panamax.payload;
  const sizePremium = 0.82 + 0.24 * Math.min(1.8, sizeFactor);
  const distanceFactor = Math.pow(distanceNm / 6400, 0.42);
  return Math.round(forecast.predictedRate * sizePremium * distanceFactor);
}

export function evaluateVessel(input: VesselEvaluationInput): VesselEvaluation[] {
  const { scenario, forecast, port, distanceNm, congestion } = input;
  const cargoRef = getCargo(scenario.cargo);

  const evaluations = VESSEL_ORDER.map((type) => {
    const v = VESSEL_REFERENCE[type];

    // --- parcel fit ---------------------------------------------------------
    // Utilisation is the share of the *hull's capacity* the parcel occupies on
    // a single voyage, so it is capped at 100%. How many voyages the parcel
    // needs is tracked separately.
    const utilisationTonnes = Math.min(v.payload, scenario.quantity);
    const utilisationPercent = round1((utilisationTonnes / v.payload) * 100);
    const parcelsNeeded = Math.max(1, Math.ceil(scenario.quantity / v.payload));
    const parcelFit =
      parcelsNeeded === 1
        ? mapRange(utilisationPercent, 55, 100, 10, 22)
        : // Splitting a parcel across extra voyages adds waiting, stevedoring
          // and demurrage exposure at both ends. Penalised, but not so heavily
          // that a class becomes incomparable on a single bad parcel.
          -12 - (parcelsNeeded - 1) * 18;

    // --- physical feasibility at the chosen port -----------------------------
    // Draft, LOA and beam are hard physical limits: failing any one of them
    // means the vessel cannot berth, regardless of how the other constraints
    // fall. Cargo handling is soft — a tight rate costs time, not access.
    const draftOk = v.draft <= port.maxDraft;
    const loaOk = v.loa <= port.maxLOA;
    const beamOk = v.beam <= port.maxBeam;
    const handlingOk = port.cargoHandlingCapacity * cargoRef.handlingFactor >= scenario.quantity / 2.2;

    const physicalOk =
      (draftOk ? 1 : 0) + (loaOk ? 1 : 0) + (beamOk ? 1 : 0);
    const compatibilityScore = physicalOk * 25 + (handlingOk ? 25 : 0);
    const portCompatibility: VesselEvaluation["portCompatibility"] =
      physicalOk < 3 ? "Fail" : handlingOk ? "Pass" : "Restricted";

    // --- freight outlook ----------------------------------------------------
    const implied = impliedRateFor(type, distanceNm, forecast);
    const voyageDays = transitDays(distanceNm, v.serviceSpeed) + 3.4 + scenario.quantity / Math.max(1, port.cargoHandlingCapacity * cargoRef.handlingFactor);
    const costs = estimateVoyageCost(
      type,
      distanceNm,
      scenario.quantity,
      cargoRef.handlingFactor,
      port,
      implied,
      congestion,
    );
    const costPerTonne = costs.total / Math.max(1, scenario.quantity);
    const parcelsNeededTotal = Math.max(1, Math.ceil(scenario.quantity / v.payload));
    // Cost of the whole parcel, not just one voyage — a class that needs three
    // voyages to lift the parcel is paying handling and waiting three times.
    const costPerTonneParcel = costs.total * parcelsNeededTotal / Math.max(1, scenario.quantity);

    // --- availability -------------------------------------------------------
    const availabilityIndex = VESSEL_AVAILABILITY_INDEX[type];
    // Tightness is a cost when rates are rising, an advantage when they are not.
    const availabilityScore = mapRange(availabilityIndex, 20, 80, 12, 5);

    // --- scale efficiency ---------------------------------------------------
    const scaleScore = mapRange(v.payload / 150_000, 0.2, 1, 4, 10);

    return {
      type,
      implied,
      voyageDays,
      costs,
      costPerTonne,
      costPerTonneParcel,
      parcelsNeededTotal,
      availabilityIndex,
      availabilityScore,
      scaleScore,
      parcelFit,
      utilisationPercent,
      utilisationTonnes,
      draftOk,
      loaOk,
      beamOk,
      handlingOk,
      compatibilityScore,
      portCompatibility,
    };
  });

  // Cost is scored relative to the cheapest *feasible* class on this parcel, so
  // the ranking stays meaningful whatever the absolute level of the corridor.
  const feasibleCosts = evaluations
    .filter((e) => e.portCompatibility !== "Fail")
    .map((e) => e.costPerTonneParcel);
  const bestCost =
    feasibleCosts.length > 0 ? Math.min(...feasibleCosts) : Math.min(...evaluations.map((e) => e.costPerTonneParcel));

  const scored = evaluations.map((e): VesselEvaluation => {
    const { implied, voyageDays, costs, costPerTonneParcel, availabilityIndex } = e;
    // 26 points: full marks for matching the best feasible cost per tonne,
    // tapering as the class gets more expensive.
    const costScore = mapRange(costPerTonneParcel, bestCost * 1.45, bestCost, 1, 26);

    // Weighted so a perfect fit on every axis lands in the low 90s rather than
    // pinning the scale at 100 and flattening the ranking underneath.
    const score = Math.round(
      clamp(
        e.compatibilityScore * 0.30 +
          e.parcelFit +
          costScore +
          e.availabilityScore +
          e.scaleScore -
          (forecast.trend === "Increasing" ? (availabilityIndex - 40) * 0.06 : 0),
        0,
        97,
      ),
    );

    const { type } = e;
    const v = VESSEL_REFERENCE[type];

    const reasons: string[] = [];
    const blockers: string[] = [];

    if (e.portCompatibility === "Pass") {
      reasons.push(
        `Clears every ${port.name} constraint: ${v.draft}m draft vs ${port.maxDraft}m, ${v.loa}m LOA vs ${port.maxLOA}m, ${v.beam}m beam vs ${port.maxBeam}m.`,
      );
    } else {
      if (!e.draftOk) blockers.push(`${port.name} draft limit ${port.maxDraft}m is below the ${v.draft}m needed.`);
      if (!e.loaOk) blockers.push(`${port.name} LOA limit ${port.maxLOA}m is below the ${v.loa}m required.`);
      if (!e.beamOk) blockers.push(`${port.name} beam limit ${port.maxBeam}m is below the ${v.beam}m required.`);
      if (!e.handlingOk) blockers.push(`${port.name} handling rate is too low to discharge ${scenario.quantity.toLocaleString()} t inside the working window.`);
    }

    if (e.parcelsNeededTotal === 1 && e.utilisationPercent >= 90) {
      reasons.push(
        `Carries the full ${scenario.quantity.toLocaleString()} t parcel in one voyage at ${e.utilisationPercent}% of capacity.`,
      );
    } else if (e.parcelsNeededTotal === 1) {
      reasons.push(
        `Carries ${e.utilisationTonnes.toLocaleString()} t of the ${scenario.quantity.toLocaleString()} t parcel (${e.utilisationPercent}% of capacity) in one voyage.`,
      );
    } else {
      reasons.push(
        `Needs ${e.parcelsNeededTotal} voyages per parcel at ${e.utilisationPercent}% of capacity, adding waiting and stevedoring exposure at both ends.`,
      );
    }

    reasons.push(
      `Reference ${type} rate on this corridor is ${formatUSD(implied)}/day over a ~${round1(voyageDays)}-day voyage.`,
    );
    reasons.push(
      `Estimated all-in cost ${formatUSD(costs.total)} per voyage (${formatUSD(costPerTonneParcel, false)} per tonne for the whole parcel).`,
    );
    reasons.push(
      `Market availability is ${VESSEL_AVAILABILITY[type].toLowerCase()} (tightness index ${availabilityIndex}/100).`,
    );

    const costImplication =
      e.parcelsNeededTotal === 1
        ? `One voyage covers the parcel. Estimated ${formatUSD(costs.total)} all-in.`
        : `Needs ${e.parcelsNeededTotal} voyages for the parcel; estimated ${formatUSD(costs.total)} per voyage, ${formatUSD(costs.total * e.parcelsNeededTotal)} for the parcel.`;

    return {
      type,
      dwtLabel: dwtLabel(type),
      payload: v.payload,
      score,
      recommended: false,
      isStatedPreference: type === scenario.preferredVesselType,
      availability: VESSEL_AVAILABILITY[type],
      availabilityIndex,
      costPerDay: v.dailyRate,
      portCompatibility: e.portCompatibility,
      compatibilityScore: e.compatibilityScore,
      utilisationTonnes: e.utilisationTonnes,
      utilisationPercent: e.utilisationPercent,
      impliedDailyRate: implied,
      costImplication,
      reasons,
      blockers,
      draftMargin: round1(port.maxDraft - v.draft),
      loaMargin: round1(port.maxLOA - v.loa),
      beamMargin: round1(port.maxBeam - v.beam),
    };
  });

  scored.sort((a, b) => b.score - a.score || a.payload - b.payload);
  return scored;
}

/** Distance for a scenario corridor, used by both the vessel and route engines. */
export function corridorDistanceFor(scenario: ProcurementScenario): number {
  const loading = getLoadingPort(scenario.loadingPort);
  const port = getPort(scenario.dischargePort);
  if (!loading) return 6400;
  return Math.round(
    greatCircleNm(
      { lat: loading.lat, lng: loading.lon },
      { lat: port.lat, lng: port.lon },
    ),
  );
}

export function recommendVessel(input: VesselEvaluationInput): VesselRecommendation {
  const all = evaluateVessel(input);

  // Feasible classes first; a class that physically cannot berth or cannot lift
  // the parcel is never recommended, however cheap it looks.
  const feasible = all.filter((v) => v.portCompatibility !== "Fail");
  const pool = feasible.length > 0 ? feasible : all;
  const primary = pool[0];
  const alternative = pool[1] ?? null;

  if (primary) primary.recommended = true;

  // Push the analyst's stated preference into the primary slot when it is
  // genuinely feasible and within a close band, so the UI never surprises the
  // user by silently overriding an explicit preference.
  const preferred = all.find((v) => v.type === input.scenario.preferredVesselType);
  if (
    preferred &&
    preferred !== primary &&
    preferred.portCompatibility !== "Fail" &&
    preferred.score >= primary.score - 6
  ) {
    if (primary) primary.recommended = false;
    preferred.recommended = true;
    return { primary: preferred, alternative: primary, all };
  }

  return { primary: primary ?? all[0], alternative, all };
}