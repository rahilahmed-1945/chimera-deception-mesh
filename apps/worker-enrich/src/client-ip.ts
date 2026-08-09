import { isIP } from 'node:net';

/**
 * Derive a trustworthy public client IP from an event's X-Forwarded-For chain,
 * for GeoIP ONLY. Behind a proxy the transport peer (event.sourceIp) is the
 * proxy's own private address, which cannot be geolocated; the real client sits
 * in X-Forwarded-For.
 *
 * The chain is comma-separated (`client, proxy1, proxy2, …`). We walk it
 * right-to-left and return the first globally-routable public unicast address
 * that is NOT a trusted proxy, skipping:
 *   - loopback / private / link-local / ULA / CGNAT / reserved / documentation
 *     ranges (this already covers Zerops' internal proxy addresses, e.g. 10.22.x)
 *   - any address inside the configurable trusted-proxy list (see below), which
 *     is how a *public* ingress/proxy IP (e.g. a Zerops project IPv6) is excluded
 *     without hard-coding it in source.
 *
 * Trusted proxies are read from the GEO_TRUSTED_PROXIES environment variable: a
 * comma/space-separated list of IPs or CIDRs (IPv4 and IPv6), e.g.
 * "2a00:1ed0:1100::/48, 203.0.113.10". Unset => no extra trusted proxies.
 *
 * Returns null when no eligible public client IP remains (only trusted/private
 * infrastructure), so the caller falls back to sourceIp (e.g. SSH has no XFF) or
 * emits no coordinates. Coordinates are never fabricated; private/proxy IPs are
 * never geolocated.
 */

export interface Cidr {
  value: bigint;
  prefix: number;
  version: 4 | 6;
}

/** Parse a comma/space-separated list of IPs/CIDRs into normalized ranges. */
export function parseTrustedProxies(spec: string | undefined | null): Cidr[] {
  if (!spec) return [];
  const out: Cidr[] = [];
  for (const raw of spec.split(/[,\s]+/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const cidr = parseCidr(entry);
    if (cidr) out.push(cidr);
  }
  return out;
}

// Default trusted proxies from the environment (evaluated once at load).
const DEFAULT_TRUSTED = parseTrustedProxies(process.env.GEO_TRUSTED_PROXIES);

export function clientIpForGeo(payload: unknown, trusted: Cidr[] = DEFAULT_TRUSTED): string | null {
  const xff = readXff(payload);
  if (!xff) return null;
  const parts = xff.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = normalizeIp(parts[i]);
    if (ip && isPublicUnicast(ip) && !isTrusted(ip, trusted)) return ip;
  }
  return null;
}

function readXff(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const headers = (payload as Record<string, unknown>).headers;
  if (typeof headers !== 'object' || headers === null) return null;
  const xff = (headers as Record<string, unknown>)['x-forwarded-for'];
  return typeof xff === 'string' ? xff : null;
}

/** Trim, strip brackets/zone-id, and unwrap IPv4-mapped IPv6; null if not an IP. */
function normalizeIp(raw: string): string | null {
  let ip = raw.trim();
  if (!ip) return null;
  ip = ip.replace(/^\[/, '').replace(/\]$/, '').split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

function isPublicUnicast(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPublicV4(ip);
  if (v === 6) return isPublicV6(ip);
  return false;
}

function isPublicV4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // 10.0.0.0/8 private
  if (a === 127) return false; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return false; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return true;
}

function isPublicV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return false; // unspecified / loopback
  if (/^f[cd]/.test(s)) return false; // fc00::/7 unique-local (ULA)
  if (/^fe[89ab]/.test(s)) return false; // fe80::/10 link-local
  if (/^ff/.test(s)) return false; // ff00::/8 multicast
  if (s.startsWith('2001:db8:')) return false; // 2001:db8::/32 documentation
  if (s.startsWith('64:ff9b:')) return false; // 64:ff9b::/96 NAT64
  return true; // global unicast (2000::/3 and other public ranges)
}

// --- trusted-proxy CIDR matching (IPv4 + IPv6, big-int masks) ----------------

function isTrusted(ip: string, trusted: Cidr[]): boolean {
  if (trusted.length === 0) return false;
  const parsed = ipToBigInt(ip);
  if (!parsed) return false;
  return trusted.some((c) => c.version === parsed.version && inRange(parsed.value, c));
}

function inRange(value: bigint, c: Cidr): boolean {
  if (c.prefix === 0) return true;
  const totalBits = c.version === 4 ? 32 : 128;
  const shift = BigInt(totalBits - c.prefix);
  return value >> shift === c.value >> shift;
}

function parseCidr(entry: string): Cidr | null {
  const slash = entry.indexOf('/');
  const ipPart = slash === -1 ? entry : entry.slice(0, slash);
  const ip = normalizeIp(ipPart);
  if (!ip) return null;
  const parsed = ipToBigInt(ip);
  if (!parsed) return null;
  const maxBits = parsed.version === 4 ? 32 : 128;
  let prefix = maxBits;
  if (slash !== -1) {
    const p = Number(entry.slice(slash + 1));
    if (!Number.isInteger(p) || p < 0 || p > maxBits) return null;
    prefix = p;
  }
  return { value: parsed.value, prefix, version: parsed.version };
}

function ipToBigInt(ip: string): { value: bigint; version: 4 | 6 } | null {
  const v = isIP(ip);
  if (v === 4) {
    const o = ip.split('.').map(Number);
    return {
      value: (BigInt(o[0]) << 24n) | (BigInt(o[1]) << 16n) | (BigInt(o[2]) << 8n) | BigInt(o[3]),
      version: 4,
    };
  }
  if (v === 6) return { value: ipv6ToBigInt(ip), version: 6 };
  return null;
}

/** Expand a (net.isIP-validated) IPv6 string, incl. `::` and embedded IPv4. */
function ipv6ToBigInt(ip: string): bigint {
  let s = ip.toLowerCase();
  const embedded = /(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (embedded) {
    const o = embedded[2].split('.').map(Number);
    const h1 = ((o[0] << 8) | o[1]).toString(16);
    const h2 = ((o[2] << 8) | o[3]).toString(16);
    s = `${embedded[1]}${h1}:${h2}`;
  }
  const [headStr, tailStr] = s.split('::');
  const head = headStr ? headStr.split(':').filter(Boolean) : [];
  const tail = tailStr ? tailStr.split(':').filter(Boolean) : [];
  const fill = Math.max(0, 8 - head.length - tail.length);
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(parseInt(g || '0', 16));
  return value & ((1n << 128n) - 1n);
}
