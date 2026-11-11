import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Header } from "@/widgets/header/Header";
import HistoryPage from "@/app/history/page";

const mocks = vi.hoisted(() => ({ session: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/entities/check/server/get-user-check-history", () => ({ getUserCheckHistory: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/widgets/header/HeaderNav", () => ({ HeaderNav: () => null }));
vi.mock("@/widgets/header/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/widgets/header/MobileMenu", () => ({ MobileMenu: ({ identity }: { identity: string }) => <span>{identity}</span> }));
vi.mock("@/features/auth/ui/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));
it("redirects unauthenticated History requests to login", async () => {
  mocks.session.mockResolvedValue(null); await expect(HistoryPage()).rejects.toThrow("redirect:/login");
});
it("renders History for a validated session", async () => {
  mocks.session.mockResolvedValue({ user: { name: "Dummy" } }); expect(renderToStaticMarkup(await HistoryPage())).toContain("History");
});
it("shows Sign in in the logged-out Header", async () => {
  mocks.session.mockResolvedValue(null); expect(renderToStaticMarkup(await Header())).toContain("Sign in");
});
it("renders identity without passing a session token to Header UI", async () => {
  mocks.session.mockResolvedValue({ user: { name: "Dummy", email: "dummy@example.test" }, session: { token: "private-session-token" } });
  const element = await Header(); const html = renderToStaticMarkup(element);
  expect(html).toContain("Dummy"); expect(html).toContain("Sign out"); expect(html).not.toContain("private-session-token");
});
