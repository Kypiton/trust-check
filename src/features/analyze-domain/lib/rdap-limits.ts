export const MAX_RDAP_CONCURRENCY = 5;
export const MAX_RDAP_QUEUE_SIZE = 50;
export const RDAP_FAILURE_COOLDOWN_MS = 30_000;
export const DOMAIN_ANALYSIS_DEADLINE_MS = 5_000;

/** Also bounds work waiting on shared bootstrap discovery, before admission. */
export const MAX_PENDING_DOMAINS = MAX_RDAP_CONCURRENCY + MAX_RDAP_QUEUE_SIZE;

export type DomainDeadline = { signal: AbortSignal; expiresAt: number };

export async function withDomainDeadline<T>(work: (deadline: DomainDeadline) => Promise<T>, expired: T, now = Date.now): Promise<T> {
  const controller = new AbortController();
  const expiresAt = now() + DOMAIN_ANALYSIS_DEADLINE_MS;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(expired);
    }, DOMAIN_ANALYSIS_DEADLINE_MS);
  });
  try {
    const result = await Promise.race([work({ signal: controller.signal, expiresAt }), deadline]);
    return now() >= expiresAt ? expired : result;
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
