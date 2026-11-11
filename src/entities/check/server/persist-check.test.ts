import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckAnalysis, CheckResult } from "../model/types";
import { persistCheck } from "./persist-check";
import { parsePersistedCheck } from "../lib/parse-persisted-check";
import { buildTextCheckResult } from "@/features/analyze-text/lib/build-text-check-result";
import { buildUrlCheckResult } from "@/features/analyze-url/lib/build-url-check-result";
import { buildScreenshotCheckResult } from "@/features/analyze-screenshot/lib/build-screenshot-check-result";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { create: mocks.create } }) }));
const result: CheckResult = {
  riskLevel: "MEDIUM", riskScore: 42, confidence: "LOW", summary: "Some suspicious signs were detected.",
  analysisNote: "Text analysis currently supports English only.",
  signals: [{ code: "OTP_REQUEST", title: "Verification code requested", description: "A verification code is requested." }],
  recommendedActions: [{ code: "PROTECT_CODES", title: "Do not share verification codes" }],
  analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "COMPLETED" }],
};
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ id: "generated-check-id" }); });

it.each(["TEXT", "URL", "SCREENSHOT"] as const)("stores %s metadata with ownership and unchanged scoring", async (inputType) => {
  const id = await persistCheck("session-user", inputType, { status: "COMPLETED", result });
  expect(id).toBe("generated-check-id");
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ data: {
    userId: "session-user", inputType, status: "COMPLETED", riskLevel: result.riskLevel,
    riskScore: result.riskScore, confidence: result.confidence, summary: result.summary,
    signals: result.signals, recommendedActions: result.recommendedActions,
    analysisCoverage: result.analysisCoverage, analysisNotes: [result.analysisNote], completedAt: expect.any(Date),
  }, select: { id: true } });
});
it("stores PARTIAL and represents an absent note with an empty JSON array", async () => {
  await persistCheck("session-user", "URL", { status: "PARTIAL", result: { ...result, analysisNote: undefined } });
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({ status: "PARTIAL", analysisNotes: [] });
});
it.each(["FAILED", "INSUFFICIENT_DATA", "ANALYZING"] as const)("does not store %s", async (status) => {
  const analysis: CheckAnalysis = status === "ANALYZING" ? { status, steps: [] } : { status };
  expect(await persistCheck("session-user", "TEXT", analysis)).toBeUndefined(); expect(mocks.create).not.toHaveBeenCalled();
});
it("drops unselected fields at every JSON level without serializing arbitrary objects", async () => {
  const extra = { rawInput: "PRIVATE_MESSAGE", originalUrl: "https://private.example/secret", filename: "PRIVATE_FILE.png", ocrText: "PRIVATE_OCR", image: Buffer.from("PRIVATE_BYTES"), error: new Error("PRIVATE_PROVIDER_ERROR"), callback: () => "PRIVATE_CALLBACK", rawProviderResponse: { secret: "PRIVATE_PROVIDER_DATA" } };
  const dirty = { ...result, ...extra,
    signals: result.signals.map(s => ({ ...s, ...extra })),
    recommendedActions: result.recommendedActions.map(a => ({ ...a, ...extra })),
    analysisCoverage: result.analysisCoverage.map(s => ({ ...s, ...extra })),
    redirectDetails: { hops: [{ url: "PRIVATE_REDIRECT" }] },
  } as unknown as CheckResult;
  await persistCheck("session-user", "SCREENSHOT", { status: "COMPLETED", result: dirty });
  const data = mocks.create.mock.calls[0][0].data;
  expect(JSON.stringify(data)).not.toContain("PRIVATE_"); expect(JSON.stringify(data)).not.toContain("private.example");
  expect(data.signals).toEqual(result.signals); expect(data.recommendedActions).toEqual(result.recommendedActions); expect(data.analysisCoverage).toEqual(result.analysisCoverage);
});
it.each([undefined, new Error("private"), Buffer.from("private"), () => "private", new File(["private"], "private.png")])("refuses non-string selected JSON fields", async (description) => {
  const invalid = { ...result, signals: [{ ...result.signals[0], description }] } as unknown as CheckResult;
  await expect(persistCheck("session-user", "TEXT", { status: "COMPLETED", result: invalid })).rejects.toThrow("Invalid persistence metadata");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("does not silently coerce a non-finite score", async () => {
  await expect(persistCheck("session-user", "TEXT", { status: "COMPLETED", result: { ...result, riskScore: NaN } })).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
});

describe("real builder privacy contract", () => {
  it("stores no submitted message from a real Text assessment", async () => {
    const message = "PRIVATE_MESSAGE_MARKER: Please send me your verification code immediately.";
    const response = buildTextCheckResult(message); if (!response.ok) throw new Error("Expected result");
    await persistCheck("session-user", "TEXT", response.analysis);
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("PRIVATE_MESSAGE_MARKER");
    expect(mocks.create.mock.calls[0][0].data.signals.length).toBeGreaterThan(0);
  });
  it("stores no submitted URL or provider data from a real Link assessment", async () => {
    const url = "http://private.example/PRIVATE_PATH?token=PRIVATE_TOKEN";
    const response = await buildUrlCheckResult(url, {
      analyzeDomain: async () => ({ status: "UNAVAILABLE", reason: "NETWORK_ERROR" }),
      analyzeReputation: async () => ({ status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [], source: { code: "THREAT_REPUTATION", status: "SKIPPED" } }),
      analyzeRedirect: async () => ({ status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [] }),
    });
    if (!response.ok) throw new Error("Expected result");
    await persistCheck("session-user", "URL", response.analysis);
    const json = JSON.stringify(mocks.create.mock.calls);
    expect(json).not.toContain("private.example"); expect(json).not.toContain("PRIVATE_"); expect(json).not.toContain("NETWORK_ERROR");
  });
  it("stores no bytes, filename or OCR text from a real Screenshot assessment", async () => {
    const bytes = new Uint8Array([23, 61, 149]);
    const response = await buildScreenshotCheckResult({ bytes, declaredMimeType: "image/png", filename: "PRIVATE_FILENAME.png" }, {
      prepare: async () => ({ ok: true, image: { bytes, mimeType: "image/png", format: "png", width: 1, height: 1, size: 3 } }),
      extractText: async () => ({ status: "COMPLETED", text: "PRIVATE_OCR_MARKER: Please send your verification code immediately.", ocrConfidence: 90, truncated: false }),
      collectEvidence: vi.fn(async () => { throw new Error("Unexpected network operation"); }),
    });
    if (!response.ok) throw new Error("Expected result");
    await persistCheck("session-user", "SCREENSHOT", response.analysis);
    const json = JSON.stringify(mocks.create.mock.calls);
    expect(json).not.toContain("PRIVATE_"); expect(json).not.toContain("bytes"); expect(json).not.toContain("ocrConfidence");
    expect(mocks.create.mock.calls[0][0].data.signals.length).toBeGreaterThan(0);
  });
});

it("round-trips persisted application metadata into the same historical presentation", async () => {
  await persistCheck("session-user", "TEXT", { status: "PARTIAL", result });
  const row = mocks.create.mock.calls[0][0].data;
  expect(parsePersistedCheck(row)).toEqual({ status: "PARTIAL", result });
});
