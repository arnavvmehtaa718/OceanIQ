/**
 * OceanIQ — cargo reference data.
 *
 * Mirrors `CARGO_TYPES` in `ml/reference/reference_config.py`.
 *
 * `stowageFactor` mirrors the model's cargo encoding; `handlingFactor` is a
 * separate operations assumption used by the cost engine (throughput, dust
 * suppression, breakage etc.). Both are prototype reference assumptions.
 */

export const CARGO_TYPES = [
  "Coal",
  "Thermal Coal",
  "Coking Coal",
  "Iron Ore",
  "Limestone",
  "Steel Products",
] as const;

export type CargoType = (typeof CARGO_TYPES)[number];

export interface CargoReference {
  name: CargoType;
  /** Longer display label used in report prose. */
  label: string;
  /** Dense-to-dense stowage multiplier (model feature). */
  stowageFactor: number;
  /** Relative discharge/loading handling cost multiplier. */
  handlingFactor: number;
  /** Demand seasonality amplitude multiplier. */
  demandAmplitude: number;
  /**
   * Declared hazardous-substance classification level 0-3, used by the risk
   * engine. Prototype reference assumption, not a real IMDG determination.
   */
  hazardClass: number;
  /** Notes surfaced in the UI so the assumption is never mistaken for fact. */
  note: string;
}

export const CARGO_REFERENCE: Record<CargoType, CargoReference> = {
  Coal: {
    name: "Coal",
    label: "Coal",
    stowageFactor: 1.0,
    handlingFactor: 1.0,
    demandAmplitude: 1.0,
    hazardClass: 0,
    note: "Reference dry-bulk coal assumption.",
  },
  "Thermal Coal": {
    name: "Thermal Coal",
    label: "thermal coal",
    stowageFactor: 0.95,
    handlingFactor: 1.02,
    demandAmplitude: 1.1,
    hazardClass: 0,
    note: "Power-station coal; higher seasonality in the reference model.",
  },
  "Coking Coal": {
    name: "Coking Coal",
    label: "coking coal",
    stowageFactor: 1.05,
    handlingFactor: 1.06,
    demandAmplitude: 0.78,
    hazardClass: 0,
    note: "Metallurgical coal; tighter cargo specification requirements.",
  },
  "Iron Ore": {
    name: "Iron Ore",
    label: "iron ore",
    stowageFactor: 1.12,
    handlingFactor: 1.08,
    demandAmplitude: 0.92,
    hazardClass: 0,
    note: "Heavy ore cargo; favours larger parcel sizes.",
  },
  Limestone: {
    name: "Limestone",
    label: "limestone",
    stowageFactor: 0.88,
    handlingFactor: 0.94,
    demandAmplitude: 0.66,
    hazardClass: 0,
    note: "Lower-value bulk; most price-sensitive segment.",
  },
  "Steel Products": {
    name: "Steel Products",
    label: "steel products",
    stowageFactor: 1.18,
    handlingFactor: 1.22,
    demandAmplitude: 0.72,
    hazardClass: 1,
    note: "Finished steel; higher handling and stowage-loss allowance.",
  },
};

export function getCargo(name: string): CargoReference {
  return CARGO_REFERENCE[(name as CargoType) in CARGO_REFERENCE ? (name as CargoType) : "Coal"];
}