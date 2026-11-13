import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  poweredByHeader: false,
  // Development action diagnostics otherwise include submitted argument values.
  logging: { serverFunctions: false },
  async headers() {
    const privateHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ];
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        { key: "X-Frame-Options", value: "DENY" },
        // Framing only: no brittle script/style policy that would break hydration.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ] },
      ...["/history/:path*", "/account/:path*", "/api/:path*", "/check/:path+", "/login", "/register"]
        .map(source => ({ source, headers: privateHeaders })),
    ];
  },
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
      "./node_modules/@tesseract.js-data/rus/**/*",
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*",
    ],
  },
};

export default nextConfig;
