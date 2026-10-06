"""Verify that the TypeScript inference layer reproduces sklearn exactly.

`ml.train_model` writes `ml/model/parity_fixture.json` containing the feature
vectors and sklearn's own predictions for a sample of held-out rows. This script
re-derives the predictions through the TypeScript implementation by running the
app's own Node code path, then asserts the two agree to floating-point tolerance.

Usage:
    python -m ml.verify_parity            # writes a temp JS shim and runs node
    python -m ml.verify_parity --strict   # fail on any difference at all
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "ml" / "model" / "parity_fixture.json"
MODEL = ROOT / "ml" / "model" / "freight_rf_model.json"

SHIM = """
import * as fs from "node:fs";
import { RandomForestRegressor, type RandomForestArtifact } from "{ts}/randomForest";

const model = JSON.parse(fs.readFileSync("{model}", "utf-8")) as RandomForestArtifact;
const fixture = JSON.parse(fs.readFileSync("{fixture}", "utf-8"));
const forest = new RandomForestRegressor(model);

const out = fixture.rows.map(
  (row) => forest.predict(row.input as Record<string, number>),
);
process.stdout.write(JSON.stringify(out));
"""

# Absolute tolerance on a rate expressed in USD/day. The traversal is identical
# arithmetic in both languages, so this only needs to absorb float64 formatting.
TOLERANCE_USD = 1e-6


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="require bit-identical results")
    args = parser.parse_args()

    if not FIXTURE.exists() or not MODEL.exists():
        print(
            "parity fixture or model artifact missing — run `python -m ml.train_model` first.",
            file=sys.stderr,
        )
        return 2

    ts_dir = (ROOT / "src" / "lib" / "ml").resolve().as_posix()
    shim = (
        SHIM.replace("{ts}", ts_dir)
        .replace("{model}", MODEL.as_posix())
        .replace("{fixture}", FIXTURE.as_posix())
    )

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx is None:
        print("npx not found on PATH — cannot run the TypeScript parity check.", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        shim_path = Path(tmp) / "parity_shim.ts"
        shim_path.write_text(shim, encoding="utf-8")

        proc = subprocess.run(
            [npx, "--yes", "tsx", str(shim_path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            shell=os.name == "nt",
        )

    if proc.returncode != 0:
        print("TypeScript parity run failed:", file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        return 3

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    ts_predictions = json.loads(proc.stdout)
    sklearn_predictions = [row["sklearnPrediction"] for row in fixture["rows"]]

    from ml.features import FEATURE_COLUMNS

    if fixture["featureColumns"] != list(FEATURE_COLUMNS):
        print(
            "feature contract differs between ml/features.py and the exported artifact",
            file=sys.stderr,
        )
        return 4

    if len(ts_predictions) != len(sklearn_predictions):
        print(
            f"length mismatch: {len(ts_predictions)} vs {len(sklearn_predictions)}",
            file=sys.stderr,
        )
        return 4

    worst = 0.0
    worst_index = -1
    for i, (ts, sk) in enumerate(zip(ts_predictions, sklearn_predictions)):
        delta = abs(float(ts) - float(sk))
        if delta > worst:
            worst = delta
            worst_index = i

    tol = 0.0 if args.strict else TOLERANCE_USD

    print(f"rows compared      : {len(ts_predictions)}")
    print(f"max abs difference : {worst:.12f} USD/day (row {worst_index})")
    print(f"tolerance          : {tol:.12f}")

    if worst > tol or math.isnan(worst):
        print("PARITY FAILED", file=sys.stderr)
        return 1

    print("PARITY OK — TypeScript inference matches sklearn exactly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())