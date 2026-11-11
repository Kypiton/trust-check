import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as builder from "../lib/build-screenshot-check-result";
import { analyzeScreenshotAction } from "./analyze-screenshot-action";
import { MAX_SCREENSHOT_BYTES } from "../lib/prepare-screenshot";

beforeEach(() => { vi.spyOn(builder, "buildScreenshotCheckResult").mockResolvedValue({ ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "NO_READABLE_TEXT" } }); });
afterEach(() => vi.restoreAllMocks());
function upload(file = new File([new Uint8Array([1, 2, 3])], "private.png", { type: "image/png" })) {
  const form = new FormData(); form.set("file", file); return form;
}

describe("Screenshot Server Action upload boundary", () => {
  it("passes only in-memory bytes and declared MIME to orchestration", async () => {
    expect(await analyzeScreenshotAction(upload())).toMatchObject({ ok: true, analysis: { status: "INSUFFICIENT_DATA" } });
    expect(builder.buildScreenshotCheckResult).toHaveBeenCalledExactlyOnceWith({ bytes: new Uint8Array([1, 2, 3]), declaredMimeType: "image/png" });
  });
  it.each([null, "image", {}])("rejects a non-FormData request: %j", async (value) => {
    expect(await analyzeScreenshotAction(value as FormData)).toMatchObject({ ok: false });
    expect(builder.buildScreenshotCheckResult).not.toHaveBeenCalled();
  });
  it("requires exactly one File in the file field", async () => {
    const text = new FormData(); text.set("file", "https://example.com/image.png");
    const multiple = upload(); multiple.append("file", new File(["extra"], "extra.png", { type: "image/png" }));
    for (const form of [new FormData(), text, multiple]) expect(await analyzeScreenshotAction(form)).toMatchObject({ ok: false });
    expect(builder.buildScreenshotCheckResult).not.toHaveBeenCalled();
  });
  it.each(["image/svg+xml", "image/gif", "application/pdf", ""])("rejects declared MIME %s before reading bytes", async (type) => {
    const file = new File(["untrusted"], "image.png", { type });
    const read = vi.spyOn(file, "arrayBuffer");
    expect(await analyzeScreenshotAction(upload(file))).toMatchObject({ ok: false, error: "Choose a PNG, JPG or WebP image." });
    expect(read).not.toHaveBeenCalled();
    expect(builder.buildScreenshotCheckResult).not.toHaveBeenCalled();
  });
  it("rejects empty and oversized files before reading bytes", async () => {
    for (const size of [0, MAX_SCREENSHOT_BYTES + 1]) {
      const file = new File(["x"], "image.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: size });
      const read = vi.spyOn(file, "arrayBuffer");
      expect(await analyzeScreenshotAction(upload(file))).toMatchObject({ ok: false });
      expect(read).not.toHaveBeenCalled();
    }
    expect(builder.buildScreenshotCheckResult).not.toHaveBeenCalled();
  });
  it("allows exactly 10 MiB through to authoritative image validation", async () => {
    const file = new File([new Uint8Array(MAX_SCREENSHOT_BYTES)], "image.png", { type: "image/png" });
    expect((await analyzeScreenshotAction(upload(file))).ok).toBe(true);
    expect(vi.mocked(builder.buildScreenshotCheckResult).mock.calls[0][0].bytes.length).toBe(MAX_SCREENSHOT_BYTES);
  });
  it("returns safe FAILED without logging exception contents", async () => {
    vi.mocked(builder.buildScreenshotCheckResult).mockRejectedValue(new Error("PRIVATE OCR TEXT / private filename"));
    const loggers = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    expect(await analyzeScreenshotAction(upload())).toEqual({ ok: true, analysis: { status: "FAILED" } });
    loggers.forEach((logger) => expect(logger).not.toHaveBeenCalled());
  });
});

// Keep existing engine/orchestration tests independent of session/database state.
vi.mock("@/entities/check/server", () => ({
  persistAnalysisResponse: vi.fn(async (_inputType: string, response: unknown) => response),
}));
