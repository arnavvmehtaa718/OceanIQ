"use client";

import {
  Anchor,
  CalendarDays,
  CheckSquare,
  PackageSearch,
  PiggyBank,
  Route,
  ScrollText,
  ShieldAlert,
  Ship,
  TrendingUp,
} from "lucide-react";
import type { GeneratedReport } from "@/store/useAppStore";
import { formatDate, formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { RiskComponent, RouteOption, StrategyComparison } from "@/lib/types";
import CostBreakdown from "@/components/domain/CostBreakdown";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";

export default function ReportPreview({ report }: { report: GeneratedReport }) {
  const { analysis } = report;
  const { scenario, cost, savings, forecast, vessel, port, route, risk, strategies, charterTiming } = analysis;

  const routeColumns: Column<RouteOption>[] = [
    { header: "Route", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Distance", align: "right", render: (r) => <span>{formatNumber(r.distance)} nm</span> },
    { header: "Duration", align: "right", render: (r) => <span>{r.duration} days</span> },
    { header: "Total", align: "right", render: (r) => <span>{formatUSD(r.totalCost)}</span> },
    {
      header: "Risk",
      render: (r) => <RiskBadge level={r.riskLevel} label={r.riskLevel} />,
    },
    {
      header: "",
      render: (r) =>
        r.recommended ? (
          <StatusBadge status="Recommended" tone="green" />
        ) : (
          <span className="text-secondary/60">{r.label}</span>
        ),
    },
  ];

  const riskColumns: Column<RiskComponent>[] = [
    { header: "Component", render: (r) => <span className="font-medium">{r.label}</span> },
    {
      header: "Severity",
      render: (r) => <StatusBadge status={r.level} tone={r.level === "Low" ? "green" : r.level === "Medium" ? "amber" : "red"} />,
    },
    { header: "Score", align: "right", render: (r) => <span>{r.score}/100</span> },
    { header: "Weight", align: "right", render: (r) => <span className="text-secondary">{r.weight}%</span> },
    { header: "Mitigation", render: (r) => <span className="text-secondary">{r.mitigation}</span> },
  ];

  const strategyColumns: Column<StrategyComparison>[] = [
    { header: "Strategy", render: (s) => <span className="font-medium">{s.name}</span> },
    { header: "Total cost", align: "right", render: (s) => <span>{formatUSD(s.totalCost)}</span> },
    { header: "Per tonne", align: "right", render: (s) => <span>{formatUSDExact(s.costPerTonne)}</span> },
    { header: "Per voyage", align: "right", render: (s) => <span>{formatUSD(s.costPerVoyage)}</span> },
    { header: "vs spot", align: "right", render: (s) => <span>{s.savingsVsSpot >= 0 ? "−" : "+"}{formatUSD(Math.abs(s.savingsVsSpot))}</span> },
    { header: "Certainty", align: "right", render: (s) => <span className="text-secondary">{s.priceCertainty.toFixed(0)}%</span> },
    {
      header: "",
      render: (s) => (s.recommended ? <StatusBadge status="Recommended" tone="green" /> : <span />),
    },
  ];

  const saving = savings.savings >= 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold text-primary">{report.name}</h2>
            <p className="mt-0.5 text-[12px] text-secondary">
              {route.selected.name} · {scenario.cargo} · Generated {report.date}
            </p>
          </div>
          <StatusBadge status={report.status} tone="green" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Stat label="Programme cost" value={formatUSD(cost.totalProgram)} />
          <Stat
            label={saving ? "Savings vs spot" : "Premium vs spot"}
            value={`${saving ? "−" : "+"}${formatUSD(Math.abs(savings.savings))}`}
            good={saving}
          />
          <Stat label="Risk score" value={`${risk.score}/100`} />
          <Stat label="Forecast confidence" value={`${forecast.confidence}%`} />
        </div>
      </div>

      {/* Cargo & voyage details */}
      <Section title="Cargo & Voyage Details" icon={PackageSearch}>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Field label="Cargo type" value={scenario.cargo} />
          <Field label="Parcel quantity" value={`${formatNumber(scenario.quantity)} tonnes`} />
          <Field label="Programme quantity" value={`${formatNumber(analysis.totalQuantity)} tonnes`} />
          <Field label="Programme voyages" value={`${scenario.voyages}`} />
          <Field label="Loading port" value={scenario.loadingPort} />
          <Field label="Discharge port" value={scenario.dischargePort} />
          <Field label="Contract horizon" value={scenario.contractHorizon} />
          <Field label="Stated strategy" value={scenario.contractStrategy} />
          <Field label="Recommended vessel" value={vessel.primary.type} />
          <Field label="Scenario ID" value={analysis.scenarioId} />
        </div>
      </Section>

      {/* Freight forecast */}
      <Section title="Freight Forecast" icon={TrendingUp}>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Field label="Latest observed rate" value={`${formatUSD(forecast.currentRate)}/day`} />
          <Field label="Next week (ML)" value={`${formatUSD(forecast.predictedRate)}/day`} />
          <Field label="30-day prediction" value={`${formatUSD(forecast.predictedRate30d)}/day`} />
          <Field
            label="30-day change"
            value={`${forecast.forecastChange30d >= 0 ? "+" : ""}${forecast.forecastChange30d.toFixed(2)}%`}
          />
          <Field
            label="Horizon change"
            value={`${forecast.forecastChange90d >= 0 ? "+" : ""}${forecast.forecastChange90d.toFixed(2)}%`}
          />
          <Field label="Trend" value={`${forecast.trend} (${(forecast.trendStrength * 100).toFixed(0)}%)`} />
          <Field label="Best rate in horizon" value={`${formatUSD(forecast.bestRate)}/day in week ${forecast.bestWeek}`} />
          <Field label="Charting window" value={charterTiming.windowLabel} />
        </div>
        <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] text-secondary">
          Forecast confidence {forecast.confidence}% ({forecast.confidenceLabel}) over{" "}
          {forecast.forecastHorizonWeeks} weeks from {formatDate(forecast.firstForwardDate)}. Lane{" "}
          {forecast.laneResolution.exact ? "matched exactly" : "proxied"}: {forecast.laneResolution.lane} —{" "}
          {forecast.laneResolution.adjustment}
        </div>
      </Section>

      {/* Recommended vessel */}
      <Section title={`Recommended Vessel — ${vessel.primary.type}`} icon={Ship}>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Field label="Class" value={vessel.primary.type} />
          <Field label="Deadweight" value={vessel.primary.dwtLabel} />
          <Field label="Payload available" value={`${formatNumber(vessel.primary.payload)} t`} />
          <Field label="Utilisation" value={`${formatNumber(vessel.primary.utilisationTonnes)} t (${vessel.primary.utilisationPercent.toFixed(0)}%)`} />
          <Field label="Score" value={`${vessel.primary.score}/100`} />
          <Field label="Estimated cost / day" value={formatUSD(vessel.primary.costPerDay)} />
          <Field label="Implied rate" value={`${formatUSD(vessel.primary.impliedDailyRate)}/day`} />
          <Field label="Availability" value={vessel.primary.availability} />
          <Field label="Cost implication" value={vessel.primary.costImplication} />
        </div>
        {vessel.alternative && (
          <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] text-secondary">
            Runner-up: {vessel.alternative.type} at {vessel.alternative.score}/100 —{" "}
            {vessel.alternative.reasons[0] ?? vessel.alternative.costImplication}
          </div>
        )}
      </Section>

      {/* Port compatibility */}
      <Section title={`Port Compatibility — ${port.selected.name}`} icon={Anchor}>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Field label="Congestion" value={`${port.selected.congestion}% (${port.selected.congestionLabel})`} />
          <Field label="Waiting time" value={`${port.selected.waitingTime} d → ${port.selected.waitingTimeProjected} d`} />
          <Field label="Max draft" value={`${port.selected.maxDraft} m`} />
          <Field label="Max LOA" value={`${port.selected.maxLOA} m`} />
          <Field
            label="Berths available"
            value={`${port.selected.berthsAvailable} / ${port.selected.totalBerths}`}
          />
          <Field
            label="Handling capacity"
            value={`${formatNumber(port.selected.cargoHandlingCapacity)} tonnes/day`}
          />
          <Field label="Suitable vessels" value={port.selected.suitableVessels.join(", ")} />
          <Field label="Feasibility score" value={`${port.selected.score}/100`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <RiskBadge level={port.selected.riskLevel} label={`${port.selected.riskLevel} risk`} />
          <StatusBadge
            status={port.selected.status}
            tone={port.selected.status === "Compatible" ? "green" : port.selected.status === "Conditional" ? "amber" : "red"}
          />
        </div>
      </Section>

      {/* Route details */}
      <Section title="Route Details & Comparison" icon={Route}>
        <DataTable columns={routeColumns} data={route.all} rowKey={(r) => r.id} dense />
      </Section>

      {/* Total cost + savings */}
      <Section title="Total Cost & Savings Analysis" icon={PiggyBank}>
        <CostBreakdown
          items={cost.items.map((i) => ({ key: i.key, name: i.name, value: i.perVoyage }))}
          total={cost.totalPerVoyage}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
          <span className="text-secondary">
            All-in programme cost:{" "}
            <span className="font-semibold text-primary">{formatUSD(cost.totalProgram)}</span>
          </span>
          <span className={saving ? "text-good" : "text-warn"}>
            {saving ? "Savings" : "Certainty premium"}: {saving ? "−" : "+"}
            {formatUSD(Math.abs(savings.savings))} vs {savings.baselineLabel.toLowerCase()} (
            {savings.savingsPercent.toFixed(1)}%)
          </span>
        </div>
      </Section>

      {/* Risk assessment */}
      <Section title="Risk Assessment" icon={ShieldAlert}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <RiskBadge level={risk.level} label={`Overall: ${risk.level} (${risk.score}/100)`} />
          {risk.keyDrivers.slice(0, 3).map((d) => (
            <span key={d} className="rounded-md bg-panel px-2 py-0.5 text-[10.5px] text-secondary">
              {d}
            </span>
          ))}
        </div>
        <DataTable columns={riskColumns} data={risk.components} rowKey={(r) => r.key} dense />
      </Section>

      {/* Contract strategy comparison */}
      <Section title="Contract Strategy Comparison" icon={ScrollText}>
        <DataTable columns={strategyColumns} data={strategies} rowKey={(s) => s.key} dense />
      </Section>

      <p className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[11px] text-secondary">
        <CheckSquare className="size-3.5 text-accent" />
        Generated by the OceanIQ deterministic cost engine from {analysis.model.modelName} over reference data as of{" "}
        {formatDate(analysis.referenceAsOf)} <CalendarDays className="size-3.5" /> {report.date}
      </p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Ship;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-accent" />
        <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-primary">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-secondary">{label}</span>
      <span className="truncate text-[12.5px] font-medium text-primary">{value}</span>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-secondary">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold ${good ? "text-good" : "text-primary"}`}>{value}</div>
    </div>
  );
}