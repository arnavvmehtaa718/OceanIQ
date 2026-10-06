"""OceanIQ feature engineering for the prototype freight forecaster.

This module is the SINGLE SOURCE OF TRUTH for the feature contract. The
TypeScript mirror lives at `src/lib/ml/features.ts`, and
`ml/verify_parity.py` proves the two implementations agree.

Feature groups
--------------
1. Route identity      : route_distance_nm, corridor code, corridor distance
2. Vessel identity     : vessel_size_class, payload, fuel index
3. Cargo identity      : cargo code, stowage factor
4. Calendar / season   : month, quarter, season code, cyclic sin/cos
5. Exogenous market    : bunker index, demand index, volatility
6. Target lags         : lag_1w, lag_2w, lag_4w, lag_8w
7. Rolling windows     : rolling mean / std over 4w and 13w
8. Trend features      : 4w slope, momentum, rate vs 13w MA, z-score
9. Port state          : destination congestion, congestion delta

Leakage control
---------------
Lags and rolling windows are computed on the SHIFTED target series
(`shift(1).rolling(...)`), so the feature vector for week T never contains the
freight rate at week T or later. The time split is chronological (train =
earliest 80% of weeks), never random.
"""

from __future__ import annotations

import math
from typing import Final

FEATURE_COLUMNS: Final[list[str]] = [
    # --- route identity -------------------------------------------------------
    "route_distance_nm",
    "corridor_code",
    "corridor_distance_nm",
    # --- vessel identity ------------------------------------------------------
    "vessel_size_class",
    "vessel_payload_t",
    "vessel_fuel_index",
    # --- cargo identity -------------------------------------------------------
    "cargo_code",
    "cargo_stowage_factor",
    # --- calendar / season ----------------------------------------------------
    "month",
    "quarter",
    "season_code",
    "month_sin",
    "month_cos",
    # --- exogenous market -----------------------------------------------------
    "bunker_index_usd_t",
    "demand_index",
    "market_volatility",
    # --- port state -----------------------------------------------------------
    "port_congestion",
    "port_congestion_delta_4w",
    # --- target lags ----------------------------------------------------------
    "freight_lag_1w",
    "freight_lag_2w",
    "freight_lag_4w",
    "freight_lag_8w",
    # --- rolling windows ------------------------------------------------------
    "freight_ma_4w",
    "freight_ma_13w",
    "freight_std_13w",
    # --- trend ----------------------------------------------------------------
    "freight_slope_4w",
    "freight_mom_4w",
    "rate_vs_ma_13w",
    "freight_zscore_13w",
]

TARGET_COLUMN: Final[str] = "freight_rate_usd_day"

# Lags are computed inside each physical lane so the model never sees a rate
# from a different corridor / vessel / cargo combination.
SERIES_KEYS: Final[list[str]] = [
    "loading_port",
    "discharge_port",
    "vessel_type",
    "cargo_type",
]

CARGO_CODES: Final[dict[str, int]] = {
    "Coal": 0,
    "Thermal Coal": 1,
    "Coking Coal": 2,
    "Iron Ore": 3,
    "Limestone": 4,
    "Steel Products": 5,
}

VESSEL_SIZE_CLASS: Final[dict[str, int]] = {
    "Handysize": 0,
    "Supramax": 1,
    "Panamax": 2,
    "Capesize": 3,
}

VESSEL_SPECS: Final[dict[str, dict]] = {
    "Handysize": {"payload_t": 32000.0, "fuel_index": 0.72},
    "Supramax": {"payload_t": 58000.0, "fuel_index": 1.00},
    "Panamax": {"payload_t": 70000.0, "fuel_index": 1.14},
    "Capesize": {"payload_t": 150000.0, "fuel_index": 2.05},
}

CARGO_STOWAGE: Final[dict[str, float]] = {
    "Coal": 1.00,
    "Thermal Coal": 0.95,
    "Coking Coal": 1.05,
    "Iron Ore": 1.12,
    "Limestone": 0.88,
    "Steel Products": 1.18,
}

CORRIDOR_CODES: Final[dict[tuple[str, str], int]] = {
    ("Hay Point", "Paradip"): 0,
    ("Hay Point", "Visakhapatnam"): 1,
    ("Hay Point", "Gangavaram"): 2,
    ("Hay Point", "Haldia"): 3,
    ("Newcastle", "Paradip"): 4,
    ("Newcastle", "Gangavaram"): 5,
    ("Gladstone", "Paradip"): 6,
    ("Dampier", "Gopalpur"): 7,
    ("Richards Bay", "Paradip"): 8,
    ("Richards Bay", "Visakhapatnam"): 9,
    ("Richards Bay", "Haldia"): 10,
    ("Saldanha", "Haldia"): 11,
    ("Tanjung Bara", "Paradip"): 12,
    ("Tanjung Bara", "Haldia"): 13,
    ("Tarahan", "Gopalpur"): 14,
    ("Tubarao", "Paradip"): 15,
    ("Tubarao", "Visakhapatnam"): 16,
    ("Itaqui", "Haldia"): 17,
    ("Nakhodka", "Paradip"): 18,
    ("Nakhodka", "Haldia"): 19,
    ("Murmansk", "Visakhapatnam"): 20,
    ("Corpus Christi", "Haldia"): 21,
    ("Corpus Christi", "Paradip"): 22,
}

# Reference great-circle distance for every known corridor (nautical miles).
CORRIDOR_DISTANCES: Final[dict[tuple[str, str], float]] = {
    ("Hay Point", "Paradip"): 6420.0,
    ("Hay Point", "Visakhapatnam"): 6280.0,
    ("Hay Point", "Gangavaram"): 6255.0,
    ("Hay Point", "Haldia"): 6710.0,
    ("Newcastle", "Paradip"): 6580.0,
    ("Newcastle", "Gangavaram"): 6415.0,
    ("Gladstone", "Paradip"): 6700.0,
    ("Dampier", "Gopalpur"): 5180.0,
    ("Richards Bay", "Paradip"): 5200.0,
    ("Richards Bay", "Visakhapatnam"): 5060.0,
    ("Richards Bay", "Haldia"): 5490.0,
    ("Saldanha", "Haldia"): 5600.0,
    ("Tanjung Bara", "Paradip"): 3800.0,
    ("Tanjung Bara", "Haldia"): 4110.0,
    ("Tarahan", "Gopalpur"): 4200.0,
    ("Tubarao", "Paradip"): 8900.0,
    ("Tubarao", "Visakhapatnam"): 8740.0,
    ("Itaqui", "Haldia"): 9200.0,
    ("Nakhodka", "Paradip"): 7800.0,
    ("Nakhodka", "Haldia"): 8090.0,
    ("Murmansk", "Visakhapatnam"): 9800.0,
    ("Corpus Christi", "Haldia"): 11200.0,
    ("Corpus Christi", "Paradip"): 10950.0,
}

EARTH_RADIUS_NM: Final[float] = 3440.065


def season_code(month: int) -> int:
    """0 = winter (Dec-Feb), 1 = spring (Mar-May), 2 = summer (Jun-Aug), 3 = autumn."""
    if month in (12, 1, 2):
        return 0
    if month in (3, 4, 5):
        return 1
    if month in (6, 7, 8):
        return 2
    return 3


def corridor_code(loading_port: str, discharge_port: str) -> int:
    return CORRIDOR_CODES.get((loading_port, discharge_port), 99)


def corridor_distance(loading_port: str, discharge_port: str) -> float:
    """Exact reference distance, or a great-circle estimate for unseen pairs."""
    known = CORRIDOR_DISTANCES.get((loading_port, discharge_port))
    if known is not None:
        return known
    return great_circle_nm(loading_port, discharge_port)


def great_circle_nm(loading_port: str, discharge_port: str) -> float:
    """Great-circle distance in nautical miles between two reference ports."""
    from ml.reference.reference_config import LOADING_PORTS, PORTS

    a = LOADING_PORTS.get(loading_port) or PORTS.get(loading_port)
    b = PORTS.get(discharge_port) or LOADING_PORTS.get(discharge_port)
    if not a or not b:
        return 6400.0
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlat = lat2 - lat1
    dlon = math.radians(b["lon"]) - math.radians(a["lon"])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return round(2 * EARTH_RADIUS_NM * math.asin(min(1.0, math.sqrt(h))))


def build_features(frame):  # type: ignore[no-untyped-def]
    """Add every engineered feature column to `frame` (a pandas DataFrame)."""
    import numpy as np
    import pandas as pd

    out = frame.copy()
    dates = pd.to_datetime(out["date"])
    month = dates.dt.month.to_numpy()

    out["route_distance_nm"] = out["route_distance_nm"].astype(float)
    out["corridor_code"] = [
        corridor_code(l, d)
        for l, d in zip(out["loading_port"], out["discharge_port"])
    ]
    out["corridor_distance_nm"] = [
        corridor_distance(l, d)
        for l, d in zip(out["loading_port"], out["discharge_port"])
    ]

    out["vessel_size_class"] = out["vessel_type"].map(VESSEL_SIZE_CLASS).astype(float)
    out["vessel_payload_t"] = out["vessel_type"].map(
        lambda v: VESSEL_SPECS[v]["payload_t"]
    )
    out["vessel_fuel_index"] = out["vessel_type"].map(
        lambda v: VESSEL_SPECS[v]["fuel_index"]
    )

    out["cargo_code"] = out["cargo_type"].map(CARGO_CODES).astype(float)
    out["cargo_stowage_factor"] = out["cargo_type"].map(CARGO_STOWAGE).astype(float)

    out["month"] = month.astype(float)
    out["quarter"] = ((month - 1) // 3 + 1).astype(float)
    out["season_code"] = np.array([season_code(int(m)) for m in month], dtype=float)
    out["month_sin"] = np.sin(2 * np.pi * (month - 1) / 12.0)
    out["month_cos"] = np.cos(2 * np.pi * (month - 1) / 12.0)

    out["bunker_index_usd_t"] = out["bunker_index_usd_t"].astype(float)
    out["demand_index"] = out["demand_index"].astype(float)
    out["market_volatility"] = out["market_volatility"].astype(float)
    out["port_congestion"] = out["port_congestion"].astype(float)

    out["port_congestion_delta_4w"] = (
        out.groupby(SERIES_KEYS, sort=False)["port_congestion"]
        .diff(4)
        .fillna(0.0)
        .astype(float)
    )

    grouped = out.groupby(SERIES_KEYS, sort=False)[TARGET_COLUMN]
    out["freight_lag_1w"] = grouped.shift(1)
    out["freight_lag_2w"] = grouped.shift(2)
    out["freight_lag_4w"] = grouped.shift(4)
    out["freight_lag_8w"] = grouped.shift(8)

    # Rolling windows on the SHIFTED series -> strictly backward looking.
    past = out[TARGET_COLUMN].shift(1)
    keys = [out[k] for k in SERIES_KEYS]

    def _roll(window: int, how: str, minp: int) -> "np.ndarray":
        return (
            past.groupby(keys, sort=False)
            .rolling(window, min_periods=minp)
            .agg(how)
            .reset_index(level=list(range(len(SERIES_KEYS))), drop=True)
            .to_numpy(dtype=float)
        )

    out["freight_ma_4w"] = _roll(4, "mean", 2)
    out["freight_ma_13w"] = _roll(13, "mean", 4)
    out["freight_std_13w"] = _roll(13, "std", 4)

    l1 = out["freight_lag_1w"].to_numpy(dtype=float)
    l2 = out["freight_lag_2w"].to_numpy(dtype=float)
    l3 = out["freight_lag_4w"].to_numpy(dtype=float)

    # Closed-form OLS slope over the available lag offsets (1w, 2w, 4w).
    denom = 1.0 * 1 + 2.0 * 2 + 4.0 * 4
    slope = -(1.0 * l1 + 2.0 * l2 + 4.0 * l3) / denom
    out["freight_slope_4w"] = np.nan_to_num(slope, nan=0.0, posinf=0.0, neginf=0.0)
    out["freight_mom_4w"] = np.nan_to_num(l1 - l3, nan=0.0)

    ma13 = out["freight_ma_13w"].to_numpy(dtype=float)
    std13 = out["freight_std_13w"].to_numpy(dtype=float)
    safe_ma = np.where(ma13 > 0, ma13, 1.0)
    safe_std = np.where(std13 > 0, std13, 1.0)

    out["rate_vs_ma_13w"] = np.nan_to_num(np.where(ma13 > 0, l1 / safe_ma, 1.0), nan=1.0)
    out["freight_zscore_13w"] = np.nan_to_num(
        np.where(std13 > 0, (l1 - ma13) / safe_std, 0.0), nan=0.0
    )

    return out


def clean(frame):  # type: ignore[no-untyped-def]
    """Drop rows that cannot have a full lag / rolling history."""
    required = [c for c in FEATURE_COLUMNS if c != "port_congestion_delta_4w"]
    frame = frame.dropna(subset=required)
    frame = frame[frame[TARGET_COLUMN] > 0]
    for c in FEATURE_COLUMNS:
        frame[c] = frame[c].astype(float)
    return frame.reset_index(drop=True)