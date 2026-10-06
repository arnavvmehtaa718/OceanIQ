/**
 * OceanIQ — final recommendation engine.
 *
 * Assembles the What / Why / Impact decision brief from every upstream engine.
 * Every number here is copied from the result objects, so the brief cannot drift
 * from the analysis that produced it.
 */

import { formatUSD } from "./shared";
import { getCargo } from "@/lib/reference/cargo";
import type {
  AnalysisResult,
  CharterTiming,
  CostResult,
  FinalRecommendation,
  ForecastPoint,
  FreightForecast,
  PortAssessment,
  ProcurementScenario,
  RiskResult,
  SavingsResult,
  StrategyComparison,
  VesselRecommendation,
  RouteAssessment,
} from "@/lib/types";

export interface RecommendationInput {
  scenario: ProcurementScenario;
  forecast: FreightForecast;
  timing: CharterTiming;
  vessel: VesselRecommendation;
  port: PortAssessment;
  route: RouteAssessment;
  cost: CostResult;
  savings: SavingsResult;
  risk: RiskResult;
  strategies: StrategyComparison[];
  selectedStrategy: StrategyComparison;
  model: AnalysisResult["model"];
}

function pct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function band(p: ForecastPoint): string {
  return `${formatUSD(p.lower)}-${formatUSD(p.upper)}`;
}

export function buildRecommendation(input: RecommendationInput): FinalRecommendation {
  const {
    scenario,
    forecast,
    timing,
    vessel,
    port,
    route,
    cost,
    savings,
    risk,
    selectedStrategy,
    model,
  } = input;

  const cargoRef = getCargo(scenario.cargo);
  const weekOne = forecast.forecastRates[0];
  const totalTonnage = scenario.quantity * scenario.voyages;
  const alt = vessel.alternative;

  const headline = `${vessel.primary.type} on ${scenario.loadingPort} - ${scenario.dischargePort}, ${selectedStrategy.name.toLowerCase()}`;

  const summary =
    `OceanIQ recommends chartering a ${vessel.primary.dwtLabel} ${vessel.primary.type} for ` +
    `${scenario.quantity.toLocaleString()} t of ${cargoRef.label} over ${scenario.voyages} voyage(s) ` +
    `(${totalTonnage.toLocaleString()} t total) on the ${scenario.loadingPort} - ${scenario.dischargePort} corridor, ` +
    `using ${selectedStrategy.name.toLowerCase()}. The trained ${model.modelName.split(" (")[0]} model sees freight ` +
    `${forecast.trend.toLowerCase()} at ${formatUSD(forecast.predictedRate)}/day against a reference ` +
    `${formatUSD(forecast.currentRate)}/day, so the advice is "${timing.recommendation}" into ${timing.windowLabel.toLowerCase()}. ` +
    `Estimated all-in cost is ${formatUSD(cost.totalPerVoyage)} per voyage ` +
    `(${formatUSD(cost.costPerTonne)} per tonne), ${savings.label.toLowerCase()} against the spot-book baseline.`;

  const what = {
    title: "What OceanIQ recommends",
    summary: summary,
    items: [
      {
        label: "Vessel",
        value: `${vessel.primary.type} (${vessel.primary.dwtLabel})`,
        detail: `Suitability ${vessel.primary.score}/100; ${vessel.primary.portCompatibility.toLowerCase()} fit at ${scenario.dischargePort}${alt ? `; fallback ${alt.type} at ${alt.score}/100` : ""}.`,
      },
      {
        label: "Route",
        value: `${route.selected.label} - ${route.selected.distance.toLocaleString()} nm`,
        detail: `${route.selected.duration} days transit at ${route.selected.speedKnots} knots; risk ${route.selected.riskScore}/100 (${route.selected.riskLevel.toLowerCase()}).`,
      },
      {
        label: "Contract structure",
        value: `${selectedStrategy.name} (${selectedStrategy.code})`,
        detail: `${selectedStrategy.priceCertainty}% price certainty, ${selectedStrategy.flexibility}% flexibility, ${selectedStrategy.freightExposure}% residual freight exposure.`,
      },
      {
        label: "Charter timing",
        value: timing.recommendation,
        detail: `${timing.windowLabel}. Indicative cost of waiting ${formatUSD(timing.costOfWaitingProgram)} across the programme.`,
      },
      {
        label: "Discharge port",
        value: `${port.selected.name} (${port.selected.status.toLowerCase()})`,
        detail: `${port.selected.checks.filter((c) => c.status === "Pass").length}/4 constraints clear; ${port.selected.congestion}% projected congestion, about ${port.selected.waitingTimeProjected} days waiting.`,
      },
      {
        label: "Commodity & volume",
        value: `${cargoRef.label}, ${totalTonnage.toLocaleString()} t`,
        detail: `${scenario.voyages} voyage(s) of ${scenario.quantity.toLocaleString()} t; delivery target ${scenario.deliveryTarget}.`,
      },
    ],
  };

  const why = {
    title: "Why this is the right call",
    summary:
      `The recommendation is the intersection of what the model predicts, what the port can physically accept, ` +
      `and what the balance sheet prefers. Each reason below names the engine that produced it.`,
    items: [
      {
        label: "The forecast says so",
        value: `${forecast.trend} at ${formatUSD(forecast.predictedRate30d)}/day in 30 days (${pct(forecast.forecastChange30d)})`,
        detail:
          `${model.modelName} projects ${formatUSD(forecast.predictedRate90d)}/day at 90 days (${pct(forecast.forecastChange90d)}). ` +
          `The model's 80% band in week 1 is ${band(weekOne)} and the trough inside the horizon is ${formatUSD(forecast.bestRate)}/day at week ${forecast.bestWeek}.`,
      },
      {
        label: "The port can take it",
        value: `${port.selected.name} passes ${port.selected.checks.filter((c) => c.status === "Pass").length} of 4 physical checks`,
        detail:
          `Draft ${vessel.primary.draftMargin}m margin, LOA ${vessel.primary.loaMargin}m margin, beam ${vessel.primary.beamMargin}m margin. ` +
          (port.selected.constraints.length > 0 ? `Open constraint: ${port.selected.constraints[0]}` : "No hard physical constraint blocks this nomination."),
      },
      {
        label: "The economics justify it",
        value: `${formatUSD(cost.totalPerVoyage)} per voyage, ${formatUSD(cost.costPerTonne)} per tonne`,
        detail: `${cost.trendNote} Adverse band case ${formatUSD(cost.adverseCasePerVoyage)}, favourable band case ${formatUSD(cost.favourableCasePerVoyage)}.`,
      },
      {
        label: "The structure beats the alternatives",
        value: `${selectedStrategy.name} at attractiveness ${selectedStrategy.attractiveness}/100`,
        detail:
          `${formatUSD(selectedStrategy.savingsVsSpot)} (${selectedStrategy.savingsPercent}%) below the spot-book baseline across the covered programme, ` +
          `with ${selectedStrategy.priceCertainty}% certainty against ${input.strategies.find((s) => s.key === "spot")?.priceCertainty ?? 0}% for spot.`,
      },
      {
        label: "Risk is understood, not hidden",
        value: `${risk.level} programme risk (${risk.score}/100)`,
        detail: `Dominant driver: ${risk.components.slice().sort((a, b) => b.contribution - a.contribution)[0].label}. ${risk.caveat}`,
      },
    ],
  };

  const impact = {
    title: "What it delivers",
    summary:
      `On the reference cost model this programme saves ${formatUSD(savings.savings)} (${savings.savingsPercent}%) ` +
      `against the spot-book baseline while holding residual market exposure at ${selectedStrategy.freightExposure}%.`,
    items: [
      {
        label: "Programme saving",
        value: `${formatUSD(savings.savings)} (${savings.savingsPercent}%)`,
        detail: savings.drivers.map((d) => `${d.name}: ${formatUSD(d.amount)}`).join(" · "),
      },
      {
        label: "Total programme cost",
        value: formatUSD(savings.recommendedTotal),
        detail: `${scenario.voyages} voyage(s) at ${formatUSD(cost.totalPerVoyage)}; ${formatUSD(cost.costPerTonne)} per tonne.`,
      },
      {
        label: "Freight exposure after fixing",
        value: `${selectedStrategy.freightExposure}% of the programme`,
        detail: `${Math.round(selectedStrategy.freightExposure / 100 * scenario.voyages * 10) / 10} voyage-equivalents still price off the market under ${selectedStrategy.code}.`,
      },
      {
        label: "Carbon and ballast",
        value: `${route.selected.distance.toLocaleString()} nm per voyage`,
        detail: `Screening estimate only: ${route.selected.distance >= 6400 ? "Capesize-sized ballast legs on the longer corridors are the dominant source of avoidable emissions." : "Short corridor keeps ballast days low relative to laden days."} ${risk.components.find((c) => c.key === "compliance")?.mitigation ?? ""}`,
      },
    ],
  };

  const evidence: { source: string; detail: string }[] = [
    {
      source: "Freight forecasting model",
      detail: `${model.modelName} (${model.library}), ${model.nFeatures} features, trained on ${model.nTrainRows.toLocaleString()} rows of reference/synthetic weekly data. Held-out validation: MAE $${model.validation.maeUsd.toLocaleString()}, RMSE $${model.validation.rmseUsd.toLocaleString()}, MAPE ${model.validation.mapePercent}%, R2 ${model.validation.r2}.`,
    },
    {
      source: "Forecast resolution",
      detail: `Model run on lane "${forecast.laneResolution.lane}"${forecast.laneResolution.exact ? " (exact match)" : ` (proxied from ${forecast.laneResolution.basedOnLane})`}. ${forecast.laneResolution.adjustment}`,
    },
    {
      source: "Port feasibility engine",
      detail: `${port.selected.checks.map((c) => `${c.name} ${c.required}${c.unit} vs ${c.limit}${c.unit} (${c.status})`).join("; ")}.`,
    },
    {
      source: "Vessel optimisation engine",
      detail: vessel.all
        .map((v) => `${v.type} ${v.score}/100, ${v.portCompatibility}, ${v.utilisationPercent}% utilisation, ${formatUSD(v.impliedDailyRate)}/day`)
        .join("; "),
    },
    {
      source: "Route optimisation engine",
      detail: route.all.map((r) => `${r.name}: ${r.distance.toLocaleString()} nm, ${formatUSD(r.totalCost)}, risk ${r.riskScore}`).join("; "),
    },
    {
      source: "Cost engine",
      detail: cost.items.map((i) => `${i.name} ${formatUSD(i.perVoyage)} (${i.sharePercent}%)`).join("; "),
    },
    {
      source: "Risk engine",
      detail: risk.components.map((c) => `${c.label} ${c.score}/100 x ${c.weight}`).join("; "),
    },
    {
      source: "Contract strategy engine",
      detail: input.strategies
        .map((s) => `${s.code} ${formatUSD(s.totalCost)}, attractiveness ${s.attractiveness}, certainty ${s.priceCertainty}`)
        .join("; "),
    },
  ];

  const watchOuts: string[] = [
    forecast.laneResolution.exact
      ? "Forecast is a model projection from reference/synthetic history; it is not a broker quotation and will differ from the live market."
      : `Forecast is proxied from the adjacent lane "${forecast.laneResolution.basedOnLane}" and rescaled — treat the level as indicative, not precise.`,
    `Programme risk is ${risk.level.toLowerCase()} at ${risk.score}/100, driven mainly by ${risk.components.slice().sort((a, b) => b.contribution - a.contribution)[0].label.toLowerCase()}.`,
    `Waiting and demurrage at ${scenario.dischargePort} are a modelled provision (${port.selected.waitingTimeProjected} days), not a committed berth window.`,
    savings.caveat,
    risk.caveat,
  ];

  if (timing.recommendation === "Wait") {
    watchOuts.push(
      `Waiting to week ${timing.windowWeeks[0]} carries an indicative ${formatUSD(timing.costOfWaitingProgram)} exposure if rates firm faster than the model's central path.`,
    );
  }
  if (port.selected.alternative) {
    watchOuts.push(
      `Fallback port ${port.selected.alternative.name} is on standby: ${port.selected.alternative.reason}`,
    );
  }

  return {
    headline,
    summary,
    what,
    why,
    impact,
    evidence,
    watchOuts,
    disclaimer:
      "OceanIQ decision brief generated from a trained machine-learning model and a deterministic rule engine operating on " +
      "synthetic/reference dry-bulk market data. All rates, costs, risks and savings are modelled estimates for academic " +
      "prototype purposes; they are not live market data, not broker quotations, and not a financial recommendation. " +
      "No live SAIL, Baltic Exchange or AIS feed is connected in this build.",
  };
}