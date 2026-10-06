"use client";

/**
 * OceanIQ — report download control.
 *
 * Renders the *current* `AnalysisResult` to a structured A4 PDF with jsPDF and
 * hands it to the browser as a file download. The user stays on the report
 * page; the button only shows progress and surfaces failures.
 */

import { useCallback, useState } from "react";
import { Download, FileDown, Loader2, TriangleAlert } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { AnalysisResult } from "@/lib/types";

interface DownloadPdfButtonProps {
  analysis: AnalysisResult;
  /** Report name shown on the PDF cover. */
  reportName?: string;
  /** Optional class overrides so each screen can match its own button row. */
  className?: string;
  label?: string;
  compact?: boolean;
  onError?: (message: string) => void;
}

function dateLabel(d: Date): string {
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

export default function DownloadPdfButton({
  analysis,
  reportName = "Procurement Decision Report",
  className = "",
  label = "Download PDF",
  compact = false,
  onError,
}: DownloadPdfButtonProps) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { buildProcurementReportPdf } = await import("@/lib/report/pdf");
      const { blob, filename } = await buildProcurementReportPdf(analysis, {
        name: reportName,
        generatedLabel: dateLabel(new Date()),
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);

      pushToast({
        kind: "success",
        title: "PDF downloaded",
        description: `${filename} generated from the current analysis.`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "The PDF could not be generated. Please try again.";
      setError(message);
      onError?.(message);
      pushToast({
        kind: "warning",
        title: "PDF download failed",
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }, [analysis, busy, onError, pushToast, reportName]);

  const base =
    compact
      ? "grid size-7 place-items-center rounded-md border transition-colors"
      : "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-medium transition-colors";
  const tone = compact
    ? busy
      ? "border-accent/40 text-accent"
      : "border-line text-secondary hover:border-accent/40 hover:text-accent"
    : busy
      ? "border border-line text-accent"
      : "border border-accent/45 bg-accent/12 text-accent hover:bg-accent/20";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        aria-busy={busy}
        title={busy ? "Generating the PDF…" : `Download the ${reportName} as a PDF`}
        className={`${base} ${tone} disabled:cursor-progress disabled:opacity-70 ${className}`}
      >
        {busy ? (
          <Loader2 className={compact ? "size-3.5 animate-spin" : "size-4 animate-spin"} />
        ) : compact ? (
          <Download className="size-3.5" />
        ) : (
          <FileDown className="size-4" />
        )}
        {!compact && <span>{busy ? "Generating PDF…" : label}</span>}
      </button>
      {error && (
        <span className="flex items-center gap-1 text-[10.5px] text-bad">
          <TriangleAlert className="size-3 shrink-0" /> {error}
        </span>
      )}
    </span>
  );
}
