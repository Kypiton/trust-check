export type ScreenshotFormat = "png" | "jpeg" | "webp";
export type ScreenshotMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ScreenshotInput = {
  bytes: Uint8Array;
  declaredMimeType: string;
  /** Informational only; never used to select a decoder or retained. */
  filename?: string;
};

export type NormalizedScreenshot = {
  bytes: Uint8Array;
  mimeType: ScreenshotMimeType;
  format: ScreenshotFormat;
  width: number;
  height: number;
  size: number;
};

export type ScreenshotFailureReason =
  | "INVALID_INPUT"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MIME_TYPE"
  | "MIME_TYPE_MISMATCH"
  | "INVALID_IMAGE"
  | "UNSUPPORTED_IMAGE_FORMAT"
  | "ANIMATED_IMAGE"
  | "PIXEL_LIMIT_EXCEEDED"
  | "NORMALIZED_IMAGE_TOO_LARGE"
  | "BUSY"
  | "TIMEOUT"
  | "PROCESSING_FAILED";

export type ScreenshotPreparation =
  | { ok: true; image: NormalizedScreenshot }
  | { ok: false; reason: ScreenshotFailureReason };
