"""Project the exogenous market drivers forward (reference market model).

The ML forecaster needs future values for the *non-target* drivers:
bunker index, global dry-bulk demand index, market volatility and per-port
berth congestion. In a production system these would come from live feeds.

For this prototype they are projected with the SAME deterministic structural
model used to build the reference history:
  * secular trend (exponential, per-week growth)
  * seasonal cycle (sine on calendar month)
  * a damped, mean-reverting stochastic residual

The stochastic residual is damped toward zero over the horizon (the market is
assumed to converge on its structural path), which is why the projection is
fully deterministic and reproducible.

HONESTY: SYNTHETIC / REFERENCE projection. Not SAIL data, not a live feed.

Output: ml/data/exogenous_forecast.csv  (weekly, forward from SERIES_END)
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
    DEMAND_BASE,
    DEMAND_SEASON_AMP,
    DEMAND_TREND_PER_WEEK,
    PORTS,
    RANDOM_SEED,
    SERIES_END,
    VOL_BASE,
    VOL_SEASON_AMP,
)

OUT_CSV = Path(__file__).resolve().parent / "exogenous_forecast.csv"

HORIZON_WEEKS = 30


def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED + 991)
    history_dates = pd.date_range(
        start="2023-01-06", end=SERIES_END, freq="W-FRI"
    )
    future_dates = pd.date_range(
        start=history_dates[-1] + pd.Timedelta(weeks=1),
        periods=HORIZON_WEEKS,
        freq="W-FRI",
    )

    # t = weeks since the first observation, continuing the history timeline.
    t0 = len(history_dates)
    t = np.arange(t0, t0 + HORIZON_WEEKS)
    month = np.asarray(future_dates.month)

    # Residual damping: keeps the projection deterministic but not implausibly
    # smooth. Damping factor falls from 1.0 to 0.15 across the horizon.
    damp = np.linspace(1.0, 0.15, HORIZON_WEEKS)

    season = np.sin(2 * np.pi * (month - 1) / 12.0)

    bunker = (
        BUNKER_BASE_USD_T
        * np.exp(BUNKER_TREND_PER_YEAR * t / 52.0)
        * (1.0 + BUNKER_SEASON_AMP * season)
        * (1.0 + 0.030 * np.cumsum(rng.normal(0.0, 1.0, HORIZON_WEEKS)) / np.sqrt(
            np.arange(1, HORIZON_WEEKS + 1)
        ) * damp)
    )

    demand = (
        DEMAND_BASE
        * np.exp(DEMAND_TREND_PER_WEEK * t / 52.0)
        * (1.0 + DEMAND_SEASON_AMP * season)
        * (1.0 + 0.022 * np.cumsum(rng.normal(0.0, 1.0, HORIZON_WEEKS)) / np.sqrt(
            np.arange(1, HORIZON_WEEKS + 1)
        ) * damp)
    )

    vol = np.clip(
        VOL_BASE
        * (1.0 + VOL_SEASON_AMP * np.abs(season))
        * (1.0 + 0.006 * t / 52.0)
        * (1.0 + rng.normal(0.0, 0.12, HORIZON_WEEKS) * damp),
        8.0,
        96.0,
    )

    frames = [
        pd.DataFrame(
            {
                "date": future_dates.date.astype(str),
                "horizon_weeks": np.arange(1, HORIZON_WEEKS + 1),
                "bunker_index_usd_t": np.round(bunker, 2),
                "demand_index": np.round(demand, 3),
                "market_volatility": np.round(vol, 2),
            }
        )
    ]

    # Per-port congestion, same structural form as the historical generator.
    cong_frames: dict[str, np.ndarray] = {}
    for name, cfg in PORTS.items():
        base = cfg["congestion_base"]
        amp = cfg["congestion_amp"]
        season_c = np.sin(2 * np.pi * (month - 4) / 12.0)
        shock = rng.normal(0.0, 1.0, HORIZON_WEEKS)
        queue = np.zeros(HORIZON_WEEKS)
        for i in range(1, HORIZON_WEEKS):
            queue[i] = 0.82 * queue[i - 1] + shock[i]
        level = np.clip(
            base + amp * season_c + 0.55 * queue * amp * damp, 5.0, 99.0
        )
        cong_frames[f"congestion_{name.replace(' ', '_')}"] = np.round(level, 2)

    cong_df = pd.DataFrame(cong_frames)
    cong_df.insert(0, "date", future_dates.date.astype(str))
    cong_df.insert(1, "horizon_weeks", np.arange(1, HORIZON_WEEKS + 1))

    out = frames[0].merge(cong_df, on=["date", "horizon_weeks"], how="left")
    out.to_csv(OUT_CSV, index=False)

    print(f"Wrote {OUT_CSV}")
    print(f"rows={len(out)}  horizon={HORIZON_WEEKS} weeks  "
          f"{out['date'].iloc[0]} .. {out['date'].iloc[-1]}")


if __name__ == "__main__":
    main()