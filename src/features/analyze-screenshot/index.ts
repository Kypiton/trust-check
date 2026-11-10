// Server-side entry point: Sharp/Node must not be imported by client components.
export {
  prepareScreenshot,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOT_PIXELS,
  MAX_NORMALIZED_SCREENSHOT_BYTES,
  MAX_SCREENSHOT_PROCESSING_CONCURRENCY,
  MAX_SCREENSHOT_QUEUE_SIZE,
  SCREENSHOT_PROCESSING_TIMEOUT_SECONDS,
} from "./lib/prepare-screenshot";
export type {
  ScreenshotInput, ScreenshotFormat, ScreenshotMimeType,
  NormalizedScreenshot, ScreenshotFailureReason, ScreenshotPreparation,
} from "./model/types";
export { extractScreenshotText, MAX_OCR_CONCURRENCY, MAX_OCR_QUEUE, MAX_OCR_TEXT_LENGTH } from "./lib/extract-screenshot-text";
export { extractUrlsFromText, MAX_SCREENSHOT_URLS } from "./lib/extract-urls-from-text";
export type { ScreenshotTextExtraction } from "./model/types";
