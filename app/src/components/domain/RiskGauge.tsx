"use client";

import type { RiskLevel } from "@/lib/types";

function riskLevelOf(score: number): RiskLevel {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

interface RiskGaugeProps {
  score: number;
  label?: string;
  size?: number;
}

function colorFor(score: number): string {
  if (score >= 70) return "#ef4444";
  if (score >= 45) return "#f59e0b";
  return "#10b981";
}

export default function RiskGauge({ score, label = "Overall Risk Score", size = 200 }: RiskGaugeProps) {
  const color = colorFor(score);
  const level = riskLevelOf(score);
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          style={{
            transition: "stroke-dasharray 500ms ease, stroke 300ms ease",
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      </svg>
      <div className="-mt-[110px] mb-[110px] flex h-0 flex-col items-center justify-center gap-0.5 text-center">
        <div className="text-[32px] font-bold leading-8" style={{ color }}>
          {score}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-secondary">/ 100</div>
      </div>
      <div className="text-center">
        <div className="text-[12px] font-medium text-primary">{label}</div>
        <div
          className="mt-0.5 text-[11px] font-semibold"
          style={{ color }}
        >
          {level} risk
        </div>
      </div>
      <div className="flex w-full justify-between text-[10px] text-secondary/80">
        <span className="text-good">Low</span>
        <span className="text-warn">Medium</span>
        <span className="text-bad">High</span>
      </div>
    </div>
  );
}