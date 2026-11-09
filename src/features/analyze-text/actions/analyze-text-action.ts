"use server";

import { buildTextCheckResult, type TextCheckResponse } from "../lib/build-text-check-result";

export async function analyzeTextAction(value: unknown): Promise<TextCheckResponse> {
  try {
    return buildTextCheckResult(value);
  } catch {
    // Report a fixed event only: exception messages/stacks can contain user input.
    console.error("[TrustCheck] TEXT_ANALYSIS_FAILED");
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
