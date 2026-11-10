import { Resolver } from "node:dns/promises";

export type ResolvedAddress = { readonly address: string; readonly family: 4 | 6 };
export type ResolveAddresses = (hostname: string, signal: AbortSignal) => Promise<readonly ResolvedAddress[]>;

/** Per-request cancellable DNS; query both families without OS family filtering. */
export const resolveAddresses: ResolveAddresses = async (hostname, signal) => {
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  if (signal.aborted) throw new Error("DNS cancelled");
  signal.addEventListener("abort", cancel, { once: true });
  const absent = (error: unknown): string[] => {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    // A failed family is not evidence of absence. Do not connect using only the
    // other family's answers when this family's policy could not be checked.
    throw new Error("DNS unavailable");
  };
  try {
    const [v4, v6] = await Promise.all([
      resolver.resolve4(hostname).catch(absent),
      resolver.resolve6(hostname).catch(absent),
    ]);
    return [
      ...v4.map((address): ResolvedAddress => ({ address, family: 4 })),
      ...v6.map((address): ResolvedAddress => ({ address, family: 6 })),
    ];
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
};
