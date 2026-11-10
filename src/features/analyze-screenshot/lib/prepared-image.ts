import type { NormalizedScreenshot } from "../model/types";

// Process-local provenance only; weak references do not retain screenshots.
// An object from a request/JSON payload cannot masquerade as prepared output.
const prepared = new WeakMap<NormalizedScreenshot, Uint8Array>();

export function markPreparedImage(image: NormalizedScreenshot): NormalizedScreenshot {
  prepared.set(image, image.bytes);
  return image;
}

export function isPreparedImage(image: NormalizedScreenshot): boolean {
  return !!image && prepared.has(image) && prepared.get(image) === image.bytes;
}
