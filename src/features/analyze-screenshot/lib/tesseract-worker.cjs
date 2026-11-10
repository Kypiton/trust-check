/* eslint-disable @typescript-eslint/no-require-imports -- Node worker entry runs directly, without a TypeScript loader. */
const { parentPort } = require("node:worker_threads");
const { createWorker, OEM } = require("tesseract.js");
const { langPath } = require("@tesseract.js-data/eng");

// A trusted blank PNG replaces the previous page in the reusable WASM engine.
const blank = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");
const fail = () => parentPort.postMessage({ type: "failed" });

async function initialize() {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath,
    gzip: true,
    cacheMethod: "none",
    logger: () => {},
    errorHandler: fail,
    logging: false,
  });
  await worker.setParameters({ classify_enable_learning: "0" });
  parentPort.on("message", async (bytes) => {
    try {
      if (!(bytes instanceof Uint8Array)) throw new Error("Invalid image input");
      const { data } = await worker.recognize(Buffer.from(bytes), {}, { text: true });
      const result = { text: data.text, confidence: data.confidence };
      // Tesseract keeps /input in its in-memory filesystem and the last page in
      // its engine. Replace that page, then unlink the input before returning.
      await worker.recognize(blank, {}, { text: false });
      await worker.removeFile("/input");
      parentPort.postMessage({ type: "result", result });
    } catch {
      // The owner terminates this thread and its nested Tesseract worker.
      fail();
    }
  });
  parentPort.postMessage({ type: "ready" });
}

initialize().catch(fail);
