import type { RdapFailure } from "./rdap-http";
import { MAX_RDAP_CONCURRENCY, MAX_RDAP_QUEUE_SIZE, RDAP_FAILURE_COOLDOWN_MS, type DomainDeadline } from "./rdap-limits";

type Release = () => void;

function needsCooldown(failure: RdapFailure): boolean {
  switch (failure.reason) {
    case "HTTP_ERROR": return failure.httpStatus === 429 || (failure.httpStatus ?? 0) >= 500;
    case "TIMEOUT":
    case "DEADLINE_EXCEEDED":
    case "NETWORK_ERROR":
    case "INVALID_RESPONSE":
    case "RESPONSE_TOO_LARGE":
    case "REDIRECT": return true;
    default: return false;
  }
}

/** Isolated process-local state; the production analyzer shares one instance. */
export function createRdapGuard(now: () => number) {
  let active = 0;
  const queue: { grant: () => void }[] = [];
  const cooldowns = new Map<string, number>();
  const expired = (): RdapFailure => ({ ok: false, reason: "DEADLINE_EXCEEDED" });

  function release() {
    active -= 1;
    queue.shift()?.grant();
  }

  function acquire(signal: AbortSignal): Promise<Release | RdapFailure> {
    if (signal.aborted) return Promise.resolve(expired());
    if (active < MAX_RDAP_CONCURRENCY) {
      active += 1;
      return Promise.resolve(release);
    }
    if (queue.length >= MAX_RDAP_QUEUE_SIZE) return Promise.resolve({ ok: false, reason: "QUEUE_FULL" });
    return new Promise((resolve) => {
      const waiter = { grant: () => {
        signal.removeEventListener("abort", cancel);
        active += 1;
        resolve(release);
      } };
      const cancel = () => {
        const index = queue.indexOf(waiter);
        if (index !== -1) queue.splice(index, 1);
        resolve(expired());
      };
      signal.addEventListener("abort", cancel, { once: true });
      queue.push(waiter);
    });
  }

  function coolingDown(origin: string): boolean {
    const currentTime = now();
    for (const [key, until] of cooldowns) {
      if (until <= currentTime) cooldowns.delete(key);
    }
    return cooldowns.has(origin);
  }

  return {
    async run<T extends { ok: true }>(
      provider: URL,
      { signal, expiresAt }: DomainDeadline,
      operation: () => Promise<T | RdapFailure>,
    ): Promise<T | RdapFailure> {
      if (signal.aborted || now() >= expiresAt) return expired();
      if (coolingDown(provider.origin)) return { ok: false, reason: "PROVIDER_COOLDOWN" };
      const slot = await acquire(signal);
      if (typeof slot !== "function") return slot;
      try {
        if (signal.aborted || now() >= expiresAt) return expired();
        // A previous request may have failed while this request was queued.
        if (coolingDown(provider.origin)) return { ok: false, reason: "PROVIDER_COOLDOWN" };
        const result = await operation();
        if (!result.ok && needsCooldown(result)) cooldowns.set(provider.origin, now() + RDAP_FAILURE_COOLDOWN_MS);
        return result;
      } finally {
        slot();
      }
    },
  };
}

export type RdapGuard = ReturnType<typeof createRdapGuard>;
