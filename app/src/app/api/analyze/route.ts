/**
 * OceanIQ — analysis REST endpoint.
 *
 * POST /api/analyze
 * Body: a partial ProcurementScenario (missing fields fall back to the
 * documented default scenario).
 *
 * Response: the full AnalysisResult — the same object every screen reads.
 */

import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/engine/analysis";
import { buildGeneratedReport, buildReportSections } from "@/lib/engine/report";
import { mlArtifactsPresent } from "@/lib/ml/dataLoader";
import { DEFAULT_SCENARIO, type ProcurementScenario } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coerceScenario(body: Record<string, unknown>): ProcurementScenario {
  const s = body.scenario && typeof body.scenario === "object"
    ? (body.scenario as Record<string, unknown>)
    : body;

  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;

  return {
    cargo: str(s.cargo, DEFAULT_SCENARIO.cargo) as ProcurementScenario["cargo"],
    quantity: num(s.quantity, DEFAULT_SCENARIO.quantity),
    voyages: Math.round(num(s.voyages, DEFAULT_SCENARIO.voyages)),
    originCountry: str(s.originCountry, DEFAULT_SCENARIO.originCountry),
    loadingPort: str(s.loadingPort, DEFAULT_SCENARIO.loadingPort),
    dischargePort: str(s.dischargePort, DEFAULT_SCENARIO.dischargePort),
    contractHorizon: str(s.contractHorizon, DEFAULT_SCENARIO.contractHorizon),
    contractStrategy: (str(
      s.contractStrategy,
      DEFAULT_SCENARIO.contractStrategy,
    ) as ProcurementScenario["contractStrategy"]),
    preferredVesselType: str(
      s.preferredVesselType,
      DEFAULT_SCENARIO.preferredVesselType,
    ) as ProcurementScenario["preferredVesselType"],
    deliveryTarget: str(s.deliveryTarget, DEFAULT_SCENARIO.deliveryTarget),
  };
}

export async function POST(request: Request) {
  if (!mlArtifactsPresent()) {
    return NextResponse.json(
      {
        error:
          "ML artifacts missing. Run: python -m ml.data.generate_reference_data; python -m ml.train_model; python -m ml.data.generate_exogenous_forecast",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // An empty body is valid — it means "run the default scenario".
  }

  const scenario = coerceScenario(body);
    const result = await runAnalysis(scenario);
  const includeReport = body.includeReport === true || body.includeReport === "true";

  return NextResponse.json({
    analysis: result,
    computeMs: result.computeMs,
    ...(includeReport
      ? {
          reportSections: buildReportSections(result),
          generatedReport: buildGeneratedReport(result),
        }
      : {}),
  });
}

/** Convenience GET so the endpoint can be probed without a body. */
export async function GET() {
  if (!mlArtifactsPresent()) {
    return NextResponse.json(
      { error: "ML artifacts missing — see POST /api/analyze." },
      { status: 503 },
    );
  }
  const result = await runAnalysis(DEFAULT_SCENARIO);
  return NextResponse.json({
    scenario: result.scenario,
    scenarioId: result.scenarioId,
    model: result.model,
    forecast: {
      currentRate: result.forecast.currentRate,
      predictedRate: result.forecast.predictedRate,
      predictedRate30d: result.forecast.predictedRate30d,
      trend: result.forecast.trend,
      lane: result.forecast.laneResolution.lane,
    },
    recommendation: result.recommendation.headline,
    computeMs: result.computeMs,
  });
}