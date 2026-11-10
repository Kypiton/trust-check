import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 10 MiB image plus multipart framing; the action enforces the file limit.
    serverActions: { bodySizeLimit: "11mb" },
  },
  outputFileTracingIncludes: {
    "/*": [
      "./src/features/analyze-screenshot/lib/tesseract-worker.cjs",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/**/*",
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
