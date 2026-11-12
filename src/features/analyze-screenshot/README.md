# Standalone screenshot extraction

This feature requires a Node.js server runtime. It has no React, Server Action,
network-analysis, Risk Engine, or TrustCheck Confidence Engine integration.

```ts
const prepared = await prepareScreenshot({ bytes, declaredMimeType });
if (prepared.ok) {
  const ocr = await extractScreenshotText(prepared.image, "eng");
  if (ocr.status === "COMPLETED") {
    const urls = extractUrlsFromText(ocr.text);
  }
}
```

Pass the original successful `image` object directly, without serializing or
mutating it. A weak registry verifies preparation provenance without retaining
screenshots or repeating decoding. Admission takes an owned byte snapshot.

OCR uses Tesseract.js 7 and locally installed `@tesseract.js-data/eng` and
`@tesseract.js-data/rus` models. English (`eng`) and Russian (`rus`) are supported;
the caller selects one language per recognition job. No language/model download occurs
during analysis. Language caches, debug outputs and logging are disabled. Only text
and overall OCR confidence are returned; hOCR, TSV and blocks are not requested.
`ocrConfidence` is a provider measurement, separate from TrustCheck confidence.

The process-local manager lazily creates and reuses one OCR worker, with at most
one active job and five waiting jobs. Initialization counts as active work.
Excess requests receive `FAILED/BUSY`. A small Node supervisor owns Tesseract's
engine thread, so failures during initialization can be terminated even before
the SDK exposes a handle. Both threads are bounded to one pair, independent of
the screenshot preparation guard. Initialization and recognition each have a
30-second failsafe; termination is awaited before admitting the next job.
Failed workers are discarded and the next request initializes a new worker.

The adapter replaces the last page with a trusted blank image and removes
Tesseract's virtual `/input` after each recognition. That filesystem is WASM
memory, not disk. Pixels/text are not persisted or logged. SDK/native stdout and
stderr are discarded. Normal memory reclamation applies; this is not a promise
of cryptographic memory zeroization. The reusable worker is unreferenced when
idle. Test managers expose `close()` for deterministic shutdown.

Text is capped at 20,000 UTF-16 code units without splitting a surrogate pair;
`truncated` records whether the raw output exceeded that limit. CRLF/CR become
LF, outer whitespace is trimmed, and repeated blank lines are collapsed without
changing case or meaningful interior spacing.

URL extraction recognizes HTTP(S) and `www.` prefixes, removes surrounding
sentence punctuation, and uses the standard URL parser for serialization and
hostname normalization. Bare domains, email fragments, credentials and malformed
hosts are omitted conservatively. Results preserve encounter order and stop at
ten unique normalized URLs. Extraction never fetches or judges a destination.

Deployment must ship `lib/tesseract-worker.cjs`, the Tesseract runtime/core and
the English and Russian data packages, and support Node worker threads/WASM. Keep these
server assets out of client bundles. A future bundled/standalone deployment may
need explicit server asset tracing; no live app route imports this feature yet.
The provider-neutral `OcrWorker` interface isolates those deployment details.

Tests use injected workers for output, queue and recovery boundaries. One local
smoke test generates English text with Sharp and runs real OCR on normalized
PNG, JPEG and WebP, plus a blank image. Language-switch tests verify that changing
`eng`/`rus` replaces the cached worker instead of reusing the wrong model. Tests use
installed assets only.
