/**
 * OceanIQ — ML freight forecasting layer.
 *
 * Pipeline
 * --------
 *   reference history (ml/data/*.csv)
 *     -> feature engineering (src/lib/ml/features.ts, mirrors ml/features.py)
 *     -> trained RandomForestRegressor (ml/model/freight_rf_model.json)
 *     -> recursive multi-step forecast
 *     -> FreightForecast
 *
 * Multi-step forecasting is recursive: the model is a single-step regressor, so
 * week h+1 is predicted using the previous predictions appended to the lane's
 * rate series. Uncertainty therefore widens with the square root of the horizon
 * step, anchored on the held-out RMSE measured on the reference data.
 *
 * This module answers one question only — "where is freight likely to move?".
 * The decision engines in src/lib/engine answer the second question.
 */

import {
  CARGO_CODES,
  CARGO_STOWAGE,
  FEATURE_COLUMNS,
  FEATURE_LABELS,
  FEATURE_PROBE,
  VESSEL_FUEL_INDEX,
  VESSEL_PAYLOAD_T,
  VESSEL_SIZE_CLASS,
  freightSlope4w,
  seasonCode,
} from "./features";
import {
  type HistorySeries,
  getExogenousForecast,
  getForest,
  getHistoryMeta,
  getHistorySeries,
  getModelMetrics,
  laneKey,
} from "./dataLoader";
import type { RandomForestRegressor } from "./randomForest";
import {
  corridorCode,
  corridorDistanceNm,
  getLoadingPort,
  VESSEL_REFERENCE,
  type VesselClass,
} from "@/lib/reference/corridors";
import { getPort } from "@/lib/reference/ports";
import type {
  ForecastPoint,
  FreightForecast,
  LaneResolution,
  MajorFactor,
  ModelDescriptor,
} from "@/lib/types";
import { getCargo, type CargoType } from "@/lib/reference/cargo";

export interface ForecastRequest {
  loadingPort: string;
  dischargePort: string;
  vesselType: VesselClass;
  cargo: CargoType;
  /** Number of weekly steps to project. */
  horizonWeeks?: number;
}

const DEFAULT_HORIZON = 26;

// ---------------------------------------------------------------------------
// Model provenance
// ---------------------------------------------------------------------------

export function getModelDescriptor(): ModelDescriptor {
  const m = getModelMetrics();
  const meta = getHistoryMeta();
  return {
    modelName: `${m.model.name} (${m.model.nEstimators} trees)`,
    library: m.model.library,
    modelStatus: "trained-reference-data",
    dataLabel: "Prototype ML Forecast · Reference/Synthetic Data",
    trainingDataNote: `Trained on ${m.nTrainRows.toLocaleString()} weekly observations of a synthetic/reference dry-bulk freight history (${meta.rows.toLocaleString()} rows, ${meta.asOf} latest week) generated from a structural market model.`,
    datasetKind: "synthetic_reference",
    nEstimators: m.model.nEstimators,
    nFeatures: m.nFeatures,
    nTrainRows: m.nTrainRows,
    nTestRows: m.nTestRows,
    splitStrategy: m.splitStrategy,
    trainThroughDate: m.trainThroughDate,
    testFromDate: m.testFromDate,
    validation: {
      label: "Validation on reference/synthetic data (held-out chronological tail)",
      maeUsd: m.test.mae,
      rmseUsd: m.test.rmse,
      mapePercent: m.test.mape,
      r2: m.test.r2,
    },
    limitation: m.disclaimer,
  };
}

// ---------------------------------------------------------------------------
// Lane resolution
// ---------------------------------------------------------------------------

interface ResolvedLane {
  series: HistorySeries;
  resolution: LaneResolution;
}

/** How many observed weeks the UI shows behind the forecast. */
const HISTORY_TAIL_WEEKS = 8;

/**
 * Find the reference lane the model will actually run on.
 *
 * Priority: exact corridor+vessel+cargo -> same corridor+vessel, nearest cargo
 * -> same corridor+cargo, nearest vessel -> same corridor, nearest vessel+cargo
 * -> globally nearest corridor. Anything but the exact match is reported in the
 * result so the UI never implies a precision it does not have.
 */
function resolveLane(req: ForecastRequest): ResolvedLane {
  const all = getHistorySeries();
  const vesselRef = VESSEL_REFERENCE[req.vesselType];
  const cargoRef = getCargo(req.cargo);

  const exact = all.get(laneKey(req.loadingPort, req.dischargePort, req.vesselType, req.cargo));
  if (exact) {
    return {
      series: exact,
      resolution: {
        exact: true,
        lane: exact.key,
        loadingPort: req.loadingPort,
        dischargePort: req.dischargePort,
        vesselType: req.vesselType,
        cargoType: req.cargo,
        adjustment: "Model run on the exact reference lane for this corridor, vessel class and cargo.",
      },
    };
  }

  const candidates = [...all.values()];
  const cargoDist = (c: string) =>
    Math.abs((CARGO_CODES[c] ?? 0) - (CARGO_CODES[req.cargo] ?? 0));
  const vesselDist = (v: string) =>
    Math.abs((VESSEL_SIZE_CLASS[v] ?? 0) - (VESSEL_SIZE_CLASS[req.vesselType] ?? 0));

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestReason = "";

  for (const s of candidates) {
    const sameCorridor = s.loadingPort === req.loadingPort && s.dischargePort === req.dischargePort;
    const sameOrigin = s.loadingPort === req.loadingPort;
    let score: number;
    let reason: string;

    if (sameCorridor && s.vesselType === req.vesselType) {
      score = cargoDist(s.cargoType) * 10;
      reason = `same corridor and vessel class, nearest available cargo (${s.cargoType})`;
    } else if (sameCorridor && s.cargoType === req.cargo) {
      score = 100 + vesselDist(s.vesselType) * 10;
      reason = `same corridor and cargo, nearest available vessel class (${s.vesselType})`;
    } else if (sameCorridor) {
      score = 200 + cargoDist(s.cargoType) * 10 + vesselDist(s.vesselType) * 10;
      reason = `same corridor, nearest vessel class (${s.vesselType}) and cargo (${s.cargoType})`;
    } else if (sameOrigin && s.cargoType === req.cargo && s.vesselType === req.vesselType) {
      score = 1000 + cargoDist(s.cargoType) + Math.abs(s.dischargePort.length - req.dischargePort.length);
      reason = `same origin, vessel class and cargo; discharge port proxied by ${s.dischargePort}`;
    } else {
      score = 5000 + cargoDist(s.cargoType) + vesselDist(s.vesselType);
      reason = `nearest reference lane (${s.key})`;
    }
    // Prefer longer / closer-in-kind lanes when scores tie.
    const distancePenalty = Math.abs(s.distanceNm - vesselRef.payload) / 100000;
    const total = score + distancePenalty;
    if (total < bestScore) {
      bestScore = total;
      best = s;
      bestReason = reason;
    }
  }

  // Adjust the proxy rate for the stowage difference so the adjusted level is
  // meaningful even though the tree saw a different cargo code.
  const baseStowage = CARGO_STOWAGE[best.cargoType as CargoType];
  const scale = baseStowage > 0 ? cargoRef.stowageFactor / baseStowage : 1;
  const scaled: HistorySeries = {
    ...best,
    rates: best.rates.map((r) => r * scale),
  };

  return {
    series: scaled,
    resolution: {
      exact: false,
      lane: best.key,
      loadingPort: req.loadingPort,
      dischargePort: req.dischargePort,
      vesselType: req.vesselType,
      cargoType: req.cargo,
      basedOnLane: best.key,
      adjustment: `No reference lane exists for this exact combination. Model run on the ${bestReason} and rescaled by the ${scale.toFixed(2)}x stowage factor between ${best.cargoType} and ${req.cargo}.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Feature assembly
// ---------------------------------------------------------------------------

function mean(values: number[], from: number, to: number): number {
  const slice = values.slice(Math.max(0, from), to);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function stdev(values: number[], from: number, to: number): number {
  const slice = values.slice(Math.max(0, from), to);
  if (slice.length < 2) return 0;
  const m = slice.reduce((a, b) => a + b, 0) / slice.length;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(v);
}

function monthOfIsoDate(iso: string): number {
  return Number.parseInt(iso.slice(5, 7), 10) || 1;
}

interface FeatureContext {
  loadingPort: string;
  dischargePort: string;
  vesselType: VesselClass;
  cargo: CargoType;
  distanceNm: number;
  /** Chronological rate series; last element is the most recent observation. */
  rates: number[];
  congestion: number[];
  weekDate: string;
  bunkerIndex: number;
  demandIndex: number;
  marketVolatility: number;
}

function buildFeatures(ctx: FeatureContext): Record<string, number> {
  const n = ctx.rates.length;
  const l1 = n >= 1 ? ctx.rates[n - 1] : 0;
  const l2 = n >= 2 ? ctx.rates[n - 2] : l1;
  const l4 = n >= 4 ? ctx.rates[n - 4] : ctx.rates[Math.max(0, n - 2)];
  const l8 = n >= 8 ? ctx.rates[n - 8] : ctx.rates[Math.max(0, n - 3)];

  const ma4 = mean(ctx.rates, n - 4, n);
  const ma13 = mean(ctx.rates, n - 13, n);
  const std13 = stdev(ctx.rates, n - 13, n);

  const month = monthOfIsoDate(ctx.weekDate);
  const port = getPort(ctx.dischargePort);
  const congNow = ctx.congestion[n - 1] ?? port.congestionBase;
  const congPrev = ctx.congestion[Math.max(0, n - 5)] ?? congNow;
  const congDelta = congNow - congPrev;

  const safeMa = ma13 > 0 ? ma13 : 1;
  const safeStd = std13 > 0 ? std13 : 1;

  const feats: Record<string, number> = {
    route_distance_nm: ctx.distanceNm,
    corridor_code: corridorCode(ctx.loadingPort, ctx.dischargePort),
    corridor_distance_nm: corridorDistanceNm(
      ctx.loadingPort,
      ctx.dischargePort,
      getLoadingPort(ctx.loadingPort)?.lat ?? 0,
      getLoadingPort(ctx.loadingPort)?.lon ?? 0,
      port.lat,
      port.lon,
    ),
    vessel_size_class: VESSEL_SIZE_CLASS[ctx.vesselType] ?? 0,
    vessel_payload_t: VESSEL_PAYLOAD_T[ctx.vesselType] ?? 0,
    vessel_fuel_index: VESSEL_FUEL_INDEX[ctx.vesselType] ?? 1,
    cargo_code: CARGO_CODES[ctx.cargo] ?? 0,
    cargo_stowage_factor: CARGO_STOWAGE[ctx.cargo] ?? 1,
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    season_code: seasonCode(month),
    month_sin: Math.sin((2 * Math.PI * (month - 1)) / 12),
    month_cos: Math.cos((2 * Math.PI * (month - 1)) / 12),
    bunker_index_usd_t: ctx.bunkerIndex,
    demand_index: ctx.demandIndex,
    market_volatility: ctx.marketVolatility,
    port_congestion: congNow,
    port_congestion_delta_4w: congDelta,
    freight_lag_1w: l1,
    freight_lag_2w: l2,
    freight_lag_4w: l4,
    freight_lag_8w: l8,
    freight_ma_4w: ma4,
    freight_ma_13w: ma13,
    freight_std_13w: std13,
    freight_slope_4w: freightSlope4w(l1, l2, l4),
    freight_mom_4w: l1 - l4,
    rate_vs_ma_13w: ma13 > 0 ? l1 / safeMa : 1,
    freight_zscore_13w: std13 > 0 ? (l1 - ma13) / safeStd : 0,
  };

  // Guarantee every declared feature is present and finite.
  for (const col of FEATURE_COLUMNS) {
    const v = feats[col];
    feats[col] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return feats;
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

function buildMajorFactors(
  forest: RandomForestRegressor,
  features: Record<string, number>,
): MajorFactor[] {
  const ranked = FEATURE_COLUMNS.map((f) => ({ f, imp: forest.featureImportance(f) }))
    .sort((a, b) => b.imp - a.imp)
    .slice(0, 9);

  return ranked.map(({ f, imp }) => {
    const probe = FEATURE_PROBE[f] ?? 1;
    const sensitivity = forest.localSensitivity(features, f, probe);
    const direction: MajorFactor["direction"] =
      Math.abs(sensitivity) < 1 ? "neutral" : sensitivity > 0 ? "up" : "down";
    return {
      feature: f,
      label: FEATURE_LABELS[f] ?? f,
      importance: imp,
      sensitivity,
      direction,
      value: features[f],
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the trained model over a procurement scenario's corridor and return a
 * weekly freight forecast plus a scenario-specific explanation.
 *
 * Deterministic: identical input always yields an identical result.
 */
export function forecastFreight(req: ForecastRequest): FreightForecast {
  const horizonWeeks = Math.max(4, Math.min(req.horizonWeeks ?? DEFAULT_HORIZON, 30));
  const forest = getForest();
  const metrics = getModelMetrics();
  const exogenous = getExogenousForecast();
  const { series, resolution } = resolveLane(req);

  const port = getPort(req.dischargePort);
  const loading = getLoadingPort(req.loadingPort);
  const distanceNm = corridorDistanceNm(
    req.loadingPort,
    req.dischargePort,
    loading?.lat ?? 0,
    loading?.lon ?? 0,
    port.lat,
    port.lon,
  );

  // Working copies that grow as the recursive forecast advances.
  const rates = [...series.rates];
  const congestion = [...series.congestion];

  // Uncertainty band: held-out RMSE on the reference data, widened by sqrt(step)
  // to reflect recursive-error accumulation.
  const baseSigma = metrics.test.rmse;

  const path: ForecastPoint[] = [];
  const currentRate = rates[rates.length - 1] ?? 0;
  let finalFeatures: Record<string, number> = {};

  for (let h = 1; h <= horizonWeeks; h++) {
    const exo = exogenous[Math.min(h - 1, exogenous.length - 1)];
    const weekDate = exo.date;

    const feats = buildFeatures({
      loadingPort: req.loadingPort,
      dischargePort: req.dischargePort,
      vesselType: req.vesselType,
      cargo: req.cargo,
      distanceNm,
      rates,
      congestion,
      weekDate,
      bunkerIndex: exo.bunkerIndex,
      demandIndex: exo.demandIndex,
      marketVolatility: exo.marketVolatility,
    });

    const predicted = forest.predict(feats);
    const sigma = baseSigma * Math.sqrt(h);

    path.push({
      week: h,
      date: weekDate,
      rate: Math.round(predicted),
      lower: Math.round(Math.max(0, predicted - 1.28 * sigma)),
      upper: Math.round(predicted + 1.28 * sigma),
      changePercent: currentRate > 0 ? ((predicted - currentRate) / currentRate) * 100 : 0,
    });

    finalFeatures = feats;
    rates.push(predicted);
    congestion.push(exo.congestion[port.name] ?? port.congestionBase);
  }

  const at = (week: number): number =>
    path[Math.min(Math.max(week, 1), path.length) - 1].rate;

  const predictedRate = at(1);
  const predictedRate30d = at(4);
  const predictedRate90d = at(13);
  const forecastChange30d = currentRate > 0 ? ((predictedRate30d - currentRate) / currentRate) * 100 : 0;
  const forecastChange90d = currentRate > 0 ? ((predictedRate90d - currentRate) / currentRate) * 100 : 0;

  // Trend is measured on the forecast path itself, not assumed.
  const firstHalf = mean(path.slice(0, Math.ceil(path.length / 2)).map((p) => p.rate), 0, path.length);
  const secondHalf = mean(path.slice(Math.ceil(path.length / 2)).map((p) => p.rate), 0, path.length);
  const drift = currentRate > 0 ? ((secondHalf - firstHalf) / currentRate) * 100 : 0;
  const trend: FreightForecast["trend"] =
    Math.abs(drift) < 1 ? "Stable" : drift > 0 ? "Increasing" : "Decreasing";

  const weeklyChange = currentRate > 0 ? ((predictedRate - currentRate) / currentRate) * 100 : 0;

  // Cheapest week inside the horizon -> the chartering window.
  let best = path[0];
  for (const p of path) if (p.rate < best.rate) best = p;

  // Recommended charter week: act now if the model expects rates to firm,
  // otherwise wait for the trough.
  const actsNow =
    trend === "Increasing" && predictedRate >= currentRate && forecastChange30d > 1.5;
  const recommendedCharterWeek = actsNow ? 1 : Math.max(1, best.week);

  // Confidence indicator: reference-residual based, deliberately conservative.
  const cv = metrics.test.mape / 100;
  const bandWidth = path[0].upper - path[0].lower;
  const relativeBand = currentRate > 0 ? bandWidth / (2 * currentRate) : 1;
  const confidence = Math.max(
    40,
    Math.min(
      92,
      Math.round(100 - (cv * 100 * 2.4 + relativeBand * 160) * 0.55),
    ),
  );

  const notes = [
    `Model: ${forest.artifact.modelType} (${forest.artifact.nEstimators} trees, ${forest.artifact.featureColumns.length} features) from ${forest.artifact.library}.`,
    `Validation on reference/synthetic data: MAPE ${metrics.test.mape}% (held-out tail from ${metrics.testFromDate}), RMSE $${metrics.test.rmse.toFixed(0)}/day.`,
    resolution.adjustment,
    `Forecast band is the held-out RMSE widened by sqrt(week) for recursive multi-step prediction.`,
  ];

  return {
    currentRate: Math.round(currentRate),
    predictedRate,
    predictedRate30d,
    predictedRate90d,
    forecastChange30d: round1(forecastChange30d),
    forecastChange90d: round1(forecastChange90d),
    weeklyChange: round1(weeklyChange),
    trend,
    trendStrength: round1(Math.abs(drift)),
    bestRate: best.rate,
    bestWeek: best.week,
    recommendedCharterWeek,
    forecastHorizonWeeks: horizonWeeks,
    confidence,
    confidenceLabel: confidence >= 75 ? "High agreement" : confidence >= 60 ? "Moderate agreement" : "Low agreement",
    forecastRates: path,
    recentHistory: series.dates.slice(-HISTORY_TAIL_WEEKS).map((date, i) => ({
      date,
      rate: Math.round(series.rates[series.rates.length - HISTORY_TAIL_WEEKS + i]),
    })),
    firstForwardDate: exogenous[0].date,
    majorFactors: buildMajorFactors(forest, finalFeatures),
    laneResolution: resolution,
    notes,
  };
}

/** Weekly rate volatility implied by the forecast band, as a percent. */
export function forecastVolatilityPercent(forecast: FreightForecast): number {
  if (forecast.currentRate <= 0) return 0;
  const first = forecast.forecastRates[0];
  return round1(((first.upper - first.lower) / forecast.currentRate) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}