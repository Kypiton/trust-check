import { describe, expect, it } from "vitest";
import { shouldRenderTrustCoreCanvas } from "./policy";

describe("Trust Core rendering policy", () => {
  it("renders WebGL only when the hero is ready, visible enough and motion is allowed", () => {
    expect(shouldRenderTrustCoreCanvas({ nearViewport: true, browserReady: true, webgl: true, mobile: false, reducedMotion: false })).toBe(true);
  });

  it.each([
    ["outside the loading margin", { nearViewport: false, browserReady: true, webgl: true, mobile: false, reducedMotion: false }],
    ["before idle readiness", { nearViewport: true, browserReady: false, webgl: true, mobile: false, reducedMotion: false }],
    ["without WebGL", { nearViewport: true, browserReady: true, webgl: false, mobile: false, reducedMotion: false }],
    ["on compact mobile", { nearViewport: true, browserReady: true, webgl: true, mobile: true, reducedMotion: false }],
    ["with reduced motion", { nearViewport: true, browserReady: true, webgl: true, mobile: false, reducedMotion: true }],
  ])("keeps the lightweight fallback %s", (_label, inputs) => {
    expect(shouldRenderTrustCoreCanvas(inputs)).toBe(false);
  });
});
