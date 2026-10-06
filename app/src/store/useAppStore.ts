"use client";

import { create } from "zustand";
import { DEFAULT_SCENARIO, type AnalysisResult, type ProcurementScenario } from "@/lib/types";

export interface GeneratedReport {
  id: number;
  name: string;
  route: string;
  cargo: string;
  quantity: number;
  voyages: number;
  origin: string;
  loadingPort: string;
  destinationPort: string;
  date: string;
  type: string;
  status: "READY";
  format: string;
  sections: string[];
  analysis: AnalysisResult;
}

function dateLabel(d: Date): string {
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

function buildReport(
  analysis: AnalysisResult,
  id: number,
  format: string,
  sections: string[],
  scope?: string,
  date = new Date(),
): GeneratedReport {
  const { scenario } = analysis;
  const name = scope || "Full Decision Brief";
  return {
    id,
    name,
    route: `${scenario.loadingPort} → ${scenario.dischargePort}`,
    cargo: scenario.cargo,
    quantity: scenario.quantity,
    voyages: scenario.voyages,
    origin: scenario.originCountry,
    loadingPort: scenario.loadingPort,
    destinationPort: scenario.dischargePort,
    date: dateLabel(date),
    type: name,
    status: "READY",
    format,
    sections,
    analysis,
  };
}

export type UserRole =
  | "Procurement Operator"
  | "Procurement Analyst"
  | "Risk Manager"
  | "Executive";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  kind: "success" | "info" | "warning";
}

export interface Settings {
  currency: "USD" | "INR";
  weightUnit: "Tonnes" | "Metric Tonnes";
  defaultCargo: string;
  defaultDestinationPort: string;
  defaultVessel: string;
  notificationDigest: boolean;
  alertsEnabled: boolean;
}

interface AppState {
  isAuthenticated: boolean;
  userName: string;
  userRole: UserRole;
  login: (name: string, role: UserRole) => void;
  logout: () => void;

  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;

  procurement: {
    scenario: ProcurementScenario;
    analysis: AnalysisResult | null;
  };
  isAnalysing: boolean;
  analysisError: string | null;
  /** Recomputes the analysis through the server pipeline. */
  runAnalysis: (partial?: Partial<ProcurementScenario>) => Promise<AnalysisResult>;
  /** Re-runs the current scenario, e.g. after a theme or settings change. */
  refreshAnalysis: () => Promise<AnalysisResult | null>;

  reports: GeneratedReport[];
  addReport: (format: string, sections: string[], scope?: string) => Promise<GeneratedReport | null>;

  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
}

let toastId = 1;

async function postScenario(scenario: ProcurementScenario): Promise<AnalysisResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Analysis failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const body = (await res.json()) as { analysis: AnalysisResult };
  return body.analysis;
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  userName: "",
  userRole: "Procurement Analyst",
  login: (userName, userRole) => set({ isAuthenticated: true, userName, userRole }),
  logout: () => set({ isAuthenticated: false, userName: "" }),

  theme: "dark",
  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== "undefined") {
      try {
        document.documentElement.classList.toggle("light", theme === "light");
        document.documentElement.style.colorScheme = theme;
        window.localStorage.setItem("oceaniq-theme", theme);
      } catch {
        /* ignore storage/security errors */
      }
    }
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  procurement: {
    scenario: DEFAULT_SCENARIO,
    analysis: null,
  },
  isAnalysing: false,
  analysisError: null,

  runAnalysis: async (partial) => {
    const scenario = { ...get().procurement.scenario, ...partial };
    set({ procurement: { scenario, analysis: get().procurement.analysis }, isAnalysing: true, analysisError: null });
    try {
      const analysis = await postScenario(scenario);
      set({ procurement: { scenario: analysis.scenario, analysis }, isAnalysing: false });
      return analysis;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      set({ isAnalysing: false, analysisError: message });
      throw err;
    }
  },

  refreshAnalysis: async () => {
    if (!get().procurement.analysis) return null;
    try {
      return await get().runAnalysis();
    } catch {
      return null;
    }
  },

  reports: [],
  addReport: async (format, sections, scope) => {
    let analysis = get().procurement.analysis;
    if (!analysis) {
      try {
        analysis = await get().runAnalysis();
      } catch {
        return null;
      }
    }
    const report = buildReport(analysis, get().reports.length + 1, format, sections, scope);
    set((s) => ({ reports: [report, ...s.reports] }));
    return report;
  },

  toasts: [],
  pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: toastId++ }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  settings: {
    currency: "USD",
    weightUnit: "Tonnes",
    defaultCargo: "Coal",
    defaultDestinationPort: "Paradip",
    defaultVessel: "Panamax",
    notificationDigest: true,
    alertsEnabled: true,
  },
  updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
}));