/**
 * OceanIQ — procurement decision report PDF.
 *
 * Renders the *current* `AnalysisResult` into a structured A4 document with
 * jsPDF + jspdf-autotable. Nothing is recomputed here: every number, rating and
 * paragraph comes straight off the central result the screens render, so the
 * PDF can never disagree with the on-screen report.
 *
 * jsPDF's built-in Helvetica uses WinAnsi encoding, so all copy passes through
 * `safeText()` before it reaches the canvas.
 */

import type { CellHookData } from "jspdf-autotable";
import { formatDate, formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { AnalysisResult, RiskLevel } from "@/lib/types";

export interface ReportMeta {
  /** Report name shown on the cover, e.g. "Full Decision Brief". */
  name?: string;
  /** Pre-formatted generation label shown in the header, e.g. "6 Oct 2026". */
  generatedLabel?: string;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = { left: 15, right: 15, top: 26, bottom: 20 };
const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right;
const BOTTOM = PAGE_H - MARGIN.bottom;

const INK: [number, number, number] = [15, 23, 42];
const BODY: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const HAIR: [number, number, number] = [203, 213, 225];
const NAVY: [number, number, number] = [10, 14, 26];
const PANEL: [number, number, number] = [241, 245, 249];
const ZEBRA: [number, number, number] = [248, 250, 252];
const ACCENT: [number, number, number] = [29, 78, 216];
const GOOD: [number, number, number] = [5, 150, 105];
const WARN: [number, number, number] = [217, 119, 6];
const NOTE_WARN: [number, number, number] = [124, 82, 20];
const BAD: [number, number, number] = [220, 38, 38];
const WHITE: [number, number, number] = [255, 255, 255];

const RISK_COLOR: Record<RiskLevel, [number, number, number]> = {
  Low: GOOD,
  Medium: WARN,
  High: BAD,
};

const SIZE = {
  coverTitle: 21,
  coverMeta: 9,
  section: 12.5,
  sub: 9.5,
  body: 8.6,
  small: 7.6,
  tableHead: 7.8,
  table: 7.6,
};

/** Vertical room a sub-heading must keep on the page for the block it introduces. */
const KEEP_WITH_NEXT_MM = 18;

const REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2192": "->",
  "\u2190": "<-",
  "\u2191": "^",
  "\u2193": "v",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2260": "!=",
  "\u00b2": "2",
  "\u00b3": "3",
  "\u00d7": "x",
  "\u00f7": "/",
  "\u20ac": "EUR",
  "\u20b9": "INR ",
  "\u2026": "...",
  "\u2022": "-",
  "\u00a9": "(c)",
  "\u00ae": "(tm)",
  "\u00a0": " ",
  "\u00ad": "",
};

/** Keeps copy inside the WinAnsi range of jsPDF's built-in fonts. */
function safeText(input: string): string {
  return String(input ?? "")
    .replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2212\u2192\u2190\u2191\u2193\u2264\u2265\u2260\u00b2\u00b3\u00d7\u00f7\u20ac\u20b9\u2026\u2022\u00a9\u00ae\u00a0\u00ad]/g, (m) => REPLACEMENTS[m] ?? "")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "");
}

function portKey(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

/** `OceanIQ_Procurement_Report_HayPoint_Paradip.pdf` */
export function procurementReportFilename(analysis: AnalysisResult): string {
  const { loadingPort, dischargePort } = analysis.scenario;
  return `OceanIQ_Procurement_Report_${portKey(loadingPort) || "Origin"}_${portKey(dischargePort) || "Destination"}.pdf`;
}

function money(n: number): string {
  return safeText(formatUSD(n));
}

function moneyExact(n: number): string {
  return safeText(formatUSDExact(n));
}

function signed(n: number): string {
  const text = Math.abs(n) < 0.005 ? "0" : formatUSD(Math.abs(n));
  return n < 0 ? `-${text}` : `+${text}`;
}

function signedInr(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("en-US");
  return `${n < 0 ? "-" : "+"}INR ${abs}`;
}

function signedPercent(n: number, digits = 1): string {
  const value = Number.isFinite(n) ? n : 0;
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}%`;
}

export async function buildProcurementReportPdf(
  analysis: AnalysisResult,
  meta: ReportMeta = {},
): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const { scenario, forecast, charterTiming, vessel, port, route, cost, savings, risk } = analysis;
  const strategy = analysis.selectedStrategy;
  const model = analysis.model;
  const generatedLabel = meta.generatedLabel ?? safeText(analysis.generatedAt.slice(0, 10));
  const reportName = meta.name ?? "Procurement Decision Report";
  const corridor = `${scenario.loadingPort} -> ${scenario.dischargePort}`;

  doc.setProperties({
    title: `OceanIQ Procurement Report - ${corridor}`,
    subject: `OceanIQ maritime procurement decision brief for ${corridor}`,
    author: "OceanIQ",
    keywords: "OceanIQ, procurement, maritime analytics, reference data",
    creator: "OceanIQ",
  });

  let y = MARGIN.top;

  const setBody = (size: number, style: "normal" | "bold" | "italic", color: [number, number, number]) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const remaining = () => BOTTOM - y;

  const need = (mm: number) => {
    if (remaining() < mm) {
      doc.addPage();
      y = MARGIN.top;
    }
  };

  const wrap = (text: string, width = CONTENT_W): string[] =>
    doc.splitTextToSize(safeText(text), width) as unknown as string[];

  const paragraph = (
    text: string,
    opts: { size?: number; style?: "normal" | "bold" | "italic"; color?: [number, number, number]; gap?: number } = {},
  ) => {
    const size = opts.size ?? SIZE.body;
    const style = opts.style ?? "normal";
    setBody(size, style, opts.color ?? BODY);
    const lines = wrap(text);
    const lh = size * 0.3528 * 1.42;
    need(lines.length * lh);
    doc.text(lines, MARGIN.left, y);
    y += lines.length * lh + (opts.gap ?? 2.2);
  };

  const bullets = (items: (string | undefined | null)[], size = SIZE.body) => {
    const usable = CONTENT_W - 5;
    setBody(size, "normal", BODY);
    items.filter(Boolean).forEach((raw) => {
      const lines = wrap(String(raw), usable);
      const lh = size * 0.3528 * 1.42;
      need(lines.length * lh + 1.2);
      doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.circle(MARGIN.left + 1.4, y - size * 0.3528 * 0.32, 0.8, "F");
      doc.text(lines, MARGIN.left + 5, y);
      y += lines.length * lh + 1.2;
    });
    y += 1;
  };

  const label = (text: string) => {
    need(KEEP_WITH_NEXT_MM);
    const value = safeText(text).toUpperCase();
    setBody(SIZE.small - 0.6, "bold", ACCENT);
    doc.text(value, MARGIN.left, y);
    y += 4;
  };

  const table = (
    head: string[],
    rows: (string | number)[][],
    opts: {
      widths?: number[];
      align?: ("left" | "right" | "center")[];
      emphasis?: number[];
      startY?: number;
      fontSize?: number;
    } = {},
  ) => {
    const startY = opts.startY ?? y;
    const fontSize = opts.fontSize ?? SIZE.table;
    autoTable(doc, {
      startY,
      head: [head],
      body: rows.map((row) => row.map((cell) => safeText(String(cell ?? "")))),
      margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top, bottom: MARGIN.bottom },
      tableWidth: CONTENT_W,
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      columnStyles: {
        ...(opts.widths
          ? opts.widths.reduce<Record<string, { cellWidth: number }>>((acc, width, i) => {
              acc[String(i)] = { cellWidth: width };
              return acc;
            }, {})
          : {}),
        ...(opts.align
          ? opts.align.reduce<Record<string, { halign: "left" | "right" | "center" }>>((acc, value, i) => {
              acc[String(i)] = { halign: value };
              return acc;
            }, {})
          : {}),
      },
      styles: {
        font: "helvetica",
        fontSize,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        lineColor: HAIR,
        lineWidth: 0.1,
        textColor: BODY,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: SIZE.tableHead,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: ZEBRA },
      ...(opts.emphasis && opts.emphasis.length > 0
        ? {
            didParseCell: (hook: CellHookData) => {
              if (hook.section !== "body") return;
              if (opts.emphasis?.indexOf(hook.column.index) === -1) return;
              hook.cell.styles.fontStyle = "bold";
              hook.cell.styles.textColor = hook.column.index === 0 ? ACCENT : BODY;
            },
          }
        : {}),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    y += 4;
  };

  const kv = (rows: [string, string][], opts: { emphasis?: number } = {}) => {
    table(["Field", "Value"], rows.map(([k, v]) => [k, v]), {
      widths: [66, CONTENT_W - 66],
      emphasis: opts.emphasis === undefined ? [] : [opts.emphasis],
    });
  };

  const note = (text: string, tone: "info" | "warn" = "info") => {
    const size = SIZE.small + 0.2;
    const ink: [number, number, number] = tone === "warn" ? NOTE_WARN : MUTED;
    setBody(size, "italic", ink);
    const lines = wrap(text, CONTENT_W - 6);
    const lh = size * 0.3528 * 1.4;
    const boxH = lines.length * lh + 4;
    need(boxH + 2);
    doc.setFillColor(PANEL[0], PANEL[1], PANEL[2]);
    doc.setDrawColor(tone === "warn" ? WARN[0] : HAIR[0], tone === "warn" ? WARN[1] : HAIR[1], tone === "warn" ? WARN[2] : HAIR[2]);
    doc.setLineWidth(0.1);
    doc.roundedRect(MARGIN.left, y - 1.6, CONTENT_W, boxH, 1.2, 1.2, "FD");
    if (tone === "warn") {
      doc.setFillColor(WARN[0], WARN[1], WARN[2]);
      doc.rect(MARGIN.left, y - 1.6, 1, boxH, "F");
    }
    doc.text(lines, MARGIN.left + 3.5, y + 1);
    y += boxH + 3;
  };

  const section = (index: number, title: string, tag?: string) => {
    const titleH = 11;
    need(titleH + 16);
    if (index > 1) y += 3;
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(MARGIN.left, y - 3.4, 1.6, 7.2, "F");
    setBody(SIZE.section, "bold", INK);
    doc.text(safeText(`${index}.  ${title}`), MARGIN.left + 3.6, y + 1.2);
    if (tag) {
      setBody(SIZE.small - 0.4, "bold", WARN);
      const tagText = safeText(tag).toUpperCase();
      const w = doc.getTextWidth(tagText) + 4;
      const rx = MARGIN.left + CONTENT_W - w;
      const ry = y - 2.6;
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(252, 211, 77);
      doc.setLineWidth(0.1);
      doc.roundedRect(rx, ry, w, 5.4, 1, 1, "FD");
      setBody(SIZE.small - 0.4, "bold", [146, 92, 8]);
      doc.text(tagText, rx + 2, ry + 3.7);
    }
    y += 4.4;
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.15);
    doc.line(MARGIN.left, y, MARGIN.left + CONTENT_W, y);
    y += 4;
  };

  // ---------------------------------------------------------------- cover ---
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, PAGE_W, 34, "F");
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(0, 0, 3.2, 34, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text("OceanIQ", MARGIN.left - 6.2, 15.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(148, 178, 255);
  doc.text("MARITIME PROCUREMENT INTELLIGENCE", MARGIN.left - 6.2, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(148, 178, 255);
  doc.text(
    safeText(`Report date ${generatedLabel}  |  Reference data as of ${safeText(formatDate(analysis.referenceAsOf))}`),
    PAGE_W - MARGIN.right,
    12,
    { align: "right" },
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(safeText(`Scenario ${analysis.scenarioId}`), PAGE_W - MARGIN.right, 18.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(148, 178, 255);
  doc.text("REFERENCE / SYNTHETIC DATA - NOT A LIVE QUOTATION", PAGE_W - MARGIN.right, 24.5, {
    align: "right",
  });

  y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.coverTitle);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(safeText(reportName), MARGIN.left, y);
  y += 7;

  setBody(11, "bold", ACCENT);
  doc.text(safeText(corridor), MARGIN.left, y);
  y += 5.4;

  setBody(SIZE.coverMeta, "normal", MUTED);
  const headline =
    `${scenario.cargo}  |  ${formatNumber(scenario.quantity)} t per parcel  |  ${scenario.voyages} voyage` +
    `${scenario.voyages > 1 ? "s" : ""}  |  ${formatNumber(analysis.totalQuantity)} t programme  |  ${vessel.primary.type}`;
  doc.text(wrap(headline), MARGIN.left, y);
  y += wrap(headline).length * 4 + 4;

  table(
    ["Programme cost", "Per voyage", "Per tonne", "Risk (prototype)", "Forecast confidence", "Structure"],
    [
      [
        money(cost.totalProgram),
        money(cost.totalPerVoyage),
        `${moneyExact(cost.costPerTonne)}/t`,
        `${risk.score}/100 ${risk.level}`,
        `${forecast.confidence}%`,
        strategy.code,
      ],
    ],
    {
      align: ["left", "right", "right", "left", "left", "left"],
      widths: [36, 30, 24, 32, 30, CONTENT_W - 152],
      emphasis: [0, 1, 2],
    },
  );

  // ------------------------------------------------- 1. Executive summary ---
  section(1, "Executive Summary");
  paragraph(analysis.recommendation.headline, { size: 10.5, style: "bold", color: INK });
  paragraph(analysis.recommendation.summary);

  kv(
    [
      ["Recommended vessel", `${vessel.primary.type} (${vessel.primary.dwtLabel}), suitability ${vessel.primary.score}/100`],
      ["Recommended corridor", `${route.selected.name} - ${formatNumber(route.selected.distance)} nm, ${route.selected.duration} days at ${route.selected.speedKnots} kn`],
      ["Discharge port", `${port.selected.name} (${port.selected.status}), feasibility ${port.selected.score}/100`],
      ["Contract structure", `${strategy.name} (${strategy.code}), attractiveness ${strategy.attractiveness}/100`],
      ["Charter timing", `${charterTiming.recommendation} - ${charterTiming.windowLabel}`],
      [
        savings.savings >= 0 ? "Modelled saving vs baseline" : "Modelled certainty premium vs baseline",
        `${signed(savings.savings)} (${signedPercent(savings.savingsPercent)}) - ${savings.label}`,
      ],
      ["Prototype risk score", `${risk.score}/100 (${risk.level}) - dominant driver: ${risk.keyDrivers[0] ?? "n/a"}`],
      ["Prototype ML forecast", `${forecast.trend}, ${money(forecast.predictedRate30d)}/day at 30 days (${signedPercent(forecast.forecastChange30d)})`],
    ],
    { emphasis: 1 },
  );
  note(
    "Simulated / reference estimate. Every figure in this report is produced by the OceanIQ deterministic pipeline over synthetic reference data; nothing here is a live market quote, a broker fixture or a booked position.",
  );

  // ------------------------------------------------ 2. Procurement scenario --
  section(2, "Procurement Scenario");
  const originCoord = route.selected.coordinates[0];
  const destCoord = route.selected.coordinates[route.selected.coordinates.length - 1];
  kv(
    [
      ["Commodity", scenario.cargo],
      ["Origin country", scenario.originCountry],
      [
        "Loading port",
        `${scenario.loadingPort}${originCoord ? ` (${originCoord.lat.toFixed(4)}, ${originCoord.lng.toFixed(4)})` : ""}`,
      ],
      [
        "Discharge port",
        `${scenario.dischargePort}${destCoord ? ` (${destCoord.lat.toFixed(4)}, ${destCoord.lng.toFixed(4)})` : ""}`,
      ],
      ["Quantity per parcel", `${formatNumber(scenario.quantity)} tonnes`],
      ["Programme voyages", String(scenario.voyages)],
      ["Total programme quantity", `${formatNumber(analysis.totalQuantity)} tonnes`],
      ["Contract horizon", scenario.contractHorizon],
      ["Stated contract strategy", scenario.contractStrategy],
      ["Stated vessel preference", scenario.preferredVesselType],
      ["Delivery target", scenario.deliveryTarget],
      ["Scenario ID", analysis.scenarioId],
      ["Analysis generated", safeText(analysis.generatedAt.replace("T", " ").slice(0, 19))],
      ["Reference data as of", safeText(formatDate(analysis.referenceAsOf))],
    ],
    { emphasis: 1 },
  );

  // ------------------------------------------------------ 3. ML  forecast ---
  section(3, "ML Freight Forecast", "Prototype ML Forecast");
  kv(
    [
      ["Model", `${model.modelName}`],
      ["Library", model.library],
      ["Training data", `${formatNumber(model.nTrainRows)} rows, ${model.nFeatures} features (${model.datasetKind})`],
      ["Split strategy", `${model.splitStrategy}; trained through ${safeText(formatDate(model.trainThroughDate))}, tested from ${safeText(formatDate(model.testFromDate))}`],
      [
        "Held-out validation",
        `MAE ${moneyExact(model.validation.maeUsd)}, RMSE ${moneyExact(model.validation.rmseUsd)}, MAPE ${model.validation.mapePercent}%, R2 ${model.validation.r2}`,
      ],
      ["Reference lane used", `${forecast.laneResolution.lane} (${forecast.laneResolution.exact ? "exact match" : `proxied via ${forecast.laneResolution.basedOnLane ?? "adjacent lane"}`}) - ${forecast.laneResolution.adjustment}`],
      ["Latest observed rate", `${money(forecast.currentRate)}/day`],
      ["Prediction, week 1", `${money(forecast.predictedRate)}/day`],
      ["Prediction, 30 days", `${money(forecast.predictedRate30d)}/day (${signedPercent(forecast.forecastChange30d)})`],
      ["Prediction, 90 days", `${money(forecast.predictedRate90d)}/day (${signedPercent(forecast.forecastChange90d)})`],
      ["Trend", `${forecast.trend}, strength ${Math.round(forecast.trendStrength * 100)}%`],
      ["Lowest rate in horizon", `${money(forecast.bestRate)}/day at week ${forecast.bestWeek}`],
      ["Confidence indicator", `${forecast.confidence}/100 - ${forecast.confidenceLabel}`],
      ["Known limitation", model.limitation],
    ],
    { emphasis: 1 },
  );

  label("Forecast path (prototype model, reference data)");
  table(
    ["Week", "Date", "Rate $/day", "80% lower", "80% upper", "Change %"],
    forecast.forecastRates.map((point) => [
      String(point.week),
      safeText(formatDate(point.date)),
      formatNumber(point.rate),
      formatNumber(point.lower),
      formatNumber(point.upper),
      signedPercent(point.changePercent),
    ]),
    {
      widths: [16, 32, 34, 34, 34, CONTENT_W - 150],
      align: ["center", "left", "right", "right", "right", "right"],
    },
  );

  if (forecast.majorFactors.length > 0) {
    label("Model drivers (global importance / scenario sensitivity)");
    table(
      ["Factor", "Importance %", "Sensitivity $/day", "Direction"],
      forecast.majorFactors.map((f) => [
        f.label,
        f.importance.toFixed(1),
        signed(f.sensitivity),
        f.direction,
      ]),
      {
        widths: [CONTENT_W - 92, 32, 34, 26],
        align: ["left", "right", "right", "center"],
      },
    );
  }

  // ----------------------------------------------------- 4. Charter timing ---
  section(4, "Charter Timing");
  kv(
    [
      ["Timing call", charterTiming.recommendation],
      ["Recommended window", charterTiming.windowLabel],
      ["Wait before fixture", `${charterTiming.waitDays} days`],
      ["Indicative cost of waiting", `${money(charterTiming.costOfWaitingPerVoyage)} per voyage, ${money(charterTiming.costOfWaitingProgram)} across the programme`],
    ],
    { emphasis: 1 },
  );
  bullets(charterTiming.rationale);

  // ------------------------------------------------ 5. Vessel  selection ----
  section(5, "Vessel Recommendation");
  kv(
    [
      ["Recommended class", `${vessel.primary.type} - ${vessel.primary.dwtLabel}`],
      ["Suitability score", `${vessel.primary.score}/100`],
      ["Payload available", `${formatNumber(vessel.primary.payload)} t dwt`],
      ["Payload utilisation", `${formatNumber(vessel.primary.utilisationTonnes)} t (${Math.round(vessel.primary.utilisationPercent)}%)`],
      ["Port compatibility", `${vessel.primary.portCompatibility} at ${port.selected.name} (${vessel.primary.compatibilityScore}/100)`],
      ["Estimated cost per day", money(vessel.primary.costPerDay)],
      ["Reference implied rate", `${money(vessel.primary.impliedDailyRate)}/day on this corridor`],
      ["Market availability", `${vessel.primary.availability} (tightness ${vessel.primary.availabilityIndex}/100)`],
      ["Cost implication", vessel.primary.costImplication],
      [
        "Runner-up",
        vessel.alternative
          ? `${vessel.alternative.type} at ${vessel.alternative.score}/100 - ${vessel.alternative.costImplication}`
          : "None",
      ],
    ],
    { emphasis: 1 },
  );

  label("Screened vessel classes");
  table(
    ["Class", "Score", "Port fit", "Payload t", "Util %", "Rate $/day", "Availability", "Selected"],
    vessel.all.map((v) => [
      v.type,
      `${v.score}`,
      v.portCompatibility,
      formatNumber(v.payload),
      Math.round(v.utilisationPercent).toString(),
      formatNumber(v.impliedDailyRate),
      v.availability,
      v.recommended ? "Awarded" : "-",
    ]),
    {
      widths: [26, 16, 22, 24, 16, 28, 24, CONTENT_W - 156],
      align: ["left", "right", "left", "right", "right", "right", "left", "center"],
      emphasis: [7],
    },
  );

  label("Why this class");
  bullets(vessel.primary.reasons);
  if (vessel.primary.blockers.length > 0) bullets(vessel.primary.blockers);

  // ------------------------------------------------------ 6. Port  check ---
  section(6, "Port Feasibility");
  kv(
    [
      ["Discharge port", `${port.selected.name}, ${port.selected.state}`],
      ["Status", `${port.selected.status} - risk ${port.selected.riskLevel}`],
      ["Feasibility score", `${port.selected.score}/100`],
      [
        "Congestion",
        `${port.selected.congestion}% (${port.selected.congestionLabel}), trend ${signedPercent(port.selected.congestionTrend)}`,
      ],
      ["Waiting time", `${port.selected.waitingTime} days now, ${port.selected.waitingTimeProjected} days projected`],
      ["Berths available", `${port.selected.berthsAvailable} of ${port.selected.totalBerths} (${port.selected.berthUtilisationPercent}% projected utilisation)`],
      ["Handling capacity", `${formatNumber(port.selected.cargoHandlingCapacity)} tonnes/day`],
      ["Physical limits", `draft ${port.selected.maxDraft} m, LOA ${port.selected.maxLOA} m, beam ${port.selected.maxBeam} m`],
      ["Suitable vessels", port.selected.suitableVessels.join(", ")],
      ["Best alternative port", `${port.bestAlternative.name} (${port.bestAlternative.score}/100) - ${port.bestAlternative.reason}`],
    ],
    { emphasis: 1 },
  );

  label("Constraint checks");
  table(
    ["Constraint", "Required", "Limit", "Margin", "Status"],
    port.selected.checks.map((c) => [
      c.name,
      `${c.required} ${c.unit}`,
      `${c.limit} ${c.unit}`,
      `${c.margin > 0 ? "+" : ""}${c.margin}`,
      c.status,
    ]),
    {
      widths: [CONTENT_W - 96, 26, 26, 22, 22],
      align: ["left", "right", "right", "right", "center"],
    },
  );

  if (port.selected.warnings.length > 0) {
    label("Port warnings");
    bullets(port.selected.warnings);
  }

  // ------------------------------------------------------- 7. Route plan ---
  section(7, "Route Optimization");
  kv(
    [
      ["Selected corridor", `${route.selected.name} (${route.selected.label})`],
      ["Distance", `${formatNumber(route.selected.distance)} nautical miles, great-circle`],
      ["Transit time", `${route.selected.duration} days at ${route.selected.speedKnots} knots`],
      ["All-in corridor cost", `${money(route.selected.totalCost)} per voyage, ${moneyExact(route.selected.costPerTonne)} per tonne`],
      ["Route risk", `${route.selected.riskScore}/100 (${route.selected.riskLevel}) - prototype risk score`],
      ["Congestion exposure", `${route.selected.congestionExposure}% at the discharge port`],
      [
        "Great-circle waypoints",
        `${route.selected.coordinates.length} reference coordinate(s) on this corridor`,
      ],
    ],
    { emphasis: 1 },
  );

  label("Corridor comparison");
  table(
    ["Corridor", "nm", "Days", "Kn", "Freight", "Fuel", "Port", "Waiting", "Deadhead", "Total", "/t", "Risk", "Cong %"],
    route.all.map((r) => [
      r.label,
      formatNumber(r.distance),
      r.duration.toFixed(1),
      r.speedKnots.toFixed(1),
      money(r.freightCost),
      money(r.fuelCost),
      money(r.portCharges),
      money(r.waitingCost),
      money(r.deadheadingCost),
      money(r.totalCost),
      moneyExact(r.costPerTonne),
      `${r.riskScore} ${r.riskLevel}`,
      `${r.congestionExposure}`,
    ]),
    {
      fontSize: 6.8,
      widths: [22, 15, 11, 10, 17, 14, 15, 14, 16, 17, 12, 17, CONTENT_W - 190],
      align: ["left", "right", "right", "right", "right", "right", "right", "right", "right", "right", "right", "left", "right"],
      emphasis: [12],
    },
  );

  label("Selection rationale");
  bullets(route.selected.notes);

  // ---------------------------------------------------- 8. Cost & savings ---
  section(8, "Cost & Savings", "Simulated / Reference Estimate");
  kv(
    [
      ["Reference rate applied", `${money(cost.referenceRatePerDay)}/day`],
      ["Cost per voyage", money(cost.totalPerVoyage)],
      ["Programme cost", money(cost.totalProgram)],
      ["Cost per tonne", `${moneyExact(cost.costPerTonne)}/t`],
      ["Bunker index", String(cost.bunkerIndex)],
      ["Cost trend", cost.trend],
      ["Adverse band case", `${money(cost.adverseCasePerVoyage)} per voyage`],
      ["Favourable band case", `${money(cost.favourableCasePerVoyage)} per voyage`],
    ],
    { emphasis: 1 },
  );

  label("Cost breakdown");
  table(
    ["Cost line", "Per voyage", "Programme", "Share %", "Basis"],
    [
      ...cost.items.map((item) => [
        item.name,
        money(item.perVoyage),
        money(item.program),
        `${item.sharePercent.toFixed(1)}`,
        item.note,
      ]),
      [
        "Total",
        money(cost.totalPerVoyage),
        money(cost.totalProgram),
        "100.0",
        "Simulated / reference estimate, not a quotation",
      ],
    ],
    {
      fontSize: 7.2,
      widths: [44, 26, 28, 16, CONTENT_W - 114],
      align: ["left", "right", "right", "right", "left"],
      emphasis: [1],
    },
  );
  note(cost.trendNote);

  label("Savings against the unhedged spot baseline");
  kv(
    [
      ["Baseline", savings.baselineLabel],
      ["Baseline programme cost", money(savings.baselineTotal)],
      ["Recommended structure", savings.recommendedLabel],
      ["Recommended programme cost", money(savings.recommendedTotal)],
      ["Difference", `${signed(savings.savings)} (${signedPercent(savings.savingsPercent)})`],
      ["Difference in INR (modelling rate)", signedInr(savings.savingsInr)],
      ["Interpretation", savings.label],
    ],
    { emphasis: 1 },
  );

  label("Where the difference comes from");
  table(
    ["Driver", "Amount"],
    savings.drivers.map((d) => [d.name, signed(d.amount)]),
    { widths: [CONTENT_W - 42, 42], align: ["left", "right"], emphasis: [1] },
  );
  note(savings.caveat, "warn");

  // ------------------------------------------------------ 9. Risk & alerts ---
  section(9, "Risk & Alerts", "Prototype Risk Score");
  kv(
    [
      ["Overall programme risk", `${risk.score}/100 (${risk.level}) - ${risk.label}`],
      ["Scoring basis", risk.caveat],
    ],
    { emphasis: 1 },
  );

  label("Risk breakdown");
  table(
    ["Component", "Score", "Weight", "Contribution", "Level"],
    risk.components.map((c) => [
      c.label,
      `${c.score}/100`,
      `${Math.round(c.weight * 100)}%`,
      c.contribution.toFixed(1),
      c.level,
    ]),
    {
      widths: [CONTENT_W - 92, 26, 22, 26, 18],
      align: ["left", "right", "right", "right", "center"],
    },
  );

  label("Drivers and mitigations");
  risk.components.forEach((component) => {
    const text = `${component.label} (${component.score}/100): ${component.driver}`;
    const fix = `Mitigation: ${component.mitigation}`;
    const size = SIZE.small + 0.4;
    const lh = size * 0.3528 * 1.42;
    setBody(size, "normal", BODY);
    const lines = wrap(text, CONTENT_W - 4);
    setBody(size, "italic", MUTED);
    const fixLines = wrap(fix, CONTENT_W - 4);
    need(lines.length * lh + fixLines.length * lh + 2);
    doc.setFillColor(RISK_COLOR[component.level][0], RISK_COLOR[component.level][1], RISK_COLOR[component.level][2]);
    doc.rect(MARGIN.left, y - size * 0.3528 * 0.85, 1.1, lines.length * lh + fixLines.length * lh, "F");
    setBody(size, "normal", BODY);
    doc.text(lines, MARGIN.left + 4, y);
    y += lines.length * lh;
    doc.text(fixLines, MARGIN.left + 4, y);
    y += fixLines.length * lh + 1.6;
  });

  if (analysis.alerts.length > 0) {
    label("Open advisories");
    table(
      ["Severity", "Advisory", "Location", "Recommended action", "Age"],
      analysis.alerts.map((alert) => [
        alert.severity,
        `${alert.title} - ${alert.description}`,
        alert.location,
        alert.action,
        alert.daysAgo === 0 ? "today" : `${alert.daysAgo}d`,
      ]),
      {
        fontSize: 7.2,
        widths: [18, CONTENT_W - 116, 26, 48, 14],
        align: ["center", "left", "left", "left", "right"],
      },
    );
  }
  note(risk.caveat, "warn");

  // ----------------------------------------------- 10. Contract  strategy ---
  section(10, "Contract Strategy");
  table(
    ["Structure", "Programme cost", "Per tonne", "vs spot", "Certainty", "Flexibility", "Exposure", "Attr.", "Selected"],
    analysis.strategies.map((s) => [
      `${s.name} (${s.code})`,
      money(s.totalCost),
      `${moneyExact(s.costPerTonne)}`,
      `${signedPercent(s.savingsPercent)}`,
      `${s.priceCertainty} ${s.priceCertaintyLabel}`,
      `${s.flexibility} ${s.flexibilityLabel}`,
      `${s.marketExposure} ${s.marketExposureLabel}`,
      `${s.attractiveness}/100`,
      s.recommended ? "Recommended" : "-",
    ]),
    {
      fontSize: 7.2,
      widths: [40, 26, 20, 17, 22, 22, 22, 15, CONTENT_W - 184],
      align: ["left", "right", "right", "right", "left", "left", "left", "right", "center"],
      emphasis: [8],
    },
  );

  kv(
    [
      ["Recommended structure", `${strategy.name} (${strategy.code})`],
      ["Attractiveness", `${strategy.attractiveness}/100`],
      ["Price certainty", `${strategy.priceCertainty}/100 (${strategy.priceCertaintyLabel})`],
      ["Flexibility", `${strategy.flexibility}/100 (${strategy.flexibilityLabel})`],
      ["Residual freight exposure", `${strategy.freightExposure}% of the programme`],
      ["Time-charter applicability", strategy.timeCharterApplicable ? "Available" : "Not available"],
    ],
    { emphasis: 1 },
  );
  label("Strategy rationale");
  bullets([strategy.rationale, strategy.timeCharterNote]);

  // ------------------------------------------------ 11. Final  decision ----
  section(11, "Final Recommendation");
  paragraph(analysis.recommendation.headline, { size: 10.5, style: "bold", color: INK });
  paragraph(analysis.recommendation.summary);

  const block = (title: string, items: { label: string; value: string; detail?: string }[]) => {
    label(title);
    table(
      ["Item", "Recommendation"],
      items.map((i) => [`${i.label}: ${i.value}`, i.detail ?? "-"]),
      { widths: [82, CONTENT_W - 82] },
    );
  };

  block("What to do", analysis.recommendation.what.items);
  block("Why", analysis.recommendation.why.items);
  block("Impact", analysis.recommendation.impact.items);

  label("Evidence trail");
  bullets(
    analysis.recommendation.evidence.map((e) => `${e.source}: ${e.detail}`),
    SIZE.small + 0.3,
  );

  label("Watch-outs");
  bullets(analysis.recommendation.watchOuts, SIZE.small + 0.3);

  // ---------------------------------------- 12. Assumptions &  disclaimer ---
  section(12, "Assumptions & Data Disclaimer");
  label("Modelling assumptions");
  bullets(analysis.assumptions, SIZE.small + 0.3);

  label("Data provenance");
  kv(
    [
      ["Dataset", analysis.disclosure.datasetKind],
      ["Trained on", analysis.disclosure.trainedOn],
      ["Not trained on", analysis.disclosure.notTrainedOn.join("; ")],
      ["Cost note", analysis.disclosure.costNote],
      ["Risk note", analysis.disclosure.riskNote],
      ["Savings note", analysis.disclosure.savingsNote],
      ["Recalibration", analysis.disclosure.recalibrationNote],
    ],
    { emphasis: 1 },
  );

  label("What this report is not");
  bullets(
    [
      "Not built on live SAIL, RAIL or any proprietary charter-party data.",
      "Not built on live Baltic Exchange, broker or market index feeds.",
      "Not built on live AIS vessel-position or port-call data; vessel positions shown on screen are simulated.",
      "Not a quotation, a booking, or a financial recommendation.",
      "All modelled values are labelled as prototype ML forecasts, simulated / reference estimates and prototype risk scores.",
    ],
    SIZE.small + 0.3,
  );

  note(analysis.recommendation.disclaimer, "warn");
  note(
    `OceanIQ procurement decision report for ${corridor}, generated ${generatedLabel}. Scenario ${analysis.scenarioId}, reference data as of ${safeText(
      formatDate(analysis.referenceAsOf),
    )}. Data provenance: reference / synthetic - not live market, SAIL or AIS data.`,
  );

  // -------------------------------------------- running header and footer ---
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, PAGE_W, 13, "F");
      doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.rect(0, 0, PAGE_W, 0.9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      doc.text("OceanIQ", MARGIN.left, 8.6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.setTextColor(148, 178, 255);
      doc.text(safeText(`${reportName}  |  ${corridor}`), MARGIN.left + 20, 8.6);
      doc.setTextColor(148, 178, 255);
      doc.text("REFERENCE / SYNTHETIC DATA", PAGE_W - MARGIN.right, 8.6, { align: "right" });
    }

    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.15);
    doc.line(MARGIN.left, PAGE_H - MARGIN.bottom + 6, MARGIN.left + CONTENT_W, PAGE_H - MARGIN.bottom + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.9);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
      safeText(
        `OceanIQ  |  ${corridor}  |  scenario ${analysis.scenarioId}  |  reference / synthetic data - not a live quotation`,
      ),
      MARGIN.left,
      PAGE_H - MARGIN.bottom + 9.5,
    );
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN.right, PAGE_H - MARGIN.bottom + 9.5, {
      align: "right",
    });
  }

  return {
    blob: doc.output("blob") as Blob,
    filename: procurementReportFilename(analysis),
  };
}
