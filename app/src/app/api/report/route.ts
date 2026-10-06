/**
 * OceanIQ — report endpoint.
 *
 * POST /api/report
 * Body: a ProcurementScenario, or `{ reportId }` for a previously generated one
 * (the engine is deterministic, so re-requesting by id reproduces the report).
 *
 * Response: the generated report sections plus a printable text rendering.
 */

import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/engine/analysis";
import { buildGeneratedReport, buildReportSections } from "@/lib/engine/report";
import { mlArtifactsPresent } from "@/lib/ml/dataLoader";
import { DEFAULT_SCENARIO, type ProcurementScenario } from "@/lib/types";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flatten a result into a plain-text document, section by section. */
export function renderReportText(result: AnalysisResult): string {
  const sections = buildReportSections(result);
  const lines: string[] = [];

  lines.push("OCEANIQ — PROCUREMENT DECISION REPORT");
  lines.push("=".repeat(64));
  lines.push(`Scenario id      : ${result.scenarioId}`);
  lines.push(`Generated        : ${result.generatedAt}`);
  lines.push(`Reference as of  : ${result.referenceAsOf}`);
  lines.push(`Model            : ${result.model.modelName} (${result.model.library})`);
  lines.push(`Validation       : MAPE ${result.model.validation.mapePercent}%, RMSE $${result.model.validation.rmseUsd}, R2 ${result.model.validation.r2} on held-out reference tail`);
  lines.push("");
  lines.push(result.recommendation.headline.toUpperCase());
  lines.push(result.recommendation.summary);
  lines.push("");

  for (const section of sections) {
    lines.push("");
    lines.push(section.title);
    lines.push("-".repeat(section.title.length));
    for (const row of section.rows) {
      lines.push(`${row.label.padEnd(26, ".")} ${row.value}`);
    }
    if (section.table) {
      lines.push("");
      const header = section.table.columns;
      lines.push(header.join(" | "));
      lines.push(header.map((h) => "-".repeat(h.length)).join("-+-"));
      for (const row of section.table.rows) lines.push(row.join(" | "));
    }
    if (section.note) {
      lines.push("");
      lines.push(section.note);
    }
  }

  lines.push("");
  lines.push("-".repeat(64));
  lines.push("DISCLAIMER");
  lines.push(result.recommendation.disclaimer);

  return lines.join("\n");
}

export async function POST(request: Request) {
  if (!mlArtifactsPresent()) {
    return NextResponse.json(
      { error: "ML artifacts missing — regenerate them before requesting a report." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* default scenario */
  }

  const scenario: ProcurementScenario = {
    ...DEFAULT_SCENARIO,
    ...(typeof body === "object" ? body : {}),
  } as ProcurementScenario;

  const result = await runAnalysis(scenario);

  return NextResponse.json({
    reportId: result.scenarioId,
    scenario: result.scenario,
    generatedAt: result.generatedAt,
    headline: result.recommendation.headline,
    sections: buildReportSections(result),
    generated: buildGeneratedReport(result),
    text: renderReportText(result),
  });
}

export async function GET() {
  return NextResponse.json({
    usage: "POST a ProcurementScenario to /api/report to generate a decision report.",
    defaultScenario: DEFAULT_SCENARIO,
  });
}