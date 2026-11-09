"use server";

import { buildUrlCheckResult, type UrlCheckResponse } from "../lib/build-url-check-result";

export async function analyzeUrlAction(value: unknown): Promise<UrlCheckResponse> {
  try {
    return await buildUrlCheckResult(value);
  } catch {
    // Log a fixed event, never the URL or exception details that may contain it.
    console.error("[TrustCheck] URL_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
