/**
 * OceanIQ — savings engine.
 *
 * The baseline is the spot-book total computed by the contract strategy engine,
 * not a second independent calculation. Reusing it is what keeps the Cost &
 * Savings screen consistent with the Contract Strategy screen: the number shown
 * as "saving" is exactly the difference between the two structures on the same
 * pricing basis.
 *
 * Where the saving comes from is then attributed to the two components the
 * models can actually separate:
 *   - the commitment advantage earned by fixing part of the programme, and
 *   - demurrage and congestion control from a coordinated berth window.
 */

import { round, round1 } from "./shared";
import { getCargo } from "@/lib/reference/cargo";
import { VESSEL_REFERENCE } from "@/lib/reference/corridors";
import type {
  CostResult,
  FreightForecast,
  PortCompatibility,
  ProcurementScenario,
  StrategyComparison,
  VesselRecommendation,
} from "@/lib/types";

export interface SavingsInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  vessel: VesselRecommendation;
  port: PortCompatibility;
  cost: CostResult;
  strategies: StrategyComparison[];
  selectedStrategy: StrategyComparison;
}

export function computeSavings(input: SavingsInput) {
  const { scenario, forecast, vessel, cost, strategies, selectedStrategy } = input;
  const v = VESSEL_REFERENCE[vessel.primary.type];
  const cargoRef = getCargo(scenario.cargo);

  const spot = strategies.find((s) => s.key === "spot")!;
  const parcelVoyages = Math.max(1, Math.ceil(scenario.quantity / v.payload));
  const programmeVoyages = Math.max(1, scenario.voyages);
  const totalVoyages = parcelVoyages * programmeVoyages;

  // Both totals come from the strategy engine on an identical pricing basis.
  const baselineTotal = round(spot.totalCost);
  const recommendedTotal = round(selectedStrategy.totalCost);
  const savings = round(baselineTotal - recommendedTotal);
  const savingsPercent = round1((savings / Math.max(1, baselineTotal)) * 100);

  // --- attribution ---------------------------------------------------------
  const demurrageLine = cost.items.find((i) => i.key === "demurrage")?.perVoyage ?? 0;
  // An uncoordinated spot book carries a larger waiting/demurrage provision.
  const demurrageDriver = round(demurrageLine * (1.85 - 1) * totalVoyages);
  // Everything else in the delta is the rate/commitment advantage.
  const rateDriver = round(savings - demurrageDriver);

  const drivers = [
    {
      name:
        `Rate and commitment advantage (${selectedStrategy.code} fixes ` +
        `${Math.round((1 - selectedStrategy.freightExposure / 100) * 100)}% of the programme at a ` +
        `discount to the ${formatPerDay(spot.costPerVoyage)} unhedged spot basis)`,
      amount: rateDriver,
    },
    {
      name: `Demurrage and congestion control with a coordinated berth window at ${scenario.dischargePort}`,
      amount: demurrageDriver,
    },
  ].filter((d) => Math.abs(d.amount) >= 1);

  const netLabel =
    savings > 0
      ? `Saves ${formatUSD(savings)} against the unhedged spot baseline`
      : savings < 0
        ? `Costs ${formatUSD(Math.abs(savings))} more than the unhedged spot baseline, in exchange for ${selectedStrategy.freightExposure}% residual freight exposure instead of 100%`
        : "Costs the same as the unhedged spot baseline";

  return {
    baselineLabel: `Baseline: unhedged spot-by-spot book (${spot.code}, 100% market-exposed)`,
    recommendedLabel: `OceanIQ: ${selectedStrategy.name} with an OceanIQ-coordinated berth window`,
    baselineTotal,
    recommendedTotal,
    savings,
    savingsPercent,
    savingsInr: round(savings * 83.2),
    drivers,
    label: netLabel,
    caveat:
      `Baseline and recommendation are both priced by the contract strategy engine on the same cost model ` +
      `(reference rate $${cost.referenceRatePerDay.toLocaleString()}/day, ${totalVoyages} vessel voyage(s), ` +
      `${cargoRef.label} handling). The forecast path averages $${forecast.currentRate.toLocaleString()}/day today and ` +
      `${forecast.forecastChange90d > 0 ? "+" : ""}${forecast.forecastChange90d}% over 90 days, so the structure is priced against ` +
      `the model's own central path. These are modelled estimates on synthetic/reference data — not broker quotations, ` +
      `not a booked position, and not a guaranteed commercial outcome.`,
  };
}

function formatUSD(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function formatPerDay(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}