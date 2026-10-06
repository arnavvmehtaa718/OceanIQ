/**
 * OceanIQ — shared deterministic helpers used by every decision engine.
 *
 * Nothing here is random. Given the same scenario, the same forecast and the
 * same reference data, these functions always return the same number.
 */

import type { RiskLevel } from "@/lib/types";

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function round1(n: number): number {
  return round(n, 1);
}

export function round2(n: number): number {
  return round(n, 2);
}

export function roundMoney(n: number): number {
  return Math.round(n);
}

export function riskLevelOf(score: number): RiskLevel {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

export function levelOfScore(score: number): RiskLevel {
  return riskLevelOf(score);
}

/** Linear interpolation helper. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Maps a value from one range to another, clamped at both ends. */
export function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return clamp(outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Deterministic 32-bit FNV-1a hash, used to build a stable scenario id. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Formats a USD amount compactly, e.g. $1.24M. */
export function formatUSD(value: number, compact = false): string {
  const abs = Math.abs(value);
  if (compact) {
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatINR(value: number): string {
  return `\u20B9${(value / 10_000_000).toFixed(2)} Cr`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSigned(value: number, digits = 1): string {
  const v = round(value, digits);
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}