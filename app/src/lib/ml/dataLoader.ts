/**
 * OceanIQ — server-side loaders for the ML layer's on-disk artifacts.
 *
 * Artifacts (all produced by `python -m ml.train_model`):
 *   ml/data/freight_history_reference.csv  weekly synthetic freight history
 *   ml/data/exogenous_forecast.csv         projected bunker / demand /
 *                                          volatility / port congestion
 *   ml/model/freight_rf_model.json         the trained RandomForestRegressor
 *   ml/model/metrics.json                  validation metrics (reference data)
 *
 * These files are read with `node:fs`, which keeps them on the server. That is
 * deliberate: the ~4 MB forest never enters the client bundle, and the frontend
 * receives model *output* through the REST layer instead.
 *
 * Everything is cached in module scope — the artifacts are immutable for the
 * lifetime of the process.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { RandomForestArtifact } from "./randomForest";
import { RandomForestRegressor } from "./randomForest";

const ROOT = process.cwd();
const ML_DIR = path.join(ROOT, "ml");

function readText(relative: string): string {
  return fs.readFileSync(path.join(ML_DIR, relative), "utf-8");
}

// ---------------------------------------------------------------------------
// Reference history
// ---------------------------------------------------------------------------

export interface HistoryRow {
  date: string;
  loadingPort: string;
  dischargePort: string;
  vesselType: string;
  cargoType: string;
  rate: number;
  bunkerIndex: number;
  demandIndex: number;
  portCongestion: number;
  vesselAvailability: number;
  marketVolatility: number;
  distanceNm: number;
}

export interface HistorySeries {
  key: string;
  loadingPort: string;
  dischargePort: string;
  vesselType: string;
  cargoType: string;
  /** Chronological weekly observations. */
  rates: number[];
  congestion: number[];
  /** Bunker index (USD/tonne) aligned with `rates`. */
  bunker: number[];
  dates: string[];
  distanceNm: number;
}

const HISTORY_COLUMNS = [
  "date",
  "origin_country",
  "loading_port",
  "discharge_port",
  "vessel_type",
  "cargo_type",
  "freight_rate_usd_day",
  "bunker_index_usd_t",
  "demand_index",
  "port_congestion",
  "vessel_availability",
  "market_volatility",
  "route_distance_nm",
  "voyage_days_ref",
];

let historyCache: Map<string, HistorySeries> | null = null;
let historyMetaCache: { asOf: string; rows: number } | null = null;

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((l) => l.split(","));
}

function loadHistory(): Map<string, HistorySeries> {
  if (historyCache) return historyCache;

  const rows = parseCsv(readText(path.join("data", "freight_history_reference.csv")));
  const header = rows[0];
  if (!header || header[0] !== HISTORY_COLUMNS[0]) {
    throw new Error(
      "ml/data/freight_history_reference.csv header mismatch — regenerate it with `python -m ml.data.generate_reference_data`.",
    );
  }

  const idx = Object.fromEntries(HISTORY_COLUMNS.map((c, i) => [c, i]));
  const series = new Map<string, HistorySeries>();
  let asOf = "";
  let count = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const loadingPort = row[idx.loading_port];
    const dischargePort = row[idx.discharge_port];
    const vesselType = row[idx.vessel_type];
    const cargoType = row[idx.cargo_type];
    const date = row[idx.date];
    if (!loadingPort || !dischargePort) continue;

    const key = `${loadingPort}|${dischargePort}|${vesselType}|${cargoType}`;
    let s = series.get(key);
    if (!s) {
      s = {
        key,
        loadingPort,
        dischargePort,
        vesselType,
        cargoType,
        rates: [],
        congestion: [],
        bunker: [],
        dates: [],
        distanceNm: Number(row[idx.route_distance_nm]) || 6400,
      };
      series.set(key, s);
    }
    s.rates.push(Number(row[idx.freight_rate_usd_day]));
    s.congestion.push(Number(row[idx.port_congestion]));
    s.bunker.push(Number(row[idx.bunker_index_usd_t]));
    s.dates.push(date);
    if (date > asOf) asOf = date;
    count += 1;
  }

  historyCache = series;
  historyMetaCache = { asOf, rows: count };
  return series;
}

export function getHistoryMeta(): { asOf: string; rows: number } {
  loadHistory();
  return historyMetaCache!;
}

export function getHistorySeries(): Map<string, HistorySeries> {
  return loadHistory();
}

export function laneKey(
  loadingPort: string,
  dischargePort: string,
  vesselType: string,
  cargoType: string,
): string {
  return `${loadingPort}|${dischargePort}|${vesselType}|${cargoType}`;
}

// ---------------------------------------------------------------------------
// Exogenous projection
// ---------------------------------------------------------------------------

export interface ExogenousWeek {
  week: number;
  date: string;
  bunkerIndex: number;
  demandIndex: number;
  marketVolatility: number;
  /** congestion indexed by discharge port name. */
  congestion: Record<string, number>;
}

let exogenousCache: ExogenousWeek[] | null = null;

export function getExogenousForecast(): ExogenousWeek[] {
  if (exogenousCache) return exogenousCache;

  const rows = parseCsv(readText(path.join("data", "exogenous_forecast.csv")));
  const header = rows[0];
  const portCols: { name: string; col: number }[] = [];
  header.forEach((h, i) => {
    if (h.startsWith("congestion_")) {
      portCols.push({ name: h.replace("congestion_", "").replace(/_/g, " "), col: i });
    }
  });

  const out: ExogenousWeek[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const congestion: Record<string, number> = {};
    for (const p of portCols) congestion[p.name] = Number(row[p.col]);
    out.push({
      week: Number(row[1]),
      date: row[0],
      bunkerIndex: Number(row[2]),
      demandIndex: Number(row[3]),
      marketVolatility: Number(row[4]),
      congestion,
    });
  }

  exogenousCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// Trained model
// ---------------------------------------------------------------------------

let forestCache: RandomForestRegressor | null = null;

export function getForest(): RandomForestRegressor {
  if (forestCache) return forestCache;
  const artifact = JSON.parse(
    readText(path.join("model", "freight_rf_model.json")),
  ) as RandomForestArtifact;
  forestCache = new RandomForestRegressor(artifact);
  return forestCache;
}

export interface ModelMetrics {
  datasetKind: string;
  disclaimer: string;
  splitStrategy: string;
  trainThroughDate: string;
  testFromDate: string;
  nTrainRows: number;
  nTestRows: number;
  nFeatures: number;
  model: {
    name: string;
    library: string;
    nEstimators: number;
    maxDepth: number;
    minSamplesLeaf: number;
    maxFeatures: number;
    randomState: number;
  };
  train: { mae: number; rmse: number; mape: number; r2: number };
  test: { mae: number; rmse: number; mape: number; r2: number };
  featureImportances: Record<string, number>;
}

let metricsCache: ModelMetrics | null = null;

export function getModelMetrics(): ModelMetrics {
  if (metricsCache) return metricsCache;
  metricsCache = JSON.parse(readText(path.join("model", "metrics.json"))) as ModelMetrics;
  return metricsCache;
}

// ---------------------------------------------------------------------------
// Reference constants
// ---------------------------------------------------------------------------

/**
 * Long-run bunker level the synthetic history is anchored on (mirrors
 * `BUNKER_BASE_USD_T` in ml/reference/reference_config.py). The cost engine
 * measures the bunker adjustment against this base rather than against the
 * current level, so a structurally higher fuel price shows up as a real cost
 * difference instead of silently disappearing into the base.
 */
export const BUNKER_BASE_USD_T = 520;

/** Weighted mean bunker level across the reference history, for diagnostics. */
export function getHistoryBunkerBaseline(): number {
  const series = [...getHistorySeries().values()];
  const all = series.flatMap((s) => s.bunker);
  if (all.length === 0) return BUNKER_BASE_USD_T;
  return all.reduce((a, b) => a + b, 0) / all.length;
}

export function mlArtifactsPresent(): boolean {
  const required = [
    path.join("data", "freight_history_reference.csv"),
    path.join("data", "exogenous_forecast.csv"),
    path.join("model", "freight_rf_model.json"),
    path.join("model", "metrics.json"),
  ];
  return required.every((rel) => fs.existsSync(path.join(ML_DIR, rel)));
}