"use client";

import { useState } from "react";
import { Anchor, Waves } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingState from "@/components/ui/LoadingState";
import VesselCard from "@/components/domain/VesselCard";
import { useAnalysis } from "@/hooks/useAnalysis";
import { formatNumber, formatUSD } from "@/lib/format";
import { VESSEL_REFERENCE } from "@/lib/reference/corridors";
import type { PortConstraintCheck, VesselEvaluation } from "@/lib/types";

export default function VesselsPage() {
  const { analysis, isLoading, error } = useAnalysis();
  const [inspected, setInspected] = useState<string | null>(null);

  if (isLoading) return <LoadingState full label="Screening vessel classes…" />;
  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-bad/40 bg-card p-5">
        <h2 className="text-[15px] font-semibold text-primary">Analysis unavailable</h2>
        <p className="mt-1 text-[12.5px] text-secondary">{error ?? "No result returned."}</p>
      </div>
    );
  }

  const { vessel, port, scenario } = analysis;
  const selected =
    vessel.all.find((v) => v.type === inspected) ?? vessel.primary;

  const columns: Column<VesselEvaluation>[] = [
    {
      header: "Vessel",
      render: (v) => (
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-primary">{v.type}</span>
          <span className="text-[10px] text-secondary">{v.dwtLabel}</span>
          {v.recommended && (
            <span className="rounded bg-good/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-good">
              Recommended
            </span>
          )}
          {v.portCompatibility === "Fail" && (
            <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-bad">
              No berth
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Payload",
      align: "right",
      render: (v) => <span className="text-primary">{formatNumber(v.payload)} t</span>,
    },
    {
      header: "Parcel fit",
      align: "right",
      render: (v) => (
        <span className="text-primary">
          {v.utilisationPercent}% · {Math.ceil(scenario.quantity / v.payload)}{" "}
          {Math.ceil(scenario.quantity / v.payload) > 1 ? "voyages" : "voyage"}
        </span>
      ),
    },
    {
      header: "Implied rate",
      align: "right",
      render: (v) => <span className="text-primary">{formatUSD(v.impliedDailyRate)}/day</span>,
    },
    {
      header: "Availability",
      render: (v) => (
        <StatusBadge
          status={v.availability}
          tone={v.availability === "High" ? "green" : v.availability === "Medium" ? "amber" : "red"}
        />
      ),
    },
    {
      header: port.selected.name,
      render: (v) => (
        <StatusBadge
          status={v.portCompatibility}
          tone={v.portCompatibility === "Pass" ? "green" : v.portCompatibility === "Restricted" ? "amber" : "red"}
        />
      ),
    },
    {
      header: "Score",
      align: "right",
      render: (v) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${v.portCompatibility === "Fail" ? "bg-bad" : v.score >= 70 ? "bg-good" : v.score >= 40 ? "bg-warn" : "bg-bad"}`}
              style={{ width: `${v.score}%` }}
            />
          </div>
          <span className="w-6 text-right text-primary">{v.score}</span>
        </div>
      ),
    },
  ];

  const checkColumns: Column<PortConstraintCheck>[] = [
    {
      header: "Constraint",
      render: (c) => (
        <div>
          <div className="font-medium text-primary">{c.name}</div>
        </div>
      ),
    },
    {
      header: "Required",
      align: "right",
      render: (c) => <span className="text-secondary">{c.required} {c.unit}</span>,
    },
    {
      header: `${port.selected.name} limit`,
      align: "right",
      render: (c) => <span className="text-secondary">{c.limit} {c.unit}</span>,
    },
    {
      header: "Margin",
      align: "right",
      render: (c) => (
        <span className={c.margin >= 0 ? "text-good" : "text-bad"}>
          {c.margin >= 0 ? "+" : ""}
          {c.margin} {c.unit}
        </span>
      ),
    },
    {
      header: "Status",
      render: (c) => (
        <StatusBadge
          status={c.status}
          tone={c.status === "Pass" ? "green" : c.status === "Restricted" ? "amber" : "red"}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Vessel Recommendation"
        subtitle={`Fleet screening against ${port.selected.name} constraints for a ${formatNumber(scenario.quantity)} t ${scenario.cargo} parcel.`}
      />

      <div className="grid gap-4 pt-2 md:grid-cols-2 xl:grid-cols-4">
        {vessel.all.map((v) => (
          <VesselCard
            key={v.type}
            vessel={v}
            selected={selected.type === v.type}
            onSelect={(next) => setInspected(next.type)}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title={`${port.selected.name} Constraint Check`}
            subtitle="Every vessel against the port's hard physical limits and its handling rate"
          >
            <DataTable columns={checkColumns} data={port.selected.checks} rowKey={(c) => c.name} />
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard
            title="Selected Charter"
            subtitle={`${selected.type} · ${selected.dwtLabel}`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-line bg-panel p-3">
                <span className="text-[12px] text-secondary">Recommendation score</span>
                <span className="text-[15px] font-semibold text-primary">{selected.score}/100</span>
              </div>
              <div className="space-y-2 text-[12px]">
                <Row label="Implied rate" value={`${formatUSD(selected.impliedDailyRate)}/day`} />
                <Row label="Reference daily rate" value={`${formatUSD(selected.costPerDay)}/day`} />
                <Row label="Payload" value={`${formatNumber(selected.payload)} t`} />
                <Row
                  label="Parcel lift"
                  value={`${formatNumber(selected.utilisationTonnes)} t (${selected.utilisationPercent}%)`}
                />
                <Row
                  label="Draft margin"
                  value={`${selected.draftMargin >= 0 ? "+" : ""}${selected.draftMargin} m`}
                />
                <Row
                  label="LOA margin"
                  value={`${selected.loaMargin >= 0 ? "+" : ""}${selected.loaMargin} m`}
                />
                <Row
                  label="Beam margin"
                  value={`${selected.beamMargin >= 0 ? "+" : ""}${selected.beamMargin} m`}
                />
              </div>
              <div className="border-t border-line pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                  <Anchor className="size-3.5" /> Cost implication
                </div>
                <p className="text-[12px] leading-relaxed text-primary">{selected.costImplication}</p>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Why This Class" subtitle="Engine reasoning, verbatim">
            <ul className="space-y-1.5">
              {selected.reasons.map((r) => (
                <li key={r} className="text-[12px] leading-relaxed text-secondary">
                  · {r}
                </li>
              ))}
            </ul>
            {selected.blockers.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bad">
                  Blockers
                </div>
                <ul className="space-y-1.5">
                  {selected.blockers.map((b) => (
                    <li key={b} className="text-[12px] leading-relaxed text-bad">
                      · {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ChartCard>

          <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5 text-[11.5px] leading-relaxed text-secondary">
            <Waves className="mt-0.5 size-4 shrink-0 text-accent" />
            <p>
              Draft, LOA and beam are treated as hard limits — failing any one means the vessel cannot berth.
              Cargo handling is a soft constraint: a slow rate costs working days and demurrage, not access.
              A parcel larger than the hull payload is shown as multiple voyages with the added waiting and
              stevedoring exposure priced in, rather than being silently rounded away.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ChartCard title="Vessel Comparison" subtitle="Payload, parcel fit, cost, availability and score">
          <DataTable columns={columns} data={vessel.all} rowKey={(v) => v.type} />
        </ChartCard>
      </div>

      <p className="mt-4 rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-secondary">
        Vessel specifications ({Object.keys(VESSEL_REFERENCE).join(", ")}) come from the reference layer, not from
        live class indices. Implied rates are the model&apos;s forecast for this class on this corridor.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-secondary">{label}</span>
      <span className="text-primary">{value}</span>
    </div>
  );
}