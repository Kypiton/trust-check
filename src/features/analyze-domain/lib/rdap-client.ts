import { isRecord, requestRdapJson, type RequestFailure } from "./rdap-http";

type RegistrationResult =
  | { ok: true; registrationDate: string | null }
  | { ok: false; reason: RequestFailure };

function registrationTimestamp(value: unknown, now: number): number | null {
  if (typeof value !== "string") return null;
  // Require a timezone-qualified RFC 3339 timestamp, not Date.parse's permissive
  // date-only strings. Check calendar fields to reject dates like February 30.
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, , offsetHour = "0", offsetMinute = "0"] = parts;
  const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (+month < 1 || +month > 12 || +day < 1 || +day > monthDays[+month - 1] ||
      +hour > 23 || +minute > 59 || +second > 59 || +offsetHour > 23 || +offsetMinute > 59) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now ? timestamp : null;
}

/** The base URL must come from createRdapBootstrap; never accept a user URL. */
export async function lookupRegistration(
  baseUrl: URL,
  registrableDomain: string,
  fetcher: typeof fetch,
  now: number,
): Promise<RegistrationResult> {
  const query = new URL(`domain/${encodeURIComponent(registrableDomain)}`, baseUrl);
  const response = await requestRdapJson(query, fetcher);
  if (!response.ok) return response;
  const data = response.data;
  if (!isRecord(data) || data.objectClassName !== "domain" ||
      (data.events !== undefined && !Array.isArray(data.events))) return { ok: false, reason: "INVALID_RESPONSE" };
  // If a name is supplied, ensure the server answered for the requested domain.
  if (data.ldhName !== undefined && (typeof data.ldhName !== "string" ||
      data.ldhName.toLowerCase().replace(/\.$/, "") !== registrableDomain)) return { ok: false, reason: "INVALID_RESPONSE" };

  const registrations = (data.events ?? []).flatMap((event: unknown) => {
    if (!isRecord(event) || event.eventAction !== "registration") return [];
    const timestamp = registrationTimestamp(event.eventDate, now);
    return timestamp === null ? [] : [timestamp];
  });
  // Prefer the earliest valid registration if the provider supplies several;
  // never use nested entity events, transfers, changes or expiration dates.
  const timestamp = registrations.length ? Math.min(...registrations) : null;
  return { ok: true, registrationDate: timestamp === null ? null : new Date(timestamp).toISOString() };
}
