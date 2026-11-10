// Server-only entry point: node:http/https/dns/tls prevent client bundling.
export { safeHttp, createSafeHttp } from "./safe-http";
export type { SafeHttpResult, SafeHttpFailureReason } from "./safe-http";
