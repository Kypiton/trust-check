// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CheckResult as CheckResultData } from "@/entities/check/model/types";
import { CheckResult } from "./CheckResult";

const result: CheckResultData = {
  riskLevel: "HIGH",
  riskScore: 80,
  confidence: "HIGH",
  summary: "Several warning signs were detected.",
  signals: [{ code: "OTP_REQUEST", title: "Requests a verification code", description: "Requests a one-time code." }],
  recommendedActions: [{ code: "PROTECT_CODES", title: "Do not share verification codes" }],
  analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "COMPLETED" }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(CheckResult, { result })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  vi.unstubAllGlobals();
});

it("copies a compact result and confirms the action without exposing submitted input", async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Copy result"));
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText.mock.calls[0][0]).toContain("TrustCheck — High Risk");
  expect(document.querySelector('[role="status"]')?.textContent).toContain("Result copied");
});

it("keeps the exact final score accessible immediately for a fresh result", async () => {
  await act(async () => root.render(createElement(CheckResult, { result, fresh: true })));
  expect(container.querySelector(".sr-only")?.textContent).toBe("80 / 100");
  expect(container.textContent).toContain("High Risk");
  expect(container.textContent).toContain("Several warning signs were detected.");
  expect(container.textContent).toContain("Do not share verification codes");
});
