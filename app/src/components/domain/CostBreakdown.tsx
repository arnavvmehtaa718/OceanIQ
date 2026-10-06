"use client";

import { formatUSD } from "@/lib/format";

export interface BreakdownItem {
  key: string;
  name: string;
  value: number;
}

const KEY_COLORS: Record<string, string> = {
  freight: "#3b82f6",
  fuel: "#f59e0b",
  portCharges: "#10b981",
  demurrage: "#ef4444",
  repositioning: "#8b5cf6",
  riskBuffer: "#14b8a6",
};

interface CostBreakdownProps {
  items: BreakdownItem[];
  total?: number;
}

export default function CostBreakdown({ items, total }: CostBreakdownProps) {
  const resolvedTotal = total ?? items.reduce((sum, i) => sum + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel">
        {items.map((i) => (
          <div
            key={i.key}
            title={`${i.name}: ${formatUSD(i.value)}`}
            style={{
              width: `${(i.value / resolvedTotal) * 100}%`,
              background: KEY_COLORS[i.key] ?? "#8899bb",
            }}
          />
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.key} className="flex items-center gap-3">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: KEY_COLORS[i.key] ?? "#8899bb" }}
            />
            <span className="w-36 shrink-0 text-[12px] text-secondary">{i.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{ width: `${(i.value / max) * 100}%`, background: KEY_COLORS[i.key] ?? "#8899bb" }}
              />
            </div>
            <span className="w-24 text-right text-[12px] font-medium text-primary">
              {formatUSD(i.value)}
            </span>
            <span className="w-10 text-right text-[11px] text-secondary">
              {resolvedTotal ? ((i.value / resolvedTotal) * 100).toFixed(1) : "0"}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}