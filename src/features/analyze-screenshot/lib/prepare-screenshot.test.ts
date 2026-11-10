import { Buffer } from "node:buffer";
import sharp, { type Metadata, type SharpOptions } from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScreenshotFormat, ScreenshotInput } from "../model/types";
import {
  createScreenshotPreparer, prepareScreenshot, MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOT_PIXELS, MAX_NORMALIZED_SCREENSHOT_BYTES,
} from "./prepare-screenshot";

const fixtures = {} as Record<ScreenshotFormat, Buffer>;
const makeImage = () => sharp({ create: { width: 12, height: 8, channels: 3, background: "#aabbcc" } });
beforeAll(async () => {
  for (const format of ["png", "jpeg", "webp"] as const) fixtures[format] = await makeImage().toFormat(format).toBuffer();
});
afterEach(() => vi.restoreAllMocks());
const input = (bytes: Uint8Array = fixtures.png, declaredMimeType = "image/png"): ScreenshotInput => ({ bytes, declaredMimeType });

// Tiny PNG chunks for APNG and forged dimension fixtures; no committed binaries.
function chunk(type: string, data: Buffer) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

describe("screenshot validation and normalization", () => {
  it.each(["png", "jpeg", "webp"] as const)("normalizes and fully decodes %s with consistent dimensions/format", async (format) => {
    const result = await prepareScreenshot(input(fixtures[format], `image/${format}`));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected normalized image");
    expect(result.image).toMatchObject({ format, mimeType: `image/${format}`, width: 12, height: 8, size: result.image.bytes.length });
    expect(result.image.bytes).not.toBe(fixtures[format]);
    const decoded = await sharp(result.image.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 12, height: 8 });
    expect((await sharp(result.image.bytes).metadata()).format).toBe(format);
  });

  it("rejects empty input", async () => {
    expect(await prepareScreenshot(input(Buffer.alloc(0)))).toEqual({ ok: false, reason: "EMPTY_FILE" });
  });

  it.each([null, {}, { bytes: "not bytes" }, { bytes: new ArrayBuffer(10) }])("validates the runtime input shape: %j", async (value) => {
    expect(await prepareScreenshot(value as unknown as ScreenshotInput)).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });

  it("rejects over 10 MiB before opening a decoder", async () => {
    const createImage = vi.fn(sharp);
    const prepare = createScreenshotPreparer({ createImage });
    expect(await prepare(input(Buffer.alloc(MAX_SCREENSHOT_BYTES + 1)))).toEqual({ ok: false, reason: "FILE_TOO_LARGE" });
    expect(createImage).not.toHaveBeenCalled();
  });

  it("permits exactly 10 MiB, then returns only re-encoded pixels", async () => {
    const bytes = Buffer.alloc(MAX_SCREENSHOT_BYTES);
    fixtures.png.copy(bytes);
    const result = await prepareScreenshot(input(bytes));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.image.size).toBeLessThan(1024);
  });

  it("rejects random bytes claiming PNG", async () => {
    expect(await prepareScreenshot(input(Buffer.from("untrusted random bytes")))).toEqual({ ok: false, reason: "INVALID_IMAGE" });
  });

  it.each(["image/svg+xml", "image/gif", "image/tiff", "image/avif", "application/pdf", "image/bmp", "image/heif", "", "image/png; charset=utf8"])("rejects declared MIME %s before decode", async (mime) => {
    const createImage = vi.fn(sharp);
    expect(await createScreenshotPreparer({ createImage })(input(fixtures.png, mime))).toEqual({ ok: false, reason: "UNSUPPORTED_MIME_TYPE" });
    expect(createImage).not.toHaveBeenCalled();
  });

  it.each(["gif", "tiff", "avif"] as const)("rejects actual %s disguised as PNG before opening the unsupported loader", async (format) => {
    const bytes = await makeImage().toFormat(format).toBuffer();
    const createImage = vi.fn(sharp);
    expect(await createScreenshotPreparer({ createImage })(input(bytes))).toEqual({ ok: false, reason: "UNSUPPORTED_IMAGE_FORMAT" });
    expect(createImage).not.toHaveBeenCalled();
  });

  it.each(["<svg xmlns='http://www.w3.org/2000/svg'><image href='https://example.com/private'/></svg>", "\ufeff  <?xml version='1.0'?><svg/>", "%PDF-1.7", "BMfake-bitmap"])("never passes unsupported content to Sharp: %s", async (value) => {
    const createImage = vi.fn(sharp);
    expect(await createScreenshotPreparer({ createImage })(input(Buffer.from(value)))).toEqual({ ok: false, reason: "UNSUPPORTED_IMAGE_FORMAT" });
    expect(createImage).not.toHaveBeenCalled();
  });

  it("requires declared MIME to agree with actual bytes", async () => {
    expect(await prepareScreenshot(input(fixtures.jpeg))).toEqual({ ok: false, reason: "MIME_TYPE_MISMATCH" });
  });

  it("ignores a misleading filename", async () => {
    expect((await prepareScreenshot({ ...input(fixtures.jpeg, "image/jpeg"), filename: "../../screenshot.png" })).ok).toBe(true);
  });

  it("rejects corrupt data even with an allowed signature", async () => {
    expect(await prepareScreenshot(input(Buffer.from([0xff, 0xd8, 0xff, 0, 0]), "image/jpeg"))).toEqual({ ok: false, reason: "INVALID_IMAGE" });
  });

  it("rejects truncated pixel data, not just malformed headers", async () => {
    const bytes = Buffer.from(fixtures.png);
    // Keep a readable IHDR but truncate the compressed image data.
    expect((await prepareScreenshot(input(bytes.subarray(0, bytes.length - 20)))).ok).toBe(false);
  });

  it("rejects animated WebP rather than silently flattening it", async () => {
    const raw = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
    const bytes = await sharp(raw, { raw: { width: 2, height: 2, pageHeight: 1, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(bytes).metadata()).pages).toBe(2);
    expect(await prepareScreenshot(input(bytes, "image/webp"))).toEqual({ ok: false, reason: "ANIMATED_IMAGE" });
  });

  it("rejects the APNG control chunk before a decoder can flatten it", async () => {
    const control = Buffer.alloc(8);
    control.writeUInt32BE(2);
    const bytes = Buffer.concat([fixtures.png.subarray(0, 33), chunk("acTL", control), fixtures.png.subarray(33)]);
    const createImage = vi.fn(sharp);
    expect(await createScreenshotPreparer({ createImage })(input(bytes))).toEqual({ ok: false, reason: "ANIMATED_IMAGE" });
    expect(createImage).not.toHaveBeenCalled();
  });

  it("bounds pixel bombs using native limitInputPixels", async () => {
    const header = Buffer.from(fixtures.png.subarray(16, 29));
    header.writeUInt32BE(10000, 0);
    header.writeUInt32BE(10000, 4);
    const bytes = Buffer.concat([fixtures.png.subarray(0, 8), chunk("IHDR", header), fixtures.png.subarray(33)]);
    expect(await prepareScreenshot(input(bytes))).toEqual({ ok: false, reason: "PIXEL_LIMIT_EXCEEDED" });
  });

  it("applies orientation to pixels and removes EXIF/GPS/XMP/ICC", async () => {
    const raw = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255, 0, 255, 255]);
    const bytes = await sharp(raw, { raw: { width: 3, height: 2, channels: 3 } }).png()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Artist: "Private Name" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">private</x:xmpmeta>').toBuffer();
    const original = await sharp(bytes).metadata();
    expect(original).toMatchObject({ orientation: 6 });
    expect(original.exif).toBeDefined();
    expect(original.exif?.includes(Buffer.from("Private Name"))).toBe(true);
    expect(original.icc).toBeDefined();
    expect(original.xmp).toBeDefined();
    const result = await prepareScreenshot(input(bytes));
    if (!result.ok) throw new Error(result.reason);
    expect(result.image).toMatchObject({ width: 2, height: 3 });
    const metadata = await sharp(result.image.bytes).metadata();
    for (const key of ["exif", "xmp", "iptc", "icc", "orientation"] as const) expect(metadata[key]).toBeUndefined();
    expect(result.image.bytes).not.toEqual(bytes);
    const pixels = await sharp(result.image.bytes).raw().toBuffer();
    // Orientation 6 rotates clockwise: bottom-left becomes top-left.
    expect([...pixels.subarray(0, 3)]).toEqual([255, 255, 0]);
    expect(Object.keys(result.image).sort()).toEqual(["bytes", "format", "height", "mimeType", "size", "width"]);
  });

  it("does not mutate input and produces stable output", async () => {
    const bytes = new Uint8Array(fixtures.png);
    const original = bytes.slice();
    expect(await prepareScreenshot(input(bytes))).toEqual(await prepareScreenshot(input(bytes)));
    expect(bytes).toEqual(original);
  });

  it("does not invoke network access or log user content", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    expect((await prepareScreenshot(input())).ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    logs.forEach((log) => expect(log).not.toHaveBeenCalled());
  });
});

describe("trusted decoder boundary and processing admission", () => {
  function metadataPreparer(patch: Partial<Metadata>) {
    return createScreenshotPreparer({ createImage: (bytes, options) => {
      const image = sharp(bytes, options);
      const read = image.metadata.bind(image);
      vi.spyOn(image, "metadata").mockImplementation(async () => ({ ...await read(), ...patch }));
      return image;
    } });
  }

  it.each([0, -1, NaN, Infinity, 1.5, undefined])("rejects invalid decoded dimensions %s", async (width) => {
    expect(await metadataPreparer({ width })(input())).toEqual({ ok: false, reason: "INVALID_IMAGE" });
  });
  it("checks decoded format independently of the signature", async () => {
    expect(await metadataPreparer({ format: "gif" })(input())).toEqual({ ok: false, reason: "UNSUPPORTED_IMAGE_FORMAT" });
    expect(await metadataPreparer({ format: "jpeg" })(input())).toEqual({ ok: false, reason: "MIME_TYPE_MISMATCH" });
  });
  it("checks decoded pixels independently of the native limit", async () => {
    expect(await metadataPreparer({ width: MAX_SCREENSHOT_PIXELS, height: 2 })(input())).toEqual({ ok: false, reason: "PIXEL_LIMIT_EXCEEDED" });
  });
  it("rejects multiple pages reported by metadata", async () => {
    expect(await metadataPreparer({ pages: 2 })(input())).toEqual({ ok: false, reason: "ANIMATED_IMAGE" });
  });

  it.each([MAX_NORMALIZED_SCREENSHOT_BYTES, MAX_NORMALIZED_SCREENSHOT_BYTES + 1])("bounds normalized output at %s bytes", async (size) => {
    const prepare = createScreenshotPreparer({ createImage: (bytes, options) => {
      const image = sharp(bytes, options);
      vi.spyOn(image, "toBuffer").mockReturnValue(Promise.resolve({ data: Buffer.alloc(size), info: { width: 12, height: 8, format: "png" } }) as never);
      return image;
    } });
    const result = await prepare(input());
    if (size > MAX_NORMALIZED_SCREENSHOT_BYTES) expect(result).toEqual({ ok: false, reason: "NORMALIZED_IMAGE_TOO_LARGE" });
    else expect(result.ok).toBe(true);
  });

  it("sets strict decoder safety and a native three-second timeout", async () => {
    const timeout = vi.fn();
    const createImage = vi.fn((bytes: Buffer, options: SharpOptions) => {
      const image = sharp(bytes, options);
      const nativeTimeout = image.timeout.bind(image);
      vi.spyOn(image, "timeout").mockImplementation((options) => { timeout(options); return nativeTimeout(options); });
      return image;
    });
    expect((await createScreenshotPreparer({ createImage })(input())).ok).toBe(true);
    expect(createImage.mock.calls[0][1]).toEqual({ limitInputPixels: MAX_SCREENSHOT_PIXELS, failOn: "warning" });
    expect(timeout).toHaveBeenCalledWith({ seconds: 3 });
  });

  it.each(["success", "invalid", "timeout"])("caps active jobs at two, queues ten, and releases slots after %s", async (outcome) => {
    const pending: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    let calls = 0;
    const prepare = createScreenshotPreparer({ createImage: (bytes, options) => {
      const image = sharp(bytes, options);
      const read = image.metadata.bind(image);
      const call = calls++;
      vi.spyOn(image, "metadata").mockImplementation(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => pending.push(resolve));
        active--;
        if (call === 0 && outcome !== "success") throw new Error(outcome === "timeout" ? "timeout: 0% complete" : "invalid image PRIVATE CONTENT");
        return read();
      });
      return image;
    } });
    const requests = Array.from({ length: 12 }, () => prepare(input()));
    expect(calls).toBe(2);
    expect(await prepare(input())).toEqual({ ok: false, reason: "BUSY" });
    expect(await prepare(input())).toEqual({ ok: false, reason: "BUSY" });
    expect(calls).toBe(2);
    for (let i = 0; i < 12; i++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
      pending.shift()!();
    }
    const results = await Promise.all(requests);
    expect(peak).toBe(2);
    expect(calls).toBe(12);
    if (outcome !== "success") expect(results[0]).toEqual({ ok: false, reason: outcome === "timeout" ? "TIMEOUT" : "INVALID_IMAGE" });
    expect(results.slice(1).every((result) => result.ok)).toBe(true);
    const next = prepare(input());
    await vi.waitFor(() => expect(pending.length).toBe(1));
    pending.shift()!();
    expect((await next).ok).toBe(true);
  });

  it("snapshots admitted inputs before callers can mutate queued bytes", async () => {
    const pending: (() => void)[] = [];
    const prepare = createScreenshotPreparer({ createImage: (bytes, options) => {
      const image = sharp(bytes, options);
      const read = image.metadata.bind(image);
      vi.spyOn(image, "metadata").mockImplementation(async () => {
        await new Promise<void>((resolve) => pending.push(resolve));
        return read();
      });
      return image;
    } });
    const bytes = Buffer.from(fixtures.png);
    const requests = [prepare(input()), prepare(input()), prepare(input(bytes))];
    bytes.fill(0);
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
      pending.shift()!();
    }
    expect((await Promise.all(requests)).every((result) => result.ok)).toBe(true);
  });
});
