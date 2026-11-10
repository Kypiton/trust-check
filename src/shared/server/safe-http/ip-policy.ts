import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

// Conservative special-use exclusions based on the IANA IPv4/IPv6 registries.
// Reject whole protocol-assignment blocks, including their anycast exceptions;
// this utility is for ordinary public websites, not special network services.
const blockedV4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
].map((cidr) => ipaddr.IPv4.parseCIDR(cidr));
const globalV6 = ipaddr.IPv6.parseCIDR("2000::/3");
const blockedV6 = [
  "2001::/23", // Protocol assignments, including Teredo, benchmarks and ORCHID.
  "2001:db8::/32", // Documentation.
  "2002::/16", // 6to4: embedded IPv4 routing is deliberately unsupported.
  "3ffe::/16", // Former 6bone testing space.
  "3fff::/20", // Documentation.
].map((cidr) => ipaddr.IPv6.parseCIDR(cidr));

function publicV4(address: ipaddr.IPv4): boolean {
  return !blockedV4.some((range) => address.match(range));
}

/** Syntactic IPs only; callers normalize URL literals using the standard URL API. */
export function isPublicAddress(value: string): boolean {
  if (!isIP(value) || value.includes("%")) return false;
  const address = ipaddr.parse(value);
  if (address instanceof ipaddr.IPv4) return publicV4(address);
  if (address.isIPv4MappedAddress()) return publicV4(address.toIPv4Address());
  // Default deny outside allocated global unicast. This also rejects BOTH
  // NAT64 prefixes (64:ff9b::/96 and 64:ff9b:1::/48) in full, irrespective of the
  // embedded IPv4, plus unspecified, loopback, ULA, link/site-local and multicast.
  return address.match(globalV6) && !blockedV6.some((range) => address.match(range));
}
