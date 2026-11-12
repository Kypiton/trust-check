// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import HistoryError from "./error";

it("offers a generic error state and re-fetches through the route retry callback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const retry = vi.fn();
  try {
    await act(async () => root.render(<HistoryError error={new Error("private detail")} retry={retry} />));
    expect(container.textContent).toContain("Your history is temporarily unavailable");
    expect(container.textContent).not.toMatch(/Prisma|DATABASE_URL|userId/);
    await act(async () => container.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
