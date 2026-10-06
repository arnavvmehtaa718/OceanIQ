/**
 * OceanIQ — central domain types.
 *
 * A single `ProcurementScenario` is the only input to the pipeline:
 *
 *   scenario
 *     -> reference data lookup
 *     -> ML freight forecast          (src/lib/ml)
 *     -> charter timing               (src/lib/engine/charterTiming)
 *     -> vessel optimisation          (src/lib/engine/vessel)
 *     -> port feasibility             (src/lib/engine/port)
 *     -> route optimisation           (src/lib/engine/route)
 *     -> cost engine                  (src/lib/engine/cost)
 *     -> savings vs baseline          (src/lib/engine/savings)
 *     -> risk engine                  (src/lib/engine/risk)
 *     -> contract strategy            (src/lib/engine/strategy)
 *     -> final recommendation         (src/lib/engine/recommendation)
 *     -> AnalysisResult  -> every screen + the report
 *
 * Nothing in the UI computes business values; everything reads this result.
 */

import type { VesselClass } from "@/lib/reference/corridors";
import type { CargoType } from "@/lib/reference/cargo";
import type { RiskLevel } from "@/lib/reference/ports";

export type { RiskLevel };

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type ContractStrategyKey = "spot" | "short" | "medium";

export const CONTRACT_LABELS: Record<ContractStrategyKey, string> = {
  spot: "Repeated Spot Contracts",
  short: "Short-Term Multiple-Voyage",
  medium: "Medium-Term Multiple-Voyage",
};

export const CONTRACT_BLURB: Record<ContractStrategyKey, string> = {
  spot: "Max flexibility, max exposure",
  short: "Balanced - OceanIQ default",
  medium: "Min cost, min flexibility",
};

export const CONTRACT_HORIZONS = ["1 Month", "3 Months", "6 Months", "12 Months"] as const;

export function horizonMonths(horizon: string): number {
  const n = Number.parseInt(horizon, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export interface ProcurementScenario {
  cargo: CargoType;
  /** Cargo per voyage, tonnes. */
  quantity: number;
  voyages: number;
  originCountry: string;
  loadingPort: string;
  /** Indian discharge terminal. */
  dischargePort: string;
  contractHorizon: string;
  /** The analyst's stated preference. The engine may recommend differently. */
  contractStrategy: ContractStrategyKey;
  /** Stated vessel preference. The engine may recommend differently. */
  preferredVesselType: VesselClass;
  deliveryTarget: string;
}

export const DEFAULT_SCENARIO: ProcurementScenario = {
  cargo: "Coal",
  quantity: 70000,
  voyages: 4,
  originCountry: "Australia",
  loadingPort: "Hay Point",
  dischargePort: "Paradip",
  contractHorizon: "3 Months",
  contractStrategy: "short",
  preferredVesselType: "Panamax",
  deliveryTarget: "15 Dec 2026",
};

export function totalQuantity(scenario: ProcurementScenario): number {
  return scenario.quantity * scenario.voyages;
}

// ---------------------------------------------------------------------------
// ML forecast
// ---------------------------------------------------------------------------

export interface ModelDescriptor {
  modelName: string;
  library: string;
  modelStatus: "trained" | "trained-reference-data";
  /** Label the UI shows next to any metric. */
  dataLabel: string;
  /** Honest, specific statement about what the model was trained on. */
  trainingDataNote: string;
  datasetKind: "synthetic_reference";
  nEstimators: number;
  nFeatures: number;
  nTrainRows: number;
  nTestRows: number;
  splitStrategy: string;
  trainThroughDate: string;
  testFromDate: string;
  /** Validation metrics measured on the held-out tail of the reference data. */
  validation: {
    label: string;
    maeUsd: number;
    rmseUsd: number;
    mapePercent: number;
    r2: number;
  };
  limitation: string;
}

export interface ForecastPoint {
  week: number;
  date: string;
  /** Point prediction, USD/day. */
  rate: number;
  lower: number;
  upper: number;
  /** Cumulative change vs `currentRate`, percent. */
  changePercent: number;
}

export interface MajorFactor {
  feature: string;
  label: string;
  /** Global impurity-based importance from the trained forest. */
  importance: number;
  /** Scenario-local sensitivity: USD/day change per one probe step. */
  sensitivity: number;
  direction: "up" | "down" | "neutral";
  value: number;
}

export interface FreightForecast {
  /** Observed reference rate for this lane at the end of the history window. */
  currentRate: number;
  /** ML point prediction for the first forecast week. */
  predictedRate: number;
  /** ML point prediction 4 weeks ahead (30-day view used across the UI). */
  predictedRate30d: number;
  predictedRate90d: number;
  /** Percent change over 30 days (can be negative). */
  forecastChange30d: number;
  /** Percent change over the full 90-day window. */
  forecastChange90d: number;
  /** Percent change over the last observed week (persistence anchor). */
  weeklyChange: number;
  trend: "Increasing" | "Decreasing" | "Stable";
  trendStrength: number;
  /** Lowest predicted rate inside the horizon — the "buy" point. */
  bestRate: number;
  bestWeek: number;
  /** Week index (1-based) at which chartering is recommended. */
  recommendedCharterWeek: number;
  forecastHorizonWeeks: number;
  /** 1-100 confidence indicator derived from the model's reference residual. */
  confidence: number;
  confidenceLabel: string;
  /** Weekly path used by the forecast chart. */
  forecastRates: ForecastPoint[];
  /**
   * Real observed weeks from the reference history immediately before the
   * forecast origin, so charts can plot actuals against predictions instead of
   * relabelling the forecast as history.
   */
  recentHistory: { date: string; rate: number }[];
  /** ISO date of forecast week 1 - the origin every forward projection uses. */
  firstForwardDate: string;
  majorFactors: MajorFactor[];
  /** Which reference lane the model was actually run on. */
  laneResolution: LaneResolution;
  notes: string[];
}

export interface LaneResolution {
  exact: boolean;
  lane: string;
  loadingPort: string;
  dischargePort: string;
  vesselType: VesselClass;
  cargoType: CargoType;
  /** Adjacent reference lane used when the exact combination has no history. */
  basedOnLane?: string;
  adjustment: string;
}

// ---------------------------------------------------------------------------
// Charter timing
// ---------------------------------------------------------------------------

export interface CharterTiming {
  recommendation: "Charter now" | "Wait" | "Watch";
  waitDays: number;
  windowWeeks: [number, number];
  windowLabel: string;
  rationale: string[];
  /** Indicative cost of waiting vs chartering now, USD per voyage. */
  costOfWaitingPerVoyage: number;
  costOfWaitingProgram: number;
}

// ---------------------------------------------------------------------------
// Vessel
// ---------------------------------------------------------------------------

export interface VesselEvaluation {
  type: VesselClass;
  dwtLabel: string;
  payload: number;
  /** Deterministic 0-100 composite suitability score. */
  score: number;
  recommended: boolean;
  isStatedPreference: boolean;
  availability: "High" | "Medium" | "Low";
  availabilityIndex: number;
  costPerDay: number;
  portCompatibility: "Pass" | "Restricted" | "Fail";
  compatibilityScore: number;
  /** Quantity the vessel can lift on this voyage, tonnes. */
  utilisationTonnes: number;
  utilisationPercent: number;
  /** Reference implied freight rate for this class on this corridor, USD/day. */
  impliedDailyRate: number;
  costImplication: string;
  reasons: string[];
  blockers: string[];
  draftMargin: number;
  loaMargin: number;
  beamMargin: number;
}

export interface VesselRecommendation {
  primary: VesselEvaluation;
  alternative: VesselEvaluation | null;
  all: VesselEvaluation[];
}

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

export interface PortConstraintCheck {
  name: string;
  required: number;
  limit: number;
  unit: string;
  status: "Pass" | "Restricted" | "Fail";
  margin: number;
}

export interface PortCompatibility {
  name: string;
  state: string;
  lat: number;
  lon: number;
  congestion: number;
  congestionLabel: RiskLevel;
  congestionTrend: number;
  waitingTime: number;
  waitingTimeProjected: number;
  /**
   * Projected waiting time across the forward weeks, so the port screen plots
   * the same function it costs with instead of a hand-drawn shape.
   */
  waitingSeries: { week: number; date: string; waitingDays: number; congestion: number }[];
  maxDraft: number;
  maxLOA: number;
  maxBeam: number;
  cargoHandlingCapacity: number;
  berthsAvailable: number;
  totalBerths: number;
  suitableVessels: VesselClass[];
  status: "Compatible" | "Conditional" | "Incompatible";
  score: number;
  riskLevel: RiskLevel;
  checks: PortConstraintCheck[];
  constraints: string[];
  warnings: string[];
  /** Best alternative when this port is not usable. */
  alternative: { name: string; reason: string } | null;
  /** Projected berth utilisation for the planned arrival. */
  berthUtilisationPercent: number;
}

export interface PortAssessment {
  selected: PortCompatibility;
  all: PortCompatibility[];
  /** Port with the best feasibility score, whether or not it was requested. */
  bestAlternative: { name: string; score: number; reason: string };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface RouteOption {
  id: string;
  name: string;
  loadingPort: string;
  dischargePort: string;
  /** Great-circle distance, nautical miles. */
  distance: number;
  /** Estimated transit time including port rotation, days. */
  duration: number;
  speedKnots: number;
  fuelCost: number;
  portCharges: number;
  freightCost: number;
  waitingCost: number;
  deadheadingCost: number;
  totalCost: number;
  costPerTonne: number;
  riskScore: number;
  riskLevel: RiskLevel;
  congestionExposure: number;
  /** Coordinates used by the map, taken from the reference layer. */
  coordinates: { lat: number; lng: number }[];
  notes: string[];
  recommended: boolean;
  label: string;
}

export interface RouteAssessment {
  selected: RouteOption;
  all: RouteOption[];
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface CostLineItem {
  key: string;
  name: string;
  /** USD per voyage. */
  perVoyage: number;
  /** USD for the whole program. */
  program: number;
  sharePercent: number;
  note: string;
}

export interface CostResult {
  /** Reference freight rate used for the whole program, USD/day. */
  referenceRatePerDay: number;
  items: CostLineItem[];
  totalPerVoyage: number;
  totalProgram: number;
  costPerTonne: number;
  costPerVoyage: number;
  bunkerIndex: number;
  /** Cost if the rate moved to the worst point of the forecast band, USD/voyage. */
  adverseCasePerVoyage: number;
  favourableCasePerVoyage: number;
  trend: "Rising" | "Stable" | "Falling";
  trendNote: string;
}

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

export interface SavingsResult {
  baselineLabel: string;
  recommendedLabel: string;
  baselineTotal: number;
  recommendedTotal: number;
  savings: number;
  savingsPercent: number;
  savingsInr: number;
  /** Deterministic breakdown of where the saving comes from. */
  drivers: { name: string; amount: number }[];
  label: string;
  caveat: string;
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

export interface RiskComponent {
  key: string;
  label: string;
  /** 0-100 normalised component score. */
  score: number;
  weight: number;
  contribution: number;
  level: RiskLevel;
  driver: string;
  mitigation: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  components: RiskComponent[];
  keyDrivers: string[];
  mitigations: string[];
  label: string;
  caveat: string;
  /** Free-form advisories shown on the dashboard and risk screens. */
  advisories: Alert[];
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: RiskLevel;
  status: "New" | "Reviewed";
  action: string;
  location: string;
  daysAgo: number;
}

// ---------------------------------------------------------------------------
// Contract strategy
// ---------------------------------------------------------------------------

/** Working detail the strategy engine needs to write its rationale prose. */
export interface RationaleDetail {
  expectedRate: number;
  lockRate: number;
  openAvg: number;
  freightExposure: number;
  coveredFraction: number;
  coveredVoyages: number;
  voyages: number;
  programmeMonths: number;
  portName: string;
  congestion: number;
  certainty: number;
  timeCharterApplicable: boolean;
  horizon: string;
  savingsVsSpot: number;
  savingsPercent: number;
}

export interface StrategyComparison {
  key: ContractStrategyKey;
  code: string;
  name: string;
  totalCost: number;
  costPerTonne: number;
  costPerVoyage: number;
  savingsVsSpot: number;
  savingsPercent: number;
  /** Expected rate at which the structure locks vs the forecast, 0-100. */
  priceCertainty: number;
  priceCertaintyLabel: RiskLevel;
  flexibility: number;
  flexibilityLabel: RiskLevel;
  marketExposure: number;
  marketExposureLabel: RiskLevel;
  operationalRisk: number;
  operationalRiskLabel: RiskLevel;
  freightExposure: number;
  attractiveness: number;
  recommended: boolean;
  rationale: string;
  applicable: boolean;
  timeCharterApplicable: boolean;
  timeCharterNote: string;
}

// ---------------------------------------------------------------------------
// Final recommendation
// ---------------------------------------------------------------------------

export interface RecommendationBlock {
  title: string;
  summary: string;
  items: { label: string; value: string; detail?: string }[];
}

export interface FinalRecommendation {
  headline: string;
  summary: string;
  what: RecommendationBlock;
  why: RecommendationBlock;
  impact: RecommendationBlock;
  /** Ordered, traceable justification referencing the other engines. */
  evidence: { source: string; detail: string }[];
  watchOuts: string[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface ReportSection {
  id: string;
  title: string;
  /** Row groups rendered by the report preview. */
  rows: { label: string; value: string }[];
  table?: {
    columns: string[];
    rows: string[][];
  };
  note?: string;
}

export interface GeneratedReportSection {
  id: string;
  title: string;
  body: string[];
  metrics: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface DataDisclosure {
  datasetKind: string;
  trainedOn: string;
  notTrainedOn: string[];
  costNote: string;
  riskNote: string;
  savingsNote: string;
  recalibrationNote: string;
}

export interface AnalysisResult {
  /** Stable hash of the scenario — the report key. */
  scenarioId: string;
  scenario: ProcurementScenario;
  totalQuantity: number;
  generatedAt: string;
  /** Latest week present in the reference history. */
  referenceAsOf: string;
  model: ModelDescriptor;
  forecast: FreightForecast;
  charterTiming: CharterTiming;
  vessel: VesselRecommendation;
  port: PortAssessment;
  route: RouteAssessment;
  cost: CostResult;
  savings: SavingsResult;
  risk: RiskResult;
  strategies: StrategyComparison[];
  selectedStrategy: StrategyComparison;
  recommendation: FinalRecommendation;
  alerts: Alert[];
  disclosure: DataDisclosure;
  assumptions: string[];
  /** Wall-clock ms for the pipeline; surfaced in the API, not the UI. */
  computeMs?: number;
}