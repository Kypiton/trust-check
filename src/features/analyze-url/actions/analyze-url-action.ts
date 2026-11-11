"use server";

import { buildUrlCheckResult, type UrlCheckResponse } from "../lib/build-url-check-result";
import { persistAnalysisResponse } from "@/entities/check/server";

export async function analyzeUrlAction(value: unknown): Promise<UrlCheckResponse> {
  try {
    const response = await buildUrlCheckResult(value);
    return await persistAnalysisResponse("URL", response);
  } catch {
    // Log a fixed event, never the URL or exception details that may contain it.
    console.error("[TrustCheck] URL_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
