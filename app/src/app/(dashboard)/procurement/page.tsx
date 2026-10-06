"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Anchor,
  CalendarDays,
  ClipboardList,
  FileDown,
  Loader2,
  MapPin,
  PackageSearch,
  Route,
  ScrollText,
  Ship,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { DEFAULT_SCENARIO } from "@/lib/types";
import { LOADING_PORTS_BY_COUNTRY, ORIGIN_COUNTRIES } from "@/lib/reference/corridors";
import { PORTS } from "@/lib/reference/ports";
import { CARGO_TYPES } from "@/lib/reference/cargo";
import { useAppStore } from "@/store/useAppStore";
import { formatNumber, formatUSD, formatUSDExact } from "@/lib/format";
import type { ContractStrategyKey, ProcurementScenario } from "@/lib/types";
import type { CargoType } from "@/lib/reference/cargo";
import type { VesselClass } from "@/lib/reference/corridors";

const HORIZONS = ["1 Month", "3 Months", "6 Months", "12 Months"];
const VESSEL_TYPES: VesselClass[] = ["Panamax", "Capesize", "Supramax", "Handysize"];

export default function ProcurementPage() {
  const router = useRouter();
  const runAnalysis = useAppStore((s) => s.runAnalysis);
  const addReport = useAppStore((s) => s.addReport);
  const reports = useAppStore((s) => s.reports);
  const pushToast = useAppStore((s) => s.pushToast);
  const analysis = useAppStore((s) => s.procurement.analysis);
  const isAnalysing = useAppStore((s) => s.isAnalysing);
  const analysisError = useAppStore((s) => s.analysisError);

  const [cargo, setCargo] = useState<CargoType>(DEFAULT_SCENARIO.cargo);
  const [quantity, setQuantity] = useState(DEFAULT_SCENARIO.quantity);
  const [voyages, setVoyages] = useState(DEFAULT_SCENARIO.voyages);
  const [originCountry, setOriginCountry] = useState(DEFAULT_SCENARIO.originCountry);
  const [loadingPort, setLoadingPort] = useState(DEFAULT_SCENARIO.loadingPort);
  const [dischargePort, setDischargePort] = useState(DEFAULT_SCENARIO.dischargePort);
  const [horizon, setHorizon] = useState(DEFAULT_SCENARIO.contractHorizon);
  const [contract, setContract] = useState<ContractStrategyKey>(DEFAULT_SCENARIO.contractStrategy);
  const [vessel, setVessel] = useState<VesselClass>(DEFAULT_SCENARIO.preferredVesselType);
  const [delivery, setDelivery] = useState(DEFAULT_SCENARIO.deliveryTarget);

  const scenario: ProcurementScenario = {
    cargo,
    quantity,
    voyages,
    originCountry,
    loadingPort,
    dischargePort,
    contractHorizon: horizon,
    contractStrategy: contract,
    preferredVesselType: vessel,
    deliveryTarget: delivery,
  };

  const totalTonnage = quantity * voyages;
  const loadingPorts = LOADING_PORTS_BY_COUNTRY[originCountry] ?? LOADING_PORTS_BY_COUNTRY.Australia;

  const handleGenerate = async () => {
    const result = await runAnalysis(scenario);
    if (!result) {
      pushToast({
        kind: "warning",
        title: "Analysis failed",
        description: analysisError ?? "The pipeline did not return a result.",
      });
      return;
    }
    pushToast({
      kind: "success",
      title: "Analysis generated",
      description: `Scenario locked: ${formatNumber(quantity)} t ${cargo}, ${voyages} voyage${
        voyages === 1 ? "" : "s"
      }, ${loadingPort} → ${dischargePort}.`,
    });
    router.push("/recommendation");
  };

  const handleGenerateReport = async () => {
    const result = await runAnalysis(scenario);
    const report = await addReport(
      "PDF",
      [
        "Freight forecast",
        "Vessel compatibility",
        "Port congestion",
        "Route comparison",
        "Contract strategy",
        "Risk matrix",
      ],
      "Full Decision Brief",
    );
    if (!result || !report) {
      pushToast({
        kind: "warning",
        title: "Report failed",
        description: analysisError ?? "The report could not be composed from this scenario.",
      });
      return;
    }
    pushToast({
      kind: "success",
      title: "Report generated",
      description: `${report.name} (${report.cargo} · ${formatNumber(report.quantity)} t) · ${report.route}`,
    });
    router.push(`/reports/${report.id}`);
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-line bg-panel px-3 text-[13px] text-primary placeholder:text-secondary/60 focus:border-accent focus:ring-1 focus:ring-accent/40 focus:outline-none";

  const saving = analysis ? analysis.savings.savings >= 0 : true;

  return (
    <div>
      <PageHeader
        title="New Procurement Analysis"
        subtitle="Define charter requirements to generate an OceanIQ decision brief with freight, vessel, port, route and contract recommendations."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Form */}
        <div className="rounded-xl border border-line bg-card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent">
              <PackageSearch className="size-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-primary">Cargo & Voyage Details</h2>
              <p className="text-[11px] text-secondary">
                Every field feeds the deterministic cost engine. Re-run to refresh the brief.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Cargo type
              </label>
              <select
                value={cargo}
                onChange={(e) => setCargo(e.target.value as CargoType)}
                className={inputClass}
              >
                {CARGO_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Contract horizon
              </label>
              <select value={horizon} onChange={(e) => setHorizon(e.target.value)} className={inputClass}>
                {HORIZONS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Quantity per voyage ({formatNumber(quantity)} t)
              </label>
              <input
                type="range"
                min={25000}
                max={250000}
                step={5000}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-10 w-full accent-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Programme voyages ({voyages})
              </label>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={voyages}
                onChange={(e) => setVoyages(Number(e.target.value))}
                className="h-10 w-full accent-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Origin country
              </label>
              <select
                value={originCountry}
                onChange={(e) => {
                  const next = e.target.value;
                  setOriginCountry(next);
                  setLoadingPort(LOADING_PORTS_BY_COUNTRY[next]?.[0] ?? loadingPort);
                }}
                className={inputClass}
              >
                {ORIGIN_COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Loading port
              </label>
              <select
                value={loadingPort}
                onChange={(e) => setLoadingPort(e.target.value)}
                className={inputClass}
              >
                {loadingPorts.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Discharge port
              </label>
              <select
                value={dischargePort}
                onChange={(e) => setDischargePort(e.target.value)}
                className={inputClass}
              >
                {PORTS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Preferred vessel
              </label>
              <select
                value={vessel}
                onChange={(e) => setVessel(e.target.value as VesselClass)}
                className={inputClass}
              >
                {VESSEL_TYPES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
                Preferred delivery
              </label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
                <input value={delivery} onChange={(e) => setDelivery(e.target.value)} className={`${inputClass} pl-9`} />
              </div>
            </div>
          </div>

          {/* Contract strategy */}
          <div className="mt-5">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-secondary">
              Contract strategy preference
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["spot", "short", "medium"] as ContractStrategyKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setContract(key)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    contract === key
                      ? "border-accent bg-accent/10 shadow-sm shadow-blue-nav/20"
                      : "border-line bg-panel hover:border-accent/40"
                  }`}
                >
                  <div
                    className={`text-[12.5px] font-semibold ${contract === key ? "text-accent" : "text-primary"}`}
                  >
                    {key === "spot" ? "Voyage-by-voyage (spot)" : key === "short" ? "Short-term series" : "Medium-term period"}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-secondary">
                    {key === "spot"
                      ? "Max flexibility, max exposure"
                      : key === "short"
                        ? "Balanced · OceanIQ default"
                        : "Min cost, min flexibility"}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-secondary">
              This is your stated preference. The engine scores all three structures and may recommend a different one.
            </p>
          </div>

          {analysisError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/5 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
              <p className="text-[12px] leading-relaxed text-secondary">{analysisError}</p>
            </div>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <button
              onClick={handleGenerate}
              disabled={isAnalysing}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-nav text-[13.5px] font-semibold text-white transition-colors hover:bg-blue-glow disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAnalysing ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Running multi-factor analysis…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate Analysis &amp; Decision Brief
                </>
              )}
            </button>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={handleGenerateReport}
                disabled={isAnalysing}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileDown className="size-4" /> Generate Report
              </button>
              <button
                onClick={() => {
                  const latest = reports[0];
                  if (latest) router.push(`/reports/${latest.id}`);
                  else
                    pushToast({
                      kind: "info",
                      title: "No reports yet",
                      description: "Generate a report to preview it here.",
                    });
                }}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-panel text-[12.5px] font-medium text-secondary transition-colors hover:border-accent/40 hover:text-primary"
              >
                <ScrollText className="size-4" /> View Report
              </button>
            </div>
          </div>
        </div>

        {/* Live summary */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-accent/35 bg-card p-4">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <ClipboardList className="size-3.5" /> Scenario summary
            </div>
            <div className="space-y-2.5">
              <SummaryRow
                icon={PackageSearch}
                label="Cargo"
                value={`${cargo} · ${formatNumber(quantity)} t/voyage · ${formatNumber(totalTonnage)} t total`}
              />
              <SummaryRow
                icon={Route}
                label="Corridor"
                value={`${loadingPort}, ${originCountry} → ${dischargePort}`}
              />
              <SummaryRow
                icon={Ship}
                label="Vessel preference"
                value={`${vessel}${analysis && analysis.vessel.primary.type !== vessel ? ` · engine picked ${analysis.vessel.primary.type}` : ""}`}
              />
              <SummaryRow
                icon={Anchor}
                label="Discharge port"
                value={
                  analysis
                    ? `${analysis.port.selected.name} · draft ${analysis.port.selected.maxDraft}m · congestion ${analysis.port.selected.congestion}%`
                    : `${dischargePort} · pending analysis`
                }
              />
              <SummaryRow icon={CalendarDays} label="Horizon / delivery" value={`${horizon} · ${delivery}`} />
            </div>
          </div>

          {analysis ? (
            <>
              <div className="rounded-xl border border-line bg-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-secondary">
                  Estimated programme cost
                </div>
                <div className="mt-1 text-[24px] font-semibold text-primary">
                  {formatUSD(analysis.cost.totalProgram)}
                </div>
                <div className={`text-[11px] ${saving ? "text-good" : "text-warn"}`}>
                  {saving
                    ? `−${Math.abs(analysis.savings.savingsPercent).toFixed(1)}% vs ${analysis.savings.baselineLabel.toLowerCase()} (${formatUSD(analysis.savings.savings)} saved)`
                    : `+${Math.abs(analysis.savings.savingsPercent).toFixed(1)}% certainty premium vs ${analysis.savings.baselineLabel.toLowerCase()}`}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-[11px]">
                  <div>
                    <div className="text-secondary">Per tonne</div>
                    <div className="font-medium text-primary">{formatUSDExact(analysis.cost.costPerTonne)}</div>
                  </div>
                  <div>
                    <div className="text-secondary">Per voyage</div>
                    <div className="font-medium text-primary">{formatUSD(analysis.cost.totalPerVoyage)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-secondary">
                  <MapPin className="size-3.5 text-accent" />
                  Forecast confidence {analysis.forecast.confidence}% · 30-day change{" "}
                  {analysis.forecast.forecastChange30d >= 0 ? "+" : ""}
                  {analysis.forecast.forecastChange30d.toFixed(1)}%
                </div>
              </div>

              {analysis.forecast.laneResolution.exact === false && (
                <div className="rounded-xl border border-warn/35 bg-warn/5 p-3">
                  <p className="text-[11.5px] leading-relaxed text-secondary">
                    <span className="font-semibold text-warn">Proxied lane:</span>{" "}
                    {analysis.forecast.laneResolution.adjustment} Forecast runs on{" "}
                    {analysis.forecast.laneResolution.basedOnLane ?? analysis.forecast.laneResolution.lane}.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-line bg-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-secondary">Estimated programme cost</div>
              <div className="mt-1 text-[14px] text-secondary">Run the analysis to price this scenario.</div>
            </div>
          )}

          <p className="rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-secondary">
            Estimates come from the OceanIQ deterministic engine across freight, fuel, port charges,
            waiting/demurrage, repositioning and a risk buffer, using {analysis?.model.dataLabel.toLowerCase() ??
              "reference data"}. Adjust any input and re-run for updated figures.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Ship; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-secondary">{label}</div>
        <div className="truncate text-[12.5px] font-medium text-primary">{value}</div>
      </div>
    </div>
  );
}