// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthForm } from "./ui/AuthForm";
import { SignOutButton } from "./ui/SignOutButton";

const mocks = vi.hoisted(() => ({ signup: vi.fn(), signin: vi.fn(), signout: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/shared/lib/auth-client", () => ({ authClient: { signUp: { email: mocks.signup }, signIn: { email: mocks.signin }, signOut: mocks.signout } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  mocks.signup.mockResolvedValue({ data: {}, error: null });
  mocks.signin.mockResolvedValue({ data: {}, error: null });
  mocks.signout.mockResolvedValue({ data: {}, error: null });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function form(mode: "register" | "login", password = "safe-dummy-password", confirmation = password) {
  await act(async () => root.render(<AuthForm mode={mode} />));
  for (const [name, value] of Object.entries({ email: "dummy@example.test", name: "Dummy", password, confirmPassword: confirmation })) {
    const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`); if (input) input.value = value;
  }
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
it("rejects a registration password shorter than 10 characters", async () => {
  await form("register", "short"); await submit(); expect(mocks.signup).not.toHaveBeenCalled(); expect(container.textContent).toContain("Use at least 10 characters");
});
it("rejects mismatched registration passwords", async () => {
  await form("register", "safe-dummy-password", "different-password"); await submit(); expect(mocks.signup).not.toHaveBeenCalled(); expect(container.textContent).toContain("Passwords must match");
});
it.each(["register", "login"] as const)("redirects successful %s to /check and refreshes the server session", async (mode) => {
  await form(mode); await submit(); expect(mode === "register" ? mocks.signup : mocks.signin).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/check"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("shows safe feedback on invalid login", async () => {
  mocks.signin.mockResolvedValue({ error: { message: "private database error" } });
  await form("login"); await submit(); expect(container.textContent).toContain("Check your email and password"); expect(container.textContent).not.toContain("private database"); expect(mocks.replace).not.toHaveBeenCalled();
});
it("prevents repeated submissions while pending", async () => {
  let resolve!: (value: unknown) => void;
  mocks.signup.mockReturnValue(new Promise((done) => { resolve = done; }));
  await form("register"); await submit(); await submit();
  expect(container.querySelector("button")!.disabled).toBe(true); expect(mocks.signup).toHaveBeenCalledOnce();
  await act(async () => resolve({ error: null }));
});
it("signs out through Better Auth before redirecting", async () => {
  await act(async () => root.render(<SignOutButton />));
  await act(async () => container.querySelector("button")!.click());
  expect(mocks.signout).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/check"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("keeps the user on the page if sign out fails", async () => {
  mocks.signout.mockResolvedValue({ error: { message: "internal" } });
  await act(async () => root.render(<SignOutButton />)); await act(async () => container.querySelector("button")!.click());
  expect(mocks.replace).not.toHaveBeenCalled(); expect(container.textContent).toContain("Unable to sign out");
});
