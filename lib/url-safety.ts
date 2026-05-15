import { lookup } from "node:dns/promises";
import net from "node:net";

export class UrlSafetyError extends Error {
  constructor(
    public readonly code: "invalid_url" | "private_ip" | "dns_failed",
    public readonly publicMessage: string
  ) {
    super(publicMessage);
    this.name = "UrlSafetyError";
  }
}

// Hostname strings that are obviously local/internal — caught before DNS
// so we save the lookup and so test runners without DNS still reject them.
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1", "::"]);

function isBlockedHostnamePattern(host: string): boolean {
  const h = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 literals matching private ranges.
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  // IPv6 literals (the URL parser keeps them bracketed; check both forms).
  const ipv6 = h.replace(/^\[|\]$/g, "");
  if (ipv6 === "::1") return true;
  if (ipv6.startsWith("fe80:")) return true;
  if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateAddress(lower.slice(7));
    }
    return false;
  }
  // Unparseable → fail closed.
  return true;
}

/**
 * Parse + validate a URL string. Returns the parsed URL on success.
 * Pure validation only — does NOT resolve DNS. Use `assertSafeUrl` for
 * the full DNS-aware check before any fetch.
 */
export function parseSafeUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new UrlSafetyError(
      "invalid_url",
      "That doesn't look like a URL."
    );
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UrlSafetyError(
      "invalid_url",
      "Only http and https URLs are allowed."
    );
  }
  if (!u.hostname) {
    throw new UrlSafetyError("invalid_url", "URL has no host.");
  }
  if (isBlockedHostnamePattern(u.hostname)) {
    throw new UrlSafetyError(
      "private_ip",
      "That URL points at a private or internal host."
    );
  }
  return u;
}

/**
 * Full safety check: validate the URL AND resolve DNS to make sure no
 * A/AAAA record points at a private address. Catches `localhost.evil.com`
 * and similar bypasses where the hostname looks public but resolves
 * to RFC1918 / link-local / AWS metadata.
 *
 * Note: this is a TOCTOU guard — the actual fetch's DNS lookup is a
 * separate resolution and could in theory differ (DNS rebinding). The
 * standard mitigation is connect-by-IP with `Host:` override; v0 ships
 * the standard guard and flags the residual risk.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const u = parseSafeUrl(rawUrl);
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch {
    throw new UrlSafetyError("dns_failed", "Couldn't resolve that hostname.");
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new UrlSafetyError(
        "private_ip",
        "That hostname resolves to a private IP."
      );
    }
  }
  return u;
}
