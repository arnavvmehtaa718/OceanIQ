/**
 * OceanIQ — health / provenance endpoint.
 *
 * GET /api/health
 * Reports which ML artifacts are present, their row counts and dates, and the
 * validation metrics. Used by the Settings screen's "Data provenance" panel and
 * by anyone verifying that the build is reading a real trained model.
 */

import { NextResponse } from "next/server";
import {
  getExogenousForecast,
  getHistoryMeta,
  getHistorySeries,
  getModelMetrics,
  mlArtifactsPresent,
} from "@/lib/ml/dataLoader";
import { getModelDescriptor } from "@/lib/ml/forecastService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const present = mlArtifactsPresent();
  if (!present) {
    return NextResponse.json(
      {
        status: "artifacts-missing",
        message:
          "ML artifacts are not present. Regenerate them with: python -m ml.data.generate_reference_data, python -m ml.train_model, python -m ml.data.generate_exogenous_forecast",
      },
      { status: 503 },
    );
  }

  const metrics = getModelMetrics();
  const meta = getHistoryMeta();
  const series = getHistorySeries();
  const exo = getExogenousForecast();

  return NextResponse.json({
    status: "ok",
    artifacts: {
      historyCsv: `ml/data/freight_history_reference.csv (${meta.rows.toLocaleString()} rows)`,
      exogenousCsv: `ml/data/exogenous_forecast.csv (${exo.length} weeks)`,
      forest: `ml/model/freight_rf_model.json (${metrics.model.nEstimators} trees)`,
      metrics: "ml/model/metrics.json",
      parityFixture: "ml/model/parity_fixture.json (400 held-out rows)",
    },
    history: {
      rows: meta.rows,
      lanes: series.size,
      asOf: meta.asOf,
      firstWeek: series.size > 0 ? [...series.values()][0].dates[0] : null,
      lastWeek: exo[exo.length - 1]?.date ?? null,
    },
    model: getModelDescriptor(),
    metrics: {
      train: metrics.train,
      test: metrics.test,
      splitStrategy: metrics.splitStrategy,
      trainThroughDate: metrics.trainThroughDate,
      testFromDate: metrics.testFromDate,
    },
    disclaimer: metrics.disclaimer,
  });
}