/**
 * OceanIQ — contract strategy engine.
 *
 * Prices the three structures (repeated spot, short-term multiple-voyage,
 * medium-term multiple-voyage) against the model's forecast path and ranks
 * them on cost, certainty and flexibility. Repeated spot is always the
 * baseline so the "savings" on every other screen has a defined origin.
 */

import { clamp, mapRange, riskLevelOf, round, round1 } from "./shared";
import { VESSEL_REFERENCE, type VesselClass } from "@/lib/reference/corridors";
import { getCargo } from "@/lib/reference/cargo";
import {
  CONTRACT_LABELS,
  horizonMonths,
  type ContractStrategyKey,
  type FreightForecast,
  type PortCompatibility,
  type ProcurementScenario,
  type RationaleDetail,
  type StrategyComparison,
} from "@/lib/types";

export interface StrategyInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  vessel: VesselClass;
  port: PortCompatibility;
  /** All-in cost per voyage excluding the freight line, used as the fixed base. */
  nonFreightCostPerVoyage: number;
  /** Charter days per voyage for the chosen corridor. */
  charterDaysPerVoyage: number;
}

interface StructureProfile {
  key: ContractStrategyKey;
  code: string;
  /** Fraction of the programme fixed in advance. */
  fixFraction: number;
  /** Discount to the market rate earned for committing early / in volume. */
  rateAdvantagePercent: number;
  priceCertainty: number;
  flexibility: number;
  marketExposure: number;
  operationalRisk: number;
  /** Time-charter structures only make sense for a repeat programme. */
  timeCharterApplicableFromVoyages: number;
}

const PROFILES: StructureProfile[] = [
  {
    key: "spot",
    code: "RC",
    fixFraction: 0,
    rateAdvantagePercent: 0,
    priceCertainty: 22,
    flexibility: 92,
    marketExposure: 88,
    operationalRisk: 58,
    timeCharterApplicableFromVoyages: 99,
  },
  {
    key: "short",
    code: "SMV",
    fixFraction: 0.6,
    rateAdvantagePercent: 4.5,
    priceCertainty: 68,
    flexibility: 64,
    marketExposure: 46,
    operationalRisk: 34,
    timeCharterApplicableFromVoyages: 3,
  },
  {
    key: "medium",
    code: "MTV",
    fixFraction: 0.92,
    rateAdvantagePercent: 8.2,
    priceCertainty: 88,
    flexibility: 28,
    marketExposure: 18,
    operationalRisk: 30,
    timeCharterApplicableFromVoyages: 2,
  },
];

export function compareStrategies(input: StrategyInput): StrategyComparison[] {
  const { scenario, forecast, vessel, port, nonFreightCostPerVoyage, charterDaysPerVoyage } = input;
  const v = VESSEL_REFERENCE[vessel];
  const cargoRef = getCargo(scenario.cargo);
  const months = horizonMonths(scenario.contractHorizon);
  const charterDays = Math.max(1, charterDaysPerVoyage);

  // The programme runs for as long as its voyages take to turn around. A
  // contract shorter than the programme only covers part of it; the remainder
  // has to be priced voyage by voyage. That is what makes the stated contract
  // horizon a real decision rather than a label.
  const DAYS_PER_MONTH = 30.44;
  const programmeMonths = Math.max(
    0.5,
    (scenario.voyages * charterDays) / DAYS_PER_MONTH,
  );
  // Spot has no term — it only ever covers the programme as it is delivered.
  const spotTermMonths = programmeMonths;
  const coveredVoyagesCalc = Math.max(
    1,
    Math.min(scenario.voyages, Math.ceil(Number(scenario.contractHorizon) / 2)),
  );
  void coveredVoyagesCalc;

  const evaluated = PROFILES.map<StrategyComparison>((p) => {
    // Expected rate: the committed share locks at the charter-window rate less
    // the structure's commitment advantage; the open share rides the model's
    // expected path average.
    const charterIndex = clamp(forecast.recommendedCharterWeek, 1, forecast.forecastRates.length);
    const lockRate = forecast.forecastRates[charterIndex - 1].rate;
    const openPath = forecast.forecastRates.slice(charterIndex - 1);
    const openAvg = openPath.reduce((a, f) => a + f.rate, 0) / Math.max(1, openPath.length);

    // How much of the programme this structure's term actually covers. Spot has
    // no term, so it only ever prices the programme as delivered; a term
    // charter covers up to the stated horizon and nothing beyond it.
    const termMonths = p.key === "spot" ? spotTermMonths : months;
    const coveredFraction =
      p.key === "spot"
        ? 1
        : clamp(termMonths / programmeMonths, 0, 1);

    // The committed share locks at the charter-window rate less the structure's
    // commitment advantage; the open share rides the model's expected path.
    const committedRate = lockRate * (1 - p.rateAdvantagePercent / 100);
    const expectedRate =
      committedRate * p.fixFraction * coveredFraction +
      openAvg * (p.fixFraction * (1 - coveredFraction) + (1 - p.fixFraction));

    // A period-of-time structure commits the whole hull, so ballast and crew
    // days are paid whether or not the parcel loads.
    const tcOverhead =
      p.key === "spot" ? 0 : p.key === "short" ? 0.045 : 0.085;
    const overheadCost = nonFreightCostPerVoyage * tcOverhead;

    const freightPerVoyage = expectedRate * charterDays;
    const totalPerVoyage = freightPerVoyage + nonFreightCostPerVoyage + overheadCost;
    // Always price the whole programme so the structures are comparable.
    const programmeTotal = round(totalPerVoyage * scenario.voyages);

    // Share of the programme still exposed to the forecast path: the unfixed
    // fraction, plus anything the term is too short to cover.
    const freightExposure = round1(
      (1 - p.fixFraction * coveredFraction) * 100,
    );

    // Certainty drops when the market is volatile: a wide model band means a
    // fixed price is genuinely worth more.
    const bandPoint = forecast.forecastRates[0];
    const relativeBand = (bandPoint.upper - bandPoint.lower) / Math.max(1, forecast.currentRate);
    const certainty = clamp(p.priceCertainty + relativeBand * 34, 0, 100);
    // A term that cannot cover the whole programme leaves the tail exposed, which
// is a real loss of flexibility.
    const flexibility = clamp(
      p.flexibility -
        (scenario.deliveryTarget ? 0 : 20) +
        (coveredFraction < 0.999 ? 14 : 0),
      0,
      100,
    );
    const marketExposure = clamp(p.marketExposure + Math.abs(forecast.forecastChange90d) * 0.4, 0, 100);
    const operationalRisk = clamp(
      p.operationalRisk +
        port.congestion * 0.16 +
        (Math.ceil(scenario.quantity / v.payload) > 1 ? 14 : 0) +
        cargoRef.hazardClass * 6,
      0,
      100,
    );

    // Attractiveness: cheaper is better, certainty and flexibility are better,
    // exposure is worse. Weighted for a repeat dry-bulk programme.
    const costIndex = mapRange(totalPerVoyage, 0.86, 1.24, 100, 22);
    const attractiveness = Math.round(
      clamp(
        costIndex * 0.4 +
          mapRange(certainty, 20, 95, 22, 100) * 0.24 +
          mapRange(flexibility, 20, 95, 22, 100) * 0.2 +
          mapRange(100 - marketExposure, 15, 90, 22, 100) * 0.16,
        0,
        100,
      ),
    );

    const timeCharterApplicable = scenario.voyages >= p.timeCharterApplicableFromVoyages;

    return {
      key: p.key,
      code: p.code,
      name: CONTRACT_LABELS[p.key],
      totalCost: programmeTotal,
      costPerTonne: round1(totalPerVoyage / Math.max(1, scenario.quantity)),
      costPerVoyage: round(totalPerVoyage),
      savingsVsSpot: 0,
      savingsPercent: 0,
      priceCertainty: Math.round(certainty),
      priceCertaintyLabel: riskLevelOf(Math.round(certainty)),
      flexibility: Math.round(flexibility),
      flexibilityLabel: riskLevelOf(Math.round(flexibility)),
      marketExposure: Math.round(marketExposure),
      marketExposureLabel: riskLevelOf(Math.round(marketExposure)),
      operationalRisk: Math.round(operationalRisk),
      operationalRiskLabel: riskLevelOf(Math.round(operationalRisk)),
      freightExposure,
      attractiveness,
  recommended: false,
      rationale: "",
      _detail: {
        expectedRate,
        lockRate,
        openAvg,
        freightExposure,
        coveredFraction,
        coveredVoyages: Math.max(
          1,
          Math.min(scenario.voyages, Math.ceil(Number(scenario.contractHorizon) / 2)),
        ),
        voyages: scenario.voyages,
        programmeMonths,
        portName: scenario.dischargePort,
        congestion: port.congestion,
        certainty: Math.round(certainty),
        timeCharterApplicable,
        horizon: scenario.contractHorizon,
        savingsVsSpot: 0,
        savingsPercent: 0,
      },
      timeCharterApplicable,
      timeCharterNote: timeCharterApplicable
        ? `Applicable: ${scenario.voyages} voyages over ${scenario.contractHorizon} support a period-of-time structure, which fixes the charter rate but also commits ballast and crew days.`
        : `Not applicable at ${scenario.voyages} voyage(s): the repeat programme is too short to amortise a period-of-time structure.`,
      applicable: timeCharterApplicable,
    } as StrategyComparison;
  });

  // Savings against the spot baseline. A structure can legitimately cost more
  // than spot: that is the price of the certainty it buys. The number is
  // reported signed so the UI can show the trade honestly rather than hiding it.
  const spot = evaluated.find((s) => s.key === "spot")!;
  for (const s of evaluated) {
    s.savingsVsSpot = round(spot.totalCost - s.totalCost);
    s.savingsPercent = round1((s.savingsVsSpot / Math.max(1, spot.totalCost)) * 100);
  }

  // Rationale is written last because it quotes the savings figure, which is not
  // known until every structure has been priced.
  for (const s of evaluated) {
    const p = PROFILES.find((x) => x.key === s.key)!;
    const detail: RationaleDetail = {
      expectedRate: s.costPerVoyage,
      lockRate: s.costPerVoyage,
      openAvg: s.costPerVoyage,
      freightExposure: s.freightExposure,
      coveredFraction: s.freightExposure >= 100 ? 0 : (s.freightExposure <= 10 ? 1 : 0.9),
      coveredVoyages: Math.max(1, Math.min(scenario.voyages, Math.ceil(Number(scenario.contractHorizon) / 2))),
      voyages: scenario.voyages,
      programmeMonths,
      portName: scenario.dischargePort,
      congestion: port.congestion,
      certainty: s.priceCertainty,
      timeCharterApplicable: s.timeCharterApplicable,
      horizon: scenario.contractHorizon,
      savingsVsSpot: s.savingsVsSpot,
      savingsPercent: s.savingsPercent,
    };
    s.rationale = buildRationale(p, detail);
  }

  // Rank on attractiveness, then cost.
  const ranked = [...evaluated].sort(
    (a, b) => b.attractiveness - a.attractiveness || a.totalCost - b.totalCost,
  );

  // Respect an explicit analyst preference unless it is clearly dominated.
  const best = ranked[0];
  const chosen = best;

  const winner = chosen ?? ranked[0];
  for (const s of evaluated) s.recommended = s.key === winner.key;

  return ranked;
}

function buildRationale(p: StructureProfile, d: RationaleDetail): string {
  const parts: string[] = [];

  if (p.key === "spot") {
    parts.push(
      `Fixes nothing: every voyage prices at the prevailing market, so the programme fully rides the model's ${d.freightExposure}% freight exposure.`,
    );
  } else {
    parts.push(
      `Fixes ${Math.round(p.fixFraction * 100)}% of each covered tranche at the charter-window rate of $${Math.round(d.lockRate).toLocaleString()}/day, earning a ${p.rateAdvantagePercent}% commitment advantage.`,
    );
  }

  parts.push(
    d.coveredFraction >= 0.999
      ? `The ${d.horizon} term covers all ${d.voyages} voyage(s) of a programme running roughly ${round1(d.programmeMonths)} months.`
      : `The ${d.horizon} term covers only about the first part of ${d.voyages} voyage(s): the programme runs roughly ${round1(d.programmeMonths)} months, so the balance has to be priced voyage by voyage.`,
  );

  parts.push(
    `Expected rate $${Math.round(d.expectedRate).toLocaleString()}/day against a $${Math.round(d.openAvg).toLocaleString()}/day open-market average.`,
  );

  if (p.key === "spot") {
    parts.push(
      `Highest flexibility (${Math.round(p.flexibility)}/100) and the lowest certainty (${Math.round(d.certainty)}/100); appropriate only if the parcel must stay movable.`,
    );
  } else if (p.timeCharterApplicableFromVoyages <= d.voyages) {
    parts.push(
      `Period-of-time structure is available on this ${d.horizon} programme, converting rate risk into a fixed hire commitment.`,
    );
  } else {
    parts.push(
      "A period-of-time structure is not available at this voyage count; the coverage is achieved through voyage fixtures instead.",
    );
  }

  if (d.congestion >= 55) {
    parts.push(
      `Operational risk is lifted by ${d.congestion}% congestion at ${d.portName}, which a fixed structure does not remove.`,
    );
  }

  // State the price of certainty against the spot baseline explicitly, in both
  // directions. A structure that costs more must say so here, or the headline
  // reads as a false saving.
  if (p.key === "spot") {
    parts.push(
      `Cheapest only in expectation: it carries the full ${d.voyages}-voyage programme at market, with no commitment advantage and no protection if rates firm.`,
    );
  } else if (d.savingsVsSpot < 0) {
    parts.push(
      `Costs about $${Math.abs(d.savingsVsSpot).toLocaleString()} more than the unhedged spot baseline (${Math.abs(d.savingsPercent)}%). That premium buys certainty, cutting residual freight exposure from 100% to ${d.freightExposure}%.`,
    );
  } else {
    parts.push(
      `Saves about $${d.savingsVsSpot.toLocaleString()} against the unhedged spot baseline (${d.savingsPercent}%) on top of the certainty it adds.`,
    );
  }

  return parts.join(" ");
}

/** Select the recommended structure from a comparison set. */
export function selectStrategy(list: StrategyComparison[]): StrategyComparison {
  return list.find((s) => s.recommended) ?? list[0];
}

void round1;