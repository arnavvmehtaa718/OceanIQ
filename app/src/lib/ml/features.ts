/**
 * OceanIQ — TypeScript mirror of `ml/features.py`.
 *
 * The Python module is the single source of truth for the feature contract.
 * Every constant below MUST stay in sync with it; `ml/verify_parity.py`
 * asserts numeric agreement on a held-out fixture.
 */

export const FEATURE_COLUMNS: readonly string[] = [
  "route_distance_nm",
  "corridor_code",
  "corridor_distance_nm",
  "vessel_size_class",
  "vessel_payload_t",
  "vessel_fuel_index",
  "cargo_code",
  "cargo_stowage_factor",
  "month",
  "quarter",
  "season_code",
  "month_sin",
  "month_cos",
  "bunker_index_usd_t",
  "demand_index",
  "market_volatility",
  "port_congestion",
  "port_congestion_delta_4w",
  "freight_lag_1w",
  "freight_lag_2w",
  "freight_lag_4w",
  "freight_lag_8w",
  "freight_ma_4w",
  "freight_ma_13w",
  "freight_std_13w",
  "freight_slope_4w",
  "freight_mom_4w",
  "rate_vs_ma_13w",
  "freight_zscore_13w",
];

export const TARGET_COLUMN = "freight_rate_usd_day";

export const SERIES_KEYS = [
  "loading_port",
  "discharge_port",
  "vessel_type",
  "cargo_type",
] as const;

export const CARGO_CODES: Record<string, number> = {
  Coal: 0,
  "Thermal Coal": 1,
  "Coking Coal": 2,
  "Iron Ore": 3,
  Limestone: 4,
  "Steel Products": 5,
};

export const VESSEL_SIZE_CLASS: Record<string, number> = {
  Handysize: 0,
  Supramax: 1,
  Panamax: 2,
  Capesize: 3,
};

export const VESSEL_PAYLOAD_T: Record<string, number> = {
  Handysize: 32000,
  Supramax: 58000,
  Panamax: 70000,
  Capesize: 150000,
};

export const VESSEL_FUEL_INDEX: Record<string, number> = {
  Handysize: 0.72,
  Supramax: 1.0,
  Panamax: 1.14,
  Capesize: 2.05,
};

export const CARGO_STOWAGE: Record<string, number> = {
  Coal: 1.0,
  "Thermal Coal": 0.95,
  "Coking Coal": 1.05,
  "Iron Ore": 1.12,
  Limestone: 0.88,
  "Steel Products": 1.18,
};

/** Feature labels used in the UI. Kept short so tables stay readable. */
export const FEATURE_LABELS: Record<string, string> = {
  route_distance_nm: "Route distance",
  corridor_code: "Corridor identity",
  corridor_distance_nm: "Corridor distance",
  vessel_size_class: "Vessel class",
  vessel_payload_t: "Vessel capacity",
  vessel_fuel_index: "Vessel fuel burn",
  cargo_code: "Cargo type",
  cargo_stowage_factor: "Cargo stowage factor",
  month: "Calendar month",
  quarter: "Quarter",
  season_code: "Season",
  month_sin: "Seasonal position",
  month_cos: "Seasonal position",
  bunker_index_usd_t: "Bunker / VLSFO index",
  demand_index: "Dry-bulk demand index",
  market_volatility: "Market volatility",
  port_congestion: "Discharge port congestion",
  port_congestion_delta_4w: "Congestion trend (4w)",
  freight_lag_1w: "Freight rate, 1 week ago",
  freight_lag_2w: "Freight rate, 2 weeks ago",
  freight_lag_4w: "Freight rate, 4 weeks ago",
  freight_lag_8w: "Freight rate, 8 weeks ago",
  freight_ma_4w: "4-week rolling average",
  freight_ma_13w: "13-week rolling average",
  freight_std_13w: "13-week rate volatility",
  freight_slope_4w: "4-week trend slope",
  freight_mom_4w: "4-week momentum",
  rate_vs_ma_13w: "Rate vs 13-week average",
  freight_zscore_13w: "Rate z-score (13w)",
};

/**
 * Reasonable one-sigma nudge per feature, used for the local-sensitivity
 * explanation. Chosen to be meaningful in the feature's own units.
 */
export const FEATURE_PROBE: Record<string, number> = {
  route_distance_nm: 400,
  corridor_code: 1,
  corridor_distance_nm: 400,
  vessel_size_class: 1,
  vessel_payload_t: 15000,
  vessel_fuel_index: 0.25,
  cargo_code: 1,
  cargo_stowage_factor: 0.08,
  month: 1,
  quarter: 1,
  season_code: 1,
  month_sin: 0.4,
  month_cos: 0.4,
  bunker_index_usd_t: 60,
  demand_index: 6,
  market_volatility: 8,
  port_congestion: 10,
  port_congestion_delta_4w: 6,
  freight_lag_1w: 1500,
  freight_lag_2w: 1800,
  freight_lag_4w: 2200,
  freight_lag_8w: 2600,
  freight_ma_4w: 1600,
  freight_ma_13w: 2000,
  freight_std_13w: 800,
  freight_slope_4w: 250,
  freight_mom_4w: 900,
  rate_vs_ma_13w: 0.06,
  freight_zscore_13w: 0.4,
};

export function seasonCode(month: number): number {
  if (month === 12 || month === 1 || month === 2) return 0;
  if (month >= 3 && month <= 5) return 1;
  if (month >= 6 && month <= 8) return 2;
  return 3;
}

/** Closed-form OLS slope over lag offsets 1w, 2w, 4w (matches ml/features.py). */
export function freightSlope4w(l1: number, l2: number, l4: number): number {
  const denom = 1 * 1 + 2 * 2 + 4 * 4; // = 21
  return -(1 * l1 + 2 * l2 + 4 * l4) / denom;
}