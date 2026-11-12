import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyzeTextAction } from "@/features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "@/features/analyze-url/actions/analyze-url-action";
import { analyzeScreenshotAction } from "@/features/analyze-screenshot/actions/analyze-screenshot-action";
const mocks = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn(), consume: vi.fn(), create: vi.fn(), text: vi.fn(), url: vi.fn(), screenshot: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("./prisma-store", () => ({ prismaRateLimitStore: { consume: mocks.consume } }));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { create: mocks.create } }) }));
vi.mock("@/features/analyze-text/lib/build-text-check-result", () => ({ buildTextCheckResult: mocks.text }));
vi.mock("@/features/analyze-url/lib/build-url-check-result", () => ({ buildUrlCheckResult: mocks.url }));
vi.mock("@/features/analyze-screenshot/lib/build-screenshot-check-result", () => ({ buildScreenshotCheckResult: mocks.screenshot }));
const result = { riskLevel: "LOW", riskScore: 0, confidence: "LOW", summary: "Safe summary", signals: [], recommendedActions: [], analysisCoverage: [] };
const response = { ok: true, analysis: { status: "COMPLETED", result } };
function upload() { const data = new FormData(); data.set("file", new File(["image"], "private.png", { type: "image/png" })); return data; }
const flows = [
  { operation: "TEXT", builder: mocks.text, run: () => analyzeTextAction("A harmless private message.") },
  { operation: "URL", builder: mocks.url, run: () => analyzeUrlAction("https://private.example/") },
  { operation: "SCREENSHOT", builder: mocks.screenshot, run: () => analyzeScreenshotAction(upload()) },
] as const;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RATE_LIMIT_SECRET", "s".repeat(48)); vi.stubEnv("TRUST_PROXY_IP_HEADERS", "false");
  mocks.session.mockResolvedValue({ user: { id: "server-user" } }); mocks.headers.mockResolvedValue(new Headers());
  mocks.consume.mockResolvedValue({ allowed: true, count: 1, windowStart: new Date() }); mocks.create.mockResolvedValue({ id: "saved-id" });
  for (const flow of flows) flow.builder.mockReturnValue(response);
});
afterEach(() => vi.unstubAllEnvs());
for (const flow of flows) {
  it(`${flow.operation}: blocks before pipeline/providers and persistence with safe retry information`, async () => {
    mocks.consume.mockResolvedValue({ allowed: false, count: 100, windowStart: new Date() });
    const output = await flow.run(); expect(output).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    expect(output).not.toHaveProperty("analysis"); expect(JSON.stringify(output)).not.toContain("server-user");
    expect(flow.builder).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it(`${flow.operation}: allowed authenticated results preserve assessment and persist`, async () => {
    expect(await flow.run()).toEqual({ ...response, persistedCheckId: "saved-id" }); expect(flow.builder).toHaveBeenCalledOnce(); expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.consume.mock.calls[0][0].key).toBe(`user:server-user:${flow.operation.toLowerCase()}`);
  });
  it(`${flow.operation}: anonymous results remain unsaved and use HMAC keys`, async () => {
    mocks.session.mockResolvedValue(null); expect(await flow.run()).toEqual(response); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.consume.mock.calls[0][0].key).toMatch(/^anonymous:[a-f0-9]{64}:/); expect(mocks.consume.mock.calls[0][0].key).not.toContain("127.0.0.1");
  });
  it(`${flow.operation}: storage failure fails closed in production`, async () => {
    vi.stubEnv("NODE_ENV", "production"); mocks.consume.mockRejectedValue(new Error("PRIVATE_DATABASE_ERROR"));
    const output = await flow.run(); expect(output).toMatchObject({ ok: false, code: "TEMPORARILY_UNAVAILABLE" }); expect(JSON.stringify(output)).not.toContain("PRIVATE_DATABASE_ERROR");
    expect(flow.builder).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
}
it("production anonymous requests without proxy trust fail closed before consuming or analyzing", async () => {
  vi.stubEnv("NODE_ENV", "production"); mocks.session.mockResolvedValue(null); mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "192.0.2.1" }));
  expect(await analyzeUrlAction("https://example.test/")).toMatchObject({ code: "TEMPORARILY_UNAVAILABLE" }); expect(mocks.consume).not.toHaveBeenCalled(); expect(mocks.url).not.toHaveBeenCalled();
});
it("cheap invalid inputs do not consume quotas", async () => {
  await analyzeTextAction(123); await analyzeUrlAction(""); await analyzeScreenshotAction(new FormData()); expect(mocks.consume).not.toHaveBeenCalled();
});
it("a blocked screenshot does not read file contents", async () => {
  mocks.consume.mockResolvedValue({ allowed: false, count: 10, windowStart: new Date() }); const data = upload(); const file = data.get("file") as File;
  const read = vi.spyOn(file, "arrayBuffer"); await analyzeScreenshotAction(data); expect(read).not.toHaveBeenCalled();
});
