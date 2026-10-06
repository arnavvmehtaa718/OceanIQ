"use client";

/**
 * OceanIQ — Route Optimization map.
 *
 * A real geographic Leaflet map: OpenStreetMap basemap tiles, pan/zoom,
 * fit-to-route, live origin/destination markers, the great-circle corridor the
 * route engine produced (densified with the same `gcInterpolate` the engine
 * uses) and a simulated vessel running the passage on a requestAnimationFrame
 * loop.
 *
 * Every geographic input comes from the central `AnalysisResult`: corridor
 * `coordinates`, distance, transit time and risk are read straight off
 * `RouteOption`, so changing the procurement scenario and re-running the
 * analysis redraws the whole map. No coordinates are invented here.
 */

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers, Loader2, Ship, TriangleAlert } from "lucide-react";
import type * as Leaflet from "leaflet";
import { gcInterpolate, greatCircleNm } from "@/lib/reference/corridors";
import type { VesselClass } from "@/lib/reference/corridors";
import type { RouteOption } from "@/lib/types";
import { formatNumber, formatUSD } from "@/lib/format";

type LatLng = [number, number];

interface RouteGeometry {
  /** Drawable pieces, split wherever the corridor would cross the antimeridian. */
  segments: LatLng[][];
  /** Unbroken coordinate list, used for distances and the vessel animation. */
  continuous: LatLng[];
  /** Cumulative nautical miles from the origin, parallel to `continuous`. */
  cumulativeNm: number[];
  totalNm: number;
}

const OSM_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIB = `${OSM_ATTRIB} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

interface BasemapDef {
  key: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

/** Every option below is OpenStreetMap-derived, so the basemap is real geography. */
const BASEMAPS: BasemapDef[] = [
  {
    key: "standard",
    label: "OSM",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIB,
    maxZoom: 19,
  },
];

const RISK_COLOR: Record<string, string> = {
  Low: "#10b981",
  Medium: "#f59e0b",
  High: "#ef4444",
};

const DENSIFY_STEPS = 48;
const VOYAGE_MS = 16000;
const FIT_MAX_ZOOM = 7;
const FIT_PADDING: [number, number] = [72, 72];

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function densifyLeg(a: LatLng, b: LatLng): LatLng[] {
  let delta = b[1] - a[1];
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  const from = { lat: a[0], lng: a[1] };
  const to = { lat: b[0], lng: a[1] + delta };
  const out: LatLng[] = [];
  for (let i = 0; i <= DENSIFY_STEPS; i += 1) {
    const p = gcInterpolate(from, to, i / DENSIFY_STEPS);
    out.push([p.lat, p.lng]);
  }
  return out;
}

function buildGeometry(coordinates: { lat: number; lng: number }[]): RouteGeometry {
  const continuous: LatLng[] = [];
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const leg = densifyLeg(
      [coordinates[i].lat, coordinates[i].lng],
      [coordinates[i + 1].lat, coordinates[i + 1].lng],
    );
    for (let j = i === 0 ? 0 : 1; j < leg.length; j += 1) continuous.push(leg[j]);
  }
  if (continuous.length === 0 && coordinates.length > 0) {
    continuous.push([coordinates[0].lat, coordinates[0].lng]);
  }

  const segments: LatLng[][] = [];
  let current: LatLng[] = [];
  for (const [lat, lng] of continuous) {
    const normalised = wrapLng(lng);
    const previous = current[current.length - 1];
    if (previous && Math.abs(normalised - previous[1]) > 180) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push([lat, normalised]);
  }
  if (current.length > 1) segments.push(current);

  const cumulativeNm: number[] = [0];
  let totalNm = 0;
  for (let i = 1; i < continuous.length; i += 1) {
    totalNm += greatCircleNm(
      { lat: continuous[i - 1][0], lng: continuous[i - 1][1] },
      { lat: continuous[i][0], lng: continuous[i][1] },
    );
    cumulativeNm.push(totalNm);
  }

  return { segments, continuous, cumulativeNm, totalNm };
}

function pointAtNm(
  geometry: RouteGeometry,
  distanceNm: number,
): { lat: number; lng: number; course: number } {
  const { continuous, cumulativeNm, totalNm } = geometry;
  if (continuous.length < 2) {
    const only = continuous[0] ?? ([0, 0] as LatLng);
    return { lat: only[0], lng: wrapLng(only[1]), course: 0 };
  }
  const d = Math.min(Math.max(distanceNm, 0), totalNm);
  let i = 1;
  while (i < cumulativeNm.length - 1 && cumulativeNm[i] < d) i += 1;
  const span = cumulativeNm[i] - cumulativeNm[i - 1];
  const t = span > 0 ? (d - cumulativeNm[i - 1]) / span : 0;
  const a = continuous[i - 1];
  const b = continuous[i];
  return {
    lat: a[0] + (b[0] - a[0]) * t,
    lng: wrapLng(a[1] + (b[1] - a[1]) * t),
    course: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
}

function portIcon(L: typeof Leaflet, kind: "origin" | "discharge"): Leaflet.DivIcon {
  const ring = kind === "origin" ? "#3b82f6" : "#f59e0b";
  return L.divIcon({
    className: "ociq-map-icon",
    html: `<span class="ociq-pin" style="--ociq-pin:${ring}"><span class="ociq-pin__pulse"></span><span class="ociq-pin__core"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function vesselIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "ociq-map-icon",
    html:
      '<span class="ociq-vessel"><span class="ociq-vessel__ring"></span>' +
      '<svg class="ociq-vessel__arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2 19.2 20.6 12 16.7 4.8 20.6Z"/></svg></span>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function waypointIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "ociq-map-icon",
    html: '<span class="ociq-waypoint"></span>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export interface RouteVisualizationProps {
  /** The awarded corridor straight off `AnalysisResult.route.selected`. */
  selected: RouteOption;
  /** The screened alternatives, drawn as muted context corridors. */
  alternatives: RouteOption[];
  vesselType: VesselClass;
}

export default function RouteVisualization({
  selected,
  alternatives,
  vesselType,
}: RouteVisualizationProps) {
  const [basemap, setBasemap] = useState(BASEMAPS[0].key);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tilesRef = useRef<Record<string, Leaflet.TileLayer>>({});
  const overlaysRef = useRef<Leaflet.LayerGroup | null>(null);
  const vesselArrowRef = useRef<SVGElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);

  const geometry = useMemo(() => buildGeometry(selected.coordinates), [selected.coordinates]);
  const screened = useMemo(
    () =>
      alternatives
        .filter((r) => !r.recommended && r.coordinates.length > 1)
        .map((r) => ({ route: r, geometry: buildGeometry(r.coordinates) })),
    [alternatives],
  );

  const riskColor = RISK_COLOR[selected.riskLevel] ?? RISK_COLOR.Medium;
  const totalDays = Math.max(1, Math.round(selected.duration));

  const fitRoute = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || geometry.continuous.length < 2) return;
    map.invalidateSize({ animate: false });
    map.fitBounds(L.latLngBounds(geometry.continuous as unknown as Leaflet.LatLngExpression[]), {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      animate: true,
      duration: 0.7,
    });
  }, [geometry]);

  const changeBasemap = useCallback((key: string) => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, layer] of Object.entries(tilesRef.current)) {
      if (id === key) {
        if (map.hasLayer(layer)) layer.bringToBack();
        else layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
    setBasemap(key);
  }, []);

  // Map lifecycle: created once, client-side only, torn down on unmount.
  useEffect(() => {
    let disposed = false;

    (async () => {
      const L = await import("leaflet");
      if (disposed || !hostRef.current) return;

      const map = L.map(hostRef.current, {
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 19,
        zoomSnap: 0.5,
        wheelPxPerZoomLevel: 90,
      });

      for (const def of BASEMAPS) {
        tilesRef.current[def.key] = L.tileLayer(def.url, {
          attribution: def.attribution,
          maxZoom: def.maxZoom,
          minZoom: 1,
        });
      }
      tilesRef.current[BASEMAPS[0].key].addTo(map);

      map.attributionControl.setPrefix(false);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      leafletRef.current = L;
      mapRef.current = map;
      overlaysRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })().catch(() => {
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      overlaysRef.current?.clearLayers();
      overlaysRef.current = null;
      vesselArrowRef.current = null;
      tilesRef.current = {};
      leafletRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Wheel zoom engages only once the operator interacts, so scrolling past the
  // card is never hijacked.
  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host) return;
    const engage = () => map.scrollWheelZoom.enable();
    const release = () => map.scrollWheelZoom.disable();
    host.addEventListener("click", engage);
    host.addEventListener("mouseenter", engage);
    host.addEventListener("mouseleave", release);
    return () => {
      host.removeEventListener("click", engage);
      host.removeEventListener("mouseenter", engage);
      host.removeEventListener("mouseleave", release);
      map.scrollWheelZoom.disable();
    };
  }, [ready]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize({ animate: false }));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Draw the corridor, markers and the simulated vessel for the current result.
  useEffect(() => {
    let disposed = false;

    (async () => {
      const L = leafletRef.current;
      const map = mapRef.current;
      const overlays = overlaysRef.current;
      if (!L || !map || !overlays) return;

      const origin = geometry.continuous[0];
      const discharge = geometry.continuous[geometry.continuous.length - 1];
      if (!origin || !discharge) return;

      overlays.clearLayers();

      const asLatLng = (seg: LatLng[]) => seg as unknown as Leaflet.LatLngExpression[];
      const bounds = L.latLngBounds(geometry.continuous as unknown as Leaflet.LatLngExpression[]);

      geometry.segments.forEach((seg) => {
        L.polyline(asLatLng(seg), {
          className: "ociq-route-halo",
          color: riskColor,
          weight: 12,
          opacity: 0.18,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(overlays);
        L.polyline(asLatLng(seg), {
          className: "ociq-route-casing",
          color: "#06101f",
          weight: 7,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(overlays);
        L.polyline(asLatLng(seg), {
          className: "ociq-route-flow",
          color: "#60a5fa",
          weight: 3,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(overlays);
      });

      for (const { route, geometry: alt } of screened) {
        alt.segments.forEach((seg) => {
          L.polyline(asLatLng(seg), {
            className: "ociq-route-alt",
            color: "#94a3b8",
            weight: 2,
            opacity: 0.55,
            dashArray: "5 7",
            interactive: true,
          })
            .addTo(overlays)
            .bindTooltip(
              `${route.name} &middot; ${route.label}<br/>${formatNumber(route.distance)} nm &middot; ${
                route.duration
              } days &middot; risk ${route.riskScore}`,
              { className: "ociq-tip", sticky: true, direction: "top", opacity: 1 },
            );
        });
        const mid = alt.continuous[Math.floor(alt.continuous.length / 2)];
        if (mid) {
          L.marker([mid[0], mid[1]], { icon: waypointIcon(L), interactive: false, keyboard: false })
            .addTo(overlays)
            .bindTooltip(`${route.name} routing waypoint`, {
              className: "ociq-tip",
              direction: "top",
              opacity: 1,
            });
        }
      }

      L.marker([origin[0], wrapLng(origin[1])], {
        icon: portIcon(L, "origin"),
        keyboard: false,
        zIndexOffset: 500,
      })
        .addTo(overlays)
        .bindTooltip(
          `<strong>Loading port</strong><br/>${selected.loadingPort}<br/>${origin[0].toFixed(
            4,
          )}, ${wrapLng(origin[1]).toFixed(4)}`,
          { className: "ociq-tip", direction: "top", opacity: 1, offset: [0, -16] },
        );

      L.marker([discharge[0], wrapLng(discharge[1])], {
        icon: portIcon(L, "discharge"),
        keyboard: false,
        zIndexOffset: 500,
      })
        .addTo(overlays)
        .bindTooltip(
          `<strong>Discharge port</strong><br/>${selected.dischargePort}<br/>${discharge[0].toFixed(
            4,
          )}, ${wrapLng(discharge[1]).toFixed(4)}`,
          { className: "ociq-tip", direction: "top", opacity: 1, offset: [0, -16] },
        );

      const vessel = L.marker([origin[0], wrapLng(origin[1])], {
        icon: vesselIcon(L),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(overlays);
      vesselArrowRef.current = vessel
        .getElement()
        ?.querySelector<SVGElement>(".ociq-vessel__arrow") ?? null;

      map.fitBounds(bounds, {
        padding: FIT_PADDING,
        maxZoom: FIT_MAX_ZOOM,
        animate: false,
      });

      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        const mid = pointAtNm(geometry, geometry.totalNm / 2);
        vessel.setLatLng([mid.lat, mid.lng]);
        if (readoutRef.current) {
          readoutRef.current.textContent = `Mid-passage · day ${Math.ceil(totalDays / 2)} of ${totalDays}`;
        }
        return;
      }

      const started = performance.now();
      const tick = (now: number) => {
        if (disposed || !mapRef.current) return;
        const progress = ((now - started) % VOYAGE_MS) / VOYAGE_MS;
        const pos = pointAtNm(geometry, progress * geometry.totalNm);
        vessel.setLatLng([pos.lat, pos.lng]);
        if (vesselArrowRef.current) {
          vesselArrowRef.current.style.transform = `rotate(${pos.course.toFixed(1)}deg)`;
        }
        if (readoutRef.current) {
          readoutRef.current.textContent = `Day ${Math.min(
            totalDays,
            Math.floor(progress * totalDays) + 1,
          )} of ${totalDays}`;
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    })();

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      vesselArrowRef.current = null;
      overlaysRef.current?.clearLayers();
    };
  }, [
    geometry,
    screened,
    riskColor,
    totalDays,
    selected.loadingPort,
    selected.dischargePort,
    ready,
  ]);

  const showAlternatives = screened.length > 0;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-line bg-panel">
      <style>{`
        .ociq-map-shell { position: relative; height: 380px; }
        @media (min-width: 768px) { .ociq-map-shell { height: 460px; } }
        .ociq-map-shell .leaflet-container {
          height: 100%; width: 100%; background: #0a0e1a; font: inherit; outline: none;
        }
        .ociq-map-icon { background: none !important; border: none !important; }

        .ociq-route-flow { stroke-dasharray: 11 9; animation: oceaniq-route-flow 2.2s linear infinite; }
        @keyframes oceaniq-route-flow { to { stroke-dashoffset: -40; } }

        .ociq-pin { position: relative; display: grid; place-items: center; width: 34px; height: 34px; }
        .ociq-pin__core {
          position: relative; z-index: 2; display: grid; place-items: center;
          width: 20px; height: 20px; border-radius: 999px;
          background: var(--ociq-pin); color: #06101f;
          border: 2px solid rgba(255,255,255,0.92);
          box-shadow: 0 2px 8px rgba(0,0,0,0.55);
        }
        .ociq-pin__core svg { width: 11px; height: 11px; }
        .ociq-pin__pulse {
          position: absolute; inset: 3px; border-radius: 999px;
          background: var(--ociq-pin); opacity: 0.45;
          animation: oceaniq-pin-pulse 2.6s ease-out infinite;
        }
        @keyframes oceaniq-pin-pulse {
          0% { transform: scale(0.6); opacity: 0.6; }
          70% { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }

        .ociq-vessel { position: relative; display: grid; place-items: center; width: 38px; height: 38px; }
        .ociq-vessel__ring {
          position: absolute; inset: 0; border-radius: 999px;
          background: rgba(16,185,129,0.22); border: 1px solid rgba(16,185,129,0.6);
          animation: oceaniq-vessel-halo 1.8s ease-out infinite;
        }
        @keyframes oceaniq-vessel-halo {
          0% { transform: scale(0.55); opacity: 0.85; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .ociq-vessel__arrow {
          position: relative; z-index: 2; width: 22px; height: 22px; color: #10b981;
          filter: drop-shadow(0 1px 3px rgba(0,0,0,0.75)); transition: transform 120ms linear;
        }

        .ociq-waypoint {
          display: block; width: 9px; height: 9px; transform: rotate(45deg);
          background: #cbd5e1; border: 1px solid #06101f;
        }

        .ociq-tip {
          background: rgba(10,14,26,0.94) !important; border: 1px solid #1e2a3d !important;
          border-radius: 8px !important; color: #f0f4ff !important; font-size: 11px !important;
          line-height: 1.5 !important; padding: 6px 9px !important;
          box-shadow: 0 8px 22px rgba(0,0,0,0.5) !important;
        }
        .ociq-tip::before { border-top-color: #1e2a3d !important; }

        .ociq-map-shell .leaflet-control-zoom a,
        .ociq-map-shell .leaflet-control-zoom a:hover {
          background: rgba(10,14,26,0.9) !important; color: #f0f4ff !important;
          border-color: #1e2a3d !important;
        }
        .ociq-map-shell .leaflet-control-zoom { border: none !important; box-shadow: none !important; }
        .ociq-map-shell .leaflet-control-zoom a {
          width: 26px !important; height: 26px !important; line-height: 26px !important;
        }
        .ociq-map-shell .leaflet-control-attribution {
          background: rgba(10,14,26,0.72) !important; color: #8899bb !important;
          font-size: 9.5px !important; padding: 1px 6px !important;
        }
        .ociq-map-shell .leaflet-control-attribution a { color: #3b82f6 !important; }
      `}</style>

      <div
        ref={hostRef}
        className="ociq-map-shell"
        role="img"
        aria-label={`Geographic route map from ${selected.loadingPort} to ${selected.dischargePort}: ${formatNumber(
          selected.distance,
        )} nautical miles, ${selected.duration} days transit, operational risk ${selected.riskLevel}.`}
      />

      <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[min(20rem,calc(100%-5rem))]">
        <div className="rounded-lg border border-line bg-navy/88 px-3 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              {selected.label}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: `${riskColor}22`, color: riskColor }}
            >
              {selected.riskLevel} risk {selected.riskScore}
            </span>
          </div>
          <div className="mt-1 text-[13px] font-semibold text-primary">
            {selected.loadingPort} <span className="text-secondary">&rarr;</span>{" "}
            {selected.dischargePort}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-secondary">
            <span className="font-semibold text-primary">{formatNumber(selected.distance)} nm</span>
            <span>
              {selected.duration} days @ {selected.speedKnots} kn
            </span>
            <span>{formatUSD(selected.totalCost)}</span>
          </div>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-navy/88 backdrop-blur">
          <span className="flex items-center gap-1 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-secondary">
            <Layers className="size-3" /> Base
          </span>
          {BASEMAPS.map((def) => (
            <button
              key={def.key}
              type="button"
              onClick={() => changeBasemap(def.key)}
              aria-pressed={basemap === def.key}
              className={`border-t border-line px-2.5 py-1 text-left text-[10.5px] font-medium transition-colors ${
                basemap === def.key
                  ? "bg-accent/20 text-accent"
                  : "text-secondary hover:bg-white/5 hover:text-primary"
              }`}
            >
              {def.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={fitRoute}
          title="Fit route to view"
          aria-label="Fit route to view"
          className="grid size-8 place-items-center rounded-lg border border-line bg-navy/88 text-secondary backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Crosshair className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-3 z-[500] rounded-lg border border-line bg-navy/88 px-2.5 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" /> Loading
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warn" /> Discharge
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" /> Selected corridor
          </span>
          {showAlternatives && (
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t border-dashed border-secondary" /> Screened alternative
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Ship className="size-3 text-good" /> Simulated vessel position
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          <span ref={readoutRef} className="font-semibold text-good">
            Day 1 of {totalDays}
          </span>
          <span className="text-secondary">{vesselType} &middot; simulated, not live AIS</span>
        </div>
      </div>

      {!ready && !failed && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-navy/70 text-[11.5px] text-secondary backdrop-blur-sm">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading OpenStreetMap basemap&hellip;
          </span>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-navy/85 px-6 text-center">
          <div>
            <TriangleAlert className="mx-auto size-5 text-warn" />
            <p className="mt-2 text-[12px] font-medium text-primary">Basemap unavailable</p>
            <p className="mt-1 text-[11px] text-secondary">
              The OpenStreetMap tile layer could not be loaded. Route metrics shown here remain current.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
