// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileMenu } from "./MobileMenu";
import { HeaderNav } from "./HeaderNav";
import { ThemeToggle } from "./ThemeToggle";

const state = vi.hoisted(() => ({ path: "/check/example" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/features/auth/ui/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.documentElement.classList.remove("dark"); localStorage.clear(); vi.unstubAllGlobals(); });

it.each(["/check", "/check/example", "/history"])("marks the current route %s", async path => {
  state.path = path; await act(async () => root.render(<HeaderNav />));
  expect(container.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(path.startsWith("/check") ? "/check" : "/history");
});
it("does not match an unrelated route prefix", async () => {
  state.path = "/checklist"; await act(async () => root.render(<HeaderNav />));
  expect(container.querySelector('[aria-current="page"]')).toBeNull();
});
it("exposes menu state, closes with Escape and restores trigger focus", async () => {
  await act(async () => root.render(<MobileMenu identity={null} />));
  const trigger = container.querySelector("button")!;
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById(trigger.getAttribute("aria-controls")!)?.hidden).toBe(false);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
it("closes when a navigation link is selected and preserves signed-in identity", async () => {
  await act(async () => root.render(<MobileMenu identity="Sample User" />));
  const trigger = container.querySelector("button")!;
  await act(async () => trigger.click());
  const link = container.querySelector<HTMLAnchorElement>('a[href="/history"]')!;
  link.addEventListener("click", event => event.preventDefault());
  await act(async () => link.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(container.textContent).toContain("Sample User");
  expect(container.textContent).toContain("Sign out");
});
it("toggles the theme with a matching accessible label and stores the preference", async () => {
  await act(async () => root.render(<ThemeToggle />));
  const button = container.querySelector("button")!;
  await act(async () => button.click());
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem("trustcheck-theme")).toBe("dark");
  expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
  await act(async () => button.click());
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem("trustcheck-theme")).toBe("light");
});
