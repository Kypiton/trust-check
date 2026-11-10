// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckForm } from "./CheckForm";
import { analyzeTextAction } from "../../features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "../../features/analyze-url/actions/analyze-url-action";
import { analyzeScreenshotAction } from "../../features/analyze-screenshot/actions/analyze-screenshot-action";
import type { ScreenshotCheckResponse } from "../../features/analyze-screenshot/lib/build-screenshot-check-result";

vi.mock("../../features/analyze-text/actions/analyze-text-action", () => ({ analyzeTextAction: vi.fn() }));
vi.mock("../../features/analyze-url/actions/analyze-url-action", () => ({ analyzeUrlAction: vi.fn() }));
vi.mock("../../features/analyze-screenshot/actions/analyze-screenshot-action", () => ({ analyzeScreenshotAction: vi.fn() }));
const completed: ScreenshotCheckResponse = { ok: true, analysis: { status: "COMPLETED", result: {
  riskLevel: "LOW", riskScore: 0, confidence: "MEDIUM", summary: "No strong signs of fraud were detected in the readable screenshot content.",
  signals: [], recommendedActions: [], analysisCoverage: [{ code: "SCREENSHOT_EXTRACTION", status: "COMPLETED" }],
} } };
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(analyzeScreenshotAction).mockResolvedValue(completed);
  vi.mocked(analyzeTextAction).mockResolvedValue(completed);
  vi.mocked(analyzeUrlAction).mockResolvedValue(completed);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(CheckForm)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function select(file = new File(["image bytes"], "screenshot.png", { type: "image/png" })) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }

describe("Screenshot form flow", () => {
  it("offers file selection but disables submit without a file", async () => {
    await click("Screenshot");
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(button("Check screenshot").disabled).toBe(true);
    await submit();
    expect(analyzeScreenshotAction).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("coming soon");
  });
  it("enables valid uploads, sends FormData, shows loading, then displays the result", async () => {
    let resolve!: (response: ScreenshotCheckResponse) => void;
    vi.mocked(analyzeScreenshotAction).mockReturnValue(new Promise((done) => { resolve = done; }));
    await click("Screenshot");
    const file = await select();
    expect(button("Check screenshot").disabled).toBe(false);
    expect(container.textContent).toContain("screenshot.png");
    await submit();
    expect(analyzeScreenshotAction).toHaveBeenCalledOnce();
    const data = vi.mocked(analyzeScreenshotAction).mock.calls[0][0];
    expect(data).toBeInstanceOf(FormData);
    expect(data.get("file")).toBe(file);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Reading screenshot and checking its content");
    await act(async () => resolve(completed));
    expect(container.textContent).toContain("Low Risk");
    expect(container.textContent).toContain("This does not guarantee that the content is safe.");
    expect(container.querySelector('[aria-label="Check result"]')).toBe(document.activeElement);
    expect(analyzeTextAction).not.toHaveBeenCalled();
    expect(analyzeUrlAction).not.toHaveBeenCalled();
  });
  it("returns upload validation feedback without exposing internal errors", async () => {
    vi.mocked(analyzeScreenshotAction).mockResolvedValue({ ok: false, error: "We couldn't read this image. Try exporting the screenshot again." });
    await click("Screenshot"); await select(); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't read this image");
    expect(container.textContent).not.toContain("Analysis failed");
    expect(container.textContent).toContain("screenshot.png");
  });
  it.each(["unsupported", "oversized", "empty"])("blocks a client-side %s file without calling the action", async (kind) => {
    await click("Screenshot");
    const file = new File([kind === "empty" ? "" : "x"], "image.png", { type: kind === "unsupported" ? "image/svg+xml" : "image/png" });
    if (kind === "oversized") Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    await select(file);
    expect(button("Check screenshot").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await submit();
    expect(analyzeScreenshotAction).not.toHaveBeenCalled();
  });
  it("New check clears file, result and upload errors and stays in Screenshot mode", async () => {
    await click("Screenshot");
    await select(new File(["bad"], "bad.svg", { type: "image/svg+xml" }));
    await select(); await submit();
    await click("← New check");
    expect(button("Screenshot").getAttribute("aria-pressed")).toBe("true");
    expect(button("Check screenshot").disabled).toBe(true);
    expect(container.textContent).not.toContain("screenshot.png");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-label="Check result"]')).toBeNull();
  });
  it("shows NO_TEXT and unsupported-language experiences without a LOW result", async () => {
    await click("Screenshot");
    vi.mocked(analyzeScreenshotAction).mockResolvedValueOnce({ ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "NO_READABLE_TEXT" } });
    await select(); await submit();
    expect(container.textContent).toContain("couldn't find readable text in this screenshot");
    expect(container.textContent).not.toContain("Low Risk");
    await click("← New check");
    vi.mocked(analyzeScreenshotAction).mockResolvedValueOnce({ ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE" } });
    await select(); await submit();
    expect(container.textContent).toContain("English text required");
  });
  it("keeps the file for retry after an unexpected transport failure", async () => {
    vi.mocked(analyzeScreenshotAction).mockRejectedValueOnce(new Error("Private internal text"));
    await click("Screenshot"); await select(); await submit();
    expect(container.textContent).toContain("Analysis failed");
    expect(container.textContent).not.toContain("Private internal text");
    await click("Try again");
    expect(analyzeScreenshotAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Low Risk");
  });
});

describe("existing Text and Link interactions", () => {
  it.each(["Text", "Link"])("submits %s through its original action and resets to Text", async (mode) => {
    await click(mode);
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(mode === "Text" ? "textarea" : 'input[type="text"]')!;
    const value = mode === "Text" ? "An ordinary English message" : "https://example.com";
    const prototype = mode === "Text" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    await act(async () => field.dispatchEvent(new Event("input", { bubbles: true })));
    await submit();
    expect(mode === "Text" ? analyzeTextAction : analyzeUrlAction).toHaveBeenCalledExactlyOnceWith(value);
    expect(analyzeScreenshotAction).not.toHaveBeenCalled();
    await click("← New check");
    expect(button("Text").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(container.textContent).toContain("Text analysis currently supports English only.");
  });
});
