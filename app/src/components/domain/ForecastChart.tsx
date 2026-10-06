"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUSD, formatWeekLabel } from "@/lib/format";

export interface ForecastChartPoint {
  /** Axis label, e.g. "03 Oct". */
  date: string;
  /** Observed reference rate for historical weeks, null for forecast weeks. */
  rate: number | null;
  /** Model point prediction for forecast weeks, null for historical weeks. */
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  /** upper - lower, used to stack the band fill between the two bounds. */
  bandHeight?: number | null;
  /** Flags the charter week the engine picked. */
  charterWeek?: boolean;
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  dataKey?: string;
  payload?: ForecastChartPoint;
}

function FreightTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  if (!point) return null;

  const shown = payload.filter(
    (p) => p.dataKey === "rate" || p.dataKey === "forecast",
  );

  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-xl shadow-black/40">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-secondary">
        Week of {point.date}
        {point.charterWeek && (
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
            Charter window
          </span>
        )}
      </div>
      {shown.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span
            className="size-2 rounded-full"
            style={{ background: p.dataKey === "forecast" ? "#f59e0b" : "#3b82f6" }}
          />
          <span className="text-secondary">{p.name}</span>
          <span className="ml-auto font-medium text-primary">
            {typeof p.value === "number" ? formatUSD(p.value) : p.value}
          </span>
        </div>
      ))}
      {point.lower != null && point.upper != null && (
        <div className="mt-1 border-t border-line pt-1 text-[10px] text-secondary">
          80% model band {formatUSD(point.lower)}–{formatUSD(point.upper)}
        </div>
      )}
    </div>
  );
}

interface ForecastChartProps {
  data: ForecastChartPoint[];
  height?: number;
  /** Renders a vertical marker at the engine's recommended charter week. */
  charterWeek?: number | null;
}

export default function ForecastChart({ data, height = 300, charterWeek }: ForecastChartProps) {
  const marker =
    charterWeek != null ? (data.find((d) => d.charterWeek) ? charterWeek : null) : null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
          minTickGap={18}
        />
        <YAxis
          tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
          domain={["auto", "auto"]}
          width={48}
        />
        <Tooltip
          content={<FreightTooltip />}
          cursor={{ stroke: "#2563eb", strokeDasharray: "4 4", strokeOpacity: 0.5 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--color-secondary)" }}
          iconType="circle"
          iconSize={7}
        />
        {/*
          The band is drawn as a stacked area: an invisible base carrying the
          lower bound to zero height, then the upper bound stacked on top. That
          is the standard way to fill a between-series band in recharts.
        */}
        <Area
          type="monotone"
          dataKey="lower"
          name="80% band floor"
          stackId="band"
          stroke="none"
          fill="transparent"
          legendType="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="bandHeight"
          name="80% model band"
          stackId="band"
          stroke="none"
          fill="url(#bandFill)"
          legendType="none"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="rate"
          name="Reference rate"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#0a0e1a", stroke: "#3b82f6", strokeWidth: 2 }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Model forecast"
          stroke="#f59e0b"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#0a0e1a", stroke: "#f59e0b", strokeWidth: 2 }}
          connectNulls={false}
        />
        {marker != null && (
          <ReferenceLine
            x={marker}
            stroke="#22c55e"
            strokeDasharray="4 3"
            label={{
              value: "Charter window",
              position: "top",
              fill: "#22c55e",
              fontSize: 10,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function toChartPoints(
  history: { date: string; rate: number }[],
  forecast: { date: string; rate: number; lower: number; upper: number }[],
  charterWeek: number | null,
): ForecastChartPoint[] {
  const tail = history.slice(-8);
  const points: ForecastChartPoint[] = tail.map((h) => ({
    date: formatWeekLabel(h.date),
    rate: Math.round(h.rate),
    forecast: null,
    lower: null,
    upper: null,
  }));

  forecast.forEach((f, i) => {
    points.push({
      date: formatWeekLabel(f.date),
      // The last historical point is repeated as the forecast origin so the two
      // lines join instead of leaving a gap at the boundary.
      rate: i === 0 ? (tail.length > 0 ? tail[tail.length - 1].rate : null) : null,
      forecast: Math.round(f.rate),
      lower: Math.round(f.lower),
      upper: Math.round(f.upper),
      bandHeight: Math.round(f.upper - f.lower),
      charterWeek: charterWeek != null && i + 1 === charterWeek,
    });
  });

  return points;
}