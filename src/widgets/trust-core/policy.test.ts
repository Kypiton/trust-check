import { describe, expect, it } from "vitest";
import { shouldRenderTrustCoreCanvas } from "./policy";

describe("Trust Core render policy", () => {
  it("renders the full WebGL scene whenever the browser is ready, visible, and motion is allowed", () => {
    expect(
      shouldRenderTrustCoreCanvas({
        nearViewport: true,
        browserReady: true,
        webgl: true,
        reducedMotion: false,
      }),
    ).toBe(true);
  });

  it.each([
    ["outside the loading margin", { nearViewport: false, browserReady: true, webgl: true, reducedMotion: false }],
    ["before idle readiness", { nearViewport: true, browserReady: false, webgl: true, reducedMotion: false }],
    ["without WebGL", { nearViewport: true, browserReady: true, webgl: false, reducedMotion: false }],
    ["with reduced motion", { nearViewport: true, browserReady: true, webgl: true, reducedMotion: true }],
  ] as const)("keeps the lightweight fallback %s", (_label, inputs) => {
    expect(shouldRenderTrustCoreCanvas(inputs)).toBe(false);
  });
});
