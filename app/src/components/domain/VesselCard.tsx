"use client";

import { AlertTriangle, CheckCircle2, Clock, Star, XCircle } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatNumber, formatUSD } from "@/lib/format";
import type { VesselEvaluation } from "@/lib/types";

interface VesselCardProps {
  vessel: VesselEvaluation;
  onSelect?: (vessel: VesselEvaluation) => void;
  selected?: boolean;
}

const compatIcon = {
  Pass: CheckCircle2,
  Restricted: AlertTriangle,
  Fail: XCircle,
};

export default function VesselCard({ vessel, onSelect, selected }: VesselCardProps) {
  const Icon = compatIcon[vessel.portCompatibility];
  const isRecommended = vessel.recommended;

  return (
    <div
      onClick={() => onSelect?.(vessel)}
      className={`relative flex flex-col gap-3 rounded-xl border p-4 transition-all ${
        selected
          ? "border-accent bg-card shadow-lg shadow-blue-nav/20"
          : "border-line bg-card hover:border-accent/50"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      {isRecommended && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-good py-0.5 pl-1.5 pr-2 text-[10px] font-semibold text-emerald-950">
          <Star className="size-3 fill-emerald-950" />
          Recommended
        </span>
      )}
      {vessel.isStatedPreference && !isRecommended && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold text-secondary">
          Stated preference
        </span>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-primary">{vessel.type}</h3>
          <p className="text-[11px] text-secondary">
            {vessel.dwtLabel} · {formatNumber(vessel.payload)} t payload
          </p>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-semibold text-primary">
            {formatUSD(vessel.impliedDailyRate)}
            <span className="text-[10px] font-normal text-secondary">/day</span>
          </div>
          <div className="text-[10px] text-secondary">implied, corridor</div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon
            className={`size-4 ${
              vessel.portCompatibility === "Pass"
                ? "text-good"
                : vessel.portCompatibility === "Restricted"
                  ? "text-warn"
                  : "text-bad"
            }`}
          />
          <span className="text-[12px] text-secondary">Port compatibility</span>
        </div>
        <StatusBadge
          status={vessel.portCompatibility}
          tone={vessel.portCompatibility === "Pass" ? "green" : vessel.portCompatibility === "Restricted" ? "amber" : "red"}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-secondary">Recommendation score</span>
          <span className="font-semibold text-primary">{vessel.score}/100</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-good transition-all"
            style={{ width: `${vessel.score}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-secondary">
          <span>Parcel fit {vessel.compatibilityScore}/100</span>
          <span>{vessel.utilisationPercent}% utilisation</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-secondary">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" /> {vessel.availability} availability
        </span>
        <span>tightness {vessel.availabilityIndex}/100</span>
      </div>

      {onSelect && (
        <button
          type="button"
          className={`mt-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${
            selected
              ? "bg-accent/15 text-accent"
              : "border border-line text-secondary hover:border-accent/50 hover:text-accent"
          }`}
        >
          {selected ? "Selected" : "Inspect"}
        </button>
      )}
    </div>
  );
}