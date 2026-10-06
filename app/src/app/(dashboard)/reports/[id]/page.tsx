"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileBarChart2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ReportPreview from "@/components/domain/ReportPreview";
import DownloadPdfButton from "@/components/domain/DownloadPdfButton";
import { useAppStore } from "@/store/useAppStore";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reports = useAppStore((s) => s.reports);
  const report = reports.find((r) => r.id === Number(params.id)) ?? reports[0];

  if (!report) {
    return (
      <div>
        <PageHeader title="Report not found" subtitle="No report has been generated yet." />
        <Link
          href="/procurement"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-nav px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-blue-glow"
        >
          <ArrowLeft className="size-4" /> Back to Analysis
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={report.name}
        subtitle={`${report.route} · ${report.cargo} (${report.quantity.toLocaleString()} t · ${report.voyages} voyage${report.voyages > 1 ? "s" : ""}) · generated ${report.date}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadPdfButton analysis={report.analysis} reportName={report.name} />
            <Link
              href="/procurement"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-nav px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-blue-glow"
            >
              <ArrowLeft className="size-4" /> Back to Analysis
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
            <FileBarChart2 className="size-3.5" /> {report.type}
          </div>
          <p className="max-w-xl text-right text-[11px] leading-relaxed text-secondary">
            The PDF is generated in your browser from this exact analysis — the same forecast, vessel,
            port, route, cost, risk, contract and recommendation figures shown below.
          </p>
        </div>
        <ReportPreview report={report} />
      </div>
    </div>
  );
}
