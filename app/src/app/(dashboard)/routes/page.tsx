"use client";

import {
  Anchor,
  Clock,
  Compass,
  Fuel,
  Map,
  Navigation,
  Route as RouteIcon,
  Ship,
  TimerReset,
  TrendingUp,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import { Bar, BarChart,   CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import RouteVisualization from "@/components/domain/RouteVisualization";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { RouteOption } from "@/lib/types";

const RISK_BAR: Record<string, string> = {
  Low: "#22c55e",
  Medium: "#f59e0b",
  High: "#ef4444",
};

export default function RoutesPage() {
  const { analysis, isLoading, error } = useAnalysis();

  if (isLoading) return <LoadingState full label="Screening transit corridors…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { route, scenario, vessel } = analysis;
  const recommended = route.selected;

  const costChart: {
    name: string;
    Freight: number;
    Fuel: number;
    "Port charges": number;
    Waiting: number;
    Deadhead: number;
  }[] = route.all.map((r) => ({
    name: r.label,
    Freight: Math.round(r.freightCost),
    Fuel: Math.round(r.fuelCost),
    "Port charges": Math.round(r.portCharges),
    Waiting: Math.round(r.waitingCost),
    Deadhead: Math.round(r.deadheadingCost),
  }));

  const columns: Column<RouteOption>[] = [
    {
      header: "Route",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent/12 text-accent">
            <RouteIcon className="size-3.5" />
          </span>
          <div>
            <div className="font-medium text-primary">
              {r.name}
              {r.recommended && (
                <span className="ml-2 rounded bg-good/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-good">
                  Recommended
                </span>
              )}
            </div>
            <div className="text-[10px] text-secondary">
              {r.loadingPort} → {r.dischargePort} · {r.label}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Distance",
      align: "right",
      render: (r) => <span className="text-primary">{formatNumber(r.distance)} nm</span>,
    },
    {
      header: "Transit",
      align: "right",
      render: (r) => (
        <span className="text-primary">
          {r.duration} d
          <span className="ml-1 text-[10px] text-secondary">@{r.speedKnots} kn</span>
        </span>
      ),
    },
    {
      header: "Freight",
      align: "right",
      render: (r) => <span className="text-primary">{formatUSD(r.freightCost)}</span>,
    },
    { header: "Fuel", align: "right", render: (r) => <span className="text-primary">{formatUSD(r.fuelCost)}</span> },
    {
      header: "Port charges",
      align: "right",
      render: (r) => <span className="text-primary">{formatUSD(r.portCharges)}</span>,
    },
    {
      header: "Total",
      align: "right",
      render: (r) => <span className="font-semibold text-primary">{formatUSD(r.totalCost)}</span>,
    },
    {
      header: "Per tonne",
      align: "right",
      render: (r) => <span className="text-primary">{formatUSDExact(r.costPerTonne)}/t</span>,
    },
    {
      header: "Risk",
      render: (r) => (
        <div className="flex items-center gap-2">
          <RiskBadge level={r.riskLevel} label={r.riskLevel} />
          <span className="text-[10.5px] text-secondary">{r.riskScore}</span>
        </div>
      ),
    },
  ];

  const cheapest = [...route.all].sort((a, b) => a.totalCost - b.totalCost)[0];
  const fastest = [...route.all].sort((a, b) => a.duration - b.duration)[0];

  return (
    <div>
      <PageHeader
        title="Route Optimization"
        subtitle={`Transit options for ${scenario.loadingPort} → ${scenario.dischargePort} (${vessel.primary.type}, ${formatNumber(
          scenario.quantity,
        )} t per parcel) screened for time, cost and operational risk.`}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Recommended Corridor"
            subtitle="Great-circle route on an OpenStreetMap basemap · pan, zoom and tap a corridor for its numbers"
            right={
              <span className="rounded-md bg-accent/12 px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-accent">
                {recommended.label}
              </span>
            }
          >
            <RouteVisualization
              selected={recommended}
              alternatives={route.all}
              vesselType={vessel.primary.type}
            />
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard
            title="Selected Route Metrics"
            subtitle={`${recommended.loadingPort} → ${recommended.dischargePort}`}
          >
            <div className="grid grid-cols-2 gap-2.5">
              <Metric icon={Navigation} label="Distance" value={`${formatNumber(recommended.distance)} nm`} />
              <Metric
                icon={Clock}
                label="Transit time"
                value={`${recommended.duration} days`}
              />
              <Metric icon={TrendingUp} label="Freight cost" value={formatUSD(recommended.freightCost)} />
              <Metric icon={Fuel} label="Fuel cost" value={formatUSD(recommended.fuelCost)} />
              <Metric icon={Anchor} label="Port charges" value={formatUSD(recommended.portCharges)} />
              <Metric
                icon={TimerReset}
                label="Waiting cost"
                value={formatUSD(recommended.waitingCost)}
              />
              <Metric
                icon={Compass}
                label="Deadhead cost"
                value={formatUSD(recommended.deadheadingCost)}
              />
              <Metric icon={Ship} label="Total" value={formatUSD(recommended.totalCost)} good />
            </div>

            <div className="mt-3 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-secondary">Operational risk</span>
                <RiskBadge level={recommended.riskLevel} label={recommended.riskLevel} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-secondary">Congestion exposure</span>
                <span className="font-medium text-accent">{recommended.congestionExposure}%</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-secondary">All-in cost</span>
                <span className="font-medium text-accent">{formatUSDExact(recommended.costPerTonne)}/t</span>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {recommended.notes.map((n) => (
                <li key={n} className="flex gap-1.5 text-[11.5px] leading-relaxed text-secondary">
                  <Waypoints className="mt-0.5 size-3 shrink-0 text-accent" />
                  {n}
                </li>
              ))}
            </ul>
          </ChartCard>

          {cheapest.name !== recommended.name && (
            <div className="rounded-xl border border-warn/35 bg-warn/5 p-4">
              <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-primary">
                <TriangleAlert className="size-4 text-warn" />
                Cheapest lane is not the selected lane
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                {cheapest.name} prices at {formatUSD(cheapest.totalCost)} versus {formatUSD(recommended.totalCost)}{" "}
                for {recommended.name}, but adds {cheapest.duration - recommended.duration} days and carries{" "}
                {cheapest.riskLevel.toLowerCase()} risk. Time and reliability decide the award.
              </p>
            </div>
          )}

          {fastest.name !== recommended.name && (
            <div className="rounded-xl border border-line bg-panel p-4">
              <h3 className="text-[13.5px] font-semibold text-primary">Fastest lane</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                {fastest.name} completes in {fastest.duration} days at {formatUSD(fastest.totalCost)}. It is not
                selected because the award weights total cost and risk alongside transit time.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Cost Composition by Corridor"
            subtitle="Every cost component the route engine charges, USD per programme voyage"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={costChart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--color-secondary)", fontSize: 10.5 }}
                  axisLine={{ stroke: "var(--color-line)" }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(v) => formatUSD(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(59,130,246,0.08)" }}
                />
                <Bar dataKey="Freight" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Fuel" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Port charges" stackId="a" fill="#8b5cf6" />
                <Bar dataKey="Waiting" stackId="a" fill="#ef4444" />
                <Bar
                  dataKey="Deadhead"
                  stackId="a"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                  label={{
                    position: "top",
                    fill: "var(--color-secondary)",
                    fontSize: 10,
                    formatter: (v) => formatUSD(Number(v)),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Lane Trade-Off" subtitle="Cost versus transit time across the screened corridors">
          <div className="space-y-2.5">
            {route.all.map((r) => {
              const maxCost = Math.max(...route.all.map((x) => x.totalCost));
              return (
                <div key={r.id} className="rounded-lg border border-line bg-panel p-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5 font-medium text-primary">
                      <span className="size-2 rounded-full" style={{ background: RISK_BAR[r.riskLevel] }} />
                      {r.label}
                    </span>
                    <span className="text-secondary">{r.duration} d</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(r.totalCost / maxCost) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-[11px] text-primary">{formatUSD(r.totalCost)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-secondary">
                    <span>{formatNumber(r.distance)} nm · {r.speedKnots} kn</span>
                    <span>risk {r.riskScore}</span>
                  </div>
                  {r.recommended && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-good">
                      <Map className="size-3" /> awarded
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title="Route Comparison"
          subtitle="All screened transit alternatives with cost components and risk"
        >
          <DataTable columns={columns} data={route.all} rowKey={(r) => r.id} />
        </ChartCard>
      </div>

      <p className="mt-4 rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-secondary">
        Distances are great-circle nautical miles at reference service speeds; fuel, port charges, waiting and
        deadheading are modelled from the reference layer, not live quotations. Changing the loading port,
        discharge port or vessel class reruns every corridor.
      </p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof Navigation;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-secondary">
        <Icon className="size-3 text-accent" />
        {label}
      </div>
      <div className={`mt-1 text-[16px] font-semibold ${good ? "text-good" : "text-primary"}`}>{value}</div>
    </div>
  );
}