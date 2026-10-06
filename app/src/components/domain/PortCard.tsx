"use client";

import { Anchor, Clock, Gauge, Ship, Waves } from "lucide-react";
import RiskBadge from "@/components/ui/RiskBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { PortCompatibility } from "@/lib/types";

interface PortCardProps {
  port: PortCompatibility;
  selected?: boolean;
  onSelect?: (port: PortCompatibility) => void;
}

export default function PortCard({ port, selected, onSelect }: PortCardProps) {
  const congestion = port.congestion;
  const barClass = congestion >= 60 ? "bg-bad" : congestion >= 45 ? "bg-warn" : "bg-good";

  return (
    <div
      onClick={() => onSelect?.(port)}
      className={`rounded-xl border p-4 transition-all ${
        selected
          ? "border-accent bg-card shadow-lg shadow-blue-nav/20"
          : "border-line bg-card hover:border-accent/50"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-primary">{port.name}</h3>
          <p className="text-[11px] text-secondary">
            {port.state} · scored {port.score}/100
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RiskBadge level={port.riskLevel} />
          <StatusBadge
            status={port.status}
            tone={port.status === "Compatible" ? "green" : port.status === "Conditional" ? "amber" : "red"}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-secondary">
            <Gauge className="size-3.5" /> Congestion
          </span>
          <span className="font-semibold text-primary">
            {congestion}% · {port.congestionLabel}
            {port.congestionTrend !== 0 && (
              <span className={port.congestionTrend > 0 ? "text-warn" : "text-good"}>
                {" "}
                ({port.congestionTrend > 0 ? "+" : ""}
                {port.congestionTrend})
              </span>
            )}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${congestion}%` }} />
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-secondary">
            <Clock className="size-3.5" /> Waiting time
          </span>
          <span className="font-medium text-primary">
            {port.waitingTime} d now → {port.waitingTimeProjected} d projected
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-panel p-3 text-center">
        <div>
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-secondary">
            <Waves className="size-3" /> Draft
          </div>
          <div className="text-[13px] font-semibold text-primary">{port.maxDraft}m</div>
        </div>
        <div>
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-secondary">
            <Ship className="size-3" /> LOA
          </div>
          <div className="text-[13px] font-semibold text-primary">{port.maxLOA}m</div>
        </div>
        <div>
          <div className="inline-flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-secondary">
            <Anchor className="size-3" /> Berths
          </div>
          <div className="text-[13px] font-semibold text-primary">
            {port.berthsAvailable}/{port.totalBerths}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10.5px] text-secondary">
        <span>Handles {(port.cargoHandlingCapacity / 1000).toFixed(0)}K t/day</span>
        <span className="truncate pl-2">{port.suitableVessels.join(", ")}</span>
      </div>

      <div className="mt-1 text-[10.5px] text-secondary">
        {formatNumber(port.berthUtilisationPercent)}% berth occupancy modelled
      </div>
    </div>
  );
}