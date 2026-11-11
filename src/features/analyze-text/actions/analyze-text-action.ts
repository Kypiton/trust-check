"use server";

import { buildTextCheckResult, type TextCheckResponse } from "../lib/build-text-check-result";
import { persistAnalysisResponse } from "@/entities/check/server";

export async function analyzeTextAction(value: unknown): Promise<TextCheckResponse> {
  try {
    const response = buildTextCheckResult(value);
    return await persistAnalysisResponse("TEXT", response);
  } catch {
    // Report a fixed event only: exception messages/stacks can contain user input.
    console.error("[TrustCheck] TEXT_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
