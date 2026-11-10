import { Buffer } from "node:buffer";
import type { NormalizedScreenshot, ScreenshotTextExtraction } from "../model/types";
import type { OcrWorker, OcrWorkerFactory } from "./ocr-adapter";
import { isPreparedImage } from "./prepared-image";
import { createTesseractOcrWorker } from "./tesseract-adapter";

export const MAX_OCR_CONCURRENCY = 1;
export const MAX_OCR_QUEUE = 5;
export const MAX_OCR_TEXT_LENGTH = 20_000;

function normalizeOutput(text: string): { text: string; truncated: boolean } {
  // Bound work before normalization. Avoid splitting a UTF-16 surrogate pair.
  const truncated = text.length > MAX_OCR_TEXT_LENGTH;
  let end = Math.min(text.length, MAX_OCR_TEXT_LENGTH);
  if (truncated && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return {
    text: text.slice(0, end).replace(/\r\n?/g, "\n").replace(/\n(?:[\t ]*\n){2,}/g, "\n\n").trim(),
    truncated,
  };
}

/** Isolated manager for tests/shutdown; application calls use the singleton. */
export function createScreenshotTextExtractor({ createWorker = createTesseractOcrWorker }: { createWorker?: OcrWorkerFactory } = {}) {
  let worker: OcrWorker | undefined;
  let active = false;
  let closed = false;
  let closePromise: Promise<void> | undefined;
  let becameIdle: (() => void) | undefined;
  const queue: { start: () => void; cancel: () => void }[] = [];

  async function discardWorker() {
    const previous = worker;
    worker = undefined;
    await previous?.terminate();
  }

  async function extract(image: NormalizedScreenshot): Promise<ScreenshotTextExtraction> {
    if (!isPreparedImage(image)) return { status: "FAILED", reason: "INVALID_INPUT" };
    if (closed) return { status: "FAILED", reason: "CLOSED" };
    if (active && queue.length >= MAX_OCR_QUEUE) return { status: "FAILED", reason: "BUSY" };
    // Do not retain the caller's object or allow queued caller mutations.
    const bytes = Buffer.from(image.bytes);
    return new Promise((resolve) => {
      const start = async () => {
        active = true;
        try {
          worker ??= await createWorker();
          const result = await worker.recognize(bytes);
          if (typeof result.text !== "string") throw new Error("Invalid OCR output");
          const normalized = normalizeOutput(result.text);
          if (!normalized.text) resolve({ status: "NO_TEXT" });
          else resolve({
            status: "COMPLETED", ...normalized,
            ocrConfidence: typeof result.confidence === "number" && Number.isFinite(result.confidence) &&
              result.confidence >= 0 && result.confidence <= 100 ? result.confidence : null,
          });
        } catch {
          try { await discardWorker(); } catch {
            // Do not create more workers if termination cannot be confirmed.
            closed = true;
            for (const job of queue.splice(0)) job.cancel();
          }
          resolve({ status: "FAILED", reason: "OCR_FAILED" });
        } finally {
          active = false;
          const next = queue.shift();
          if (next) next.start();
          else becameIdle?.();
        }
      };
      if (!active) void start();
      else queue.push({
        start: () => { void start(); },
        cancel: () => resolve({ status: "FAILED", reason: "CLOSED" }),
      });
    });
  }

  function close(): Promise<void> {
    if (!closePromise) {
      closed = true;
      for (const job of queue.splice(0)) job.cancel();
      closePromise = (async () => {
        if (active) await new Promise<void>((resolve) => { becameIdle = resolve; });
        await discardWorker();
      })();
    }
    return closePromise;
  }
  return { extract, close };
}

const extractor = createScreenshotTextExtractor();
/** Accepts the successful image object returned by prepareScreenshot, not raw input. */
export const extractScreenshotText = extractor.extract;
