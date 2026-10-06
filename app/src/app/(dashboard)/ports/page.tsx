"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Anchor, Gauge, MapPin, Ship, TimerReset, Waves } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingState from "@/components/ui/LoadingState";
import PortCard from "@/components/domain/PortCard";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatNumber, formatWeekLabel } from "@/lib/format";
import type { PortCompatibility } from "@/lib/types";

interface ChartPoint {
  label: string;
  observed: number | null;
  projected: number | null;
  congestion: number;
}

function WaitingTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow-xl shadow-black/40">
      <div className="mb-1 text-[11px] text-secondary">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: p.dataKey === "projected" ? "#f59e0b" : "#3b82f6" }}
          />
          <span className="text-secondary">{p.name}</span>
          <span className="ml-auto font-medium text-primary">{p.value?.toFixed(1)} days</span>
        </div>
      ))}
    </div>
  );
}

export default function PortsPage() {
  const { analysis, isLoading, error } = useAnalysis();
  const [inspected, setInspected] = useState<string | null>(null);

  if (isLoading) return <LoadingState full label="Assessing port feasibility…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { port, scenario, vessel } = analysis;
  const selected = port.all.find((p) => p.name === inspected) ?? port.selected;

  const waitingChart: ChartPoint[] = selected.waitingSeries.map((p) => ({
    label: formatWeekLabel(p.date),
    observed: p.week === 0 ? p.waitingDays : null,
    projected: p.week === 0 ? p.waitingDays : p.waitingDays,
    congestion: p.congestion,
  }));

  const comparisonColumns: Column<PortCompatibility>[] = [
    {
      header: "Port",
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent/12 text-accent">
            <MapPin className="size-3.5" />
          </span>
          <div>
            <div className="font-medium text-primary">{p.name}</div>
            <div className="text-[10px] text-secondary">{p.state}</div>
          </div>
          {p.name === port.selected.name && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-accent">
              Selected
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Congestion",
      render: (p) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${p.congestion >= 60 ? "bg-bad" : p.congestion >= 45 ? "bg-warn" : "bg-good"}`}
              style={{ width: `${p.congestion}%` }}
            />
          </div>
          <span className="text-[11px] text-secondary">
            {p.congestion}% · {p.congestionLabel}
          </span>
        </div>
      ),
    },
    {
      header: "Waiting",
      align: "right",
      render: (p) => (
        <span className="text-primary">
          {p.waitingTime} → {p.waitingTimeProjected} d
        </span>
      ),
    },
    {
      header: "Handling",
      align: "right",
      render: (p) => <span className="text-primary">{(p.cargoHandlingCapacity / 1000).toFixed(0)}K t/d</span>,
    },
    {
      header: "Draft",
      align: "right",
      render: (p) => <span className="text-primary">{p.maxDraft} m</span>,
    },
    {
      header: "Status",
      render: (p) => (
        <StatusBadge
          status={p.status}
          tone={p.status === "Compatible" ? "green" : p.status === "Conditional" ? "amber" : "red"}
        />
      ),
    },
    {
      header: "Feasibility",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${p.score >= 70 ? "bg-good" : p.score >= 45 ? "bg-warn" : "bg-bad"}`}
              style={{ width: `${p.score}%` }}
            />
          </div>
          <span className="w-6 text-right text-primary">{p.score}</span>
        </div>
      ),
    },
    { header: "Risk", render: (p) => <RiskBadge level={p.riskLevel} label={p.riskLevel} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Port Analytics"
        subtitle={`Discharge-port feasibility for a ${formatNumber(scenario.quantity)} t ${scenario.cargo} parcel with ${vessel.primary.type}, across the east-coast candidates.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {port.all.map((p) => (
          <PortCard
            key={p.name}
            port={p}
            selected={selected.name === p.name}
            onSelect={(next) => setInspected(next.name)}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title={`Waiting-Time Outlook — ${selected.name}`}
            subtitle="Projected anchorage delay per call, from the same function the cost engine charges with"
            right={
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider ${
                  selected.congestion >= 60
                    ? "bg-bad/10 text-bad"
                    : selected.congestion >= 45
                      ? "bg-warn/10 text-warn"
                      : "bg-good/10 text-good"
                }`}
              >
                <Gauge className="size-3" /> {selected.congestion}% congestion
              </span>
            }
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={waitingChart} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="waitBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--color-line)" }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit=" d"
                />
                <Tooltip
                  content={<WaitingTooltip />}
                  cursor={{ stroke: "#2563eb", strokeDasharray: "4 4", strokeOpacity: 0.5 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                <Area dataKey="observed" name="Today" fill="url(#waitBand)" stroke="none" />
                <Line
                  dataKey="projected"
                  name="Projected waiting"
                  type="monotone"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 3, fill: "#f59e0b" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              <InfoChip icon={TimerReset} label={`Wait: ${selected.waitingTime} d today`} />
              <InfoChip icon={TimerReset} label={`Projected: ${selected.waitingTimeProjected} d`} />
              <InfoChip icon={Waves} label={`Handle: ${(selected.cargoHandlingCapacity / 1000).toFixed(0)}K t/day`} />
              <InfoChip
                icon={Anchor}
                label={`Berths: ${selected.berthsAvailable}/${selected.totalBerths} free`}
              />
              <InfoChip icon={Ship} label={`Reference suitability: ${selected.suitableVessels.join(", ")}`} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-secondary">
              Waiting falls gently across the window because the projection unwinds the seasonal congestion
              cycle from its current level; it is not a claim that the reference port will clear.
            </p>
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard
            title={`Infrastructure Constraints — ${selected.name}`}
            subtitle="Hard physical limits and the handling rate"
          >
            <div className="space-y-2">
              {selected.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2.5"
                >
                  <div>
                    <div className="text-[11px] text-secondary">{c.name}</div>
                    <div className="text-[14px] font-semibold text-primary">
                      {c.required} / {c.limit} {c.unit}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10.5px] ${c.margin >= 0 ? "text-good" : "text-bad"}`}
                    >
                      {c.margin >= 0 ? "+" : ""}
                      {c.margin}
                    </span>
                    <StatusBadge
                      status={c.status}
                      tone={c.status === "Pass" ? "green" : c.status === "Restricted" ? "amber" : "red"}
                    />
                  </div>
                </div>
              ))}
            </div>
            {selected.warnings.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-warn">
                  Warnings
                </div>
                <ul className="space-y-1.5">
                  {selected.warnings.map((w) => (
                    <li key={w} className="text-[12px] leading-relaxed text-secondary">
                      · {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ChartCard>

          {port.selected.alternative && (
            <div className="rounded-xl border border-warn/35 bg-warn/5 p-4">
              <h3 className="text-[13.5px] font-semibold text-primary">
                {port.selected.name} cannot take this parcel
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                Best feasible alternative is{" "}
                <span className="font-medium text-primary">{port.selected.alternative.name}</span>.{" "}
                {port.selected.alternative.reason}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line bg-panel p-4 text-[11.5px] leading-relaxed text-secondary">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Feasibility ranking
            </div>
            {port.bestAlternative.reason}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ChartCard
          title="Port Comparison — East Coast India"
          subtitle="Every candidate ranked by physical feasibility, congestion, berth availability and class suitability"
        >
          <DataTable columns={comparisonColumns} data={port.all} rowKey={(p) => p.name} />
        </ChartCard>
      </div>

      <p className="mt-4 rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-secondary">
        Port specifications, congestion baselines and berth counts come from the reference layer and are
        representative, not live terminal data. Scores are recomputed whenever the vessel class or parcel size
        changes.
      </p>
    </div>
  );
}

function InfoChip({ icon: Icon, label }: { icon: typeof Waves; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-secondary">
      <Icon className="size-3.5 text-accent" />
      {label}
    </span>
  );
}