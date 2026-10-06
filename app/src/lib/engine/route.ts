/**
 * OceanIQ — route optimisation engine.
 *
 * The displayed corridor is always generated from the real geographic
 * coordinates held in the reference layer, so switching the discharge port
 * changes the map, the distance and every downstream number.
 *
 * Three deterministic corridor variants are screened (direct, southern
 * weather-divergent, northern alternative) and ranked on cost and risk.
 */

import { clamp, formatUSD, mapRange, riskLevelOf, round, round1 } from "./shared";
import {
  corridorDistanceNm,
  getLoadingPort,
  transitDays,
  type VesselClass,
} from "@/lib/reference/corridors";
import { getPort, type PortReference } from "@/lib/reference/ports";
import { getCargo } from "@/lib/reference/cargo";
import type {
  PortCompatibility,
  ProcurementScenario,
  RouteAssessment,
  RouteOption,
} from "@/lib/types";

interface Variant {
  id: string;
  name: string;
  label: string;
  /** Multiplier applied to the great-circle distance. */
  distanceFactor: number;
  /** Speed penalty (fraction of service speed lost). */
  speedFactor: number;
  /** Weather / routing risk weight, 0-100. */
  weatherRisk: number;
  /** Congestion exposure multiplier at the discharge port. */
  congestionFactor: number;
  notes: string[];
}

const VARIANTS: Variant[] = [
  {
    id: "direct",
    name: "Recommended Corridor",
    label: "Direct great-circle",
    distanceFactor: 1.0,
    speedFactor: 1.0,
    weatherRisk: 34,
    congestionFactor: 1.0,
    notes: [
      "Direct great-circle routing keeps bunker burn and schedule slippage at their minimum.",
      "Standard routing; the baseline every alternative is measured against.",
    ],
  },
  {
    id: "southern",
    name: "Southern Weather-Divergent",
    label: "Southern lane",
    distanceFactor: 1.068,
    speedFactor: 0.965,
    weatherRisk: 18,
    congestionFactor: 0.88,
    notes: [
      "Tracks further south to stay clear of the seasonal cyclone belt.",
      "Longer passage, but materially lower weather and congestion exposure.",
    ],
  },
  {
    id: "northern",
    name: "Northern Alternative",
    label: "Northern lane",
    distanceFactor: 1.112,
    speedFactor: 0.945,
    weatherRisk: 58,
    congestionFactor: 1.14,
    notes: [
      "Longest passage with the highest weather exposure and bunker burn.",
      "Only justified if the southern lanes are closed or heavily congested.",
    ],
  },
];

export interface RouteEvaluationInput {
  scenario: ProcurementScenario;
  vessel: VesselClass;
  port: PortCompatibility;
  /** Reference freight rate for the chosen class, USD/day. */
  ratePerDay: number;
  congestion: number;
}

export function optimizeRoutes(input: RouteEvaluationInput): RouteAssessment {
  const { scenario, port, ratePerDay, congestion } = input;
  const loading = getLoadingPort(scenario.loadingPort);
  const portRef: PortReference = getPort(scenario.dischargePort);
  const cargoRef = getCargo(scenario.cargo);

  const baseDistance = loading
    ? corridorDistanceNm(
        scenario.loadingPort,
        scenario.dischargePort,
        loading.lat,
        loading.lon,
        portRef.lat,
        portRef.lon,
      )
    : 6400;

  const options: RouteOption[] = VARIANTS.map((variant) => {
    const distance = Math.round(baseDistance * variant.distanceFactor);
    const speed = 13.6 * variant.speedFactor;
    const transit = transitDays(distance, speed);
    const cargoDays = scenario.quantity / Math.max(1, port.cargoHandlingCapacity * cargoRef.handlingFactor);
    const duration = round1(transit + cargoDays + 1.6);

    const freightCost = round(ratePerDay * duration);
    const fuelCost = round(ratePerDay * duration * 0.145 * variant.distanceFactor);
    const portCharges = round(96_000 * cargoRef.handlingFactor * (0.55 + baseDistance / 12_000));
    const waitingCost = round(port.waitingTimeProjected * ratePerDay * 0.55 * variant.congestionFactor);
    const deadheadingCost = round(
      ratePerDay * Math.min(3.4, 1.2 + baseDistance / 9_000) * 0.42 * variant.distanceFactor,
    );
    const totalCost = round(freightCost + fuelCost + portCharges + waitingCost + deadheadingCost);

    const distanceRisk = mapRange(distance, 4000, 11_500, 8, 46);
    const riskScore = Math.round(
      clamp(
        variant.weatherRisk * 0.42 +
          distanceRisk * 0.3 +
          congestion * variant.congestionFactor * 0.24 +
          scenario.voyages * 0.8,
        0,
        100,
      ),
    );

    const notes = [...variant.notes];
    if (variant.congestionFactor > 1) {
      notes.push(
        `Congestion exposure at ${scenario.dischargePort} rises to roughly ${Math.round(congestion * variant.congestionFactor)}% on this lane.`,
      );
    } else if (variant.congestionFactor < 1) {
      notes.push(
        `Congestion exposure eases to roughly ${Math.round(congestion * variant.congestionFactor)}% by approaching from the south.`,
      );
    }
    notes.push(
      `Projected schedule reliability ${Math.round(100 - variant.weatherRisk * 0.55)}% over the ${round1(transit)}-day passage.`,
    );

    const coordinates: { lat: number; lng: number }[] = [];
    if (loading) {
      coordinates.push({ lat: loading.lat, lng: loading.lon });
      // A single deterministic waypoint nudges the corridor off the pure
      // great-circle so the alternatives are visually distinguishable while
      // still being anchored on real coordinates.
      if (variant.distanceFactor !== 1.0) {
        const swing = (variant.distanceFactor - 1) * 46;
        coordinates.push({
          lat: round1((loading.lat + portRef.lat) / 2 + (portRef.lat >= loading.lat ? swing : -swing)),
          lng: round1((loading.lon + portRef.lon) / 2 + (portRef.lon >= loading.lon ? -swing : swing)),
        });
      }
      coordinates.push({ lat: portRef.lat, lng: portRef.lon });
    }

    return {
      id: variant.id,
      name: variant.name,
      label: variant.label,
      loadingPort: scenario.loadingPort,
      dischargePort: scenario.dischargePort,
      distance,
      duration,
      speedKnots: round1(speed),
      fuelCost,
      portCharges,
      freightCost,
      waitingCost,
      deadheadingCost,
      totalCost,
      costPerTonne: round1(totalCost / Math.max(1, scenario.quantity)),
      riskScore,
      riskLevel: riskLevelOf(riskScore),
      congestionExposure: Math.round(congestion * variant.congestionFactor),
      coordinates,
      notes,
      recommended: false,
    };
  });

  // Pick the lowest expected-cost option whose risk stays inside the programme
  // tolerance; fall back to the cheapest if none qualify.
  const tolerance = scenario.voyages >= 5 ? 74 : 66;
  const acceptable = options.filter((o) => o.riskScore <= tolerance);
  const pool = acceptable.length > 0 ? acceptable : options;
  const selected = [...pool].sort((a, b) => a.totalCost - b.totalCost || a.riskScore - b.riskScore)[0];
  selected.recommended = true;

  // Annotate the selected route with a scheduling note derived from the numbers.
  selected.notes.unshift(
    `Selected: lowest all-in cost among corridors holding risk at or below ${tolerance}/100, at ${formatUSD(selected.totalCost)} per voyage.`,
  );

  return { selected, all: options };
}