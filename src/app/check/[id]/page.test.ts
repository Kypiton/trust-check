import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CheckResultPage from "./page";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), risk: vi.fn(), confidence: vi.fn(), rdap: vi.fn(), reputation: vi.fn(), redirects: vi.fn(), ocr: vi.fn() }));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/entities/check/server/get-user-check-by-id", () => ({ getUserCheckById: mocks.query }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/entities/risk/lib/risk-engine", () => ({ calculateRisk: mocks.risk }));
vi.mock("@/entities/confidence/lib/confidence-engine", () => ({ calculateConfidence: mocks.confidence }));
vi.mock("@/features/analyze-domain", () => ({ analyzeDomain: mocks.rdap }));
vi.mock("@/features/analyze-reputation", () => ({ analyzeReputation: mocks.reputation }));
vi.mock("@/features/analyze-redirect", () => ({ analyzeRedirect: mocks.redirects }));
vi.mock("@/features/analyze-screenshot/lib/extract-screenshot-text", () => ({ extractScreenshotText: mocks.ocr }));
const page = (id: string) => CheckResultPage({ params: Promise.resolve({ id }) });
const row = { status: "COMPLETED", riskLevel: "MEDIUM", riskScore: 47, confidence: "LOW", summary: "Historical assessment.", signals: [], recommendedActions: [], analysisCoverage: [], analysisNotes: [] };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); mocks.session.mockResolvedValue({ user: { id: "user-a" } }); mocks.query.mockResolvedValue(null); mocks.confidence.mockReturnValue({ level: "MEDIUM" }); });
afterEach(() => vi.unstubAllEnvs());
it("redirects anonymous users without reading a Check", async () => {
  mocks.session.mockResolvedValue(null); await expect(page("check-id")).rejects.toThrow("redirect:/login"); expect(mocks.query).not.toHaveBeenCalled();
});
it.each(["COMPLETED", "PARTIAL"])("renders owned %s data through the existing result UI", async status => {
  mocks.query.mockResolvedValue({ ...row, status }); const html = renderToStaticMarkup(await page("check-id"));
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith("user-a", "check-id"); expect(html).toContain("Historical assessment."); expect(html).toContain("Delete check"); expect(html).toContain("Medium Risk"); expect(html).toContain("47"); expect(html).toContain("Low confidence"); expect(html).toContain('href="/history"'); expect(html).not.toContain("Development preview");
  if (status === "PARTIAL") expect(html).toContain("Some checks were unavailable");
});
it.each(["missing", "owned-by-b", "arbitrary-id"])("uses the same 404 for inaccessible %s", async id => { await expect(page(id)).rejects.toThrow("NOT_FOUND"); });
it.each(["high", "medium", "low", "loading", "error", "insufficient", "partial"])("never renders preview %s in production", async id => { await expect(page(id)).rejects.toThrow("NOT_FOUND"); expect(mocks.query).toHaveBeenCalledWith("user-a", id); });
it.each(["high", "medium", "low", "loading", "error", "insufficient", "partial"])("allows explicit preview %s only in development", async id => {
  vi.stubEnv("NODE_ENV", "development"); const html = renderToStaticMarkup(await page(id)); expect(html).toContain("Development preview — sample data."); expect(html).not.toContain("Delete check"); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
});
it("unknown development IDs query persisted data rather than falling back to a fixture", async () => {
  vi.stubEnv("NODE_ENV", "development"); await expect(page("unknown")).rejects.toThrow("NOT_FOUND"); expect(mocks.query).toHaveBeenCalledWith("user-a", "unknown");
});
it("fails safely on malformed persisted data", async () => { mocks.query.mockResolvedValue({ ...row, riskScore: null }); await expect(page("id")).rejects.toThrow("Saved result is unavailable."); });
it("does not run engines, enrichments, OCR or fixture initialization for persisted results", async () => {
  mocks.query.mockResolvedValue(row); await page("real-check");
  for (const operation of [mocks.risk, mocks.confidence, mocks.rdap, mocks.reputation, mocks.redirects, mocks.ocr]) expect(operation).not.toHaveBeenCalled();
});

vi.mock("@/features/delete-check/ui/DeleteCheckControl", () => ({
  DeleteCheckControl: ({ mode }: { mode: string }) => mode === "all" ? "Clear history" : "Delete check",
}));
