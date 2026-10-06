/**
 * OceanIQ — report engine.
 *
 * Turns an `AnalysisResult` into the dynamic section set the Reports screen
 * renders. Every row is generated from the result, so a report can never show a
 * number that disagrees with the analysis it was generated from.
 */

import { getCargo } from "@/lib/reference/cargo";
import type {
  AnalysisResult,
  GeneratedReportSection,
  ReportSection,
} from "@/lib/types";

function tone(value: number, good: "low" | "high"): "good" | "warn" | "bad" {
  const isGood = good === "low" ? value <= 33 : value >= 67;
  return isGood ? "good" : value >= 66 ? "warn" : "warn";
}

export function buildReportSections(result: AnalysisResult): ReportSection[] {
  const {
    scenario,
    forecast,
    vessel,
    port,
    route,
    cost,
    savings,
    risk,
    model,
    selectedStrategy: strategy,
  } = result;
  const total = scenario.quantity * scenario.voyages;
  const cargoRef = getCargo(scenario.cargo);

  return [
    {
      id: "scenario",
      title: "1. Scenario Definition",
      rows: [
        { label: "Commodity", value: cargoRef.label },
        { label: "Quantity per voyage", value: `${scenario.quantity.toLocaleString()} t` },
        { label: "Voyages", value: String(scenario.voyages) },
        { label: "Total programme", value: `${total.toLocaleString()} t` },
        { label: "Origin", value: `${scenario.loadingPort}, ${scenario.originCountry}` },
        { label: "Discharge port", value: scenario.dischargePort },
        { label: "Contract horizon", value: scenario.contractHorizon },
        { label: "Stated strategy", value: strategy.name },
        { label: "Stated vessel preference", value: vessel.primary.type },
        { label: "Delivery target", value: scenario.deliveryTarget },
        { label: "Analysis generated", value: result.generatedAt },
        { label: "Reference data as of", value: result.referenceAsOf },
      ],
      note: `Deterministic analysis. Re-running this exact scenario reproduces this report byte for byte (scenario id ${result.scenarioId}).`,
    },
    {
      id: "forecast",
      title: "2. ML Freight Forecast",
      rows: [
        { label: "Model", value: `${model.modelName} via ${model.library}` },
        { label: "Training data", value: `${model.nTrainRows.toLocaleString()} rows · ${model.nFeatures} features` },
        { label: "Validation (held-out tail)", value: `MAE $${model.validation.maeUsd.toLocaleString()} · RMSE $${model.validation.rmseUsd.toLocaleString()} · MAPE ${model.validation.mapePercent}% · R² ${model.validation.r2}` },
        { label: "Reference rate today", value: `$${forecast.currentRate.toLocaleString()}/day` },
        { label: "Forecast (week 1)", value: `$${forecast.predictedRate.toLocaleString()}/day` },
        { label: "Forecast (30 days)", value: `$${forecast.predictedRate30d.toLocaleString()}/day (${forecast.forecastChange30d > 0 ? "+" : ""}${forecast.forecastChange30d}%)` },
        { label: "Forecast (90 days)", value: `$${forecast.predictedRate90d.toLocaleString()}/day (${forecast.forecastChange90d > 0 ? "+" : ""}${forecast.forecastChange90d}%)` },
        { label: "Trend", value: `${forecast.trend} · strength ${forecast.trendStrength}%` },
        { label: "Lowest point in horizon", value: `$${forecast.bestRate.toLocaleString()}/day at week ${forecast.bestWeek}` },
        { label: "Recommended charter week", value: `Week ${forecast.recommendedCharterWeek}` },
        { label: "Model confidence indicator", value: `${forecast.confidence}/100 · ${forecast.confidenceLabel}` },
        { label: "Lane used", value: forecast.laneResolution.lane },
      ],
      table: {
        columns: ["Week", "Date", "Rate $/day", "80% lower", "80% upper", "Change %"],
        rows: forecast.forecastRates.slice(0, 13).map((p) => [
          String(p.week),
          p.date,
          p.rate.toLocaleString(),
          p.lower.toLocaleString(),
          p.upper.toLocaleString(),
          `${p.changePercent > 0 ? "+" : ""}${p.changePercent.toFixed(1)}%`,
        ]),
      },
      note: forecast.notes.join(" "),
    },
    {
      id: "vessel",
      title: "3. Vessel Recommendation",
      rows: [
        { label: "Recommended vessel", value: `${vessel.primary.type} · ${vessel.primary.dwtLabel} · score ${vessel.primary.score}/100` },
        { label: "Port compatibility", value: vessel.primary.portCompatibility },
        { label: "Payload utilisation", value: `${vessel.primary.utilisationPercent}%` },
        { label: "Reference implied rate", value: `$${vessel.primary.impliedDailyRate.toLocaleString()}/day` },
        { label: "Market availability", value: `${vessel.primary.availability} (${vessel.primary.availabilityIndex}/100)` },
        { label: "Runner-up", value: vessel.alternative ? `${vessel.alternative.type} · ${vessel.alternative.score}/100` : "None" },
      ],
      table: {
        columns: ["Class", "Score", "Port fit", "Util %", "Rate $/day", "Cost/voyage"],
        rows: vessel.all.map((v) => [
          v.type,
          String(v.score),
          v.portCompatibility,
          v.utilisationPercent.toFixed(0),
          v.impliedDailyRate.toLocaleString(),
          v.costImplication.replace(/\D+/g, "").slice(0, 9) || "-",
        ]),
      },
      note: vessel.primary.reasons.join(" "),
    },
    {
      id: "port",
      title: "4. Port Feasibility & Congestion",
      rows: [
        { label: "Discharge port", value: `${port.selected.name} · ${port.selected.status}` },
        { label: "Feasibility score", value: `${port.selected.score}/100` },
        { label: "Projected congestion", value: `${port.selected.congestion}% · ${port.selected.congestionLabel}` },
        { label: "Waiting time", value: `${port.selected.waitingTime} days now · ${port.selected.waitingTimeProjected} days projected` },
        { label: "Berths available", value: `${port.selected.berthsAvailable} of ${port.selected.totalBerths}` },
        { label: "Berth utilisation", value: `${port.selected.berthUtilisationPercent}%` },
        { label: "Best alternative", value: `${port.bestAlternative.name} (${port.bestAlternative.reason})` },
      ],
      table: {
        columns: ["Constraint", "Required", "Limit", "Margin", "Status"],
        rows: port.selected.checks.map((c) => [
          c.name,
          `${c.required} ${c.unit}`,
          `${c.limit} ${c.unit}`,
          `${c.margin > 0 ? "+" : ""}${c.margin}`,
          c.status,
        ]),
      },
      note: port.selected.warnings.length > 0 ? port.selected.warnings.join(" ") : "No warnings raised.",
    },
    {
      id: "route",
      title: "5. Route Optimisation",
      rows: [
        { label: "Selected corridor", value: route.selected.name },
        { label: "Distance", value: `${route.selected.distance.toLocaleString()} nm` },
        { label: "Duration", value: `${route.selected.duration} days at ${route.selected.speedKnots} knots` },
        { label: "All-in cost", value: `$${route.selected.totalCost.toLocaleString()} · $${route.selected.costPerTonne}/tonne` },
        { label: "Route risk", value: `${route.selected.riskScore}/100 · ${route.selected.riskLevel}` },
        { label: "Congestion exposure", value: `${route.selected.congestionExposure}%` },
      ],
      table: {
        columns: ["Corridor", "Distance nm", "Days", "Cost $/voyage", "Risk", "Selected"],
        rows: route.all.map((r) => [
          r.label,
          r.distance.toLocaleString(),
          r.duration.toFixed(1),
          r.totalCost.toLocaleString(),
          String(r.riskScore),
          r.recommended ? "Yes" : "-",
        ]),
      },
      note: route.selected.notes.join(" "),
    },
    {
      id: "cost",
      title: "6. Cost Breakdown",
      rows: [
        { label: "Reference rate used", value: `$${cost.referenceRatePerDay.toLocaleString()}/day` },
        { label: "Cost per voyage", value: `$${cost.totalPerVoyage.toLocaleString()}` },
        { label: "Programme cost", value: `$${cost.totalProgram.toLocaleString()}` },
        { label: "Cost per tonne", value: `$${cost.costPerTonne}` },
        { label: "Bunker index", value: String(cost.bunkerIndex) },
        { label: "Cost trend", value: cost.trend },
        { label: "Adverse band case", value: `$${cost.adverseCasePerVoyage.toLocaleString()} per voyage` },
        { label: "Favourable band case", value: `$${cost.favourableCasePerVoyage.toLocaleString()} per voyage` },
      ],
      table: {
        columns: ["Cost line", "Per voyage", "Programme", "Share"],
        rows: cost.items.map((i) => [
          i.name,
          `$${i.perVoyage.toLocaleString()}`,
          `$${i.program.toLocaleString()}`,
          `${i.sharePercent}%`,
        ]),
      },
      note: cost.trendNote,
    },
    {
      id: "savings",
      title: "7. Cost Savings",
      rows: [
        { label: "Baseline", value: savings.baselineLabel },
        { label: "Baseline programme cost", value: `$${savings.baselineTotal.toLocaleString()}` },
        { label: "Recommended programme cost", value: `$${savings.recommendedTotal.toLocaleString()}` },
        { label: "Savings", value: `$${savings.savings.toLocaleString()} (${savings.savingsPercent}%)` },
        { label: "Savings in INR", value: `₹${(savings.savingsInr / 10000000).toFixed(2)} Cr` },
      ],
      table: {
        columns: ["Driver", "Amount"],
        rows: savings.drivers.map((d) => [d.name, `$${d.amount.toLocaleString()}`]),
      },
      note: savings.caveat,
    },
    {
      id: "risk",
      title: "8. Risk Assessment",
      rows: [
        { label: "Programme risk", value: `${risk.score}/100 · ${risk.level}` },
        { label: "Dominant driver", value: risk.keyDrivers[0] ?? "n/a" },
      ],
      table: {
        columns: ["Component", "Score", "Weight", "Contribution", "Level"],
        rows: risk.components.map((c) => [
          c.label,
          String(c.score),
          `${Math.round(c.weight * 100)}%`,
          c.contribution.toFixed(1),
          c.level,
        ]),
      },
      note: risk.caveat,
    },
    {
      id: "strategy",
      title: "9. Contract Strategy Comparison",
      rows: [
        { label: "Recommended structure", value: `${result.selectedStrategy.name} (${result.selectedStrategy.code})` },
        { label: "Attractiveness", value: `${result.selectedStrategy.attractiveness}/100` },
        { label: "Savings vs spot", value: `$${result.selectedStrategy.savingsVsSpot.toLocaleString()} (${result.selectedStrategy.savingsPercent}%)` },
        { label: "Residual freight exposure", value: `${result.selectedStrategy.freightExposure}%` },
        { label: "Charter timing", value: result.charterTiming.recommendation },
      ],
      table: {
        columns: ["Structure", "Programme cost", "vs spot", "Certainty", "Flexibility", "Exposure", "Score"],
        rows: result.strategies.map((s) => [
          s.name,
          `$${s.totalCost.toLocaleString()}`,
          `${s.savingsPercent}%`,
          String(s.priceCertainty),
          String(s.flexibility),
          `${s.freightExposure}%`,
          String(s.attractiveness),
        ]),
      },
      note: result.selectedStrategy.rationale,
    },
    {
      id: "recommendation",
      title: "10. Final Recommendation",
      rows: [
        ...result.recommendation.what.items.map((i) => ({ label: i.label, value: i.value })),
      ],
      note: [
        result.recommendation.summary,
        "",
        "Watch-outs:",
        ...result.recommendation.watchOuts.map((w) => `- ${w}`),
      ].join("\n"),
    },
    {
      id: "disclosure",
      title: "11. Data Provenance & Limitations",
      rows: [
        { label: "Dataset", value: result.disclosure.datasetKind },
        { label: "Trained on", value: result.disclosure.trainedOn },
        { label: "Not trained on", value: result.disclosure.notTrainedOn.join("; ") },
        { label: "Cost note", value: result.disclosure.costNote },
        { label: "Risk note", value: result.disclosure.riskNote },
        { label: "Savings note", value: result.disclosure.savingsNote },
        { label: "Recalibration", value: result.disclosure.recalibrationNote },
      ],
      note: result.recommendation.disclaimer,
    },
  ];
}

/** Flattened section model used by the dashboard/report preview cards. */
export function buildGeneratedReport(result: AnalysisResult): GeneratedReportSection[] {
  const { recommendation, savings, risk, forecast, cost, selectedStrategy } = result;

  return [
    {
      id: "summary",
      title: "Executive Summary",
      body: [recommendation.summary],
      metrics: [
        { label: "Recommended vessel", value: result.vessel.primary.type, tone: "good" },
        { label: "Programme cost", value: `$${cost.totalProgram.toLocaleString()}`, tone: "good" },
        { label: "Savings", value: `${savings.savingsPercent}%`, tone: "good" },
        { label: "Risk", value: `${risk.score}/100 ${risk.level}`, tone: tone(risk.score, "low") },
      ],
    },
    {
      id: "decision",
      title: "The Decision",
      body: [recommendation.headline, recommendation.summary],
      metrics: [
        { label: "Charter timing", value: result.charterTiming.recommendation },
        { label: "Structure", value: selectedStrategy.code },
        { label: "Forecast (30d)", value: `$${forecast.predictedRate30d.toLocaleString()}/day` },
      ],
    },
    {
      id: "evidence",
      title: "Evidence",
      body: recommendation.evidence.map((e) => `${e.source}: ${e.detail}`),
      metrics: [],
    },
    {
      id: "watch",
      title: "Watch-outs",
      body: recommendation.watchOuts,
      metrics: [],
    },
    {
      id: "disclaimer",
      title: "Disclaimer",
      body: [recommendation.disclaimer],
      metrics: [],
    },
  ];
}