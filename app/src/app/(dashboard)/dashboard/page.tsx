"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  BadgeDollarSign,
  ClipboardList,
  Gauge,
  LineChart as LineChartIcon,
  MapPin,
  PiggyBank,
  Ship,
  TrendingUp,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import ForecastChart, { toChartPoints } from "@/components/domain/ForecastChart";
import AlertCard from "@/components/domain/AlertCard";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useAppStore } from "@/store/useAppStore";
import { formatPercent, formatUSD } from "@/lib/format";
import type { PortCompatibility } from "@/lib/types";

export default function DashboardPage() {
  const { analysis, isLoading, error } = useAnalysis();
  const userName = useAppStore((s) => s.userName);

  const chartPoints = useMemo(() => {
    if (!analysis) return [];
    return toChartPoints(
      analysis.forecast.recentHistory,
      analysis.forecast.forecastRates,
      analysis.forecast.recommendedCharterWeek,
    );
  }, [analysis]);

  if (isLoading) return <LoadingState full label="Running the OceanIQ decision pipeline…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">
          {error ?? "The decision pipeline did not return a result."}
        </p>
        <p className="mt-2 text-[11.5px] text-secondary">
          Verify the trained model artifacts exist under <code>ml/model/</code>, then reload.
        </p>
      </div>
    );
  }

  const { forecast, vessel, port, route, cost, savings, risk, alerts, scenario } = analysis;
  const vesselClass = vessel.primary.type;

  const portColumns: Column<PortCompatibility>[] = [
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
        </div>
      ),
    },
    {
      header: "Congestion",
      render: (p) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${p.congestion >= 60 ? "bg-bad" : p.congestion >= 45 ? "bg-warn" : "bg-good"}`}
              style={{ width: `${p.congestion}%` }}
            />
          </div>
          <span className="text-[11px] text-secondary">{p.congestion}%</span>
        </div>
      ),
    },
    {
      header: "Waiting",
      align: "right",
      render: (p) => <span className="text-primary">{p.waitingTimeProjected} d</span>,
    },
    {
      header: "Draft",
      align: "right",
      render: (p) => <span className="text-primary">{p.maxDraft} m</span>,
    },
    {
      header: "Risk",
      render: (p) => <RiskBadge level={p.riskLevel} label={p.riskLevel} />,
    },
  ];

  const sorted = [...vessel.all].sort((a, b) => b.score - a.score);

  return (
    <div>
      <PageHeader
        title={`Good day, ${userName || "Analyst"} — here's the chartering picture`}
        subtitle={`${scenario.cargo} · ${scenario.quantity.toLocaleString()} t · ${scenario.loadingPort} → ${scenario.dischargePort} · ${scenario.voyages} voyages`}
        right={
          <LinkButton href="/procurement" icon={ClipboardList}>
            New Procurement Analysis
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Reference Rate"
          value={formatUSD(forecast.currentRate)}
          sub={`${vesselClass}, ${forecast.laneResolution.lane.split("|").slice(0, 2).join(" ")}`}
          icon={TrendingUp}
          changeText={formatPercent(forecast.weeklyChange) + " w/w"}
        />
        <KpiCard
          label="30-Day Forecast"
          value={formatUSD(forecast.predictedRate30d)}
          sub={`Confidence ${forecast.confidence}%`}
          icon={LineChartIcon}
          tone="amber"
          changeText={formatPercent(forecast.forecastChange30d) + " f/c"}
        />
        <KpiCard
          label="Charter Window"
          value={`Week ${forecast.recommendedCharterWeek}`}
          sub={analysis.charterTiming.recommendation}
          icon={AlarmClock}
          tone="default"
        />
        <KpiCard
          label="Program Cost"
          value={formatUSD(savings.recommendedTotal, true)}
          sub={`${analysis.selectedStrategy.name} · ${cost.costPerTonne}/t`}
          icon={BadgeDollarSign}
          tone="blue"
        />
        <KpiCard
          label={savings.savings >= 0 ? "Saving vs Spot" : "Premium vs Spot"}
          value={formatUSD(Math.abs(savings.savings), true)}
          sub={`${formatPercent(savings.savingsPercent, 1).replace("+", "")} vs unhedged spot`}
          icon={PiggyBank}
          tone={savings.savings >= 0 ? "green" : "amber"}
        />
        <KpiCard
          label="Risk Score"
          value={`${risk.score} / 100`}
          sub={risk.level}
          icon={Gauge}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title={`Freight Rate Outlook — ${vesselClass}`}
            subtitle={`Model forecast with 80% band, ${forecast.forecastHorizonWeeks}-week horizon`}
            right={
              <LinkButton href="/forecast" bare>
                Full forecast
              </LinkButton>
            }
          >
            <ForecastChart
              data={chartPoints}
              charterWeek={forecast.recommendedCharterWeek}
            />
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard
            title="Vessel Compatibility"
            subtitle={`Scored against ${port.selected.name} constraints and parcel size`}
            right={
              <LinkButton href="/vessels" bare>
                Compare
              </LinkButton>
            }
          >
            <div className="space-y-3">
              {sorted.map((v) => (
                <div
                  key={v.type}
                  className={`rounded-lg border p-3 ${
                    v.recommended ? "border-accent bg-accent/5" : "border-line"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ship className={`size-4 ${v.recommended ? "text-accent" : "text-secondary"}`} />
                      <span className="text-[13px] font-semibold text-primary">{v.type}</span>
                      {v.recommended && (
                        <span className="rounded bg-good/15 px-1.5 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-good">
                          Best
                        </span>
                      )}
                      {v.portCompatibility === "Fail" && (
                        <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-bad">
                          No berth
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] font-medium text-primary">{v.score}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className={`h-full rounded-full ${v.recommended ? "bg-good" : "bg-accent/70"}`}
                      style={{ width: `${v.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Port Congestion Watch — East Coast India"
            subtitle="Waiting times and draft constraints across candidate discharge ports"
            right={
              <LinkButton href="/ports" bare>
                Port analytics
              </LinkButton>
            }
          >
            <DataTable
              columns={portColumns}
              data={port.all}
              rowKey={(p) => p.name}
            />
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard
            title="Recommended Route"
            subtitle={`${route.selected.loadingPort} → ${route.selected.dischargePort}, best balance of cost & risk`}
            right={
              <LinkButton href="/routes" bare>
                Optimize
              </LinkButton>
            }
          >
            <div className="space-y-2.5">
              <MetricRow label="Distance" value={`${route.selected.distance.toLocaleString()} nm`} />
              <MetricRow label="Transit time" value={`${route.selected.duration.toFixed(1)} days`} />
              <MetricRow label="Freight cost" value={formatUSD(route.selected.freightCost, true)} />
              <MetricRow label="Cost per tonne" value={formatUSD(route.selected.costPerTonne)} />
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-secondary">Risk level</span>
                <RiskBadge level={route.selected.riskLevel} label={route.selected.riskLevel} />
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="mt-4">
        <ChartCard
          title="Active Alerts & Advisory"
          subtitle="Latest operational and market advisories"
          right={
            <LinkButton href="/risk" bare>
              Risk center
            </LinkButton>
          }
        >
          {alerts.length === 0 ? (
            <p className="text-[12.5px] text-secondary">
              No advisories raised for this scenario. Risk scores still apply — see the risk centre for the
              weighted components behind the {risk.score}/100 headline.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {alerts.slice(0, 4).map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <p className="mt-4 rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-secondary">
        {analysis.model.dataLabel}. {analysis.disclosure.costNote} {analysis.disclosure.recalibrationNote}
      </p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-secondary">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
    </div>
  );
}

function LinkButton({
  href,
  icon: Icon,
  bare,
  children,
}: {
  href: string;
  icon?: typeof Ship;
  bare?: boolean;
  children: React.ReactNode;
}) {
  const cls = bare
    ? "inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:text-primary"
    : "inline-flex items-center gap-2 rounded-lg bg-blue-nav px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-blue-glow";
  return (
    <Link href={href} className={cls}>
      {Icon ? <Icon className="size-4" /> : null}
      {children}
      {bare ? <ArrowRight className="size-3.5" /> : null}
    </Link>
  );
}