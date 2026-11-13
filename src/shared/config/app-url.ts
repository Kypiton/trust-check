type Environment = Record<string, string | undefined>;

/** Canonical origin only: never derive public metadata from Host or submitted data. */
export function parseAppOrigin(value: string, production: boolean, name = "APP_URL"): URL {
  const invalid = () => new Error(`Invalid ${name}: configure an absolute ${production ? "HTTPS" : "HTTP(S)"} origin without credentials, path, query or fragment.`);
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw invalid();
  if (production) {
    const hostname = url.hostname.toLowerCase();
    const reservedDocumentationHost = /(^|\.)(example|test|invalid|localhost)$/.test(hostname)
      || ["example.com", "example.net", "example.org"].some(base => hostname === base || hostname.endsWith(`.${base}`));
    if (
      url.protocol !== "https:"
      || !hostname.includes(".")
      || hostname.endsWith(".")
      || /(^|\.)(local|internal)$/.test(hostname)
      || reservedDocumentationHost
      || /^[\d.]+$/.test(hostname)
      || hostname.includes(":")
    ) throw invalid();
  }
  return new URL(url.origin);
}

export function getAppUrl(env: Environment = process.env): URL {
  const value = env.APP_URL?.trim();

  if (value) {
    return parseAppOrigin(value, env.NODE_ENV === "production");
  }

  const vercelProductionUrl =
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (vercelProductionUrl) {
    return parseAppOrigin(
      `https://${vercelProductionUrl}`,
      true,
      "VERCEL_PROJECT_PRODUCTION_URL",
    );
  }

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return new URL("http://localhost:3000");
  }

  throw new Error(
    "APP_URL or VERCEL_PROJECT_PRODUCTION_URL is required in production.",
  );
}
