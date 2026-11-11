import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import HistoryPage from "./page";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/entities/check/server/get-user-check-history", () => ({ getUserCheckHistory: mocks.query }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue([]); });
it("redirects unauthenticated users before any History query", async () => {
  mocks.session.mockResolvedValue(null); await expect(HistoryPage()).rejects.toThrow("redirect:/login"); expect(mocks.query).not.toHaveBeenCalled();
});
it("derives ownership only from the real server session and shows empty history", async () => {
  mocks.session.mockResolvedValue({ user: { id: "user-a" } }); const html = renderToStaticMarkup(await HistoryPage());
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith("user-a"); expect(html).toContain("No checks yet");
});
it("renders the authenticated user's selected records", async () => {
  mocks.session.mockResolvedValue({ user: { id: "user-a" } });
  mocks.query.mockResolvedValue([{ id: "check-a", inputType: "URL", status: "PARTIAL", riskLevel: "HIGH", riskScore: 80, confidence: "MEDIUM", createdAt: new Date("2026-11-11T12:00:00Z") }]);
  const html = renderToStaticMarkup(await HistoryPage()); expect(html).toContain("High Risk"); expect(html).toContain("80/100"); expect(html).not.toContain("No checks yet"); expect(html).not.toContain("user-a");
});
it("lets query failures reach the generic route error boundary", async () => {
  mocks.session.mockResolvedValue({ user: { id: "user-a" } }); mocks.query.mockRejectedValue(new Error("Unable to load check history."));
  await expect(HistoryPage()).rejects.toThrow("Unable to load check history.");
});

vi.mock("@/features/delete-check/ui/DeleteCheckControl", () => ({
  DeleteCheckControl: ({ mode }: { mode: string }) => mode === "all" ? "Clear history" : "Delete check",
}));
