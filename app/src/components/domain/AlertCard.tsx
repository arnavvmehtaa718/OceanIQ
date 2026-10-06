"use client";

import { ArrowUpRight, Bell, MapPin } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Alert } from "@/lib/types";

interface AlertCardProps {
  alert: Alert;
  onAction?: (alert: Alert) => void;
}

export default function AlertCard({ alert, onAction }: AlertCardProps) {
  const severityTone: "red" | "amber" | "green" =
    alert.severity === "High" ? "red" : alert.severity === "Medium" ? "amber" : "green";
  // Static class strings: Tailwind cannot see interpolated class names.
  const iconClass =
    severityTone === "red"
      ? "bg-bad/15 text-bad"
      : severityTone === "amber"
        ? "bg-warn/15 text-warn"
        : "bg-good/15 text-good";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3.5 transition-colors hover:border-accent/40">
      <div className="flex items-center gap-2">
        <span className={`grid size-7 shrink-0 place-items-center rounded-md ${iconClass}`}>
          <Bell className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-[13px] font-semibold text-primary">{alert.title}</h4>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-secondary">
            {alert.location && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="size-3" />
                {alert.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={alert.severity} tone={severityTone} />
          <StatusBadge status={alert.status} />
        </div>
      </div>
      <p className="text-[12px] leading-snug text-secondary">{alert.description}</p>
      {alert.action && (
        <p className="text-[11.5px] text-secondary">
          <span className="font-medium text-primary">Action: </span>
          {alert.action}
        </p>
      )}
      {onAction && (
        <button
          onClick={() => onAction(alert)}
          className="inline-flex w-fit items-center gap-1 text-[11.5px] font-medium text-accent transition-colors hover:text-primary"
        >
          Mark reviewed
          <ArrowUpRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}