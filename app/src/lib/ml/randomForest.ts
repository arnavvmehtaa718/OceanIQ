/**
 * OceanIQ — RandomForest inference engine (TypeScript).
 *
 * This is a faithful re-implementation of scikit-learn's
 * `RandomForestRegressor` prediction routine. It walks the forest exported by
 * `ml/train_model.py` (see `ml/model/freight_rf_model.json`) using sklearn's
 * own split rule:
 *
 *     node = 0
 *     while nodes[node].feature >= 0:
 *         node = x[nodes[node].feature] <= nodes[node].threshold
 *             ? nodes[node].left
 *             : nodes[node].right
 *     return nodes[node].value
 *
 * prediction = mean of the per-tree leaf values.
 *
 * `ml/verify_parity.py` runs both this engine and scikit-learn over the same
 * held-out rows and asserts the outputs agree, so the frontend is demonstrably
 * consuming the *actual trained model* rather than a re-implementation of the
 * formula it learned.
 *
 * Node layout (matches `export_forest` in ml/train_model.py):
 *   [0] leftChildIndex   [1] rightChildIndex
 *   [2] featureIndex     [3] threshold    [4] leafValue
 *
 * sklearn marks a leaf with feature === -2.
 */

export type ForestNode = readonly [number, number, number, number, number];

export interface RandomForestArtifact {
  format: "oceaniq-rf-1";
  modelType: string;
  library: string;
  target: string;
  targetUnit: string;
  featureColumns: string[];
  seriesKeys: string[];
  randomState: number;
  nEstimators: number;
  maxDepth: number | null;
  minSamplesLeaf: number;
  totalNodes: number;
  /** trees[i][nodeIndex] = [left, right, feature, threshold, value] */
  trees: ForestNode[][];
  featureImportances: number[];
}

const LEAF = -2;

export class RandomForestRegressor {
  readonly artifact: RandomForestArtifact;
  private readonly featureIndex: Record<string, number>;

  constructor(artifact: RandomForestArtifact) {
    this.artifact = artifact;
    this.featureIndex = {};
    artifact.featureColumns.forEach((name, i) => {
      this.featureIndex[name] = i;
    });
  }

  /**
   * Ordered vector for the feature names declared in the artifact.
   *
   * `Math.fround` is not cosmetic: sklearn's tree predictor casts the design
   * matrix to float32 (`sklearn.tree._tree.DTYPE`) before walking the splits.
   * Rounding each feature to float32 here is what makes this engine agree with
   * sklearn bit for bit — without it a handful of near-threshold nodes branch
   * the other way and predictions drift by a few USD/day. Verified by
   * `ml/verify_parity.py`.
   */
  vector(features: Record<string, number>): number[] {
    const cols = this.artifact.featureColumns;
    const out = new Array<number>(cols.length);
    for (let i = 0; i < cols.length; i++) {
      const v = features[cols[i]];
      out[i] =
        typeof v === "number" && Number.isFinite(v) ? Math.fround(v) : 0;
    }
    return out;
  }

  /** Mean of per-tree leaf values, exactly as sklearn averages them. */
  predict(features: Record<string, number>): number {
    return this.predictVector(this.vector(features));
  }

  predictVector(x: number[]): number {
    const trees = this.artifact.trees;
    let sum = 0;
    for (let t = 0; t < trees.length; t++) {
      sum += this.predictTree(trees[t], x);
    }
    return sum / trees.length;
  }

  private predictTree(nodes: ForestNode[], x: number[]): number {
    let i = 0;
    // Trees are bounded (max_depth 11), so this loop always terminates.
    for (let guard = 0; guard < 256; guard++) {
      const node = nodes[i];
      const feature = node[2];
      if (feature === LEAF || feature < 0) return node[4];
      i = x[feature] <= node[3] ? node[0] : node[1];
    }
    return nodes[i][4];
  }

  /**
   * Local sensitivity of the prediction to a single feature. Used to produce
   * the scenario-specific "major factors" list on the forecast screen, so the
   * explanation reflects *this* corridor rather than global importance alone.
   *
   * `scale` is a sensible one-sigma nudge for the feature's domain.
   */
  localSensitivity(features: Record<string, number>, featureName: string, scale: number): number {
    const basePred = this.predict(features);
    void basePred;
    const original = features[featureName];
    const up = this.predict({ ...features, [featureName]: original + scale });
    const down = this.predict({ ...features, [featureName]: original - scale });
    return (up - down) / 2;
  }

  featureImportance(name: string): number {
    const i = this.artifact.featureColumns.indexOf(name);
    return i >= 0 ? this.artifact.featureImportances[i] : 0;
  }
}