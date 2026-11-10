import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OcrOutput, OcrWorker } from "./ocr-adapter";

const WORKER_OPERATION_TIMEOUT_MS = 30_000;

/**
 * Own the Node thread so initialization errors, crashes and timeouts can all be
 * terminated, even before Tesseract's createWorker() returns its worker handle.
 * Tesseract's inner worker is reused; one supervisor/engine pair exists at most.
 */
export async function createTesseractOcrWorker(): Promise<OcrWorker> {
  // This entry runs as native CommonJS, not as a Next.js-bundled worker chunk.
  // next.config.ts traces it and its local runtime/model assets for deployment.
  const thread = new Worker(pathToFileURL(resolve(process.cwd(), "src/features/analyze-screenshot/lib/tesseract-worker.cjs")), {
    stdout: true,
    stderr: true,
  });
  // Do not forward SDK/native diagnostics that could contain recognized data.
  thread.stdout.resume();
  thread.stderr.resume();
  let failed = false;
  let termination: Promise<void> | undefined;
  let pending: { resolve: (value?: OcrOutput) => void; reject: () => void } | undefined;
  const error = () => new Error("Local OCR unavailable");
  function reject() {
    failed = true;
    pending?.reject();
  }
  thread.on("error", reject);
  thread.on("exit", reject);
  thread.on("message", (message) => {
    if (message.type === "failed") reject();
    else if (message.type === "ready") pending?.resolve();
    else if (message.type === "result") pending?.resolve(message.result);
  });

  function wait(send?: () => void): Promise<OcrOutput | undefined> {
    if (failed || pending) return Promise.reject(error());
    thread.ref();
    return new Promise((resolve, rejectPromise) => {
      const timer = setTimeout(reject, WORKER_OPERATION_TIMEOUT_MS);
      const finish = () => {
        clearTimeout(timer);
        pending = undefined;
        thread.unref();
      };
      pending = {
        resolve: (value) => { finish(); resolve(value); },
        reject: () => { finish(); rejectPromise(error()); },
      };
      try { send?.(); } catch { reject(); }
    });
  }

  function terminate(): Promise<void> {
    if (!termination) {
      reject();
      // Await actual thread exit before the manager releases its processing slot.
      termination = thread.terminate().then(() => {});
    }
    return termination;
  }

  try {
    await wait();
  } catch {
    await terminate();
    throw error();
  }
  return {
    async recognize(bytes) {
      if (!(bytes instanceof Uint8Array)) throw error();
      const result = await wait(() => thread.postMessage(bytes));
      if (!result) throw error();
      return result;
    },
    terminate,
  };
}
