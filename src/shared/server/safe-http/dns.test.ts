import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAddresses } from "./dns";

const dns = vi.hoisted(() => ({ v4: vi.fn(), v6: vi.fn(), cancel: vi.fn(), instances: vi.fn() }));
vi.mock("node:dns/promises", () => ({ Resolver: class {
  constructor() { dns.instances(); }
  resolve4 = dns.v4;
  resolve6 = dns.v6;
  cancel = dns.cancel;
} }));
beforeEach(() => {
  vi.resetAllMocks();
  dns.v4.mockResolvedValue(["8.8.8.8", "1.1.1.1"]);
  dns.v6.mockResolvedValue(["2606:4700:4700::1111"]);
});
afterEach(() => vi.restoreAllMocks());

describe("Node DNS resolver boundary", () => {
  it("queries both families and retains every address in deterministic family order", async () => {
    const signal = new AbortController().signal;
    expect(await resolveAddresses("example.com.", signal)).toEqual([
      { address: "8.8.8.8", family: 4 }, { address: "1.1.1.1", family: 4 }, { address: "2606:4700:4700::1111", family: 6 },
    ]);
    expect(dns.v4).toHaveBeenCalledExactlyOnceWith("example.com.");
    expect(dns.v6).toHaveBeenCalledExactlyOnceWith("example.com.");
    expect(dns.instances).toHaveBeenCalledTimes(1);
  });

  it.each(["ENODATA", "ENOTFOUND"])("allows one absent family (%s)", async (code) => {
    dns.v6.mockRejectedValueOnce({ code });
    expect(await resolveAddresses("example.com", new AbortController().signal)).toHaveLength(2);
  });

  it("does not hide an unresolved family behind successful public answers", async () => {
    dns.v6.mockRejectedValueOnce({ code: "ETIMEOUT", message: "PRIVATE_DNS_ERROR" });
    await expect(resolveAddresses("example.com", new AbortController().signal)).rejects.toThrow("DNS unavailable");
    expect(dns.cancel).toHaveBeenCalled();
  });

  it("cancels the per-request resolver on abort and removes its listener on completion", async () => {
    const controller = new AbortController();
    let finish!: (addresses: string[]) => void;
    dns.v4.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = resolveAddresses("example.com", controller.signal);
    controller.abort();
    expect(dns.cancel).toHaveBeenCalledTimes(1);
    finish([]);
    await pending;
    expect(dns.cancel).toHaveBeenCalledTimes(2);
  });

  it("does not query DNS when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(resolveAddresses("example.com", controller.signal)).rejects.toThrow("DNS cancelled");
    expect(dns.v4).not.toHaveBeenCalled();
    expect(dns.v6).not.toHaveBeenCalled();
  });
});
