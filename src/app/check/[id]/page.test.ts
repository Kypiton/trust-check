import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import CheckResultPage from "./page";
import { getMockAnalysis } from "../../../entities/check/model/mock-result";

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const previewIds = ["high", "medium", "low", "loading", "error", "insufficient", "partial"];
const page = (id: string) => CheckResultPage({ params: Promise.resolve({ id }) });

describe("development result previews", () => {
  it.each(["unknown", "chk_123", "", "HIGH", "__proto__"])("rejects unknown id %j even in development", async (id) => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getMockAnalysis(id)).toBeNull();
    await expect(page(id)).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it.each(previewIds)("renders the explicit %s preview in development", async (id) => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getMockAnalysis(id)).not.toBeNull();
    const html = renderToStaticMarkup(await page(id));
    expect(html).toContain("Development preview — sample data.");
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each([...previewIds, "unknown"])("rejects %s in production", async (id) => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(page(id)).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
