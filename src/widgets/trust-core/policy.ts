export type TrustCoreRenderInputs = {
  nearViewport: boolean;
  browserReady: boolean;
  webgl: boolean;
  reducedMotion: boolean | null;
};

export function shouldRenderTrustCoreCanvas(inputs: TrustCoreRenderInputs) {
  return Boolean(
    inputs.nearViewport &&
    inputs.browserReady &&
    inputs.webgl &&
    !inputs.reducedMotion,
  );
}
