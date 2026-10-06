/**
 * OceanIQ — cost engine.
 *
 * Builds the landed-cost breakdown for the recommended vessel, corridor and
 * charter week, then stress-tests it against the model's own forecast band.
 */

import { clamp, round, round1 } from "./shared";
import { VESSEL_REFERENCE, getLoadingPort, type VesselClass } from "@/lib/reference/corridors";
import { getCargo } from "@/lib/reference/cargo";
import { BUNKER_BASE_USD_T, getExogenousForecast } from "@/lib/ml/dataLoader";
import { horizonMonths, type CostLineItem, type CostResult, type FreightForecast, type PortCompatibility, type ProcurementScenario, type RouteOption } from "@/lib/types";

export interface CostInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  vessel: VesselClass;
  port: PortCompatibility;
  route: RouteOption;
  /** Discharge-port congestion projected at arrival. */
  congestion: number;
}

export function computeCost(input: CostInput): CostResult {
  const { scenario, forecast, vessel, port, route } = input;
  const v = VESSEL_REFERENCE[vessel];
  const cargoRef = getCargo(scenario.cargo);
  const loading = getLoadingPort(scenario.loadingPort);

  // One reference rate for the whole programme, taken from the charter window
  // the ML forecast selected. Averaging across the window is what makes the
  // three contract structures comparable later.
  const from = clamp(forecast.recommendedCharterWeek, 1, forecast.forecastRates.length);
  const to = clamp(
    from + Math.max(2, horizonMonths(scenario.contractHorizon) * 4),
    from + 1,
    forecast.forecastRates.length,
  );
  const window = forecast.forecastRates.slice(from - 1, to);
  const referenceRatePerDay = Math.round(
    window.reduce((a, p) => a + p.rate, 0) / Math.max(1, window.length),
  );

  const bunkerIndex =
    getExogenousForecast()[Math.min(from - 1, getExogenousForecast().length - 1)]
      .bunkerIndex;

  // Vessel voyages needed to lift one parcel.
  const parcelVoyages = Math.max(1, Math.ceil(scenario.quantity / v.payload));
  // Total voyages the scenario commissions, i.e. one parcel per stated voyage.
  const programmeVoyages = Math.max(1, scenario.voyages);
  const totalVoyages = parcelVoyages * programmeVoyages;
  const voyageDays = route.duration;

  const freightCost = referenceRatePerDay * voyageDays;

  // Bunker is charged as a share of hire, scaled by how far the projected
  // bunker index sits above the reference base the synthetic market is
  // anchored on. A high bunker price therefore costs more, not less.
  const bunkerShare = 0.145 * v.fuelIndex * clamp((bunkerIndex - BUNKER_BASE_USD_T) / BUNKER_BASE_USD_T, -0.4, 1.2);
  const fuelCost = freightCost * bunkerShare;
  const _portCharges = 96_000 * cargoRef.handlingFactor * (0.55 + route.distance / 12_000);
  void _portCharges;
  const waitingCost = port.waitingTimeProjected * referenceRatePerDay * 0.55 * (route.congestionExposure / 100 + 0.35);
  const demurrageRisk = waitingCost * 0.42;
  const canalTransits =
    scenario.originCountry === "Australia" && Math.abs(loading?.lat ?? 0) > 8
      ? round(290_000 * cargoRef.handlingFactor)
      : 0;
  const cargoHandlingCost = scenario.quantity * 4.6 * cargoRef.handlingFactor;
  const insuranceAndInspection =
    42_000 + scenario.quantity * 1.6 * cargoRef.handlingFactor;
  // Agency and berth service fees are charged per tonne lifted, not per tonne of
  // port throughput capacity.
  const stevedoringAndAgency = scenario.quantity * 1.85 * cargoRef.handlingFactor;
  const ballastAndPortFees = referenceRatePerDay * 2.1 * v.fuelIndex;

  const raw: { key: string; name: string; perVoyage: number; note: string }[] = [
    { key: "freight", name: "Ocean freight (charter hire)", perVoyage: freightCost, note: `Reference rate $${referenceRatePerDay.toLocaleString()}/day x ${round1(voyageDays)} days` },
    { key: "fuel", name: "Bunker & fuel adjustment", perVoyage: fuelCost, note: `Model bunker index ${Math.round(bunkerIndex)} applied to a 14.5% bunker share` },
    { key: "handling", name: "Cargo handling & stevedoring", perVoyage: cargoHandlingCost + stevedoringAndAgency, note: `${cargoRef.label} handling at $4.60/t plus agency and berth charges` },
    { key: "waiting", name: "Waiting time & congestion risk", perVoyage: waitingCost, note: `${round1(port.waitingTimeProjected)} projected waiting days at ${scenario.dischargePort}` },
    { key: "demurrage", name: "Demurrage risk provision", perVoyage: demurrageRisk, note: "42% provision on waiting exposure for discharge delay" },
    { key: "insurance", name: "Insurance, inspection & survey", perVoyage: insuranceAndInspection, note: "Cargo, hull interest and pre-shipment inspection" },
    { key: "port", name: "Ballast, port dues & pilotage", perVoyage: ballastAndPortFees, note: "Ballast leg, agency dues and pilotage at both ends" },
    ...(canalTransits > 0
      ? [{ key: "canal", name: "Canal / strait transit", perVoyage: canalTransits, note: `${loading?.name ?? scenario.loadingPort} loading requires a canal or strait transit` }]
      : []),
  ];

  // The total is the sum of the rounded lines, not the rounded sum of the raw
  // lines, so the itemised breakdown visibly adds up to the headline total the
  // user sees on screen.
  const items = raw
    .map((i) => ({ key: i.key, name: i.name, perVoyage: round(i.perVoyage), note: i.note }))
    .sort((a, b) => b.perVoyage - a.perVoyage);

  const totalPerVoyage = items.reduce((a, i) => a + i.perVoyage, 0);

  const withShares: CostLineItem[] = items.map((i) => ({
    ...i,
    program: i.perVoyage * totalVoyages,
    sharePercent: round1((i.perVoyage / Math.max(1, totalPerVoyage)) * 100),
  }));

  // Stress the whole structure against the model's own 80% band at the charter
  // week, so the adverse case is a model output and not an invented haircut.
  // Only the hire component moves with the rate; the physical cost lines do not.
  const bandPoint = forecast.forecastRates[from - 1];
  const ratio = (n: number) => n / Math.max(1, bandPoint.rate);
  const freightLine = withShares.find((i) => i.key === "freight")!.perVoyage;
  const nonFreightTotal = totalPerVoyage - freightLine;
  const adverseCasePerVoyage = Math.round(
    nonFreightTotal + freightLine * ratio(bandPoint.upper),
  );
  const favourableCasePerVoyage = Math.round(
    nonFreightTotal + freightLine * ratio(bandPoint.lower),
  );

  const trend: CostResult["trend"] =
    forecast.trend === "Increasing" ? "Rising" : forecast.trend === "Decreasing" ? "Falling" : "Stable";

  const trendNote =
    trend === "Rising"
      ? `Freight is the pressure point: the model sees rates firming ${forecast.trendStrength}% across the forecast path, and freight is ${round1((freightLine / Math.max(1, totalPerVoyage)) * 100)}% of landed cost.`
      : trend === "Falling"
        ? `The model sees rates softening ${forecast.trendStrength}% across the forecast path, which puts downward pressure on the freight component.`
        : `The model sees a broadly flat market (${forecast.trendStrength}% drift), so cost stability comes from structure rather than direction.`;

  return {
    referenceRatePerDay,
    items: withShares,
    totalPerVoyage,
    totalProgram: round(totalPerVoyage * totalVoyages),
    costPerTonne: round1(totalPerVoyage / Math.max(1, scenario.quantity)),
    costPerVoyage: round(totalPerVoyage),
    bunkerIndex: Math.round(bunkerIndex),
    adverseCasePerVoyage: Math.max(0, adverseCasePerVoyage),
    favourableCasePerVoyage: Math.max(0, favourableCasePerVoyage),
    trend,
    trendNote,
  };
}