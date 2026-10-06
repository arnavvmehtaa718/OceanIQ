/**
 * OceanIQ — charter timing engine.
 *
 * Input : the ML freight forecast (where is freight likely to move?)
 * Output: when to fix tonnage (the decision layer's use of that forecast).
 */

import { clamp, formatUSD, round } from "./shared";
import type { CharterTiming, FreightForecast, ProcurementScenario } from "@/lib/types";
import { VESSEL_REFERENCE, type VesselClass } from "@/lib/reference/corridors";

export function determineCharterTiming(
  scenario: ProcurementScenario,
  forecast: FreightForecast,
): CharterTiming {
  const vessel = VESSEL_REFERENCE[scenario.preferredVesselType];
  const path = forecast.forecastRates;
  const weekOne = forecast.recommendedCharterWeek;
  const from = clamp(weekOne, 1, path.length);
  const to = clamp(weekOne + 2, from, path.length);

  const windowRates = path.slice(from - 1, to).map((p) => p.rate);
  const windowAvg = windowRates.reduce((a, b) => a + b, 0) / Math.max(1, windowRates.length);
  void windowAvg;

  const arrivalRate = path[Math.min(path.length - 1, from + 3)].rate;

  const rationale: string[] = [];

  if (forecast.trend === "Increasing") {
    rationale.push(
      `The trained model expects rates to firm over the horizon (${forecast.trend.toLowerCase()}, drift ${forecast.trendStrength}% across the forecast window), so the advantage shifts against waiting.`,
    );
  } else if (forecast.trend === "Decreasing") {
    rationale.push(
      `The trained model expects rates to soften (drift -${forecast.trendStrength}%), and the trough sits at week ${forecast.bestWeek} (${formatUSD(forecast.bestRate)}/day).`,
    );
  } else {
    rationale.push(
      `The trained model sees a broadly flat market (drift ${forecast.trendStrength}%), so charter timing is not the dominant lever in this scenario.`,
    );
  }

  rationale.push(
    `Reference rate today is ${formatUSD(forecast.currentRate)}/day; the model's ${from}-week-ahead point forecast is ${formatUSD(path[from - 1].rate)}/day with an 80% band of ${formatUSD(path[from - 1].lower)}-${formatUSD(path[from - 1].upper)}.`,
  );

  const congestionPush = scenario.dischargePort;
  rationale.push(
    `Berth congestion at ${congestionPush} is the operational counterweight: an extra week of delay costs roughly ${formatUSD(vessel.dailyRate * 1.1)} in hire, waiting and demurrage exposure before the voyage even loads.`,
  );

  const recommendation: CharterTiming["recommendation"] =
    from <= 1 ? "Charter now" : forecast.trend === "Increasing" ? "Charter now" : "Wait";

  const waitDays = (from - 1) * 7;

  const costOfWaitingPerVoyage =
    recommendation === "Charter now"
      ? Math.max(0, (arrivalRate - forecast.predictedRate) * 18 * 0.55)
      : 0;

  return {
    recommendation,
    waitDays,
    windowWeeks: [from, to],
    windowLabel: `Weeks ${from}-${to} from ${path[from - 1].date}`,
    rationale,
    costOfWaitingPerVoyage: round(costOfWaitingPerVoyage),
    costOfWaitingProgram: round(costOfWaitingPerVoyage * scenario.voyages),
  };
}

/**
 * Per-vessel timing note — used by the vessel engine so each candidate gets a
 * consistent timing view rather than a copied headline number.
 */
export function timingNoteForVessel(vessel: VesselClass, forecast: FreightForecast): string {
  const ref = VESSEL_REFERENCE[vessel];
  const rate = forecast.forecastRates[Math.max(0, forecast.recommendedCharterWeek - 1)].rate;
  return `Reference ${ref.type} rate in the recommended window is ${formatUSD(rate)}/day.`;
}