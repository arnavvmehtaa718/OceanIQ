"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { ArrowRight, Info, PiggyBank, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import CostBreakdown from "@/components/domain/CostBreakdown";
import LoadingState from "@/components/ui/LoadingState";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatNumber, formatUSD, formatUSDExact } from "@/lib/format";

const DRIVER_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444"];

export default function CostSavingsPage() {
  const { analysis, isLoading, error } = useAnalysis();

  if (isLoading) return <LoadingState full label="Comparing charter structures…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { savings, cost, strategies, selectedStrategy, scenario } = analysis;
  const spot = strategies.find((s) => s.key === "spot")!;
  const saving = savings.savings >= 0;

  const structureChart = strategies.map((s) => ({
    name: s.code,
    label: s.name,
    total: Math.round(s.totalCost),
    recommended: s.recommended,
  }));

  const driverChart = savings.drivers.map((d) => ({
    name: d.name,
    amount: Math.round(d.amount),
  }));

  const columns: Column<(typeof driverChart)[number]>[] = [
    {
      header: "Driver",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: DRIVER_COLORS[driverChart.indexOf(r) % DRIVER_COLORS.length] }}
          />
          <span className="font-medium text-primary">{r.name}</span>
        </div>
      ),
    },
    {
      header: "Contribution",
      align: "right",
      render: (r) => (
        <span className={`font-medium ${r.amount >= 0 ? "text-good" : "text-warn"}`}>
          {r.amount >= 0 ? "+" : "−"}
          {formatUSD(Math.abs(r.amount))}
        </span>
      ),
    },
    {
      header: "Share of gap",
      align: "right",
      render: (r) => (
        <span className="text-secondary">
          {savings.savings !== 0 ? `${((r.amount / savings.savings) * 100).toFixed(1)}%` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cost & Savings"
        subtitle={`${savings.baselineLabel} versus ${savings.recommendedLabel} for the ${formatNumber(
          analysis.totalQuantity,
        )} t ${scenario.cargo} programme across ${scenario.voyages} voyage${scenario.voyages === 1 ? "" : "s"}.`}
        right={
          <Link
            href="/contracts"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-secondary transition-colors hover:border-accent/40 hover:text-primary"
          >
            Contract strategy <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`Baseline · ${spot.code}`}
          value={formatUSD(spot.totalCost)}
          sub={spot.name}
          icon={Wallet}
          tone="default"
        />
        <KpiCard
          label={`Awarded · ${selectedStrategy.code}`}
          value={formatUSD(selectedStrategy.totalCost)}
          sub={selectedStrategy.name}
          icon={Scale}
          tone="blue"
        />
        <KpiCard
          label={saving ? "Net benefit" : "Certainty premium"}
          value={formatUSD(Math.abs(savings.savings))}
          sub={saving ? "vs the spot baseline" : "paid vs the spot baseline"}
          icon={saving ? PiggyBank : TrendingUp}
          tone={saving ? "green" : "amber"}
        />
        <KpiCard
          label="Per tonne effect"
          value={`${savings.savings >= 0 ? "−" : "+"}${formatUSDExact(
            Math.abs(cost.costPerTonne - spot.costPerTonne),
          )}`}
          sub={`${Math.abs(savings.savingsPercent).toFixed(1)}% ${saving ? "below" : "above"} spot`}
          icon={TrendingDown}
          tone={saving ? "green" : "amber"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Programme Cost by Structure"
          subtitle="All-in cost of every priced contract structure, with the spot benchmark marked"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={structureChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
                formatter={(value) => [formatUSD(Number(value)), "Programme cost"]}
                labelFormatter={(label) =>
                  structureChart.find((d) => d.name === label)?.label ?? String(label)
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
              <ReferenceLine
                y={spot.totalCost}
                stroke="#8b5cf6"
                strokeDasharray="5 4"
                label={{ value: "Spot", fill: "#8b5cf6", fontSize: 10, position: "right" }}
              />
              <Bar dataKey="total" name="Programme cost" radius={[6, 6, 0, 0]} barSize={54}>
                {structureChart.map((d) => (
                  <Cell key={d.name} fill={d.recommended ? "#3b82f6" : "var(--color-line)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] leading-relaxed text-secondary">
            Every bar is priced by the same strategy engine that produced the award. The awarded structure is{" "}
            {saving
              ? `${formatUSD(savings.savings)} cheaper than spot`
              : `${formatUSD(Math.abs(savings.savings))} more expensive than spot`}
            , because the award also buys {selectedStrategy.priceCertainty.toFixed(0)}% price certainty and{" "}
            {selectedStrategy.flexibility.toFixed(0)}% flexibility.
          </p>
        </ChartCard>

        <ChartCard
          title="Where the Gap Comes From"
          subtitle={savings.label}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={driverChart}
              layout="vertical"
              margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-line)" }}
                tickLine={false}
                tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={132}
                tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
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
                itemStyle={{ color: "var(--color-primary)" }}
                formatter={(value) => [formatUSD(Number(value)), "Contribution"]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
              <ReferenceLine x={0} stroke="var(--color-secondary)" strokeOpacity={0.5} />
              <Bar dataKey="amount" name="Contribution" radius={[0, 4, 4, 0]} barSize={18}>
                {driverChart.map((d, i) => (
                  <Cell key={d.name} fill={DRIVER_COLORS[i % DRIVER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] leading-relaxed text-secondary">
            These drivers sum exactly to {formatUSD(savings.savings)}, the gap between the two structures. They are
            decomposed from the same cost model rather than allocated by assumption.
          </p>
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Awarded Structure — Cost Composition"
          subtitle={`Per voyage · items sum to ${formatUSD(cost.totalPerVoyage)}`}
        >
          <CostBreakdown
            items={cost.items.map((i) => ({ key: i.key, name: i.name, value: i.perVoyage }))}
            total={cost.totalPerVoyage}
          />
        </ChartCard>

        <ChartCard title="Driver Attribution" subtitle="Deterministic decomposition of the baseline gap">
          <DataTable columns={columns} data={driverChart} rowKey={(r) => r.name} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px]">
            <span className="text-secondary">Net gap</span>
            <span className={`font-semibold ${saving ? "text-good" : "text-warn"}`}>
              {savings.savings >= 0 ? "−" : "+"}
              {formatUSD(Math.abs(savings.savings))} ({savings.savingsPercent.toFixed(1)}%)
            </span>
          </div>
        </ChartCard>
      </div>

      <div
        className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
          saving ? "border-good/30 bg-good/5" : "border-warn/30 bg-warn/5"
        }`}
      >
        {saving ? (
          <PiggyBank className="mt-0.5 size-4 shrink-0 text-good" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-warn" />
        )}
        <div className="text-[12px] leading-relaxed text-secondary">
          <span className={`font-semibold ${saving ? "text-good" : "text-warn"}`}>OceanIQ insight:</span>{" "}
          {selectedStrategy.name} prices at {formatUSD(selectedStrategy.totalCost)} against{" "}
          {formatUSD(savings.baselineTotal)} for {savings.baselineLabel.toLowerCase()}.{" "}
          {saving ? (
            <>
              That is {formatUSD(savings.savings)} ({savings.savingsPercent.toFixed(1)}%) below the baseline while
              retaining {selectedStrategy.flexibility.toFixed(0)}% flexibility and{" "}
              {selectedStrategy.priceCertainty.toFixed(0)}% price certainty.
            </>
          ) : (
            <>
              The forecast shows rates falling, so {savings.baselineLabel.toLowerCase()} is currently cheaper. The
              premium buys {selectedStrategy.priceCertainty.toFixed(0)}% price certainty and removes{" "}
              {Math.abs(savings.savingsPercent).toFixed(1)}% of rate exposure over the {scenario.contractHorizon}{" "}
              horizon.
            </>
          )}{" "}
          <span className="text-secondary/80">{savings.caveat}</span>
        </div>
      </div>
    </div>
  );
}