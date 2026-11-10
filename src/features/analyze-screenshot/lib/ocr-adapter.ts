/** Provider-neutral boundary; no Tesseract types escape the local adapter. */
export type OcrOutput = { text: unknown; confidence?: unknown };
export type OcrWorker = {
  recognize: (bytes: Uint8Array) => Promise<OcrOutput>;
  terminate: () => Promise<void>;
};
export type OcrWorkerFactory = () => Promise<OcrWorker>;
