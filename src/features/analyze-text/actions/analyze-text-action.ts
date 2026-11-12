"use server";

import { checkAnalysisRateLimit } from "@/shared/server/rate-limit";

import { buildTextCheckResult, type TextCheckResponse } from "../lib/build-text-check-result";
import { persistAnalysisResponse } from "@/entities/check/server";

export async function analyzeTextAction(value: unknown): Promise<TextCheckResponse> {
  try {
    if (typeof value !== "string") return { ok: false, error: "Enter a text message to check." };
    if (!value.trim()) return { ok: false, error: "Enter a message to check." };
    if (value.length > 10000) return { ok: false, error: "Keep your message to 10,000 characters or fewer." };
    const blocked = await checkAnalysisRateLimit("TEXT");
    if (blocked) return blocked;
    const response = buildTextCheckResult(value);
    return await persistAnalysisResponse("TEXT", response);
  } catch {
    // Report a fixed event only: exception messages/stacks can contain user input.
    console.error("[TrustCheck] TEXT_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
