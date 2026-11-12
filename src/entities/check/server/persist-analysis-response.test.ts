import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckAnalysis, CheckResult } from "../model/types";
import { analyzeTextAction } from "@/features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "@/features/analyze-url/actions/analyze-url-action";
import { analyzeScreenshotAction } from "@/features/analyze-screenshot/actions/analyze-screenshot-action";

const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), text: vi.fn(), url: vi.fn(), screenshot: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { create: mocks.create } }) }));
vi.mock("@/features/analyze-text/lib/build-text-check-result", () => ({ buildTextCheckResult: mocks.text }));
vi.mock("@/features/analyze-url/lib/build-url-check-result", () => ({ buildUrlCheckResult: mocks.url }));
vi.mock("@/features/analyze-screenshot/lib/build-screenshot-check-result", () => ({ buildScreenshotCheckResult: mocks.screenshot }));

const result: CheckResult = {
  riskLevel: "LOW", riskScore: 0, confidence: "MEDIUM", summary: "No strong signs detected.",
  signals: [], recommendedActions: [{ code: "VERIFY_REQUESTS", title: "Verify unexpected requests independently" }],
  analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "COMPLETED" }],
};
function upload() {
  const data = new FormData();
  data.set("file", new File(["PRIVATE_IMAGE_BYTES"], "PRIVATE_FILENAME.png", { type: "image/png" }));
  data.set("userId", "attacker-chosen-user");
  return data;
}
const flows = [
  { type: "TEXT", builder: mocks.text, run: () => analyzeTextAction("PRIVATE_MESSAGE") },
  { type: "URL", builder: mocks.url, run: () => analyzeUrlAction("https://private.example/PRIVATE_PATH") },
  { type: "SCREENSHOT", builder: mocks.screenshot, run: () => analyzeScreenshotAction(upload()) },
] as const;
let diagnostic: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "authenticated-user" }, session: { id: "private-session-id", token: "private-token" } });
  mocks.create.mockResolvedValue({ id: "generated-check-id" });
  for (const flow of flows) flow.builder.mockReturnValue({ ok: true, analysis: { status: "COMPLETED", result } });
  diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

for (const flow of flows) {
  describe(`${flow.type} action persistence`, () => {
    it.each(["COMPLETED", "PARTIAL"] as const)("writes exactly once for authenticated %s", async (status) => {
      const analysis = { status, result }; flow.builder.mockReturnValue({ ok: true, analysis });
      const response = await flow.run();
      expect(flow.builder).toHaveBeenCalledOnce(); expect(mocks.session).toHaveBeenCalledOnce(); expect(mocks.create).toHaveBeenCalledOnce();
      expect(mocks.create.mock.calls[0][0].data).toMatchObject({ userId: "authenticated-user", inputType: flow.type, status, riskScore: result.riskScore, riskLevel: result.riskLevel, confidence: result.confidence });
      expect(response).toEqual({ ok: true, analysis, persistedCheckId: "generated-check-id" });
      expect(response.ok && response.analysis).toBe(analysis);
      const serialized = JSON.stringify(response); expect(serialized).not.toContain("authenticated-user"); expect(serialized).not.toContain("private-token");
      const stored = JSON.stringify(mocks.create.mock.calls); expect(stored).not.toContain("PRIVATE_"); expect(stored).not.toContain("attacker-chosen-user");
    });
    it("keeps anonymous results unchanged without writing", async () => {
      mocks.session.mockResolvedValue(null); const response = await flow.run();
      expect(response).toEqual({ ok: true, analysis: { status: "COMPLETED", result } });
      expect(response).not.toHaveProperty("persistedCheckId"); expect(mocks.create).not.toHaveBeenCalled();
    });
    it.each(["FAILED", "INSUFFICIENT_DATA"] as const)("does not persist %s or look up its session", async (status) => {
      flow.builder.mockReturnValue({ ok: true, analysis: { status } });
      expect(await flow.run()).toEqual({ ok: true, analysis: { status } });
      expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    });
    it("does not persist validation errors", async () => {
      flow.builder.mockReturnValue({ ok: false, error: "Invalid input" });
      expect(await flow.run()).toEqual({ ok: false, error: "Invalid input" }); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    });
    it.each(["create", "session"] as const)("isolates %s failures from valid analysis", async (operation) => {
      mocks[operation].mockRejectedValue(new Error("PRIVATE_DATABASE_CONTENT"));
      expect(await flow.run()).toEqual({ ok: true, analysis: { status: "COMPLETED", result } });
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith("[TrustCheck] CHECK_PERSISTENCE_FAILED");
    });
  });
}
it("waits until screenshot processing finishes before looking up session or saving", async () => {
  let finish!: (value: { ok: true; analysis: CheckAnalysis }) => void;
  mocks.screenshot.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = analyzeScreenshotAction(upload());
  await vi.waitFor(() => expect(mocks.screenshot).toHaveBeenCalledOnce());
  expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  finish({ ok: true, analysis: { status: "COMPLETED", result } });
  await pending; expect(mocks.create).toHaveBeenCalledOnce();
});
it("rejects an invalid screenshot upload before any database access", async () => {
  expect(await analyzeScreenshotAction(new FormData())).toMatchObject({ ok: false });
  expect(mocks.screenshot).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});

// Existing analysis/persistence tests do not consume application quotas.
vi.mock("@/shared/server/rate-limit", () => ({ checkAnalysisRateLimit: vi.fn(async () => null) }));
