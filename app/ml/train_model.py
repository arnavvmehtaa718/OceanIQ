"""Train the OceanIQ prototype freight forecaster and export a portable model.

WHAT THIS IS
============
A real `sklearn.ensemble.RandomForestRegressor` regression model that predicts
the next-week dry-bulk freight rate (USD/day) for a given corridor, vessel,
cargo, calendar and market state.

WHAT THIS IS NOT
================
It is NOT trained on SAIL data, Baltic Exchange settlements or live AIS feeds —
none of which were available for this prototype. It is trained on the
clearly-labelled SYNTHETIC / REFERENCE dataset in
`ml/data/freight_history_reference.csv`. Every metric printed below is a
*validation metric on reference/synthetic data*, not a claim of production
accuracy on real chartering data.

METHOD
------
* Chronological (time-aware) 80/20 split on the weekly date index — the model
  never trains on future weeks.
* Lags / rolling windows are backward-looking only (see `ml/features.py`), so
  there is no target leakage.
* `random_state=42`, `n_jobs=1` -> bit-identical model on every run.
* The fitted forest is exported to `ml/model/freight_rf_model.json` in a compact
  array form, plus `ml/model/metrics.json` and a parity fixture. The TypeScript
  inference engine in `src/lib/ml/randomForest.ts` reproduces sklearn's
  traversal exactly; `ml/verify_parity.py` proves the two agree.

Run:  python -m ml.train_model
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ml.features import (  # noqa: E402
    FEATURE_COLUMNS,
    SERIES_KEYS,
    TARGET_COLUMN,
    build_features,
    clean,
)

DATA_CSV = ROOT / "ml" / "data" / "freight_history_reference.csv"
MODEL_DIR = ROOT / "ml" / "model"
MODEL_JSON = MODEL_DIR / "freight_rf_model.json"
METRICS_JSON = MODEL_DIR / "metrics.json"
PARITY_JSON = MODEL_DIR / "parity_fixture.json"

RANDOM_STATE = 42
TRAIN_FRACTION = 0.8
N_ESTIMATORS = 120
MAX_DEPTH = 11
MIN_SAMPLES_LEAF = 4
MAX_FEATURES = 0.65
# Thresholds are quantised before export so the TypeScript engine reproduces
# sklearn's split decisions bit-for-bit while keeping the artifact compact.
# 17 significant digits is the exact float64 round-trip width. Anything less
# makes the TypeScript traversal split a handful of nodes the other way, which
# shows up as a few USD/day of drift in ml/verify_parity.py.
THRESHOLD_SIGFIGS = 17


def load_frame() -> pd.DataFrame:
    if not DATA_CSV.exists():
        print(f"[ml] reference dataset missing -> generating {DATA_CSV}")
        from ml.data.generate_reference_data import main as gen_main

        gen_main()
    raw = pd.read_csv(DATA_CSV)
    return clean(build_features(raw))


def export_forest(model: RandomForestRegressor, feature_columns: list[str]) -> dict:
    """Flatten the sklearn forest into arrays the TypeScript engine can walk.

    Node layout (mirrored in `src/lib/ml/randomForest.ts`):
        [leftChildIndex, rightChildIndex, featureIndex, threshold, leafValue]

    sklearn marks a leaf with `feature == -2` and `threshold == -2.0`.
    """
    trees = []
    total_nodes = 0
    for est in model.estimators_:
        t = est.tree_
        nodes: list[list[float]] = []
        for i in range(t.node_count):
            left = int(t.children_left[i])
            right = int(t.children_right[i])
            feat = int(t.feature[i])
            thr = float(t.threshold[i])
            val = float(t.value[i][0][0])
            if feat >= 0:
                thr = float(f"{thr:.{THRESHOLD_SIGFIGS}g}")
            else:
                thr = -2.0
            nodes.append([float(left), float(right), float(feat), thr, val])
        total_nodes += len(nodes)
        trees.append(nodes)

    return {
        "format": "oceaniq-rf-1",
        "modelType": "RandomForestRegressor",
        "library": "scikit-learn",
        "target": TARGET_COLUMN,
        "targetUnit": "USD/day",
        "featureColumns": feature_columns,
        "seriesKeys": list(SERIES_KEYS),
        "randomState": RANDOM_STATE,
        "nEstimators": int(model.n_estimators),
        "maxDepth": int(model.max_depth) if model.max_depth else None,
        "minSamplesLeaf": int(model.min_samples_leaf),
        "totalNodes": total_nodes,
        "trees": trees,
        "featureImportances": [float(v) for v in model.feature_importances_],
    }


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    frame = load_frame()
    dates = pd.to_datetime(frame["date"])
    unique_dates = np.array(sorted(dates.unique()))
    split_date = unique_dates[int(len(unique_dates) * TRAIN_FRACTION)]

    train = frame[dates <= split_date]
    test = frame[dates > split_date]

    x_train = train[FEATURE_COLUMNS].to_numpy(dtype=float)
    y_train = train[TARGET_COLUMN].to_numpy(dtype=float)
    x_test = test[FEATURE_COLUMNS].to_numpy(dtype=float)
    y_test = test[TARGET_COLUMN].to_numpy(dtype=float)

    print("=" * 72)
    print("OceanIQ prototype freight forecaster — RandomForestRegressor")
    print("=" * 72)
    print(f"data source        : SYNTHETIC / REFERENCE (ml/data/freight_history_reference.csv)")
    print(f"rows (engineered)  : {len(frame):,}  ({len(train):,} train / {len(test):,} test)")
    print(f"time-aware split   : train <= {pd.Timestamp(split_date).date()}  |  test > that")
    print(f"features           : {len(FEATURE_COLUMNS)}")
    print(f"model              : n_estimators={N_ESTIMATORS} max_depth={MAX_DEPTH} "
          f"min_samples_leaf={MIN_SAMPLES_LEAF} random_state={RANDOM_STATE}")

    model = RandomForestRegressor(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        max_features=MAX_FEATURES,
        random_state=RANDOM_STATE,
        n_jobs=1,
        bootstrap=True,
    )
    model.fit(x_train, y_train)

    train_pred = model.predict(x_train)
    test_pred = model.predict(x_test)

    metrics = {
        "datasetKind": "synthetic_reference",
        "disclaimer": (
            "Metrics are measured on a held-out chronological tail of a "
            "SYNTHETIC/REFERENCE dataset. They are NOT claims about real "
            "chartering accuracy and must be recalibrated on SAIL historical "
            "fixtures before production use."
        ),
        "splitStrategy": "chronological_80_20_by_week",
        "trainThroughDate": str(pd.Timestamp(split_date).date()),
        "testFromDate": str(pd.Timestamp(pd.to_datetime(test['date']).min()).date()),
        "nTrainRows": int(len(train)),
        "nTestRows": int(len(test)),
        "nFeatures": len(FEATURE_COLUMNS),
        "model": {
            "name": "RandomForestRegressor",
            "library": "scikit-learn",
            "nEstimators": N_ESTIMATORS,
            "maxDepth": MAX_DEPTH,
            "minSamplesLeaf": MIN_SAMPLES_LEAF,
            "maxFeatures": MAX_FEATURES,
            "randomState": RANDOM_STATE,
        },
        "train": {
            "mae": round(float(mean_absolute_error(y_train, train_pred)), 2),
            "rmse": round(float(np.sqrt(np.mean((y_train - train_pred) ** 2))), 2),
            "mape": round(float(np.mean(np.abs((y_train - train_pred) / y_train)) * 100), 2),
            "r2": round(float(r2_score(y_train, train_pred)), 4),
        },
        "test": {
            "mae": round(float(mean_absolute_error(y_test, test_pred)), 2),
            "rmse": round(float(np.sqrt(np.mean((y_test - test_pred) ** 2))), 2),
            "mape": round(float(np.mean(np.abs((y_test - test_pred) / y_test)) * 100), 2),
            "r2": round(float(r2_score(y_test, test_pred)), 4),
        },
        "featureImportances": {
            col: round(float(imp), 5)
            for col, imp in sorted(
                zip(FEATURE_COLUMNS, model.feature_importances_),
                key=lambda p: -p[1],
            )
        },
    }

    print("-" * 72)
    print("Validation on REFERENCE / SYNTHETIC data (not real chartering data):")
    for split in ("train", "test"):
        m = metrics[split]
        print(f"  {split:5s}  MAE ${m['mae']:>9,.0f}   RMSE ${m['rmse']:>9,.0f}   "
              f"MAPE {m['mape']:>5.2f}%   R2 {m['r2']:>7.4f}")
    print("-" * 72)
    top = list(metrics["featureImportances"].items())[:10]
    print("Top feature importances:")
    for col, imp in top:
        print(f"  {col:32s} {imp * 100:6.2f}%")

    artifact = export_forest(model, FEATURE_COLUMNS)
    MODEL_JSON.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
    METRICS_JSON.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    # Parity fixture: raw rows + sklearn predictions + fully expanded features,
    # so the TypeScript engine can be checked numerically.
    n_fixture = 400
    rng = np.random.default_rng(7)
    idx = rng.choice(len(test), size=min(n_fixture, len(test)), replace=False)
    idx.sort()
    fixture_rows = test.iloc[idx]
    fixture_pred = model.predict(fixture_rows[FEATURE_COLUMNS].to_numpy(dtype=float))

    parity = {
        "note": "Generated by ml/train_model.py — do not hand-edit.",
        "featureColumns": FEATURE_COLUMNS,
        "rows": [
            {
                "input": {
                    col: float(v) for col, v in zip(FEATURE_COLUMNS, row)
                },
                "sklearnPrediction": float(pred),
            }
            for row, pred in zip(
                fixture_rows[FEATURE_COLUMNS].to_numpy(dtype=float), fixture_pred
            )
        ],
    }
    PARITY_JSON.write_text(json.dumps(parity, indent=1), encoding="utf-8")

    print("-" * 72)
    print(f"model artifact -> {MODEL_JSON.relative_to(ROOT)}  "
          f"({MODEL_JSON.stat().st_size / 1024:.0f} KB)")
    print(f"metrics        -> {METRICS_JSON.relative_to(ROOT)}")
    print(f"parity fixture -> {PARITY_JSON.relative_to(ROOT)}  ({len(parity['rows'])} rows)")


if __name__ == "__main__":
    main()