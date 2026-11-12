// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Toast, useToast } from "./Toast";

function Example() {
  const { notice, notify } = useToast();
  return <><button onClick={() => notify("Example loaded")}>Try example</button><Toast notice={notice} /></>;
}

it("hydrates without a portal mismatch and announces transient feedback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const errors: unknown[] = [];
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Example />); document.body.append(container);
  let root: Root | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, <Example />, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("");
    await act(async () => container.querySelector("button")!.click());
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Example loaded");
  } finally {
    await act(async () => root?.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
