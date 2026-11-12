/* eslint-disable @typescript-eslint/no-require-imports -- Node worker entry runs directly, without a TypeScript loader. */
const { parentPort, workerData } = require("node:worker_threads");
const { createWorker, OEM } = require("tesseract.js");
const { langPath: engPath } = require("@tesseract.js-data/eng");
const { langPath: rusPath } = require("@tesseract.js-data/rus");

const language = workerData && workerData.language === "rus" ? "rus" : "eng";
const langPath = language === "rus" ? rusPath : engPath;
const blank = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");
const fail = () => parentPort.postMessage({ type: "failed" });

async function initialize() {
  const worker = await createWorker(language, OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: "none", logger: () => {}, errorHandler: fail, logging: false });
  await worker.setParameters({ classify_enable_learning: "0" });
  parentPort.on("message", async (bytes) => {
    try {
      if (!(bytes instanceof Uint8Array)) throw new Error("Invalid image input");
      const { data } = await worker.recognize(Buffer.from(bytes), {}, { text: true });
      const result = { text: data.text, confidence: data.confidence };
      await worker.recognize(blank, {}, { text: false });
      await worker.removeFile("/input");
      parentPort.postMessage({ type: "result", result });
    } catch { fail(); }
  });
  parentPort.postMessage({ type: "ready" });
}

initialize().catch(fail);
