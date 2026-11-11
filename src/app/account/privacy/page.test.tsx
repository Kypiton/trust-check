import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PrivacyPage from "./page";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/features/delete-check/ui/DeleteCheckControl", () => ({ DeleteCheckControl: () => <button>Clear saved history</button> }));
it("requires a valid server session", async () => { mocks.session.mockResolvedValue(null); await expect(PrivacyPage()).rejects.toThrow("redirect:/login"); });
it("explains metadata-only storage and offers clearing without deleting identity", async () => {
  mocks.session.mockResolvedValue({ user: { id: "user-a" } }); const html = renderToStaticMarkup(await PrivacyPage());
  for (const copy of ["only analysis result metadata", "Submitted message text", "Original links", "Screenshots", "OCR text", "Clear saved history", "Your account and sign-in sessions are kept"]) expect(html).toContain(copy);
  expect(html).not.toContain("user-a"); expect(html).not.toContain("backups");
});
