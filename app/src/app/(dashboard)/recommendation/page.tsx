"use client";

import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Download,
  FileDown,
  FileSignature,
  Gauge,
  MapPin,
  Route as RouteIcon,
  ScrollText,
  ShieldCheck,
  Ship,
  Sparkles,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import ChartCard from "@/components/ui/ChartCard";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useAppStore } from "@/store/useAppStore";
import { formatINR, formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { RecommendationBlock } from "@/lib/types";

export default function RecommendationPage() {
  const router = useRouter();
  const pushToast = useAppStore((s) => s.pushToast);
  const addReport = useAppStore((s) => s.addReport);
  const reports = useAppStore((s) => s.reports);
  const { analysis, isLoading, error } = useAnalysis();

  const handleGenerateReport = async () => {
    const report = await addReport(
      "PDF",
      [
        "Freight forecast",
        "Vessel compatibility",
        "Port congestion",
        "Route comparison",
        "Contract strategy",
        "Risk matrix",
      ],
      "Full Decision Brief",
    );
    if (!report) {
      pushToast({
        kind: "warning",
        title: "Report failed",
        description: "The analysis could not be produced, so no report was created.",
      });
      return;
    }
    pushToast({
      kind: "success",
      title: "Report generated",
      description: `${report.name} (${report.cargo} · ${formatNumber(report.quantity)} t) · ${report.route}`,
    });
    router.push(`/reports/${report.id}`);
  };

  if (isLoading) return <LoadingState full label="Composing the decision brief…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { scenario, cost, savings, forecast, risk, vessel, port, route, charterTiming } = analysis;
  const rec = analysis.recommendation;
  const strategy = analysis.selectedStrategy;
  const saving = savings.savings >= 0;
  const routeLabel = `${route.selected.loadingPort} → ${route.selected.dischargePort}`;
  void charterTiming.waitDays;

  return (
    <div>
      <PageHeader
        title="Final Decision · Recommendation"
        subtitle={`NauNiti decision brief for ${scenario.cargo} · ${formatNumber(analysis.totalQuantity)} t · ${routeLabel} · ${
          scenario.voyages
        } voyage${scenario.voyages === 1 ? "" : "s"}`}
        right={
          <span className="inline-flex items-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-[12.5px] font-semibold text-accent">
            <BadgeCheck className="size-4" />
            {forecast.confidence}% model confidence
          </span>
        }
      />

      {/* Decision statement */}
      <div className="rounded-2xl border border-accent/35 bg-gradient-to-br from-card to-panel p-5">
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          <Sparkles className="size-3.5" /> Recommended plan
        </div>
        <h2 className="mt-2 max-w-3xl text-[19px] font-semibold leading-snug text-primary">{rec.headline}</h2>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-secondary">{rec.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RiskBadge level={risk.level} label={`${risk.level} risk · ${risk.score}/100`} />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-secondary">
            <TimerReset className="size-3.5 text-accent" />
            {charterTiming.recommendation} · {charterTiming.windowLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-secondary">
            <Ship className="size-3.5 text-accent" /> {vessel.primary.type}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-secondary">
            <MapPin className="size-3.5 text-accent" /> {port.selected.name}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Expected Programme Cost"
          value={formatUSD(cost.totalProgram)}
          sub={`${scenario.voyages} voyage${scenario.voyages === 1 ? "" : "s"} all-in`}
          icon={Banknote}
          tone="blue"
        />
        <KpiCard
          label={saving ? "Savings vs Spot" : "Certainty Premium"}
          value={formatUSD(Math.abs(savings.savings))}
          sub={`${Math.abs(savings.savingsPercent).toFixed(1)}% ${saving ? "below" : "above"} ${
            savings.baselineLabel
          }`}
          icon={CheckCircle2}
          tone={saving ? "green" : "amber"}
        />
        <KpiCard
          label="Savings (INR)"
          value={formatINR(savings.savingsInr)}
          sub={`≈ ${formatUSD(Math.abs(savings.savings))} at the reference rate`}
          icon={ShieldCheck}
          tone={saving ? "green" : "amber"}
        />
        <KpiCard
          label="Risk Posture"
          value={risk.level}
          sub={`score ${risk.score}/100 · ${port.selected.name}`}
          icon={Gauge}
          tone={risk.level === "High" ? "red" : risk.level === "Medium" ? "amber" : "green"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* Plan components */}
        <div className="space-y-4 xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <PlanCard
              icon={Ship}
              label="Vessel"
              value={vessel.primary.type}
              sub={`${vessel.primary.dwtLabel} · ${vessel.primary.score}/100 · ${port.selected.name} ${
                vessel.primary.portCompatibility
              }`}
            />
            <PlanCard
              icon={RouteIcon}
              label="Route"
              value={route.selected.name}
              sub={`${formatNumber(route.selected.distance)} nm · ${route.selected.duration} days · ${route.selected.riskLevel} risk`}
            />
            <PlanCard
              icon={FileSignature}
              label="Contract"
              value={strategy.name}
              sub={`${formatUSDExact(strategy.costPerTonne)}/t · ${strategy.priceCertainty.toFixed(0)}% certainty · ${
                strategy.flexibility.toFixed(0)
              }% flexibility`}
              good
            />
          </div>

          <Block title="What we recommend" block={rec.what} icon={CheckCircle2} />
          <Block title="Why it wins" block={rec.why} icon={Gauge} />

          <ChartCard title="Traceable evidence" subtitle="Every claim links back to the engine that produced it">
            <ol className="space-y-2.5">
              {rec.evidence.map((e, i) => (
                <li key={`${e.source}-${i}`} className="flex items-start gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[12.5px] font-medium text-primary">{e.source}</span>
                    <span className="block text-[12px] leading-relaxed text-secondary">{e.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </ChartCard>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <ChartCard title="Approve & Export" subtitle="Complete the decision loop">
            <div className="space-y-2.5">
              <button
                onClick={() =>
                  pushToast({
                    kind: "success",
                    title: "Approved & queued for contracting",
                    description: `${vessel.primary.type} fixture on ${strategy.name} has been logged to your workspace.`,
                  })
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-good py-2.5 text-[12.5px] font-semibold text-emerald-950 transition-opacity hover:opacity-90"
              >
                <CheckCircle2 className="size-4" /> Approve &amp; Generate Contract
              </button>
              <button
                onClick={() =>
                  pushToast({
                    kind: "info",
                    title: "Decision brief queued for export",
                    description: "The export will be ready in Reports & Downloads.",
                  })
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-[12.5px] font-medium text-secondary transition-colors hover:border-accent/40 hover:text-primary"
              >
                <Download className="size-4" /> Download Decision Brief
              </button>
              <button
                onClick={handleGenerateReport}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-nav py-2.5 text-[12.5px] font-medium text-white transition-colors hover:bg-blue-glow"
              >
                <FileDown className="size-4" /> Generate Report
              </button>
              <button
                onClick={() => {
                  const latest = reports[0];
                  if (latest) router.push(`/reports/${latest.id}`);
                  else
                    pushToast({
                      kind: "info",
                      title: "No reports yet",
                      description: "Generate a report to preview it here.",
                    });
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-[12.5px] font-medium text-secondary transition-colors hover:border-accent/40 hover:text-primary"
              >
                <ScrollText className="size-4" /> View Report
              </button>
            </div>

            <div className="mt-3 space-y-1 rounded-lg border border-line bg-panel p-3 text-[11.5px] leading-relaxed text-secondary">
              <div className="mb-1.5 font-semibold text-primary">Decision summary</div>
              <p>• Programme cost: <span className="text-primary">{formatUSD(cost.totalProgram)}</span></p>
              <p>• Charter timing: <span className="text-primary">{charterTiming.recommendation} · {charterTiming.windowLabel}</span></p>
              <p>• Confidence: <span className="text-primary">{forecast.confidence}% ({forecast.confidenceLabel})</span></p>
              <p>
                • {saving ? "Savings" : "Premium"}:{" "}
                <span className={saving ? "text-good" : "text-warn"}>
                  {formatUSD(Math.abs(savings.savings))} / {formatINR(savings.savingsInr)}
                </span>
              </p>
              <p>• Scenario: <span className="text-primary">{analysis.scenarioId}</span></p>
            </div>
          </ChartCard>

          <Block title="Business impact" block={rec.impact} icon={Banknote} />

          {rec.watchOuts.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
              <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                <TriangleAlert className="size-4" /> Watch-outs
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {rec.watchOuts.map((w) => (
                  <li key={w} className="text-[11.5px] leading-relaxed text-secondary">
                    · {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-[11.5px] leading-relaxed text-secondary">
            <span className="font-semibold text-warn">Vigilance note:</span> re-validate before fixture if{" "}
            {port.selected.name} congestion crosses 70% or the 30-day freight forecast is revised above{" "}
            {forecast.forecastChange30d + 4 >= 10 ? "+" : ""}
            {(forecast.forecastChange30d + 4).toFixed(1)}%. Waiting {charterTiming.waitDays} days{" "}
            {charterTiming.costOfWaitingProgram > 0
              ? `costs ${formatUSD(charterTiming.costOfWaitingProgram)} in the modelled downside.`
              : "carries no modelled downside cost."}
          </div>

          <p className="rounded-xl border border-line bg-panel p-3 text-[10.5px] leading-relaxed text-secondary">
            {rec.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}

function Block({
  title,
  block,
  icon: Icon,
}: {
  title: string;
  block: RecommendationBlock;
  icon: typeof Ship;
}) {
  return (
    <ChartCard title={title} subtitle={block.summary}>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.items.map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-secondary">
              <Icon className="size-3 text-accent" />
              {item.label}
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-primary">{item.value}</div>
            {item.detail && (
              <div className="mt-0.5 text-[10.5px] leading-relaxed text-secondary">{item.detail}</div>
            )}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function PlanCard({
  icon: Icon,
  label,
  value,
  sub,
  good,
}: {
  icon: typeof Ship;
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${good ? "border-good/30 bg-good/5" : "border-line bg-card"}`}>
      <div
        className={`grid size-8 place-items-center rounded-lg ${good ? "bg-good/15 text-good" : "bg-accent/12 text-accent"}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-widest text-secondary">{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-primary">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-secondary">{sub}</div>
    </div>
  );
}