/**
 * OceanIQ — risk engine.
 *
 * Six weighted components produce one normalised programme risk score plus the
 * advisories shown on the dashboard. Every component states the driver that
 * caused it and the mitigation the recommendation relies on.
 */

import { clamp, riskLevelOf, round, round1 } from "./shared";
import { VESSEL_REFERENCE, dwtLabel } from "@/lib/reference/corridors";
import { getCargo } from "@/lib/reference/cargo";
import type {
  Alert,
  CharterTiming,
  CostResult,
  FreightForecast,
  PortCompatibility,
  ProcurementScenario,
  RiskComponent,
  RiskResult,
  RouteOption,
  StrategyComparison,
  VesselRecommendation,
} from "@/lib/types";

export interface RiskInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  vessel: VesselRecommendation;
  port: PortCompatibility;
  route: RouteOption;
  cost: CostResult;
  strategy: StrategyComparison;
  timing: CharterTiming;
}

function component(
  key: string,
  label: string,
  score: number,
  weight: number,
  driver: string,
  mitigation: string,
): RiskComponent {
  const s = round(clamp(score, 0, 100));
  return {
    key,
    label,
    score: s,
    weight,
    contribution: round1(s * weight),
    level: riskLevelOf(s),
    driver,
    mitigation,
  };
}

export function computeRisk(input: RiskInput): RiskResult {
  const { scenario, forecast, vessel, port, route, strategy, timing } = input;
  const v = VESSEL_REFERENCE[vessel.primary.type];
  const cargoRef = getCargo(scenario.cargo);
  const voyages = Math.max(1, Math.ceil(scenario.quantity / v.payload));

  // --- market / freight volatility ------------------------------------------
  // Measured from the model's own band, not a guess.
  const bandPoint = forecast.forecastRates[0];
  const relativeBand = (bandPoint.upper - bandPoint.lower) / Math.max(1, forecast.currentRate);
  const marketScore = clamp(relativeBand * 118 + Math.abs(forecast.forecastChange90d) * 0.55, 0, 100);

  // --- port & congestion ----------------------------------------------------
  const portScore = clamp(port.congestion * 0.72 + port.waitingTimeProjected * 4.2, 0, 100);

  // --- counterparty & contract structure ------------------------------------
  const counterpartyScore = clamp(
    strategy.priceCertainty * 0.42 + strategy.marketExposure * 0.24 + strategy.operationalRisk * 0.34,
    0,
    100,
  );

  // --- schedule / weather ---------------------------------------------------
  const scheduleScore = clamp(
    route.riskScore * 0.55 + route.duration * 0.62 + (scenario.voyages > 6 ? 12 : 0),
    0,
    100,
  );

  // --- cargo & compliance ---------------------------------------------------
  const complianceScore = clamp(
    18 + cargoRef.hazardClass * 16 + cargoRef.stowageFactor * 22 + (scenario.quantity / Math.max(1, v.payload) > 1.02 ? 20 : 0),
    0,
    100,
  );

  // --- liquidity / timing ---------------------------------------------------
  // Holding tonnage you do not need is the real cost of a wrong call.
  const liquidityScore = clamp(
    22 +
      (timing.recommendation === "Wait" ? Math.abs(forecast.forecastChange90d) * 0.9 : Math.abs(forecast.forecastChange90d) * 0.4) +
      (scenario.voyages > 6 ? 14 : 0) +
      (vessel.primary.availabilityIndex < 35 ? 16 : 0),
    0,
    100,
  );

  const components: RiskComponent[] = [
    component(
      "market",
      "Market & freight volatility",
      marketScore,
      0.26,
      `The trained model's 80% band is ${formatRange(bandPoint.lower, bandPoint.upper)}/day in week 1 and widens with the horizon; the forecast path drifts ${forecast.trendStrength}% over ${forecast.forecastHorizonWeeks} weeks.`,
      strategy.key === "spot"
        ? "Cap each voyage with a fixture ceiling and re-quote weekly against the model's live prediction."
        : `Lock ${strategy.code} coverage for the first tranche and keep the balance on spot.`,
    ),
    component(
      "port",
      "Port congestion & berth availability",
      portScore,
      0.2,
      `${scenario.dischargePort} projects to ${port.congestion}% congestion with about ${round1(port.waitingTimeProjected)} days of waiting and ${port.berthsAvailable}/${port.totalBerths} berths free.`,
      `Secure a berth window at ${scenario.dischargePort} before fixture, and hold the alternative ${port.alternative?.name ?? "second-best port"} ready as fallback.`,
    ),
    component(
      "counterparty",
      "Counterparty & contract structure",
      counterpartyScore,
      0.18,
      `${strategy.name} gives ${strategy.priceCertaintyLabel.toLowerCase()} price certainty and ${strategy.flexibilityLabel.toLowerCase()} flexibility, with ${round1(strategy.freightExposure)}% of freight still exposed to the market.`,
      strategy.key === "spot"
        ? "Screen counterparties on fixture reliability and use voyage-charter liability caps."
        : "Add a rate-adjustment clause tied to the corridor index so an adverse move is shared, not absorbed.",
    ),
    component(
      "schedule",
      "Schedule, weather & routing",
      scheduleScore,
      0.14,
      `The selected corridor is ${route.distance.toLocaleString()} nm over ${round1(route.duration)} days at ${route.speedKnots} knots, carrying a route risk score of ${route.riskScore}/100.`,
      "Adopt the southern weather-divergent corridor for the voyages sailing inside the seasonal cyclone window, and hold a weather-routing clause.",
    ),
    component(
      "compliance",
      "Cargo, stowage & compliance",
      complianceScore,
      0.12,
      `${cargoRef.label} is carried in ${cargoRef.stowageFactor <= 1 ? "full" : "partial"} holds with a hazard class of ${cargoRef.hazardClass}; ${voyages} voyage(s) cover the parcel on a ${dwtLabel(vessel.primary.type)} vessel.`,
      "Confirm IMSBC declaration, hold cleanliness and draft plan with the loading terminal before nomination.",
    ),
    component(
      "liquidity",
      "Timing & liquidity exposure",
      liquidityScore,
      0.1,
      `${vessel.primary.availability} ${vessel.primary.type} availability (tightness ${vessel.primary.availabilityIndex}/100) against a ${forecast.trend.toLowerCase()} rate outlook; the model advises "${timing.recommendation}".`,
      `Fix in the model's ${timing.windowLabel.toLowerCase()} window, and keep one voyage uncommitted as rate cover.`,
    ),
  ];

  const score = Math.round(
    components.reduce((a, c) => a + c.score * c.weight, 0) / 100 * 100,
  );
  const level = riskLevelOf(score);

  const sorted = [...components].sort((a, b) => b.contribution - a.contribution);
  const keyDrivers = sorted.slice(0, 3).map(
    (c) => `${c.label} (${c.score}/100, ${round1(c.weight * 100)}% weight): ${c.driver}`,
  );
  const mitigations = sorted.slice(0, 4).map((c) => c.mitigation);

  return {
    score,
    level,
    components,
    keyDrivers,
    mitigations,
    label: `${level} programme risk`,
    caveat: "Risk scores are a normalised, deterministic modelling construct built from reference/synthetic inputs and the trained model's own forecast band. They are not probabilities and are not calibrated against realised charter-party outcomes.",
    advisories: buildAdvisories(input, score, level),
  };
}

function formatRange(lower: number, upper: number): string {
  return `$${lower.toLocaleString()}-$${upper.toLocaleString()}`;
}

/** Dashboard / risk-screen advisories, all derived from the analysis numbers. */
export function buildAdvisories(input: RiskInput, riskScore: number, level: string): Alert[] {
  const { scenario, forecast, vessel, port, route, timing } = input;
  const alerts: Alert[] = [];

  if (port.congestion >= 60) {
    alerts.push({
      id: `port-congestion-${port.name}`,
      title: `${port.name} congestion at ${port.congestion}%`,
      description: `Projected anchorage waiting of about ${round1(port.waitingTimeProjected)} days at ${port.name}. Waiting time and demurrage provision together add roughly ${formatMoney(port.waitingTimeProjected * forecast.predictedRate * 0.55)} per voyage.`,
      severity: port.congestion >= 75 ? "High" : "Medium",
      status: "New",
      action: "Confirm berth window before fixture; keep fallback port on standby.",
      location: port.name,
      daysAgo: 0,
    });
  }

  if (forecast.trend === "Increasing" && forecast.forecastChange30d > 3) {
    alerts.push({
      id: "market-rising",
      title: `Freight firming ${forecast.trendStrength}% on the model path`,
      description: `The trained model projects a move from ${formatMoney(forecast.currentRate)}/day to ${formatMoney(forecast.predictedRate30d)}/day over 30 days. Delay of fixtures is the dominant controllable exposure.`,
      severity: forecast.forecastChange30d > 8 ? "High" : "Medium",
      status: "New",
      action: `Advance the fixture into ${timing.windowLabel.toLowerCase()}.`,
      location: scenario.loadingPort,
      daysAgo: 1,
    });
  }

  if (vessel.primary.availabilityIndex < 40) {
    alerts.push({
      id: "vessel-tightness",
      title: `${vessel.primary.type} market is tight`,
      description: `Reference tightness of ${vessel.primary.availabilityIndex}/100 with ${vessel.primary.dwtLabel} available. The runner-up class is ${vessel.alternative?.type ?? "n/a"} at ${vessel.alternative?.score ?? 0}/100.`,
      severity: vessel.primary.availabilityIndex < 28 ? "High" : "Medium",
      status: "New",
      action: "Start owner nominations early and hold the alternative class as a live fallback.",
      location: scenario.loadingPort,
      daysAgo: 2,
    });
  }

  if (route.riskScore >= 60) {
    alerts.push({
      id: "route-exposure",
      title: `Selected corridor carries ${route.riskScore}/100 route risk`,
      description: `${route.label} runs ${route.distance.toLocaleString()} nm with ${round1(route.duration)} days in transit and ${route.congestionExposure}% congestion exposure.`,
      severity: route.riskScore >= 72 ? "High" : "Medium",
      status: "New",
      action: "Request weather routing and a schedule-relief clause.",
      location: `${scenario.loadingPort} - ${scenario.dischargePort}`,
      daysAgo: 3,
    });
  }

  if (riskScore >= 70) {
    alerts.push({
      id: "programme-risk",
      title: `Programme risk is ${level.toLowerCase()} at ${riskScore}/100`,
      description: "Weighted risk is dominated by market volatility and port congestion. The recommended structure reduces exposure but cannot remove it.",
      severity: level === "High" ? "High" : "Medium",
      status: "New",
      action: "Re-run the analysis after fixing tonnage, and review weekly against the model path.",
      location: "Programme",
      daysAgo: 0,
    });
  }

  if (scenario.quantity / 1 > 100000) {
    alerts.push({
      id: "parcel-size",
      title: "Parcel exceeds a single Panamax lift",
      description: `A ${scenario.quantity.toLocaleString()} t parcel needs more than one voyage on the reference ${vessel.primary.dwtLabel} class, which multiplies waiting and demurrage exposure.`,
      severity: "Medium",
      status: "New",
      action: "Consider a Capesize nomination or split the parcel across two berth windows.",
      location: scenario.loadingPort,
      daysAgo: 4,
    });
  }

  return alerts;
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}