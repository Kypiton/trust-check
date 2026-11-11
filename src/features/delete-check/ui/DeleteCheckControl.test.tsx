// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeleteCheckControl } from "./DeleteCheckControl";
import { CheckHistory } from "@/widgets/check-history";
const mocks = vi.hoisted(() => ({ single: vi.fn(), all: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("../actions/delete-check-actions", () => ({ deleteCheckAction: mocks.single, clearHistoryAction: mocks.all }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
let container: HTMLDivElement;
let root: Root;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.single.mockResolvedValue({ ok: true, deletedCount: 1 }); mocks.all.mockResolvedValue({ ok: true, deletedCount: 3 });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); } },
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
async function single(detail = false) { await act(async () => root.render(<DeleteCheckControl mode="single" checkId="check-a" returnToHistory={detail} />)); }
async function open() { await act(async () => container.querySelector<HTMLButtonElement>("button")!.click()); }
async function confirm() { await act(async () => container.querySelectorAll<HTMLButtonElement>("dialog button")[1].click()); }
it("requires explicit confirmation, focuses Cancel and returns focus on cancellation", async () => {
  await single(); await open(); expect(container.querySelector("dialog")!.open).toBe(true);
  expect(container.textContent).toContain("Delete this check?"); expect(document.activeElement?.textContent).toBe("Cancel"); expect(mocks.single).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>("dialog button")!.click());
  expect(container.querySelector("dialog")!.open).toBe(false); expect(document.activeElement).toBe(container.querySelector("button")); expect(mocks.single).not.toHaveBeenCalled();
});
it("allows the native Escape cancel event and restores trigger focus", async () => {
  await single(); await open(); const dialog = container.querySelector("dialog")!; const event = new Event("cancel", { cancelable: true });
  await act(async () => { dialog.dispatchEvent(event); if (!event.defaultPrevented) dialog.close(); });
  expect(event.defaultPrevented).toBe(false); expect(dialog.open).toBe(false); expect(document.activeElement).toBe(container.querySelector("button"));
});
it("deletes once then refreshes History", async () => {
  await single(); await open(); await confirm(); expect(mocks.single).toHaveBeenCalledExactlyOnceWith("check-a"); expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.replace).not.toHaveBeenCalled();
});
it("returns from a deleted detail to History", async () => {
  await single(true); await open(); await confirm(); expect(mocks.replace).toHaveBeenCalledWith("/history"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("uses stronger clear-history copy and invokes the no-argument action", async () => {
  await act(async () => root.render(<DeleteCheckControl mode="all" />)); await open();
  expect(container.textContent).toContain("Clear saved history?"); expect(container.textContent).toContain("All of your saved TrustCheck analyses will be permanently deleted.");
  await confirm(); expect(mocks.all).toHaveBeenCalledExactlyOnceWith(); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("prevents duplicate requests while awaiting deletion", async () => {
  let finish!: (value: unknown) => void; mocks.single.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await single(); await open(); await confirm(); await confirm(); expect(mocks.single).toHaveBeenCalledOnce(); expect(container.querySelectorAll<HTMLButtonElement>("dialog button")[1].disabled).toBe(true);
  await act(async () => finish({ ok: true, deletedCount: 1 }));
});
it("keeps the dialog open for safe unavailable feedback", async () => {
  mocks.single.mockResolvedValue({ ok: false, error: "This saved check is unavailable." }); await single(); await open(); await confirm();
  expect(container.querySelector("dialog")!.open).toBe(true); expect(container.querySelector('[role="alert"]')!.textContent).toBe("This saved check is unavailable."); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("does not display a raw transport error", async () => {
  mocks.single.mockRejectedValue(new Error("PRIVATE_ERROR")); await single(); await open(); await confirm(); expect(container.textContent).not.toContain("PRIVATE_ERROR"); expect(container.textContent).toContain("Unable to delete saved checks");
});
it("renders the History delete control outside the row link", async () => {
  await act(async () => root.render(<CheckHistory checks={[{ id: "check-a", inputType: "TEXT", status: "COMPLETED", riskLevel: "LOW", riskScore: 0, confidence: "LOW", createdAt: new Date() }]} />));
  expect(container.querySelector('li a[href="/check/check-a"]')).not.toBeNull(); expect(container.querySelector("li a button")).toBeNull(); expect(container.querySelector('li button[aria-label="Delete check"]')).not.toBeNull();
});
