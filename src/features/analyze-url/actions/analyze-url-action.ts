"use server";

import { MAX_URL_INPUT_LENGTH } from "../lib/limits";
import { checkAnalysisRateLimit } from "@/shared/server/rate-limit";

import { buildUrlCheckResult, type UrlCheckResponse } from "../lib/build-url-check-result";
import { persistAnalysisResponse } from "@/entities/check/server";

export async function analyzeUrlAction(value: unknown): Promise<UrlCheckResponse> {
  try {
    if (typeof value !== "string" || !value.trim()) return { ok: false, error: "Enter a valid HTTP or HTTPS link." };
    if (value.length > MAX_URL_INPUT_LENGTH) return { ok: false, error: `Keep your link to ${MAX_URL_INPUT_LENGTH} characters or fewer.` };
    const blocked = await checkAnalysisRateLimit("URL");
    if (blocked) return blocked;
    const response = await buildUrlCheckResult(value);
    return await persistAnalysisResponse("URL", response);
  } catch {
    // Log a fixed event, never the URL or exception details that may contain it.
    console.error("[TrustCheck] URL_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
