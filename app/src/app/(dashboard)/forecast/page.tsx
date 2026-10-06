"use client";

import { useMemo } from "react";
import { CalendarClock, Gauge, Lightbulb, Radar, TrendingDown, TrendingUp } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import ChartCard from "@/components/ui/ChartCard";
import LoadingState from "@/components/ui/LoadingState";
import ForecastChart, { toChartPoints } from "@/components/domain/ForecastChart";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatDate, formatPercent, formatUSD } from "@/lib/format";

export default function ForecastPage() {
  const { analysis, isLoading, error } = useAnalysis();

  const chartPoints = useMemo(() => {
    if (!analysis) return [];
    return toChartPoints(
      analysis.forecast.recentHistory,
      analysis.forecast.forecastRates,
      analysis.forecast.recommendedCharterWeek,
    );
  }, [analysis]);

  if (isLoading) return <LoadingState full label="Running the forecast model…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { forecast, charterTiming, scenario, model } = analysis;
  const { laneResolution } = forecast;
  const rising = forecast.trend === "Increasing";
  const charterPoint = forecast.forecastRates[forecast.recommendedCharterWeek - 1];

  return (
    <div>
      <PageHeader
        title="Freight Rate Forecast"
        subtitle={`${laneResolution.vesselType} ${laneResolution.cargoType} on the ${laneResolution.loadingPort} → ${laneResolution.dischargePort} corridor, ${forecast.forecastHorizonWeeks}-week horizon with model uncertainty bands.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Reference Rate"
          value={formatUSD(forecast.currentRate)}
          sub={`as of ${formatDate(analysis.referenceAsOf)}`}
          icon={TrendingUp}
          changeText={formatPercent(forecast.weeklyChange) + " w/w"}
        />
        <KpiCard
          label="Predicted · 30d"
          value={formatUSD(forecast.predictedRate30d)}
          sub="model expectation"
          icon={Gauge}
          tone="amber"
          changeText={formatPercent(forecast.forecastChange30d) + " forecast"}
        />
        <KpiCard
          label="Forecast Confidence"
          value={`${forecast.confidence}%`}
          sub={`${model.library} · ${model.nFeatures} features`}
          icon={Radar}
          tone="default"
        />
        <KpiCard
          label="Timing Signal"
          value={charterTiming.recommendation}
          sub={charterTiming.windowLabel}
          icon={CalendarClock}
          tone={charterTiming.recommendation === "Charter now" ? "green" : charterTiming.recommendation === "Wait" ? "amber" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title={`Rate Outlook — ${forecast.forecastHorizonWeeks} weeks`}
            subtitle="Solid line: model point forecast · shaded band: 80% prediction interval"
            right={
              <span className="rounded-md border border-line px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-secondary">
                {forecast.trend} {forecast.trendStrength}%
              </span>
            }
          >
            <ForecastChart
              data={chartPoints}
              height={340}
              charterWeek={forecast.recommendedCharterWeek}
            />
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard title="Forecast Summary" subtitle="What the model expects">
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-secondary">
                Rates are expected to move{" "}
                <span className={`font-semibold ${rising ? "text-warn" : "text-good"}`}>
                  {rising ? "up" : "down"} {Math.abs(forecast.forecastChange30d)}%
                </span>{" "}
                over 30 days, from{" "}
                <span className="text-primary">{formatUSD(forecast.currentRate)}</span> to{" "}
                <span className="text-primary">{formatUSD(forecast.predictedRate30d)}</span> per day,
                and {formatPercent(forecast.forecastChange90d)} over 90 days. The path bottoms at{" "}
                <span className="text-primary">{formatUSD(forecast.bestRate)}</span> in week{" "}
                {forecast.bestWeek}.
              </p>
              <div className="space-y-2 border-t border-line pt-3">
                <Row label="Recommended charter week" value={`Week ${forecast.recommendedCharterWeek} · ${formatDate(charterPoint?.date ?? analysis.referenceAsOf)}`} />
                <Row label="Rate in that week" value={formatUSD(charterPoint?.rate ?? forecast.currentRate)} />
                <Row label="80% band that week" value={`${formatUSD(charterPoint?.lower ?? 0)}–${formatUSD(charterPoint?.upper ?? 0)}`} />
                <Row label="Timing signal" value={charterTiming.recommendation} />
              </div>
              <div className="border-t border-line pt-3 text-[11px] leading-relaxed text-secondary">
                <span className="font-medium text-primary">Lane: </span>
                {laneResolution.lane}
                {!laneResolution.exact && <span className="text-warn"> — {laneResolution.adjustment}</span>}
              </div>
            </div>
          </ChartCard>

          <div
            className={`rounded-xl border p-4 ${
              charterTiming.recommendation === "Charter now"
                ? "border-good/30 bg-good/5"
                : charterTiming.recommendation === "Wait"
                  ? "border-warn/30 bg-warn/5"
                  : "border-line bg-card"
            }`}
          >
            <div
              className={`mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                charterTiming.recommendation === "Charter now"
                  ? "bg-good/15 text-good"
                  : charterTiming.recommendation === "Wait"
                    ? "bg-warn/15 text-warn"
                    : "bg-accent/12 text-accent"
              }`}
            >
              <Lightbulb className="size-3.5" /> Suggested action
            </div>
            <h3 className="text-[14px] font-semibold text-primary">
              {charterTiming.recommendation === "Charter now"
                ? "Fix within the current window"
                : charterTiming.recommendation === "Wait"
                  ? `Wait for the week-${forecast.recommendedCharterWeek} window`
                  : "Monitor; no clear timing edge"}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
              {charterTiming.rationale.join(" ")}
            </p>
            <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[11.5px]">
              <Row label="Cost of waiting (per voyage)" value={formatUSD(charterTiming.costOfWaitingPerVoyage)} />
              <Row label="Cost of waiting (programme)" value={formatUSD(charterTiming.costOfWaitingProgram)} />
              <Row label="Programme size" value={`${scenario.voyages} voyages · ${analysis.totalQuantity.toLocaleString()} t`} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ChartCard
          title="What Is Driving The Forecast"
          subtitle="Model feature importance with scenario-local sensitivity"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {forecast.majorFactors.map((f) => {
              const bull = f.direction === "up";
              const bear = f.direction === "down";
              return (
                <div key={f.feature} className="rounded-lg border border-line bg-panel p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-primary">{f.label}</span>
                    {bull ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                        <TrendingUp className="size-3" /> Bullish
                      </span>
                    ) : bear ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-good/10 px-1.5 py-0.5 text-[10px] font-medium text-good">
                        <TrendingDown className="size-3" /> Bearish
                      </span>
                    ) : (
                      <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        Neutral
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.min(100, f.importance * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-secondary">
                    <span>Global importance {(f.importance * 100).toFixed(1)}%</span>
                    <span className={f.sensitivity >= 0 ? "text-warn" : "text-good"}>
                      {f.sensitivity >= 0 ? "+" : ""}
                      {formatUSD(f.sensitivity, true)}/day per probe step
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-secondary">
            Global importance is the forest&apos;s own impurity-based score. Sensitivity is scenario-local: the
            USD/day change the model produces when this feature alone is moved one probe step from the current
            scenario. They measure different things and are shown separately for that reason.
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-semibold text-primary">{value}</span>
    </div>
  );
}