import { Buffer } from "node:buffer";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NormalizedScreenshot, ScreenshotFormat } from "../model/types";
import type { OcrWorker } from "./ocr-adapter";
import { createScreenshotTextExtractor, MAX_OCR_TEXT_LENGTH } from "./extract-screenshot-text";
import { extractUrlsFromText, MAX_SCREENSHOT_URLS } from "./extract-urls-from-text";
import { prepareScreenshot } from "./prepare-screenshot";

let image: NormalizedScreenshot;
beforeAll(async () => {
  const bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).png().toBuffer();
  const result = await prepareScreenshot({ bytes, declaredMimeType: "image/png" });
  if (!result.ok) throw new Error(result.reason);
  image = result.image;
});
afterEach(() => vi.restoreAllMocks());

function mockWorker(text: unknown = "Some text", confidence: unknown = 92) {
  return {
    recognize: vi.fn<OcrWorker["recognize"]>(async () => ({ text, confidence })),
    terminate: vi.fn(async () => {}),
  };
}

describe("OCR orchestration with injected workers", () => {
  it("initializes lazily and reuses one worker between sequential jobs", async () => {
    const worker = mockWorker();
    const createWorker = vi.fn(async () => worker);
    const manager = createScreenshotTextExtractor({ createWorker });
    expect(createWorker).not.toHaveBeenCalled();
    expect((await manager.extract(image)).status).toBe("COMPLETED");
    expect((await manager.extract(image)).status).toBe("COMPLETED");
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(2);
    expect(worker.terminate).not.toHaveBeenCalled();
    await manager.close();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(["", " \t\r\n\n "])("returns NO_TEXT for %j", async (text) => {
    const manager = createScreenshotTextExtractor({ createWorker: async () => mockWorker(text) });
    expect(await manager.extract(image)).toEqual({ status: "NO_TEXT" });
    await manager.close();
  });

  it("normalizes whitespace conservatively and preserves OCR confidence separately", async () => {
    const manager = createScreenshotTextExtractor({ createWorker: async () => mockWorker("  URGENT  Account\r\nSuspended\r\n\r\n \n\nAct Now  ", 87.5) });
    expect(await manager.extract(image)).toEqual({ status: "COMPLETED", text: "URGENT  Account\nSuspended\n\nAct Now", ocrConfidence: 87.5, truncated: false });
    await manager.close();
  });

  it.each([undefined, NaN, Infinity, -1, 101, "99"])("treats invalid or missing OCR confidence %s as unavailable", async (confidence) => {
    const worker = mockWorker();
    worker.recognize.mockResolvedValue({ text: "Text", confidence });
    const manager = createScreenshotTextExtractor({ createWorker: async () => worker });
    expect(await manager.extract(image)).toMatchObject({ status: "COMPLETED", ocrConfidence: null });
    await manager.close();
  });

  it.each([0, 100])("preserves valid confidence boundary %s", async (confidence) => {
    const manager = createScreenshotTextExtractor({ createWorker: async () => mockWorker("Text", confidence) });
    expect(await manager.extract(image)).toMatchObject({ ocrConfidence: confidence });
    await manager.close();
  });

  it.each([MAX_OCR_TEXT_LENGTH, MAX_OCR_TEXT_LENGTH + 1000])("bounds OCR output of %s characters", async (length) => {
    const manager = createScreenshotTextExtractor({ createWorker: async () => mockWorker("x".repeat(length)) });
    expect(await manager.extract(image)).toEqual({ status: "COMPLETED", text: "x".repeat(MAX_OCR_TEXT_LENGTH), ocrConfidence: 92, truncated: length > MAX_OCR_TEXT_LENGTH });
    await manager.close();
  });

  it("does not split a surrogate pair when truncating", async () => {
    const manager = createScreenshotTextExtractor({ createWorker: async () => mockWorker("a".repeat(MAX_OCR_TEXT_LENGTH - 1) + "😀end") });
    expect(await manager.extract(image)).toMatchObject({ text: "a".repeat(MAX_OCR_TEXT_LENGTH - 1), truncated: true });
    await manager.close();
  });

  it.each(["https://example.com/image.png", Buffer.from("<svg/>"), null, { ok: false, reason: "INVALID_IMAGE" }])("rejects unprepared input without initializing OCR: %s", async (input) => {
    const createWorker = vi.fn(async () => mockWorker());
    const manager = createScreenshotTextExtractor({ createWorker });
    expect(await manager.extract(input as unknown as NormalizedScreenshot)).toEqual({ status: "FAILED", reason: "INVALID_INPUT" });
    expect(createWorker).not.toHaveBeenCalled();
    await manager.close();
  });

  it("rejects fabricated/cloned normalized metadata and replacement bytes", async () => {
    const createWorker = vi.fn(async () => mockWorker());
    const manager = createScreenshotTextExtractor({ createWorker });
    expect(await manager.extract({ ...image })).toEqual({ status: "FAILED", reason: "INVALID_INPUT" });
    const original = image.bytes;
    image.bytes = Buffer.from("<svg/>");
    try {
      expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "INVALID_INPUT" });
    } finally { image.bytes = original; }
    expect(createWorker).not.toHaveBeenCalled();
    await manager.close();
  });

  it("passes an owned in-memory byte snapshot and never logs content", async () => {
    const worker = mockWorker("private screenshot text https://secret.example");
    const loggers = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const fetch = vi.spyOn(globalThis, "fetch");
    const manager = createScreenshotTextExtractor({ createWorker: async () => worker });
    await manager.extract(image);
    const bytes = worker.recognize.mock.calls[0][0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).not.toBe(image.bytes);
    expect(bytes).toEqual(Buffer.from(image.bytes));
    loggers.forEach((logger) => expect(logger).not.toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    await manager.close();
  });

  it("discards a failed worker and lazily recovers with a fresh one", async () => {
    const broken = mockWorker();
    broken.recognize.mockRejectedValue(new Error("PRIVATE TESSERACT FAILURE"));
    const healthy = mockWorker("Recovered");
    const createWorker = vi.fn<() => Promise<OcrWorker>>().mockResolvedValueOnce(broken).mockResolvedValueOnce(healthy);
    const manager = createScreenshotTextExtractor({ createWorker });
    expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "OCR_FAILED" });
    expect(broken.terminate).toHaveBeenCalledTimes(1);
    expect((await manager.extract(image)).status).toBe("COMPLETED");
    expect(createWorker).toHaveBeenCalledTimes(2);
    await manager.close();
  });

  it("recovers from an initialization failure", async () => {
    const createWorker = vi.fn<() => Promise<OcrWorker>>().mockRejectedValueOnce(new Error("Private init failure")).mockResolvedValueOnce(mockWorker());
    const manager = createScreenshotTextExtractor({ createWorker });
    expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "OCR_FAILED" });
    expect((await manager.extract(image)).status).toBe("COMPLETED");
    await manager.close();
  });

  it("discards a worker that returns malformed output", async () => {
    const worker = mockWorker(null);
    const manager = createScreenshotTextExtractor({ createWorker: async () => worker });
    expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "OCR_FAILED" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    await manager.close();
  });

  it("caps recognition at one active job with five waiting, including initialization", async () => {
    let initialized!: (worker: OcrWorker) => void;
    const createWorker = vi.fn(() => new Promise<OcrWorker>((resolve) => { initialized = resolve; }));
    const gates: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    const worker = mockWorker();
    worker.recognize.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => gates.push(resolve));
      active--;
      return { text: "Done", confidence: 90 };
    });
    const manager = createScreenshotTextExtractor({ createWorker });
    const requests = Array.from({ length: 6 }, () => manager.extract(image));
    expect(createWorker).toHaveBeenCalledOnce();
    expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "BUSY" });
    initialized(worker);
    for (let i = 0; i < 6; i++) {
      await vi.waitFor(() => expect(gates.length).toBe(1));
      expect(worker.recognize).toHaveBeenCalledTimes(i + 1);
      gates.shift()!();
    }
    expect((await Promise.all(requests)).every((result) => result.status === "COMPLETED")).toBe(true);
    expect(peak).toBe(1);
    await manager.close();
  });

  it("waits for termination before starting the next queued job", async () => {
    let terminated!: () => void;
    const broken = mockWorker();
    broken.recognize.mockRejectedValue(new Error("Failed"));
    broken.terminate.mockImplementation(() => new Promise<void>((resolve) => { terminated = resolve; }));
    const createWorker = vi.fn<() => Promise<OcrWorker>>().mockResolvedValueOnce(broken).mockResolvedValueOnce(mockWorker());
    const manager = createScreenshotTextExtractor({ createWorker });
    const first = manager.extract(image);
    const second = manager.extract(image);
    await vi.waitFor(() => expect(broken.terminate).toHaveBeenCalledOnce());
    expect(createWorker).toHaveBeenCalledOnce();
    terminated();
    expect(await first).toEqual({ status: "FAILED", reason: "OCR_FAILED" });
    expect((await second).status).toBe("COMPLETED");
    await manager.close();
  });

  it("stops accepting jobs if a worker cannot be terminated", async () => {
    const worker = mockWorker();
    worker.recognize.mockRejectedValue(new Error("Failed"));
    worker.terminate.mockRejectedValue(new Error("Termination failed"));
    const createWorker = vi.fn(async () => worker);
    const manager = createScreenshotTextExtractor({ createWorker });
    const first = manager.extract(image);
    const queued = manager.extract(image);
    expect(await first).toEqual({ status: "FAILED", reason: "OCR_FAILED" });
    expect(await queued).toEqual({ status: "FAILED", reason: "CLOSED" });
    expect(await manager.extract(image)).toEqual({ status: "FAILED", reason: "CLOSED" });
    expect(createWorker).toHaveBeenCalledOnce();
    await manager.close();
  });

  it("closes safely while active, cancelling queued jobs without terminating active work early", async () => {
    let recognized!: () => void;
    const worker = mockWorker();
    worker.recognize.mockImplementation(async () => {
      await new Promise<void>((resolve) => { recognized = resolve; });
      return { text: "Done", confidence: 90 };
    });
    const manager = createScreenshotTextExtractor({ createWorker: async () => worker });
    const first = manager.extract(image);
    const queued = manager.extract(image);
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledOnce());
    const closed = manager.close();
    expect(await queued).toEqual({ status: "FAILED", reason: "CLOSED" });
    expect(worker.terminate).not.toHaveBeenCalled();
    recognized();
    await first;
    await closed;
    await manager.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe("pure conservative URL extraction", () => {
  it.each([
    ["https://example.com", ["https://example.com/"]],
    ["http://example.com/login", ["http://example.com/login"]],
    ["www.example.com", ["https://www.example.com/"]],
    ["Open https://example.com.", ["https://example.com/"]],
    ["(https://example.com/login)", ["https://example.com/login"]],
    ['"https://example.com,"', ["https://example.com/"]],
    ["See https://example.com/a_(b).", ["https://example.com/a_(b)"]],
    ["(https://example.com/a_(b)).", ["https://example.com/a_(b)"]],
    ["https://example.com/?q=what?", ["https://example.com/?q=what?"]],
    ["https://example.com/path!", ["https://example.com/path!"]],
    ["https://example.com/O'Reilly", ["https://example.com/O'Reilly"]],
    ["'https://example.com/path'", ["https://example.com/path"]],
    ["https://EXAMPLE.com:443 https://example.com/", ["https://example.com/"]],
    ["https://example.com/Path?q=A#B", ["https://example.com/Path?q=A#B"]],
    ["https://bücher.de/path", ["https://xn--bcher-kva.de/path"]],
    ["https://[2001:db8::1]/a", ["https://[2001:db8::1]/a"]],
    ["Use version 1.2.3", []],
    ["user@example.com user@www.example.com", []],
    ["example.com", []],
    ["https:///example.com", []],
    ["https://-bad.example.com", []],
    ["https://bad_.example.com", []],
    ["https://example..com", []],
    ["https://example.com:99999", []],
    ["https://example.com\\@evil.test", []],
    ["https://", []],
    ["https://user@example.com", []],
    ["https://example.com\u0000evil", []],
    ["ftp://www.example.com javascript:https://example.com", []],
    ["https://localhost", []],
    ["awww.example.com", []],
  ])("extracts %j conservatively", (text, expected) => {
    expect(extractUrlsFromText(text as string)).toEqual(expected);
  });

  it("returns different valid URLs in order and ignores duplicates", () => {
    expect(extractUrlsFromText("https://example.com https://example.com/ http://example.org/login www.example.net"))
      .toEqual(["https://example.com/", "http://example.org/login", "https://www.example.net/"]);
  });
  it("caps output at the first ten valid unique candidates", () => {
    const urls = Array.from({ length: 15 }, (_, i) => `https://example${i}.com`);
    expect(extractUrlsFromText(["https:///broken", urls[0], ...urls].join(" "))).toEqual(urls.slice(0, MAX_SCREENSHOT_URLS).map((url) => `${url}/`));
  });
  it("rejects excessive individual URL length", () => {
    expect(extractUrlsFromText(`https://example.com/${"a".repeat(2048)} https://ok.example`)).toEqual(["https://ok.example/"]);
  });
});

describe("real offline English OCR smoke tests", () => {
  it("recognizes generated PNG/JPEG/WebP using the same local worker, and blank returns NO_TEXT", async () => {
    const manager = createScreenshotTextExtractor();
    const original = await sharp({ text: { text: "URGENT ACCOUNT SUSPENDED", font: "sans 36", rgba: true } })
      .flatten({ background: "white" }).extend({ top: 25, bottom: 25, left: 25, right: 25, background: "white" }).png().toBuffer();
    try {
      for (const format of ["png", "jpeg", "webp"] as ScreenshotFormat[]) {
        const bytes = await sharp(original).toFormat(format).toBuffer();
        const prepared = await prepareScreenshot({ bytes, declaredMimeType: `image/${format}` });
        if (!prepared.ok) throw new Error(prepared.reason);
        const result = await manager.extract(prepared.image);
        expect(result.status).toBe("COMPLETED");
        if (result.status === "COMPLETED") {
          expect(result.text).toContain("URGENT ACCOUNT SUSPENDED");
          expect(result.ocrConfidence).toBeGreaterThan(70);
        }
      }
      expect(await manager.extract(image)).toEqual({ status: "NO_TEXT" });
    } finally { await manager.close(); }
  }, 30_000);
});
