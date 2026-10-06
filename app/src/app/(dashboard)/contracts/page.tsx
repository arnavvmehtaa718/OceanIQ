"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { BadgeCheck, FileSignature, Info, Star, TrendingDown, TrendingUp } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingState from "@/components/ui/LoadingState";
import CostBreakdown from "@/components/domain/CostBreakdown";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

export default function ContractsPage() {
  const { analysis, isLoading, error } = useAnalysis();

  if (isLoading) return <LoadingState full label="Pricing charter structures…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { strategies, selectedStrategy, scenario, cost, savings } = analysis;
  const spot = strategies.find((s) => s.key === "spot")!;

  const chartData = strategies.map((s) => ({
    name: s.code,
    label: s.name,
    value: s.totalCost,
    recommended: s.recommended,
  }));

  return (
    <div>
      <PageHeader
        title="Contract Strategy"
        subtitle={`Chartering structures for the ${formatNumber(scenario.quantity)} t ${scenario.cargo} parcel across a ${scenario.contractHorizon} horizon and ${scenario.voyages} programme voyage${scenario.voyages === 1 ? "" : "s"}.`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {strategies.map((s) => {
          const delta = spot.totalCost - s.totalCost;
          const premium = delta < 0;
          return (
            <div
              key={s.key}
              className={`relative flex flex-col gap-3 rounded-xl border p-4 ${
                s.recommended ? "border-accent bg-card shadow-lg shadow-blue-nav/20" : "border-line bg-card"
              }`}
            >
              {s.recommended && (
                <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-good px-2 py-0.5 text-[10px] font-semibold text-emerald-950">
                  <Star className="size-3 fill-emerald-950" /> OceanIQ Recommended
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-secondary">{s.code}</div>
                  <h3 className="mt-0.5 text-[14px] font-semibold leading-snug text-primary">{s.name}</h3>
                </div>
                <FileSignature className={`size-5 ${s.recommended ? "text-accent" : "text-secondary"}`} />
              </div>

              <div className="flex items-end justify-between rounded-lg border border-line bg-panel p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-secondary">Programme cost</div>
                  <div className="text-[20px] font-semibold text-primary">{formatUSD(s.totalCost)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-secondary">Per tonne</div>
                  <div className="text-[15px] font-semibold text-primary">
                    {formatUSDExact(s.costPerTonne)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {delta !== 0 && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      premium ? "bg-warn/10 text-warn" : "bg-good/10 text-good"
                    }`}
                  >
                    {premium ? (
                      <>
                        <TrendingUp className="size-3" /> {formatUSD(Math.abs(delta))} premium
                      </>
                    ) : (
                      <>
                        <TrendingDown className="size-3" /> saves {formatUSD(Math.abs(delta))}
                      </>
                    )}
                    <span className="opacity-75">({s.savingsPercent.toFixed(1)}%)</span>
                  </span>
                )}
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-secondary">
                  {formatUSD(s.costPerVoyage)}/voyage
                </span>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <AttrRow label="Price certainty" value={s.priceCertaintyLabel} />
                <AttrRow label="Flexibility" value={s.flexibilityLabel} />
                <AttrRow label="Market exposure" value={s.marketExposureLabel} />
                <AttrRow label="Operational risk" value={s.operationalRiskLabel} />
              </div>

              <div className="border-t border-line pt-2.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-secondary">
                  <span>Attractiveness</span>
                  <span className="font-semibold text-accent">{s.attractiveness.toFixed(1)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.attractiveness}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <ChartCard
          title={selectedStrategy.rationale.split(".")[0]}
          subtitle={`Award decision for ${selectedStrategy.name} · attractiveness ${selectedStrategy.attractiveness.toFixed(1)}`}
          right={
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold ${
                savings.savings >= 0 ? "bg-good/10 text-good" : "bg-warn/10 text-warn"
              }`}
            >
              <BadgeCheck className="size-3.5" />
              {savings.savings >= 0
                ? `${formatUSD(savings.savings)} below spot`
                : `${formatUSD(Math.abs(savings.savings))} certainty premium`}
            </span>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-secondary">{selectedStrategy.rationale}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-secondary">
            Totals cover {formatNumber(analysis.totalQuantity)} t lifted in {scenario.voyages} programme
            voyage{scenario.voyages === 1 ? "" : "s"} at a {formatUSDExact(cost.referenceRatePerDay)}/day reference
            rate with the bunker index at {cost.bunkerIndex}. {selectedStrategy.timeCharterNote}
          </p>
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Total Cost Comparison" subtitle="All-in programme cost by contract structure">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-line)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-primary)",
                }}
                labelStyle={{ color: "var(--color-primary)", fontWeight: 600 }}
                itemStyle={{ color: "var(--color-primary)" }}
                formatter={(value) => [formatUSD(Number(value)), "Total cost"]}
                labelFormatter={(label) => chartData.find((d) => d.name === label)?.label ?? String(label)}
              />
              <ReferenceLine
                y={spot.totalCost}
                stroke="#8b5cf6"
                strokeDasharray="5 4"
                label={{ value: "Spot", fill: "#8b5cf6", fontSize: 10, position: "right" }}
              />
              <Bar dataKey="value" name="Total cost" radius={[6, 6, 0, 0]} barSize={52}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.recommended ? "#3b82f6" : "var(--color-line)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent" /> Recommended
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-line" /> Alternative
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-px w-3 bg-violet-500" /> Spot benchmark
            </span>
          </div>
        </ChartCard>

        <ChartCard
          title="Detailed Cost Breakdown"
          subtitle={`All-in cost per voyage — items sum exactly to ${formatUSD(cost.totalPerVoyage)}`}
        >
          <CostBreakdown
            items={cost.items.map((i) => ({ key: i.key, name: i.name, value: i.perVoyage }))}
            total={cost.totalPerVoyage}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px]">
            <span className="text-secondary">Programme total</span>
            <span className="font-semibold text-primary">{formatUSD(cost.totalProgram)}</span>
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="text-[12px] leading-relaxed text-secondary">
          <span className="font-semibold text-primary">Where the trade-off sits.</span>{" "}
          {strategies
            .filter((s) => s.key !== "spot")
            .map((s) => {
              const diff = s.totalCost - spot.totalCost;
              return `${s.name} prices ${diff === 0 ? "level with" : diff > 0 ? `${formatUSD(diff)} above` : `${formatUSD(Math.abs(diff))} below`} spot at ${s.attractiveness.toFixed(1)} attractiveness, ${s.priceCertainty.toFixed(0)}% price certainty and ${s.flexibility.toFixed(0)}% flexibility`;
            })
            .join("; ")}
            . Full reasoning is on each card.{" "}
          <Link href="/cost-savings" className="font-medium text-accent hover:text-primary">
            See the full cost &amp; savings view →
          </Link>
        </div>
      </div>
    </div>
  );
}

function AttrRow({ label, value }: { label: string; value: RiskLevel }) {
  const tone = value === "Low" ? "green" : value === "Medium" ? "amber" : "red";
  return (
    <div className="flex items-center justify-between">
      <span className="text-secondary">{label}</span>
      <StatusBadge status={value} tone={tone} />
    </div>
  );
}