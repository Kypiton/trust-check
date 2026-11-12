export type ScreenshotFormat = "png" | "jpeg" | "webp";
export type ScreenshotMimeType = "image/png" | "image/jpeg" | "image/webp";
export type ScreenshotOcrLanguage = "eng" | "rus";

export type ScreenshotInput = {
  bytes: Uint8Array;
  declaredMimeType: string;
  /** Informational only; never used to select a decoder or retained. */
  filename?: string;
  /** OCR language selected by the user interface. Defaults to English. */
  ocrLanguage?: ScreenshotOcrLanguage;
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

export type ScreenshotTextExtraction =
  | { status: "COMPLETED"; text: string; ocrConfidence: number | null; truncated: boolean }
  | { status: "NO_TEXT" }
  | { status: "FAILED"; reason: "INVALID_INPUT" | "BUSY" | "OCR_FAILED" | "CLOSED" };
