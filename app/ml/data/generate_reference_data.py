"""Generate the OceanIQ SYNTHETIC weekly freight history.

The generator is a structural, generative model of a dry-bulk freight market:

    rate = structural_cost(vessel, distance)
         * (1 + demand_effect)
         * (1 + bunker_effect)
         * (1 + congestion_effect)
         * (1 + availability_effect)
         * (1 + volatility_noise)

It is written out as a flat CSV so the ML pipeline has a realistic tabular
dataset with all the drivers a chartering desk would actually observe.

Determinism: every random draw comes from `numpy.random.default_rng(SEED)`, so
re-running this script reproduces the file byte-for-byte.

HONESTY: this is REFERENCE / SYNTHETIC data. It is not SAIL data, not Baltic
Exchange data, not live market data.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml.reference.reference_config import (  # noqa: E402
    BUNKER_BASE_USD_T,
    BUNKER_SEASON_AMP,
    BUNKER_TREND_PER_YEAR,
    CARGO_MONTH_FACTOR,
    CARGO_TYPES,
    DEMAND_BASE,
    DEMAND_SEASON_AMP,
    DEMAND_TREND_PER_WEEK,
    LANES,
    LOADING_PORTS,
    PORTS,
    RANDOM_SEED,
    SERIES_END,
    SERIES_START,
    VESSEL_CLASSES,
    VOL_BASE,
    VOL_SEASON_AMP,
)

DATA_DIR = Path(__file__).resolve().parent
OUT_CSV = DATA_DIR / "freight_history_reference.csv"


# ---------------------------------------------------------------------------
# Exogenous driver series (shared across all lanes - it is a global market)
# ---------------------------------------------------------------------------


def build_dates() -> pd.DatetimeIndex:
    return pd.date_range(start=SERIES_START, end=SERIES_END, freq="W-FRI")


def build_drivers(dates: pd.DatetimeIndex, rng: np.random.Generator) -> pd.DataFrame:
    """Global market drivers, one row per week."""
    n = len(dates)
    t = np.arange(n)

    month = dates.month.to_numpy()
    season = np.sin(2 * np.pi * (month - 1) / 12.0)

    # --- Bunker / VLSFO index -------------------------------------------------
    bunker_trend = BUNKER_BASE_USD_T * np.exp(BUNKER_TREND_PER_YEAR * t / 52.0)
    bunker_season = 1.0 + BUNKER_SEASON_AMP * season
    bunker_shock = rng.normal(0.0, 0.018, n).cumsum() * 0.055
    bunker = bunker_trend * bunker_season * (1.0 + bunker_shock)

    # --- Global seaborne dry-bulk demand index --------------------------------
    demand_trend = DEMAND_BASE * np.exp(DEMAND_TREND_PER_WEEK * t / 52.0)
    demand_season = 1.0 + DEMAND_SEASON_AMP * season
    demand_noise = rng.normal(0.0, 0.011, n).cumsum() * 0.038
    demand = demand_trend * demand_season * (1.0 + demand_noise)

    # --- Market volatility proxy (0-100) --------------------------------------
    vol = VOL_BASE * (1.0 + VOL_SEASON_AMP * np.abs(season))
    vol = vol * (1.0 + 0.006 * t / 52.0)  # slow secular drift
    vol = vol * (1.0 + rng.normal(0.0, 0.16, n))
    vol = np.clip(vol, 8.0, 96.0)

    return pd.DataFrame(
        {
            "date": dates,
            "bunker_index": np.round(bunker, 2),
            "demand_index": np.round(demand, 3),
            "market_volatility": np.round(vol, 2),
        }
    )


# ---------------------------------------------------------------------------
# Per-port congestion series
# ---------------------------------------------------------------------------


def build_congestion(dates: pd.DatetimeIndex, rng: np.random.Generator) -> pd.DataFrame:
    """Berth-occupancy congestion (0-100) per Indian discharge port."""
    n = len(dates)
    month = dates.month.to_numpy()
    season = np.sin(2 * np.pi * (month - 4) / 12.0)  # peaks pre-monsoon

    frames: dict[str, np.ndarray] = {}
    for name, cfg in PORTS.items():
        base = cfg["congestion_base"]
        amp = cfg["congestion_amp"]
        swing = amp * season
        # Each port carries its own persistent queue dynamic (AR-like).
        queue = np.zeros(n)
        shock = rng.normal(0.0, 1.0, n)
        for i in range(1, n):
            queue[i] = 0.82 * queue[i - 1] + shock[i]
        swing = swing + 0.55 * queue * amp
        level = np.clip(base + swing, 5.0, 99.0)
        frames[name] = np.round(level, 2)

    out = pd.DataFrame(frames)
    out.insert(0, "date", dates)
    return out


# ---------------------------------------------------------------------------
# Freight rate synthesis
# ---------------------------------------------------------------------------


def structural_daily_cost(vessel: str, distance_nm: float, cargo: str) -> float:
    """Reference voyage economics -> a notional spot daily rate.

    `Vessel.daily_rate_usd` is the *reference* rate for a nominal long-haul
    voyage. We scale it by distance (longer voyage -> higher daily rate, since
    the owner absorbs more fuel/repositioning risk per day) and by cargo stowage
    factor (heavier cargoes historically attract a premium).
    """
    v = VESSEL_CLASSES[vessel]
    base = v["daily_rate_usd"]
    distance_factor = (distance_nm / 6500.0) ** 0.42
    stowage = CARGO_TYPES[cargo]["weight_factor"]
    return base * distance_factor * (0.94 + 0.06 * stowage)


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED)
    dates = build_dates()
    months = np.asarray(dates.month)
    drivers = build_drivers(dates, rng)
    congestion = build_congestion(dates, rng)
    n_weeks = len(dates)

    rows: list[dict] = []

    for lane in LANES:
        origin = lane["origin"]
        dest = lane["dest"]
        vessel = lane["vessel"]
        distance = lane["distance_nm"]
        dest_cfg = PORTS[dest]

        cong = congestion[dest].to_numpy()
        # Vessel availability tightness (0 = loose, 100 = very tight) is a
        # function of the destination queue plus an idiosyncratic lane term.
        lane_tightness = rng.normal(0.0, 7.0, n_weeks)
        availability = np.clip(
            28.0 + 0.42 * (cong - dest_cfg["congestion_base"]) + lane_tightness, 3.0, 97.0
        )

        lane_vol = rng.normal(0.0, 1.0, n_weeks)

        for cargo in lane["cargo"]:
            base_rate = structural_daily_cost(vessel, distance, cargo)
            cargo_month_factor = np.array(CARGO_MONTH_FACTOR[cargo])

            cargo_rows: list[dict] = []
            for i, d in enumerate(dates):
                month = int(months[i])

                demand = float(drivers["demand_index"].iloc[i])
                bunker = float(drivers["bunker_index"].iloc[i])
                vol = float(drivers["market_volatility"].iloc[i])
                cong_i = float(cong[i])
                avail = float(availability[i])

                # --- multiplicative drivers (calibrated elasticities) --------
                demand_effect = 0.0022 * (demand - 100.0) * CARGO_TYPES[cargo]["demand_amp"]
                # bunker: fuel is ~30% of voyage cost -> partial pass-through
                bunker_effect = 0.30 * (bunker - BUNKER_BASE_USD_T) / BUNKER_BASE_USD_T
                congestion_effect = -0.00085 * (cong_i - dest_cfg["congestion_base"])
                availability_effect = 0.00072 * (avail - 28.0)
                seasonality = cargo_month_factor[month - 1] - 1.0

                # --- stochastic component ------------------------------------
                idio = 0.00085 * lane_vol[i] * (vol / VOL_BASE)
                # A slow mean-reverting freight cycle per lane+cargo combination
                cyc = 0.0

                rate = base_rate * (
                    1.0
                    + demand_effect
                    + bunker_effect
                    + congestion_effect
                    + availability_effect
                    + seasonality
                    + idio
                    + cyc
                )
                rate = max(rate, base_rate * 0.45)

                cargo_rows.append(
                    {
                        "date": d.date().isoformat(),
                        "origin_country": LOADING_PORTS[origin]["country"],
                        "loading_port": origin,
                        "discharge_port": dest,
                        "vessel_type": vessel,
                        "cargo_type": cargo,
                        "freight_rate_usd_day": round(float(rate), 2),
                        "bunker_index_usd_t": bunker,
                        "demand_index": demand,
                        "port_congestion": round(cong_i, 2),
                        "vessel_availability": round(avail, 2),
                        "market_volatility": vol,
                        "route_distance_nm": distance,
                        "voyage_days_ref": round(distance / 13.2, 1),
                    }
                )

            # Inject a realistic slow freight cycle AFTER the fact so the series
            # has visible autocorrelation for the lag/rolling features to exploit.
            frame = pd.DataFrame(cargo_rows)
            cycle = np.zeros(n_weeks)
            innov = rng.normal(0.0, 1.0, n_weeks)
            for i in range(1, n_weeks):
                cycle[i] = 0.93 * cycle[i - 1] + 0.028 * innov[i]
            frame["freight_rate_usd_day"] = (
                frame["freight_rate_usd_day"].to_numpy() * (1.0 + cycle)
            ).round(2)

            rows.append(frame)

    out = pd.concat(rows, ignore_index=True)
    out = out.sort_values(
        ["loading_port", "discharge_port", "vessel_type", "cargo_type", "date"],
        kind="mergesort",
    ).reset_index(drop=True)
    return out


def main() -> None:
    frame = generate()
    frame.to_csv(OUT_CSV, index=False)
    print(f"Wrote {OUT_CSV}")
    print(f"rows={len(frame)}  cols={len(frame.columns)}")
    print(f"date range: {frame['date'].min()} .. {frame['date'].max()}")
    print(f"distinct lanes: {frame.groupby(['loading_port','discharge_port','vessel_type']).ngroups}")
    print(f"distinct cargo: {sorted(frame['cargo_type'].unique())}")
    print(f"freight rate: {frame['freight_rate_usd_day'].min():.0f} .. {frame['freight_rate_usd_day'].max():.0f} USD/day")


if __name__ == "__main__":
    main()