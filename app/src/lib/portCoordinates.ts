export interface PortCoord {
  lat: number;
  lng: number;
}

/** Real geographic coordinates ([lat, lng]) for every port the Procurement
 *  Analysis can produce. Loading ports come from the origin countries, the
 *  destination ports are the Indian discharge terminals. */
export const PORT_COORDS: Record<string, PortCoord> = {
  // ---- Australia (loading) ----
  "Hay Point": { lat: -21.2772, lng: 149.2961 },
  Newcastle: { lat: -32.9267, lng: 151.7867 },
  Gladstone: { lat: -23.843, lng: 151.252 },
  Dampier: { lat: -20.6564, lng: 116.7122 },

  // ---- South Africa (loading) ----
  "Richards Bay": { lat: -28.8, lng: 32.05 },
  Saldanha: { lat: -33.01, lng: 17.957 },

  // ---- Indonesia (loading) ----
  "Tanjung Bara": { lat: 0.5896, lng: 117.442 },
  Tarahan: { lat: -5.5129, lng: 105.4099 },

  // ---- Brazil (loading) ----
  Tubarao: { lat: -20.283, lng: -40.2567 },
  "Tubar\u00E3o": { lat: -20.283, lng: -40.2567 },
  Itaqui: { lat: -2.573, lng: -44.3606 },

  // ---- USA (loading) ----
  Marseilles: { lat: 41.3285, lng: -88.7046 },
  "Corpus Christi": { lat: 27.8073, lng: -97.3932 },

  // ---- Russia (loading) ----
  Nakhodka: { lat: 42.8206, lng: 132.883 },
  Murmansk: { lat: 68.9711, lng: 33.0922 },

  // ---- India (destination) ----
  Paradip: { lat: 20.2643, lng: 86.6696 },
  Visakhapatnam: { lat: 17.6954, lng: 83.2953 },
  Gangavaram: { lat: 17.6289, lng: 83.315 },
  Gopalpur: { lat: 19.2627, lng: 84.916 },
  Dhamra: { lat: 20.754, lng: 86.9881 },
  Haldia: { lat: 22.019, lng: 88.137 },
};

export const DEFAULT_ORIGIN = "Hay Point";
export const DEFAULT_DESTINATION = "Paradip";

export function resolvePort(name: string | undefined | null): PortCoord {
  if (name && PORT_COORDS[name]) return PORT_COORDS[name];
  return PORT_COORDS[DEFAULT_DESTINATION];
}