// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InteractionButton } from "./InteractionButton";
import { Reveal } from "./Reveal";
import { RiskScore } from "@/widgets/check-result/RiskScore";

vi.mock("motion/react", async importOriginal => ({ ...await importOriginal<typeof import("motion/react")>(), useReducedMotion: () => true }));

it("keeps content, exact score and keyboard activation available with reduced motion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); const click = vi.fn();
  try {
    await act(async () => root.render(<Reveal><h1>Assessment</h1><RiskScore value={80} fresh /><InteractionButton onClick={click}>Copy result</InteractionButton></Reveal>));
    expect(container.textContent).toContain("Assessment");
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("80 / 100");
    const button = container.querySelector("button")!; button.focus();
    expect(document.activeElement).toBe(button);
    await act(async () => button.click()); expect(click).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
