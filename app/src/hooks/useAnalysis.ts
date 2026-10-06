"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { AnalysisResult } from "@/lib/types";

/**
 * Ensures a real analysis exists before a screen renders, and returns the
 * current one. Every dashboard screen goes through this so no screen can fall
 * back to placeholder numbers: if the pipeline has not run, the screen shows a
 * loading or error state instead.
 */
export function useAnalysis(): {
  analysis: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  runAnalysis: ReturnType<typeof useAppStore.getState>["runAnalysis"];
} {
  const analysis = useAppStore((s) => s.procurement.analysis);
  const isAnalysing = useAppStore((s) => s.isAnalysing);
  const analysisError = useAppStore((s) => s.analysisError);
  const runAnalysis = useAppStore((s) => s.runAnalysis);

  useEffect(() => {
    if (!analysis && !isAnalysing && !analysisError) {
      void runAnalysis().catch(() => {
        /* surfaced through analysisError by the store */
      });
    }
  }, [analysis, isAnalysing, analysisError, runAnalysis]);

  return {
    analysis,
    isLoading: isAnalysing || (!analysis && !analysisError),
    error: analysisError,
    runAnalysis,
  };
}