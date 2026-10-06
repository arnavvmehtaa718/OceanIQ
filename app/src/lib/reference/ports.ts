/**
 * OceanIQ — reference discharge-port data (East / East-South coast India).
 *
 * HONESTY NOTE
 * ------------
 * These are PROTOTYPE REFERENCE ASSUMPTIONS built from publicly documented,
 * order-of-magnitude dry-bulk terminal characteristics. They are NOT SAIL
 * berth limits, NOT port-authority certified figures and NOT live berth-occupancy
 * data. Congestion and waiting-time baselines are representative planning
 * assumptions. Production use requires replacing them with the relevant port
 * authority's published limits and a real congestion feed.
 *
 * Mirrors `ml/reference/reference_config.py`.
 */

export type RiskLevel = "Low" | "Medium" | "High";

export interface PortReference {
  name: string;
  country: string;
  state: string;
  lat: number;
  lon: number;
  /** Navigable draft limit at the berth (m) — reference assumption. */
  maxDraft: number;
  /** Maximum length overall that can be berthed (m) — reference assumption. */
  maxLOA: number;
  /** Maximum beam that can be berthed (m) — reference assumption. */
  maxBeam: number;
  /** Nominal cargo handling rate (tonnes/day) — reference assumption. */
  cargoHandlingCapacity: number;
  totalBerths: number;
  berthsAvailable: number;
  suitableVessels: string[];
  /** Baseline berth-occupancy congestion (0-100). */
  congestionBase: number;
  /** Baseline anchorage waiting time (days). */
  waitingBase: number;
  /** Swing of the seasonal congestion cycle (percentage points). */
  congestionAmp: number;
  /** Representative daily port handling cost per voyage at 70 kt (USD). */
  handlingCostUsd: number;
  /** Congestion sensitivity: extra USD/day of waiting per congestion point. */
  waitingCostUsdPerDay: number;
}

export const PORTS: PortReference[] = [
  {
    name: "Paradip",
    country: "India",
    state: "Odisha",
    lat: 20.2643,
    lon: 86.6696,
    maxDraft: 14.5,
    maxLOA: 290,
    maxBeam: 45,
    cargoHandlingCapacity: 85000,
    totalBerths: 9,
    berthsAvailable: 6,
    suitableVessels: ["Supramax", "Panamax", "Handysize"],
    congestionBase: 55,
    waitingBase: 3.5,
    congestionAmp: 16,
    handlingCostUsd: 96000,
    waitingCostUsdPerDay: 17500,
  },
  {
    name: "Visakhapatnam",
    country: "India",
    state: "Andhra Pradesh",
    lat: 17.6954,
    lon: 83.2953,
    maxDraft: 15.5,
    maxLOA: 300,
    maxBeam: 48,
    cargoHandlingCapacity: 90000,
    totalBerths: 12,
    berthsAvailable: 8,
    suitableVessels: ["Panamax", "Capesize", "Supramax"],
    congestionBase: 30,
    waitingBase: 1.8,
    congestionAmp: 20,
    handlingCostUsd: 102000,
    waitingCostUsdPerDay: 15800,
  },
  {
    name: "Gangavaram",
    country: "India",
    state: "Andhra Pradesh",
    lat: 17.6289,
    lon: 83.315,
    maxDraft: 16.5,
    maxLOA: 310,
    maxBeam: 50,
    cargoHandlingCapacity: 95000,
    totalBerths: 7,
    berthsAvailable: 5,
    suitableVessels: ["Panamax", "Capesize"],
    congestionBase: 25,
    waitingBase: 1.2,
    congestionAmp: 22,
    handlingCostUsd: 108000,
    waitingCostUsdPerDay: 15200,
  },
  {
    name: "Gopalpur",
    country: "India",
    state: "Odisha",
    lat: 19.2627,
    lon: 84.916,
    maxDraft: 12.5,
    maxLOA: 200,
    maxBeam: 32,
    cargoHandlingCapacity: 60000,
    totalBerths: 4,
    berthsAvailable: 2,
    suitableVessels: ["Handysize", "Supramax"],
    congestionBase: 78,
    waitingBase: 5.2,
    congestionAmp: 12,
    handlingCostUsd: 71000,
    waitingCostUsdPerDay: 19500,
  },
  {
    name: "Dhamra",
    country: "India",
    state: "Odisha",
    lat: 20.754,
    lon: 86.9881,
    maxDraft: 14.0,
    maxLOA: 260,
    maxBeam: 42,
    cargoHandlingCapacity: 75000,
    totalBerths: 5,
    berthsAvailable: 3,
    suitableVessels: ["Panamax", "Supramax"],
    congestionBase: 60,
    waitingBase: 2.8,
    congestionAmp: 18,
    handlingCostUsd: 88000,
    waitingCostUsdPerDay: 18200,
  },
  {
    name: "Haldia",
    country: "India",
    state: "West Bengal",
    lat: 22.019,
    lon: 88.137,
    maxDraft: 11.0,
    maxLOA: 180,
    maxBeam: 28,
    cargoHandlingCapacity: 55000,
    totalBerths: 6,
    berthsAvailable: 2,
    suitableVessels: ["Handysize"],
    congestionBase: 82,
    waitingBase: 6.1,
    congestionAmp: 10,
    handlingCostUsd: 66000,
    waitingCostUsdPerDay: 21000,
  },
];

export const PORT_NAMES = PORTS.map((p) => p.name);

export function getPort(name: string): PortReference {
  return PORTS.find((p) => p.name === name) ?? PORTS[0];
}

export function congestionLabel(level: number): RiskLevel {
  if (level >= 65) return "High";
  if (level >= 45) return "Medium";
  return "Low";
}

/**
 * Expected waiting time at a port, projected forward over the forecast horizon.
 * Deterministic: seasonal swing around the baseline, easing as the horizon
 * extends (queue unwind assumption), plus a congestion-persistence term.
 */
export function projectWaitingTime(port: PortReference, horizonWeeks: number): number {
  const seasonal = port.congestionAmp * 0.055 * Math.sin((horizonWeeks / 52) * Math.PI * 2);
  const unwind = 1 - Math.min(0.35, horizonWeeks * 0.012);
  return Math.max(0.2, (port.waitingBase + seasonal) * unwind);
}