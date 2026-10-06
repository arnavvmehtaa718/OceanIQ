/**
 * Maritime routing utilities using searoute-ts
 */

import { seaRoute } from "searoute-ts";
import type { GeoPoint } from "@/lib/reference/corridors";

export interface MaritimeRouteResult {
  coordinates: { lat: number; lng: number }[]; // [lat, lng] for consistency
  distanceNm: number;
  durationHours: number;
}

function geoPointToLngLat(p: GeoPoint): [number, number] {
  return [p.lng, p.lat];
}

function lngLatToGeoPoint(coord: [number, number]): { lat: number; lng: number } {
  return { lat: coord[1], lng: coord[0] };
}

export async function getMaritimeRoute(
  origin: GeoPoint,
  destination: GeoPoint,
  speedKnots?: number
): Promise<MaritimeRouteResult> {
  try {
    const result = await seaRoute(
      geoPointToLngLat(origin),
      geoPointToLngLat(destination),
      {
        speedKnots: speedKnots ?? 13.6,
        units: "nauticalmiles",
      }
    );

    const coords = result.geometry.coordinates.map((c: any) => {
      const arr = c as number[];
      return lngLatToGeoPoint([arr[0], arr[1]] as [number, number]);
    });

    return {
      coordinates: coords,
      distanceNm: result.properties.length as number,
      durationHours: (result.properties.durationHours as number) ?? 0,
    };
  } catch (error) {
    console.error("Maritime routing failed:", error);
    // Fallback: return simple line if routing fails
    return {
      coordinates: [origin, destination],
      distanceNm: 0,
      durationHours: 0,
    };
  }
}
