import { Buffer } from "node:buffer";
import sharp, { type Sharp, type SharpOptions } from "sharp";
import type { ScreenshotFailureReason, ScreenshotFormat, ScreenshotInput, ScreenshotMimeType, ScreenshotPreparation } from "../model/types";

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const MAX_SCREENSHOT_PIXELS = 25_000_000;
export const MAX_NORMALIZED_SCREENSHOT_BYTES = 15 * 1024 * 1024;
export const MAX_SCREENSHOT_PROCESSING_CONCURRENCY = 2;
export const MAX_SCREENSHOT_QUEUE_SIZE = 10;
export const SCREENSHOT_PROCESSING_TIMEOUT_SECONDS = 3;

const mimeTypes: Record<ScreenshotFormat, ScreenshotMimeType> = {
  png: "image/png", jpeg: "image/jpeg", webp: "image/webp",
};
const failure = (reason: ScreenshotFailureReason): ScreenshotPreparation => ({ ok: false, reason });
const validDimension = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Only these signatures may reach libvips. In particular, never invoke its SVG loader. */
function signature(bytes: Buffer): ScreenshotFormat | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
}

function unsupportedSignature(bytes: Buffer): boolean {
  const prefix = bytes.subarray(0, 256).toString("utf8").trimStart();
  return prefix.startsWith("<") || /^(GIF8[79]a|BM|%PDF-|II|MM)/.test(prefix) ||
    bytes.toString("ascii", 4, 8) === "ftyp";
}

/** libvips can treat APNG as a single PNG. Reject its animation control chunk too. */
function pngContainerFailure(bytes: Buffer): ScreenshotFailureReason | undefined {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return "INVALID_IMAGE";
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return "ANIMATED_IMAGE";
    if (type === "IEND") return;
    offset += length + 12;
  }
  return "INVALID_IMAGE";
}

type ImageFactory = (bytes: Buffer, options: SharpOptions) => Sharp;

async function normalize(bytes: Buffer, declaredMimeType: string, createImage: ImageFactory): Promise<ScreenshotPreparation> {
  const format = signature(bytes);
  if (!format) return failure(unsupportedSignature(bytes) ? "UNSUPPORTED_IMAGE_FORMAT" : "INVALID_IMAGE");
  if (mimeTypes[format] !== declaredMimeType) return failure("MIME_TYPE_MISMATCH");
  if (format === "png") {
    const reason = pngContainerFailure(bytes);
    if (reason) return failure(reason);
  }

  let image: Sharp | undefined;
  try {
    image = createImage(bytes, { limitInputPixels: MAX_SCREENSHOT_PIXELS, failOn: "warning" });
    image.timeout({ seconds: SCREENSHOT_PROCESSING_TIMEOUT_SECONDS });
    const metadata = await image.metadata();
    if (metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") {
      return failure("UNSUPPORTED_IMAGE_FORMAT");
    }
    if (metadata.format !== format || mimeTypes[metadata.format] !== declaredMimeType) return failure("MIME_TYPE_MISMATCH");
    if (metadata.pages !== undefined && metadata.pages > 1) return failure("ANIMATED_IMAGE");
    if (!validDimension(metadata.width) || !validDimension(metadata.height) ||
      (metadata.pages !== undefined && metadata.pages !== 1)) return failure("INVALID_IMAGE");
    if (metadata.width * metadata.height > MAX_SCREENSHOT_PIXELS) return failure("PIXEL_LIMIT_EXCEEDED");

    // Sharp strips metadata by default and converts to sRGB without retaining ICC.
    // Lossless PNG/WebP and high-quality 4:4:4 JPEG preserve text for later OCR.
    image.autoOrient();
    if (format === "png") image.png();
    else if (format === "jpeg") image.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
    else image.webp({ lossless: true, effort: 2 });
    const { data, info } = await image.toBuffer({ resolveWithObject: true });
    if (data.length > MAX_NORMALIZED_SCREENSHOT_BYTES) return failure("NORMALIZED_IMAGE_TOO_LARGE");
    if (!data.length || info.format !== format || !validDimension(info.width) || !validDimension(info.height)) {
      return failure("PROCESSING_FAILED");
    }
    if (info.width * info.height > MAX_SCREENSHOT_PIXELS) return failure("PIXEL_LIMIT_EXCEEDED");
    return { ok: true, image: {
      bytes: data, mimeType: mimeTypes[format], format,
      width: info.width, height: info.height, size: data.length,
    } };
  } catch (error) {
    // Classify native failures internally; never expose native messages or input.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("exceeds pixel limit")) return failure("PIXEL_LIMIT_EXCEEDED");
    if (/\btimeout\b/i.test(message)) return failure("TIMEOUT");
    return failure("INVALID_IMAGE");
  } finally {
    image?.destroy();
  }
}

/** Internal factory for isolated tests. Production callers use the singleton below. */
export function createScreenshotPreparer({ createImage = sharp }: { createImage?: ImageFactory } = {}) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async function prepare(input: ScreenshotInput): Promise<ScreenshotPreparation> {
    // Runtime checks are still required when called by a future untrusted boundary.
    if (!input || !(input.bytes instanceof Uint8Array)) return failure("INVALID_INPUT");
    if (!input.bytes.byteLength) return failure("EMPTY_FILE");
    if (input.bytes.byteLength > MAX_SCREENSHOT_BYTES) return failure("FILE_TOO_LARGE");
    if (!Object.values(mimeTypes).includes(input.declaredMimeType as ScreenshotMimeType)) return failure("UNSUPPORTED_MIME_TYPE");
    if (active >= MAX_SCREENSHOT_PROCESSING_CONCURRENCY && queue.length >= MAX_SCREENSHOT_QUEUE_SIZE) return failure("BUSY");

    // Copy only admitted, size-bounded inputs. Queued caller mutations must not
    // change the bytes validated/decoded; never retain filename or other fields.
    const bytes = Buffer.from(input.bytes);
    const mimeType = input.declaredMimeType;
    return new Promise((resolve) => {
      const start = async () => {
        active += 1;
        try {
          resolve(await normalize(bytes, mimeType, createImage));
        } catch {
          resolve(failure("PROCESSING_FAILED"));
        } finally {
          // Native work has settled before releasing the slot, including timeout.
          // Never race a JS timer against still-running libvips processing.
          active -= 1;
          queue.shift()?.();
        }
      };
      if (active < MAX_SCREENSHOT_PROCESSING_CONCURRENCY) void start();
      else queue.push(() => { void start(); });
    });
  };
}

/** Shared process-local admission: two active images and at most ten waiting. */
export const prepareScreenshot = createScreenshotPreparer();
