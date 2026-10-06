/**
 * OceanIQ — pipeline smoke test.
 *
 * Runs the full decision pipeline for the documented default scenario and the
 * required dynamic cases, asserting the numbers actually move when the inputs
 * change. Run with:
 *
 *   npx tsx src/lib/engine/pipeline.test.ts
 */

import assert from "node:assert/strict";
import { runAnalysis } from "./analysis";
import { mlArtifactsPresent } from "@/lib/ml/dataLoader";
import { VESSEL_ORDER, type VesselClass } from "@/lib/reference/corridors";
import { DEFAULT_SCENARIO } from "@/lib/types";

/** Position of a class in the size ladder, handy for "did it go up?" assertions. */
function classRank(type: string | undefined): number {
  return VESSEL_ORDER.indexOf((type ?? "") as VesselClass);
}

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
    console.log(`  FAIL ${name}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

if (!mlArtifactsPresent()) {
  console.error(
    "ML artifacts missing. Run:\n  python -m ml.data.generate_reference_data\n  python -m ml.train_model\n  python -m ml.data.generate_exogenous_forecast",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
section("1. Default scenario (Coal, 70,000 t, 4 voyages, Hay Point -> Paradip)");
// ---------------------------------------------------------------------------

const base = runAnalysis(DEFAULT_SCENARIO);

check("produces a complete AnalysisResult", () => {
  for (const key of [
    "scenarioId",
    "forecast",
    "charterTiming",
    "vessel",
    "port",
    "route",
    "cost",
    "savings",
    "risk",
    "strategies",
    "selectedStrategy",
    "recommendation",
    "disclosure",
  ] as const) {
    assert.ok(base[key] !== undefined, `missing ${key}`);
  }
});

check("forecast has a real weekly path", () => {
  assert.equal(base.forecast.forecastRates.length, 26);
  for (const p of base.forecast.forecastRates) {
    assert.ok(Number.isFinite(p.rate) && p.rate > 0, `bad rate at week ${p.week}`);
    assert.ok(p.lower < p.rate && p.rate < p.upper, `band not bracketing at week ${p.week}`);
  }
});

check("uncertainty widens with horizon", () => {
  const first = base.forecast.forecastRates[0];
  const last = base.forecast.forecastRates[base.forecast.forecastRates.length - 1];
  assert.ok(
    last.upper - last.lower > first.upper - first.lower,
    "band did not widen over the horizon",
  );
});

check("model is reported as trained on reference data", () => {
  assert.equal(base.model.datasetKind, "synthetic_reference");
  assert.equal(base.model.modelStatus, "trained-reference-data");
  assert.ok(base.model.nEstimators > 0, "no estimators reported");
  assert.ok(base.model.validation.mapePercent > 0, "no validation metric reported");
  assert.ok(
    base.model.limitation.toLowerCase().includes("synthetic"),
    "limitation does not disclose synthetic data",
  );
});

check("exactly one vessel and one strategy are recommended", () => {
  assert.equal(base.vessel.all.filter((v) => v.recommended).length, 1);
  assert.equal(base.strategies.filter((s) => s.recommended).length, 1);
  assert.equal(base.strategies.filter((s) => s.recommended)[0].key, base.selectedStrategy.key);
});

check("cost breakdown sums to the stated total", () => {
  const sum = base.cost.items.reduce((a, i) => a + i.perVoyage, 0);
  assert.ok(
    Math.abs(sum - base.cost.totalPerVoyage) <= 1,
    `items sum ${sum} != total ${base.cost.totalPerVoyage}`,
  );
  const shares = base.cost.items.reduce((a, i) => a + i.sharePercent, 0);
  assert.ok(Math.abs(shares - 100) < 0.5, `shares sum to ${shares}`);
});

check("savings drivers account for the headline saving", () => {
  const drivers = base.savings.drivers.reduce((a, d) => a + d.amount, 0);
  const gap = Math.abs(drivers - base.savings.savings);
  assert.ok(
    gap <= Math.max(2, Math.abs(base.savings.savings) * 0.02),
    `drivers ${drivers} vs savings ${base.savings.savings}`,
  );
});

check("risk weights sum to 1 and components are bounded", () => {
  const weights = base.risk.components.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(weights - 1) < 0.001, `weights sum to ${weights}`);
  for (const c of base.risk.components) {
    assert.ok(c.score >= 0 && c.score <= 100, `${c.key} out of range`);
  }
});

check("recommendation cites the model and every engine", () => {
  const sources = base.recommendation.evidence.map((e) => e.source.toLowerCase()).join(" | ");
  for (const needle of ["forecast", "port", "vessel", "route", "cost", "risk", "strategy"]) {
    assert.ok(sources.includes(needle), `evidence missing ${needle}`);
  }
  assert.ok(base.recommendation.watchOuts.length >= 3, "too few watch-outs");
  assert.ok(base.recommendation.disclaimer.length > 80, "disclaimer too thin");
});

check("route map coordinates come from the reference layer", () => {
  const first = base.route.selected.coordinates[0];
  const last = base.route.selected.coordinates[base.route.selected.coordinates.length - 1];
  assert.equal(first.lat, -21.2772, "Hay Point latitude missing");
  assert.ok(Math.abs(last.lat - 20.2648) < 0.01, "Paradip latitude missing");
});

// ---------------------------------------------------------------------------
section("2. Determinism");
// ---------------------------------------------------------------------------

check("identical scenario reproduces identical output", () => {
  const a = runAnalysis(DEFAULT_SCENARIO);
  const b = runAnalysis(DEFAULT_SCENARIO);
  assert.equal(a.forecast.predictedRate, b.forecast.predictedRate);
  assert.equal(a.vessel.primary.type, b.vessel.primary.type);
  assert.equal(a.cost.totalPerVoyage, b.cost.totalPerVoyage);
  assert.equal(a.scenarioId, b.scenarioId);
  assert.equal(a.risk.score, b.risk.score);
});

check("a different scenario produces a different scenario id", () => {
  const other = runAnalysis({ ...DEFAULT_SCENARIO, dischargePort: "Haldia" });
  assert.notEqual(other.scenarioId, base.scenarioId);
});

// ---------------------------------------------------------------------------
section("3. Changing the discharge port changes the decision");
// ---------------------------------------------------------------------------

const haldia = runAnalysis({ ...DEFAULT_SCENARIO, dischargePort: "Haldia" });

check("forecast lane follows the destination", () => {
  assert.ok(
    haldia.forecast.laneResolution.lane.includes("Haldia"),
    `lane still ${haldia.forecast.laneResolution.lane}`,
  );
  assert.notEqual(haldia.forecast.currentRate, base.forecast.currentRate);
});

check("distance, transit and route geometry change", () => {
  assert.notEqual(haldia.route.selected.distance, base.route.selected.distance);
  assert.notEqual(haldia.route.selected.coordinates.at(-1)?.lat, base.route.selected.coordinates.at(-1)?.lat);
});

check("port assessment is recomputed for the new port", () => {
  assert.equal(haldia.port.selected.name, "Haldia");
  assert.notEqual(haldia.port.selected.congestion, base.port.selected.congestion);
});

check("cost and risk move with the corridor", () => {
  assert.notEqual(haldia.cost.totalPerVoyage, base.cost.totalPerVoyage);
  assert.ok(Number.isFinite(haldia.risk.score));
});

check("recommendation prose names the new port", () => {
  assert.ok(
    haldia.recommendation.summary.includes("Haldia"),
    "recommendation does not mention the new discharge port",
  );
});

// ---------------------------------------------------------------------------
section("4. Changing the parcel quantity changes the decision");
// ---------------------------------------------------------------------------

const bigParcel = runAnalysis({ ...DEFAULT_SCENARIO, quantity: 100_000 });

check("vessel class can change with parcel size", () => {
  assert.ok(bigParcel.vessel.all.length === 4, "not all classes evaluated");
  const bigUsesBiggerVessel =
    classRank(bigParcel.vessel.primary.type) >= classRank(base.vessel.primary.type);
  assert.ok(bigUsesBiggerVessel, "a larger parcel picked a smaller vessel");
});

check("utilisation and voyages-per-parcel are recomputed", () => {
  // A 100,000 t parcel cannot be a single Panamax lift, so the engine must say so
  // in words, not just in a number.
  assert.ok(
    /voyages per parcel|Needs \d+ voyage/i.test(bigParcel.vessel.primary.reasons.join(" ")),
    "engine does not report the extra voyages a 100k parcel needs",
  );
  assert.ok(
    bigParcel.cost.totalProgram > base.cost.totalProgram,
    "100k x 4 voyages does not cost more than 70k x 4 voyages",
  );
  assert.notEqual(bigParcel.cost.costPerTonne, base.cost.costPerTonne);
});

check("a parcel that cannot berth is reported as incompatible", () => {
  // Capesize is 18.9m draft; no reference Indian port admits that.
  const cape = runAnalysis({
    ...DEFAULT_SCENARIO,
    quantity: 170_000,
    preferredVesselType: "Capesize",
  });
  const capeEval = cape.vessel.all.find((v) => v.type === "Capesize");
  assert.equal(capeEval?.portCompatibility, "Fail");
  assert.ok((capeEval?.blockers.length ?? 0) > 0, "no blockers listed for Capesize");
  assert.notEqual(cape.vessel.primary.type, "Capesize", "an infeasible class was recommended");
});

check("quantity changes the route's cost-per-tonne", () => {
  assert.notEqual(bigParcel.route.selected.costPerTonne, base.route.selected.costPerTonne);
});

// ---------------------------------------------------------------------------
section("5. Changing the stated vessel preference changes the evaluation");
// ---------------------------------------------------------------------------

const preferCapesize = runAnalysis({
  ...DEFAULT_SCENARIO,
  preferredVesselType: "Capesize",
});

check("preferred class is evaluated and marked", () => {
  const cape = preferCapesize.vessel.all.find((v) => v.type === "Capesize");
  assert.ok(cape, "Capesize not evaluated");
  assert.equal(cape?.isStatedPreference, true);
});

check("forecast is re-run on the preferred lane", () => {
  const res = preferCapesize.forecast.laneResolution;
  assert.equal(res.vesselType, "Capesize", "lane resolution ignored the preference");
  assert.ok(res.lane.length > 0, "no lane resolved");
  if (!res.exact) {
    assert.ok(res.basedOnLane, "proxied lane not disclosed");
    assert.ok(
      /no reference lane/i.test(res.adjustment),
      `proxy not explained: ${res.adjustment}`,
    );
  }
});

check("an infeasible preference is not silently adopted", () => {
  assert.notEqual(preferCapesize.vessel.primary.type, "Capesize");
  assert.ok(
    preferCapesize.recommendation.why.items.some((i) =>
      /constraint|draft|berth|LOA|beam/i.test(i.detail ?? ""),
    ),
    "recommendation does not explain the override",
  );
});

// A 58,000 t parcel is a single Supramax lift, so the stated preference is
// genuinely feasible and should win rather than being overridden by Panamax.
const preferSupramax = runAnalysis({
  ...DEFAULT_SCENARIO,
  quantity: 58_000,
  preferredVesselType: "Supramax",
});

check("a feasible preference is honoured", () => {
  assert.equal(preferSupramax.vessel.primary.type, "Supramax");
  assert.ok(
    preferSupramax.vessel.primary.utilisationPercent > 90,
    `Supramax only lifts ${preferSupramax.vessel.primary.utilisationPercent}% of the parcel`,
  );
});

check("a preference that cannot lift the parcel is overridden", () => {
  // Supramax lifts 58,000 t, so a 70,000 t parcel needs two voyages; Panamax
  // carries it in one and must win despite not being the stated preference.
  const override = runAnalysis({
    ...DEFAULT_SCENARIO,
    quantity: 70_000,
    preferredVesselType: "Supramax",
  });
  assert.equal(override.vessel.primary.type, "Panamax");
  assert.ok(
    override.recommendation.evidence.some((e) => e.source.includes("Vessel")),
    "recommendation does not cite the vessel engine",
  );
});

// ---------------------------------------------------------------------------
section("6. Changing the contract horizon changes the structure");
// ---------------------------------------------------------------------------

// The 4-voyage default programme turns around in roughly three months, so a
// 1-month term genuinely under-covers it while a 6-month term covers it fully.
const shortTerm = runAnalysis({
  ...DEFAULT_SCENARIO,
  contractHorizon: "1 Month",
  contractStrategy: "short",
});

check("a term too short to cover the programme raises residual exposure", () => {
  const baseShort = base.strategies.find((s) => s.key === "short")!;
  const shortShort = shortTerm.strategies.find((s) => s.key === "short")!;
  assert.ok(
    shortShort.freightExposure > baseShort.freightExposure,
    `1-month term exposure ${shortShort.freightExposure} not above 3-month ${baseShort.freightExposure}`,
  );
  assert.notEqual(shortShort.totalCost, baseShort.totalCost);
  assert.ok(
    /term covers only about/i.test(shortShort.rationale),
    `rationale does not explain the shortfall: ${shortShort.rationale}`,
  );
});

check("a term that covers the programme reports full coverage", () => {
  const sixMonth = runAnalysis({
    ...DEFAULT_SCENARIO,
    contractHorizon: "6 Months",
    contractStrategy: "medium",
  });
  const mediumSix = sixMonth.strategies.find((s) => s.key === "medium")!;
  assert.ok(
    /covers all \d+ voyage/i.test(mediumSix.rationale),
    `rationale does not report full coverage: ${mediumSix.rationale}`,
  );
  assert.equal(
    sixMonth.strategies.find((s) => s.key === "spot")!.totalCost,
    base.strategies.find((s) => s.key === "spot")!.totalCost,
    "spot baseline moved with the horizon",
  );
});

check("time-charter applicability follows the voyage count", () => {
  assert.equal(base.strategies.find((s) => s.key === "medium")?.timeCharterApplicable, true);
  const single = runAnalysis({ ...DEFAULT_SCENARIO, voyages: 1 });
  assert.equal(
    single.strategies.find((s) => s.key === "medium")?.timeCharterApplicable,
    false,
  );
});

// ---------------------------------------------------------------------------
section("7. Honesty of the output");
// ---------------------------------------------------------------------------

check("no live-data claims anywhere in the result", () => {
  const json = JSON.stringify(base).toLowerCase();
  for (const banned of ["baltic exchange index", "live ais", "real-time ais feed"]) {
    assert.ok(!json.includes(banned), `result claims ${banned}`);
  }
  assert.ok(
    base.disclosure.notTrainedOn.length >= 3,
    "disclosure does not list what the model was NOT trained on",
  );
  assert.ok(
    base.disclosure.trainedOn.toLowerCase().includes("synthetic"),
    "trainedOn does not disclose synthetic data",
  );
});

check("lane proxying is disclosed", () => {
  const proxied = runAnalysis({
    ...DEFAULT_SCENARIO,
    cargo: "Limestone",
  });
  if (!proxied.forecast.laneResolution.exact) {
    assert.ok(
      proxied.recommendation.watchOuts.some((w) => /proxied|adjacent lane/i.test(w)),
      "proxied lane not disclosed in watch-outs",
    );
  }
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PIPELINE OK");