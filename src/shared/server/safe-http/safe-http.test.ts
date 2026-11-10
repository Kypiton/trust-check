import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import type { PeerCertificate } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSafeHttp, MAX_SAFE_HTTP_HEADER_BYTES, MAX_SAFE_HTTP_CONCURRENCY, MAX_SAFE_HTTP_QUEUE, SAFE_HTTP_TIMEOUT_MS } from "./safe-http";
import type { ResolveAddresses, ResolvedAddress } from "./dns";

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:4700:4700::1111";
class MockRequest extends EventEmitter {
  destroyed = false;
  end = vi.fn();
  destroy = vi.fn(() => { this.destroyed = true; this.emit("close"); return this; });
}
function mockResponse(statusCode = 200, location?: string) {
  return Object.assign(new EventEmitter(), {
    statusCode, headers: location === undefined ? {} : { location },
    destroy: vi.fn(), read: vi.fn(), resume: vi.fn(),
  });
}
function setup(addresses: readonly ResolvedAddress[] = [{ address: PUBLIC_V4, family: 4 }]) {
  const requests: { options: RequestOptions; request: MockRequest; respond: (status?: number, location?: string) => ReturnType<typeof mockResponse> }[] = [];
  const resolver = vi.fn<ResolveAddresses>().mockResolvedValue(addresses);
  const transport = (options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
    const request = new MockRequest();
    requests.push({ options, request, respond: (status, location) => {
      const response = mockResponse(status, location);
      onResponse(response as unknown as IncomingMessage);
      return response;
    } });
    return request as unknown as ClientRequest;
  };
  const http = vi.fn(transport);
  const https = vi.fn(transport);
  return { run: createSafeHttp({ resolve: resolver, httpRequest: http, httpsRequest: https, now: Date.now }), resolver, http, https, requests };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("URL validation before DNS", () => {
  it.each(["http", "https"])("accepts explicit %s and uses its standard port", async (protocol) => {
    const h = setup();
    const pending = h.run(`${protocol}://example.com:${protocol === "http" ? 80 : 443}/`);
    await flush();
    expect(h.resolver).toHaveBeenCalledExactlyOnceWith("example.com", expect.any(AbortSignal));
    expect(h.requests[0].options.port).toBe(protocol === "http" ? 80 : 443);
    expect(protocol === "http" ? h.http : h.https).toHaveBeenCalledTimes(1);
    h.requests[0].respond();
    expect(await pending).toEqual({ ok: true, statusCode: 200, hostname: "example.com", resolvedAddress: PUBLIC_V4 });
  });

  it.each([
    ["ftp://example.com", "UNSUPPORTED_PROTOCOL"], ["javascript:alert(1)", "UNSUPPORTED_PROTOCOL"],
    ["data:text/html,hi", "UNSUPPORTED_PROTOCOL"], ["file:///etc/passwd", "UNSUPPORTED_PROTOCOL"],
    ["gopher://example.com", "UNSUPPORTED_PROTOCOL"], ["ws://example.com", "UNSUPPORTED_PROTOCOL"], ["wss://example.com", "UNSUPPORTED_PROTOCOL"],
    ["http://user:pass@example.com", "CREDENTIALS_NOT_ALLOWED"], ["https://token@example.com", "CREDENTIALS_NOT_ALLOWED"],
    ["https://:pass@example.com", "CREDENTIALS_NOT_ALLOWED"], ["https://example.com:8443", "PORT_NOT_ALLOWED"],
    ["https://example.com:80", "PORT_NOT_ALLOWED"], ["http://example.com:443", "PORT_NOT_ALLOWED"],
    ["http://localhost", "BLOCKED_HOST"], ["https://sub.localhost", "BLOCKED_HOST"], ["http://LOCALHOST.", "BLOCKED_HOST"],
    ["http://%6cocalhost", "BLOCKED_HOST"], ["http://metadata.google.internal", "BLOCKED_HOST"],
    ["http://metadata.amazonaws.com.", "BLOCKED_HOST"], ["http://name.local", "BLOCKED_HOST"], ["http://db.internal", "BLOCKED_HOST"],
    ["http://intranet", "BLOCKED_HOST"], ["example.com", "INVALID_URL"], ["//example.com", "INVALID_URL"],
    ["http:example.com", "INVALID_URL"], ["http:///example.com", "INVALID_URL"], ["http://example..com", "INVALID_URL"],
    ["http://example.com\\@evil.test", "INVALID_URL"], ["https://exam\nple.com", "INVALID_URL"],
    [" https://example.com", "INVALID_URL"], [`https://example.com/${"a".repeat(2048)}`, "INVALID_URL"],
    ["http://[fe80::1%25eth0]/", "INVALID_URL"],
  ])("rejects %s with %s before DNS/transport", async (input, reason) => {
    const h = setup();
    expect(await h.run(input)).toEqual({ ok: false, reason });
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, undefined, {}, [], 42, ""])("rejects non-URL runtime input (case %#)", async (input) => {
    const h = setup();
    expect(await h.run(input)).toEqual({ ok: false, reason: "INVALID_URL" });
    expect(h.resolver).not.toHaveBeenCalled();
  });

  it("accepts exactly 2048 characters, strips fragments, and preserves the path/query", async () => {
    const h = setup();
    const prefix = "https://example.com/a%2Fb?secret=";
    const input = prefix + "a".repeat(2048 - prefix.length - "#fragment".length) + "#fragment";
    const pending = h.run(input);
    await flush();
    expect(h.requests[0].options.path).toBe(input.slice("https://example.com".length).split("#")[0]);
    expect(JSON.stringify(h.requests[0].options)).not.toContain("fragment");
    h.requests[0].respond();
    expect(await pending).toMatchObject({ ok: true });
  });

  it("preserves absolute hostname semantics and standard IDNA normalization", async () => {
    const h = setup();
    const pending = h.run("https://BÜCHER.example./path");
    await flush();
    expect(h.resolver.mock.calls[0][0]).toBe("xn--bcher-kva.example.");
    expect(h.requests[0].options).toMatchObject({ hostname: "xn--bcher-kva.example.", servername: "xn--bcher-kva.example.", headers: { Host: "xn--bcher-kva.example." } });
    h.requests[0].respond();
    await pending;
  });
});

describe("DNS and IP validation", () => {
  it.each([
    "127.0.0.1", "127.1", "2130706433", "0x7f000001", "0177.0.0.1", "10.0.0.1", "172.16.0.1",
    "192.168.1.1", "169.254.169.254", "100.64.0.1", "[::1]", "[fc00::1]", "[fe80::1]",
    "[::ffff:127.0.0.1]", "[64:ff9b::a9fe:a9fe]", "[2001:db8::1]",
  ])("rejects literal %s without DNS or connections", async (host) => {
    const h = setup();
    expect(await h.run(`http://${host}/`)).toEqual({ ok: false, reason: "BLOCKED_IP" });
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
  });

  it.each([PUBLIC_V4, `[${PUBLIC_V6}]`, "[::ffff:8.8.8.8]"])("accepts literal %s without DNS", async (host) => {
    const h = setup();
    const pending = h.run(`https://${host}/`);
    await flush();
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.requests[0].options.servername).toBe("");
    expect(h.requests[0].options.headers).toMatchObject({ Host: new URL(`https://${host}`).host });
    h.requests[0].respond();
    expect(await pending).toMatchObject({ ok: true });
  });

  it.each([
    [{ address: PUBLIC_V4, family: 4 }, { address: "10.0.0.1", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }, { address: PUBLIC_V4, family: 4 }],
    [{ address: PUBLIC_V4, family: 4 }, { address: "::ffff:127.0.0.1", family: 6 }],
    [{ address: PUBLIC_V6, family: 6 }, { address: "fe80::1", family: 6 }],
  ] satisfies ResolvedAddress[][])("rejects the whole mixed DNS result (case %#)", async (...addresses) => {
    const h = setup(addresses);
    expect(await h.run("https://example.com")).toEqual({ ok: false, reason: "BLOCKED_IP" });
    expect(h.requests).toHaveLength(0);
  });

  it.each([[], [{ address: "not-an-IP", family: 4 }], [{ address: PUBLIC_V4, family: 6 }]].map((addresses) => ({ addresses })))("rejects empty/malformed DNS answers (case %#)", async ({ addresses }) => {
    const h = setup(addresses as ResolvedAddress[]);
    expect(await h.run("https://example.com")).toEqual({ ok: false, reason: "DNS_FAILED" });
    expect(h.requests).toHaveLength(0);
  });

  it("sanitizes DNS errors and releases admission", async () => {
    const h = setup();
    h.resolver.mockRejectedValueOnce(new Error("PRIVATE_DNS_ERROR"));
    expect(await h.run("https://example.com/private?token=secret")).toEqual({ ok: false, reason: "DNS_FAILED" });
    expect(h.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("pinned connection boundary", () => {
  it.each([4, 6] as const)("pins IPv%i and never consults changing DNS again", async (family) => {
    const address = family === 4 ? PUBLIC_V4 : PUBLIC_V6;
    const answers: ResolvedAddress[] = [{ address, family }, { address: "1.1.1.1", family: 4 }];
    const h = setup(answers);
    const pending = h.run("https://example.com/path");
    await flush();
    // Rebinding or mutation after validation must not alter the copied pin.
    answers[0] = { address: "127.0.0.1", family: 4 };
    h.resolver.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const options = h.requests[0].options;
    const single = vi.fn();
    options.lookup!("example.com", {}, single);
    expect(single).toHaveBeenCalledExactlyOnceWith(null, address, family);
    const all = vi.fn();
    options.lookup!("example.com", { all: true }, all);
    expect(all).toHaveBeenCalledExactlyOnceWith(null, [{ address, family }]);
    expect(h.resolver).toHaveBeenCalledTimes(1);
    expect(options).toMatchObject({ hostname: "example.com", servername: "example.com", family, autoSelectFamily: false, agent: false, rejectUnauthorized: true });
    h.requests[0].respond();
    expect(await pending).toMatchObject({ resolvedAddress: address });
  });

  it("verifies the certificate against the original hostname, never the pinned address", async () => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    const options = h.requests[0].options;
    expect(options.headers).toMatchObject({ Host: "example.com" });
    const certificate = { subjectaltname: "DNS:example.com", subject: { CN: "example.com" } } as PeerCertificate;
    expect(options.checkServerIdentity!(PUBLIC_V4, certificate)).toBeUndefined();
    expect(options.checkServerIdentity!("example.com", { subject: { CN: PUBLIC_V4 }, subjectaltname: `IP Address:${PUBLIC_V4}` } as PeerCertificate)).toBeInstanceOf(Error);
    h.requests[0].respond();
    await pending;
  });

  it("uses only fixed headers, strict parser and bounded response headers", async () => {
    const h = setup();
    const pending = h.run("https://example.com/?Authorization=private");
    await flush();
    const options = h.requests[0].options;
    expect(options.headers).toEqual({ Host: "example.com", "Accept-Encoding": "identity", "User-Agent": "TrustCheck/1.0", Connection: "close" });
    expect(options).toMatchObject({ method: "GET", maxHeaderSize: MAX_SAFE_HTTP_HEADER_BYTES, insecureHTTPParser: false, agent: false });
    expect(options).not.toHaveProperty("auth");
    h.requests[0].respond();
    await pending;
  });
});

describe("headers-only HTTP lifecycle", () => {
  it.each([301, 302, 303, 307, 308])("returns HTTP %i Location without requesting its target", async (statusCode) => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    const location = "http://169.254.169.254/private?token=PRIVATE_TOKEN";
    h.requests[0].respond(statusCode, location);
    expect(await pending).toEqual({ ok: true, statusCode, location, hostname: "example.com", resolvedAddress: PUBLIC_V4 });
    expect(h.requests).toHaveLength(1);
    expect(h.resolver).toHaveBeenCalledTimes(1);
  });

  it.each([200, 204, 404, 500])("returns HTTP %i headers and destroys the stream without reading content", async (status) => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    const response = h.requests[0].respond(status);
    expect(await pending).toEqual({ ok: true, statusCode: status, hostname: "example.com", resolvedAddress: PUBLIC_V4 });
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.read).not.toHaveBeenCalled();
    expect(response.resume).not.toHaveBeenCalled();
    expect(response.listenerCount("data")).toBe(0);
    expect(h.requests[0].request.destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["ECONNRESET", "HPE_HEADER_OVERFLOW", "HPE_INVALID_HEADER_TOKEN", "CERT_HAS_EXPIRED"])("returns a fixed NETWORK_ERROR for %s", async (code) => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    h.requests[0].request.emit("error", Object.assign(new Error("PRIVATE_ERROR"), { code }));
    expect(await pending).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(h.requests[0].request.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles synchronous transport failure without leaking the request URL", async () => {
    const h = setup();
    h.https.mockImplementationOnce(() => { throw new Error("https://example.com/PRIVATE"); });
    expect(await h.run("https://example.com/PRIVATE")).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes an unsolicited upgrade socket", async () => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    const socket = { destroy: vi.fn() };
    h.requests[0].request.emit("upgrade", {}, socket, Buffer.alloc(0));
    expect(await pending).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it("handles an early close without waiting for the deadline", async () => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    h.requests[0].request.emit("close");
    expect(await pending).toEqual({ ok: false, reason: "NETWORK_ERROR" });
  });

  it("times out connection/header wait, destroys the request and discards late responses", async () => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    await vi.advanceTimersByTimeAsync(SAFE_HTTP_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, reason: "TIMEOUT" });
    expect(h.requests[0].request.destroyed).toBe(true);
    const late = h.requests[0].respond(302, "https://other.example/");
    expect(late.destroy).toHaveBeenCalledTimes(1);
    expect(h.requests).toHaveLength(1);
  });

  it("includes DNS in the deadline and never connects after a late resolution", async () => {
    const h = setup();
    let finishDns!: (value: ResolvedAddress[]) => void;
    h.resolver.mockImplementationOnce(() => new Promise((resolve) => { finishDns = resolve; }));
    const pending = h.run("https://example.com");
    await flush();
    await vi.advanceTimersByTimeAsync(SAFE_HTTP_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, reason: "TIMEOUT" });
    expect(h.resolver.mock.calls[0][1].aborted).toBe(true);
    finishDns([{ address: PUBLIC_V4, family: 4 }]);
    await flush();
    expect(h.requests).toHaveLength(0);
  });

  it("does not restart the deadline after DNS resolution", async () => {
    const h = setup();
    let finishDns!: (value: ResolvedAddress[]) => void;
    h.resolver.mockImplementationOnce(() => new Promise((resolve) => { finishDns = resolve; }));
    const pending = h.run("https://example.com");
    await vi.advanceTimersByTimeAsync(2500);
    finishDns([{ address: PUBLIC_V4, family: 4 }]);
    await flush();
    expect(h.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ ok: false, reason: "TIMEOUT" });
    expect(h.requests[0].request.destroyed).toBe(true);
  });

  it("rejects headers arriving after the absolute deadline even if timers have not fired", async () => {
    const h = setup();
    const pending = h.run("https://example.com");
    await flush();
    vi.setSystemTime(SAFE_HTTP_TIMEOUT_MS);
    h.requests[0].respond();
    expect(await pending).toEqual({ ok: false, reason: "TIMEOUT" });
  });

  it("does not log private URLs, redirect locations or transport exceptions", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const h = setup();
    const pending = h.run("https://example.com/PRIVATE_PATH?secret=PRIVATE_QUERY#PRIVATE_FRAGMENT");
    await flush();
    h.requests[0].request.emit("error", new Error("PRIVATE_NETWORK_ERROR"));
    expect(await pending).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

describe("bounded admission", () => {
  it("does no work for an already expired parent deadline", async () => {
    const h = setup();
    const parent = new AbortController();
    parent.abort();
    expect(await h.run("https://example.com", parent.signal)).toEqual({ ok: false, reason: "TIMEOUT" });
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
  });

  it("cancels an active request at the parent deadline and releases its slot", async () => {
    const h = setup();
    const parent = new AbortController();
    const first = h.run("https://example.com", parent.signal);
    const others = Array.from({ length: 5 }, (_, i) => h.run(`https://site${i}.example`));
    await flush();
    expect(h.requests).toHaveLength(5);
    parent.abort();
    expect(await first).toEqual({ ok: false, reason: "TIMEOUT" });
    await flush();
    expect(h.requests[0].request.destroyed).toBe(true);
    expect(h.requests).toHaveLength(6);
    h.requests.slice(1).forEach((r) => r.respond());
    await Promise.all(others);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes queued work when its parent deadline expires", async () => {
    const h = setup();
    const blockers = Array.from({ length: 5 }, (_, i) => h.run(`https://site${i}.example`));
    const parent = new AbortController();
    const queued = h.run("https://queued.example", parent.signal);
    await flush();
    parent.abort();
    expect(await queued).toEqual({ ok: false, reason: "TIMEOUT" });
    h.requests.forEach((r) => r.respond());
    await Promise.all(blockers);
    expect(h.resolver).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts pending DNS at the parent deadline and prevents a late connection", async () => {
    const h = setup();
    const parent = new AbortController();
    let finish!: (value: ResolvedAddress[]) => void;
    h.resolver.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = h.run("https://example.com", parent.signal);
    await flush();
    parent.abort();
    expect(await pending).toEqual({ ok: false, reason: "TIMEOUT" });
    expect(h.resolver.mock.calls[0][1].aborted).toBe(true);
    finish([{ address: PUBLIC_V4, family: 4 }]);
    await flush();
    expect(h.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes the parent abort listener after successful completion", async () => {
    const h = setup();
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    const pending = h.run("https://example.com", parent.signal);
    await flush();
    h.requests[0].respond();
    expect(await pending).toMatchObject({ ok: true });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    parent.abort();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "failure"])("never exceeds five active requests and releases a slot after %s", async (outcome) => {
    const h = setup();
    const checks = Array.from({ length: 6 }, (_, i) => h.run(`https://site${i}.example`));
    await flush();
    expect(h.requests).toHaveLength(MAX_SAFE_HTTP_CONCURRENCY);
    expect(h.resolver).toHaveBeenCalledTimes(5);
    if (outcome === "success") h.requests[0].respond();
    else h.requests[0].request.emit("error", new Error("PRIVATE_ERROR"));
    await flush();
    expect(h.requests).toHaveLength(6);
    expect(h.requests.filter(({ request }) => !request.destroyed)).toHaveLength(5);
    h.requests.slice(1).forEach((r) => r.respond());
    await Promise.all(checks);
    expect(h.requests.every(({ request }) => request.destroyed)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the queue at 50, times out queued work and recovers capacity", async () => {
    const h = setup();
    const checks = Array.from({ length: MAX_SAFE_HTTP_CONCURRENCY + MAX_SAFE_HTTP_QUEUE }, (_, i) => h.run(`https://site${i}.example`));
    expect(await h.run("https://overflow.example")).toEqual({ ok: false, reason: "QUEUE_FULL" });
    await flush();
    expect(h.resolver).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(SAFE_HTTP_TIMEOUT_MS);
    expect((await Promise.all(checks)).every((result) => !result.ok && result.reason === "TIMEOUT")).toBe(true);
    expect(h.requests).toHaveLength(5);
    expect(vi.getTimerCount()).toBe(0);
    const next = h.run("https://recovered.example");
    await flush();
    expect(h.requests).toHaveLength(6);
    h.requests[5].respond();
    expect(await next).toMatchObject({ ok: true });
  });

  it("bounds stalled DNS work before starting any HTTP transport", async () => {
    const h = setup();
    h.resolver.mockImplementation(() => new Promise(() => {}));
    const checks = Array.from({ length: 55 }, (_, i) => h.run(`https://site${i}.example`));
    expect(await h.run("https://overflow.example")).toEqual({ ok: false, reason: "QUEUE_FULL" });
    await flush();
    expect(h.resolver).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(SAFE_HTTP_TIMEOUT_MS);
    await Promise.all(checks);
    expect(h.requests).toHaveLength(0);
    expect(h.resolver.mock.calls.every(([, signal]) => signal.aborted)).toBe(true);
  });

  it("gives queued work only the remainder of its original deadline", async () => {
    const h = setup();
    const checks = Array.from({ length: 6 }, (_, i) => h.run(`https://site${i}.example`));
    await vi.advanceTimersByTimeAsync(2000);
    h.requests[0].respond();
    await flush();
    expect(h.requests).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await checks[5]).toEqual({ ok: false, reason: "TIMEOUT" });
    await Promise.all(checks);
    expect(h.requests[5].request.destroyed).toBe(true);
  });

  it("releases slots after DNS failure or policy rejection", async () => {
    const h = setup();
    h.resolver.mockRejectedValueOnce(new Error("DNS error"));
    h.resolver.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const checks = Array.from({ length: 7 }, (_, i) => h.run(`https://site${i}.example`));
    await flush();
    expect(h.requests).toHaveLength(5);
    expect(await checks[0]).toEqual({ ok: false, reason: "DNS_FAILED" });
    expect(await checks[1]).toEqual({ ok: false, reason: "BLOCKED_IP" });
    h.requests.forEach((r) => r.respond());
    await Promise.all(checks);
  });
});
