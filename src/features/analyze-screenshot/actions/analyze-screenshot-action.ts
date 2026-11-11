"use server";

import { MAX_SCREENSHOT_BYTES } from "../lib/prepare-screenshot";
import { buildScreenshotCheckResult, type ScreenshotCheckResponse } from "../lib/build-screenshot-check-result";
import { persistAnalysisResponse } from "@/entities/check/server";

export async function analyzeScreenshotAction(formData: FormData): Promise<ScreenshotCheckResponse> {
  try {
    if (!(formData instanceof FormData)) return { ok: false, error: "Choose a screenshot to check." };
    const files = formData.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) return { ok: false, error: "Choose one screenshot to check." };
    const file = files[0];
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { ok: false, error: "Choose a PNG, JPG or WebP image." };
    if (!file.size) return { ok: false, error: "Choose a screenshot that isn't empty." };
    if (file.size > MAX_SCREENSHOT_BYTES) return { ok: false, error: "Choose an image no larger than 10 MiB." };
    const response = await buildScreenshotCheckResult({ bytes: new Uint8Array(await file.arrayBuffer()), declaredMimeType: file.type });
    return await persistAnalysisResponse("SCREENSHOT", response);
  } catch {
    // Never include errors, filenames, pixels, text or URLs in diagnostics.
    return { ok: true, analysis: { status: "FAILED" } };
  }
}
