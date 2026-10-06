/**
 * OceanIQ — reference loading ports, corridors and vessel classes.
 *
 * HONESTY NOTE
 * ------------
 * Loading-port coordinates are real. Corridor distances are representative
 * reference figures (nautical miles) calibrated against publicly documented
 * dry-bulk lane distances; when a corridor is not listed, a great-circle
 * distance is computed from the coordinates. Vessel characteristics are
 * representative industry ranges, NOT a specific fleet.
 *
 * Mirrors `ml/reference/reference_config.py`.
 */

export type VesselClass = "Handysize" | "Supramax" | "Panamax" | "Capesize";

export const VESSEL_ORDER: VesselClass[] = [
  "Handysize",
  "Supramax",
  "Panamax",
  "Capesize",
];

export interface LoadingPort {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const LOADING_PORTS: LoadingPort[] = [
  { name: "Hay Point", country: "Australia", lat: -21.2772, lon: 149.2961 },
  { name: "Newcastle", country: "Australia", lat: -32.9267, lon: 151.7867 },
  { name: "Gladstone", country: "Australia", lat: -23.843, lon: 151.252 },
  { name: "Dampier", country: "Australia", lat: -20.6564, lon: 116.7122 },
  { name: "Richards Bay", country: "South Africa", lat: -28.8, lon: 32.05 },
  { name: "Saldanha", country: "South Africa", lat: -33.01, lon: 17.957 },
  { name: "Tanjung Bara", country: "Indonesia", lat: 0.5896, lon: 117.442 },
  { name: "Tarahan", country: "Indonesia", lat: -5.5129, lon: 105.4099 },
  { name: "Tubarao", country: "Brazil", lat: -20.283, lon: -40.2567 },
  { name: "Itaqui", country: "Brazil", lat: -2.573, lon: -44.3606 },
  { name: "Corpus Christi", country: "USA", lat: 27.8073, lon: -97.3932 },
  { name: "Nakhodka", country: "Russia", lat: 42.8206, lon: 132.883 },
  { name: "Murmansk", country: "Russia", lat: 68.9711, lon: 33.0922 },
];

export const LOADING_PORTS_BY_COUNTRY: Record<string, string[]> = {
  Australia: ["Hay Point", "Newcastle", "Gladstone", "Dampier"],
  "South Africa": ["Richards Bay", "Saldanha"],
  Indonesia: ["Tanjung Bara", "Tarahan"],
  Brazil: ["Tubarao", "Itaqui"],
  USA: ["Corpus Christi"],
  Russia: ["Nakhodka", "Murmansk"],
};

export const ORIGIN_COUNTRIES = Object.keys(LOADING_PORTS_BY_COUNTRY);

export function getLoadingPort(name: string): LoadingPort | undefined {
  return LOADING_PORTS.find((p) => p.name === name);
}

export function loadingPortCountry(name: string): string {
  return getLoadingPort(name)?.country ?? "Australia";
}

// ---------------------------------------------------------------------------
// Great-circle geometry
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number;
  lng: number;
}

export const EARTH_RADIUS_NM = 3440.065;

const toRad = (d: number) => (d * Math.PI) / 180;

export function greatCircleNm(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lng) - toRad(a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const HOURS_PER_DAY = 24;

/**
 * Days required to cover `distanceNm` at `speedKnots`.
 *
 * A knot is a nautical mile *per hour*, so a 6,400 nm passage at 13.6 knots is
 * about 19.7 days — not 470.
 */
export function transitDays(distanceNm: number, speedKnots: number): number {
  if (speedKnots <= 0) return 0;
  return distanceNm / (speedKnots * HOURS_PER_DAY);
}

/** Great-circle interpolation, used by the route visualisation. */
export function gcInterpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const phi1 = toRad(a.lat);
  const lambda1 = toRad(a.lng);
  const phi2 = toRad(b.lat);
  const lambda2 = toRad(b.lng);
  const sinP1 = Math.sin(phi1);
  const cosP1 = Math.cos(phi1);
  const sinP2 = Math.sin(phi2);
  const cosP2 = Math.cos(phi2);
  const cosDelta = sinP1 * sinP2 + cosP1 * cosP2 * Math.cos(lambda2 - lambda1);
  const delta = Math.acos(Math.min(1, Math.max(-1, cosDelta)));
  if (delta < 1e-9) return a;
  const sinDelta = Math.sin(delta);
  const A = Math.sin((1 - t) * delta) / sinDelta;
  const B = Math.sin(t * delta) / sinDelta;
  const x = A * cosP1 * Math.cos(lambda1) + B * cosP2 * Math.cos(lambda2);
  const y = A * cosP1 * Math.sin(lambda1) + B * cosP2 * Math.sin(lambda2);
  const z = A * sinP1 + B * sinP2;
  return {
    lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

// ---------------------------------------------------------------------------
// Reference corridor distances (nautical miles)
// ---------------------------------------------------------------------------

export const CORRIDOR_DISTANCES: Record<string, number> = {
  "Hay Point|Paradip": 6420,
  "Hay Point|Visakhapatnam": 6280,
  "Hay Point|Gangavaram": 6255,
  "Hay Point|Haldia": 6710,
  "Newcastle|Paradip": 6580,
  "Newcastle|Gangavaram": 6415,
  "Gladstone|Paradip": 6700,
  "Dampier|Gopalpur": 5180,
  "Richards Bay|Paradip": 5200,
  "Richards Bay|Visakhapatnam": 5060,
  "Richards Bay|Haldia": 5490,
  "Saldanha|Haldia": 5600,
  "Tanjung Bara|Paradip": 3800,
  "Tanjung Bara|Haldia": 4110,
  "Tarahan|Gopalpur": 4200,
  "Tubarao|Paradip": 8900,
  "Tubarao|Visakhapatnam": 8740,
  "Itaqui|Haldia": 9200,
  "Nakhodka|Paradip": 7800,
  "Nakhodka|Haldia": 8090,
  "Murmansk|Visakhapatnam": 9800,
  "Corpus Christi|Haldia": 11200,
  "Corpus Christi|Paradip": 10950,
};

export const CORRIDOR_CODES: Record<string, number> = {
  "Hay Point|Paradip": 0,
  "Hay Point|Visakhapatnam": 1,
  "Hay Point|Gangavaram": 2,
  "Hay Point|Haldia": 3,
  "Newcastle|Paradip": 4,
  "Newcastle|Gangavaram": 5,
  "Gladstone|Paradip": 6,
  "Dampier|Gopalpur": 7,
  "Richards Bay|Paradip": 8,
  "Richards Bay|Visakhapatnam": 9,
  "Richards Bay|Haldia": 10,
  "Saldanha|Haldia": 11,
  "Tanjung Bara|Paradip": 12,
  "Tanjung Bara|Haldia": 13,
  "Tarahan|Gopalpur": 14,
  "Tubarao|Paradip": 15,
  "Tubarao|Visakhapatnam": 16,
  "Itaqui|Haldia": 17,
  "Nakhodka|Paradip": 18,
  "Nakhodka|Haldia": 19,
  "Murmansk|Visakhapatnam": 20,
  "Corpus Christi|Haldia": 21,
  "Corpus Christi|Paradip": 22,
};

export function corridorKey(loadingPort: string, dischargePort: string): string {
  return `${loadingPort}|${dischargePort}`;
}

export function corridorDistanceNm(
  loadingPort: string,
  dischargePort: string,
  loadingLat: number,
  loadingLng: number,
  dischargeLat: number,
  dischargeLng: number,
): number {
  const known = CORRIDOR_DISTANCES[corridorKey(loadingPort, dischargePort)];
  if (known !== undefined) return known;
  return Math.round(
    greatCircleNm(
      { lat: loadingLat, lng: loadingLng },
      { lat: dischargeLat, lng: dischargeLng },
    ),
  );
}

export function corridorCode(loadingPort: string, dischargePort: string): number {
  const known = CORRIDOR_CODES[corridorKey(loadingPort, dischargePort)];
  return known === undefined ? 99 : known;
}

// ---------------------------------------------------------------------------
// Vessel classes
// ---------------------------------------------------------------------------

export interface VesselReference {
  type: VesselClass;
  loa: number;
  beam: number;
  draft: number;
  dwt: number;
  /** Cargo the vessel can realistically carry on one voyage (tonnes). */
  payload: number;
  /** Reference daily charter rate (USD/day) — prototype assumption. */
  dailyRate: number;
  /** Relative fuel consumption per tonne-mile. */
  fuelIndex: number;
  /** Typical laden service speed (knots). */
  serviceSpeed: number;
  /** Representative tonnage oversize/under-size tolerance. */
  utilizationTolerance: number;
}

export const VESSEL_REFERENCE: Record<VesselClass, VesselReference> = {
  Handysize: {
    type: "Handysize",
    loa: 180,
    beam: 28,
    draft: 10.5,
    dwt: 39000,
    payload: 32000,
    dailyRate: 11200,
    fuelIndex: 0.72,
    serviceSpeed: 13.0,
    utilizationTolerance: 0.12,
  },
  Supramax: {
    type: "Supramax",
    loa: 199,
    beam: 32.3,
    draft: 12.8,
    dwt: 66000,
    payload: 58000,
    dailyRate: 15000,
    fuelIndex: 1.0,
    serviceSpeed: 13.4,
    utilizationTolerance: 0.12,
  },
  Panamax: {
    type: "Panamax",
    loa: 225,
    beam: 32.3,
    draft: 13.5,
    dwt: 78000,
    payload: 70000,
    dailyRate: 17200,
    fuelIndex: 1.14,
    serviceSpeed: 13.6,
    utilizationTolerance: 0.14,
  },
  Capesize: {
    type: "Capesize",
    loa: 292,
    beam: 45,
    draft: 18.9,
    dwt: 180000,
    payload: 150000,
    dailyRate: 23800,
    fuelIndex: 2.05,
    serviceSpeed: 14.2,
    utilizationTolerance: 0.18,
  },
};

/** How freely each class can be found on the market (0-100 tightness). */
export const VESSEL_AVAILABILITY: Record<VesselClass, "High" | "Medium" | "Low"> = {
  Handysize: "High",
  Supramax: "High",
  Panamax: "Medium",
  Capesize: "Low",
};

/** Normalised market tightness used by the risk + vessel engines (0-100). */
export const VESSEL_AVAILABILITY_INDEX: Record<VesselClass, number> = {
  Handysize: 26,
  Supramax: 38,
  Panamax: 55,
  Capesize: 78,
};

/** Human-readable deadweight label, e.g. "78K DWT". */
export function dwtLabel(type: VesselClass): string {
  return `${Math.round(VESSEL_REFERENCE[type].dwt / 1000)}K DWT`;
}