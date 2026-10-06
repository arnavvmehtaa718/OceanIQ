"use client";

import { Bell, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RiskBadge from "@/components/ui/RiskBadge";
import LoadingState from "@/components/ui/LoadingState";
import RiskGauge from "@/components/domain/RiskGauge";
import AlertCard from "@/components/domain/AlertCard";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useAppStore } from "@/store/useAppStore";
import type { RiskComponent } from "@/lib/types";

export default function RiskPage() {
  const { analysis, isLoading, error } = useAnalysis();
  const pushToast = useAppStore((s) => s.pushToast);

  if (isLoading) return <LoadingState full label="Scoring risk across the pipeline…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { risk, alerts, scenario } = analysis;

  const mitigations = risk.mitigations.map((m) => ({ mitigation: m }));

  const columns: Column<RiskComponent>[] = [
    {
      header: "Risk Category",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span
            className={`grid size-7 place-items-center rounded-md ${
              r.level === "High" ? "bg-bad/12 text-bad" : r.level === "Medium" ? "bg-warn/12 text-warn" : "bg-good/12 text-good"
            }`}
          >
            <ShieldAlert className="size-3.5" />
          </span>
          <div>
            <div className="font-medium text-primary">{r.label}</div>
            <div className="text-[10px] text-secondary">weight {Math.round(r.weight * 100)}%</div>
          </div>
        </div>
      ),
    },
    {
      header: "Severity",
      render: (r) => <RiskBadge level={r.level} label={r.level} />,
    },
    {
      header: "Score",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${r.level === "High" ? "bg-bad" : r.level === "Medium" ? "bg-warn" : "bg-good"}`}
              style={{ width: `${r.score}%` }}
            />
          </div>
          <span className="w-6 text-right text-primary">{r.score}</span>
        </div>
      ),
    },
    {
      header: "Driver",
      render: (r) => <span className="text-[11.5px] text-secondary">{r.driver}</span>,
    },
    {
      header: "Mitigation",
      render: (r) => (
        <button
          onClick={() =>
            pushToast({
              kind: "info",
              title: r.mitigation,
              description: `Advisory queued for "${r.label}".`,
            })
          }
          className="inline-flex items-center gap-1.5 text-left text-[12px] font-medium text-accent transition-colors hover:text-primary"
        >
          <CheckCircle2 className="size-3.5 shrink-0" /> {r.mitigation}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Risk & Alerts"
        subtitle={`Quantified risk posture for the ${scenario.quantity.toLocaleString()} t ${scenario.cargo} programme, with the advisories the pipeline raised.`}
        right={
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] font-medium text-warn">
            <Bell className="size-4" />
            {alerts.filter((a) => a.status === "New").length} new alerts
          </span>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div>
          <ChartCard title="Programme Risk Score" subtitle="Weighted composite of the components below">
            <div className="flex justify-center">
              <RiskGauge score={risk.score} />
            </div>
            <p className="mt-3 rounded-lg border border-line bg-panel p-3 text-[11.5px] leading-relaxed text-secondary">
              {risk.label}
            </p>
            <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/5 p-3 text-[11.5px] leading-relaxed text-secondary">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warn" />
              <span>{risk.caveat}</span>
            </div>
          </ChartCard>
        </div>

        <div>
          <ChartCard title="Key Risk Drivers" subtitle="Highest weighted contributions to the score">
            <div className="space-y-2">
              {risk.keyDrivers.map((d) => (
                <div key={d} className="flex items-start gap-2.5 rounded-lg border border-line bg-panel px-3 py-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="text-[12.5px] text-primary">{d}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="xl:row-span-2">
          <ChartCard title="Advisories" subtitle="Raised by the pipeline for this scenario">
            {alerts.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-secondary">
                No advisory thresholds were crossed for this scenario. That is a modelled result, not a
                clearance: the weighted components above still apply, and {risk.mitigations.length} standing
                mitigation(s) remain in force.
              </p>
            ) : (
              <div className="space-y-2.5">
                {alerts.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    onAction={(alert) =>
                      pushToast({
                        kind: "warning",
                        title: alert.action,
                        description: `Advisory queued for "${alert.title}".`,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </ChartCard>
        </div>

        <div className="xl:col-span-2">
          <ChartCard title="Risk Matrix" subtitle="Score, weight, driver and mitigation per component">
            <DataTable columns={columns} data={risk.components} rowKey={(r) => r.key} />
          </ChartCard>
        </div>
      </div>

      {mitigations.length > 0 && (
        <div className="mt-4">
          <ChartCard title="Standing Mitigations" subtitle="Applied regardless of the current score">
            <ul className="space-y-1.5">
              {risk.mitigations.map((m) => (
                <li key={m} className="text-[12.5px] leading-relaxed text-secondary">
                  · {m}
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      )}
    </div>
  );
}