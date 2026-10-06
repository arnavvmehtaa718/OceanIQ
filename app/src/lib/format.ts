/**
 * OceanIQ — formatting helpers for the screens.
 *
 * Deliberately separate from the engine: the engine rounds for arithmetic
 * stability, these format for reading. Every currency figure on screen carries
 * its basis in the surrounding copy, so nothing here implies a live quote.
 */

export function formatUSD(n: number, compact = false): string {
  const abs = Math.abs(n);
  if (compact && abs >= 1000) {
    const k = abs / 1000;
    const digits = k >= 100 ? 0 : 1;
    return `${n < 0 ? "-" : ""}$${k.toFixed(digits)}k`;
  }
  return `${n < 0 ? "-" : ""}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function formatUSDExact(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Signed percentage, e.g. `+2.4%` / `-1.1%`. */
export function formatPercent(n: number, digits = 1): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatWeekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatDuration(days: number): string {
  return `${days.toFixed(1)} days`;
}

/**
 * INR at the same fixed reference rate the savings engine uses. The rate is a
 * modelling constant, so every INR figure on screen states its USD basis.
 */
export function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}