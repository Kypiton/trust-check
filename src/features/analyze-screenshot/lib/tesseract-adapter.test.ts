import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTesseractOcrWorker } from "./tesseract-adapter";

const state = vi.hoisted(() => ({ threads: [] as FakeThread[] }));
class FakeThread extends EventEmitter {
  stdout = { resume: vi.fn() };
  stderr = { resume: vi.fn() };
  ref = vi.fn();
  unref = vi.fn();
  postMessage = vi.fn();
  terminate = vi.fn(async () => 0);
  constructor(readonly url: URL, readonly options: object) {
    super();
    state.threads.push(this);
  }
}
vi.mock("node:worker_threads", () => ({
  Worker: class {
    constructor(url: URL, options: object) { return new FakeThread(url, options); }
  },
}));
beforeEach(() => { state.threads.length = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("local OCR thread ownership", () => {
  async function ready() {
    const initializing = createTesseractOcrWorker();
    const thread = state.threads[0];
    thread.emit("message", { type: "ready" });
    return { worker: await initializing, thread };
  }

  it("uses the local worker entry and drains SDK output without forwarding it", async () => {
    const { worker, thread } = await ready();
    expect(thread.url.pathname).toMatch(/tesseract-worker\.cjs$/);
    expect(thread.options).toEqual({ stdout: true, stderr: true, workerData: { language: "eng" } });
    expect(thread.stdout.resume).toHaveBeenCalledOnce();
    expect(thread.stderr.resume).toHaveBeenCalledOnce();
    expect(thread.unref).toHaveBeenCalled();
    const bytes = new Uint8Array([1, 2, 3]);
    const recognizing = worker.recognize(bytes);
    expect(thread.postMessage).toHaveBeenCalledWith(bytes);
    thread.emit("message", { type: "result", result: { text: "Hello", confidence: 90 } });
    expect(await recognizing).toEqual({ text: "Hello", confidence: 90 });
    await worker.terminate();
    await worker.terminate();
    expect(thread.terminate).toHaveBeenCalledOnce();
  });

  it("passes the requested OCR language to the local worker", async () => {
    const initializing = createTesseractOcrWorker("rus");
    const thread = state.threads[0];
    expect(thread.options).toEqual({ stdout: true, stderr: true, workerData: { language: "rus" } });
    thread.emit("message", { type: "ready" });
    const worker = await initializing;
    await worker.terminate();
  });

  it("rejects URL/string image inputs before sending to the engine", async () => {
    const { worker, thread } = await ready();
    await expect(worker.recognize("https://example.com/image" as unknown as Uint8Array)).rejects.toThrow("Local OCR unavailable");
    expect(thread.postMessage).not.toHaveBeenCalled();
    await worker.terminate();
  });

  it.each(["failed", "error", "exit", "timeout"])("cleans up failed initialization (%s) before rejecting", async (failure) => {
    const initializing = createTesseractOcrWorker();
    const rejected = expect(initializing).rejects.toThrow("Local OCR unavailable");
    const thread = state.threads[0];
    let terminated!: () => void;
    thread.terminate.mockImplementation(async () => {
      await new Promise<void>((resolve) => { terminated = resolve; });
      return 0;
    });
    let settled = false;
    void initializing.catch(() => { settled = true; });
    if (failure === "failed") thread.emit("message", { type: "failed" });
    else if (failure === "error") thread.emit("error", new Error("PRIVATE NATIVE FAILURE"));
    else if (failure === "exit") thread.emit("exit", 1);
    else await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    expect(thread.terminate).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    terminated();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["failed", "error", "exit", "timeout"])("turns recognition %s into a sanitized error and permits explicit termination", async (failure) => {
    const { worker, thread } = await ready();
    const recognizing = worker.recognize(new Uint8Array([1]));
    const rejected = expect(recognizing).rejects.toThrow("Local OCR unavailable");
    if (failure === "failed") thread.emit("message", { type: "failed" });
    else if (failure === "error") thread.emit("error", new Error("PRIVATE NATIVE FAILURE"));
    else if (failure === "exit") thread.emit("exit", 1);
    else await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    await worker.terminate();
    expect(thread.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
