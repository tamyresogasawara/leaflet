import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { brand } from "@/brand.config";

type Limiter = {
  limit: (id: string) => Promise<{ success: boolean; reset: number }>;
};

let perMinuteCache: Limiter | null = null;
let perDayCache: Limiter | null = null;

function buildRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getMinuteLimiter(): Limiter | null {
  if (perMinuteCache) return perMinuteCache;
  const redis = buildRedis();
  if (!redis) return null;
  perMinuteCache = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    analytics: false,
    prefix: "leaflet:rl:min",
  });
  return perMinuteCache;
}

function getDayLimiter(): Limiter | null {
  if (perDayCache) return perDayCache;
  const redis = buildRedis();
  if (!redis) return null;
  perDayCache = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(500, "1 d"),
    analytics: false,
    prefix: "leaflet:rl:day",
  });
  return perDayCache;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Enforces 20/min and 500/day per IP in demo mode. In selfhost mode this is
 * a no-op so a single operator instance isn't gated by Upstash creds it
 * doesn't have. Plan.md §4: rate limit is wallet/abuse defense for the
 * hosted demo only.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  if (brand.deploymentMode !== "demo") return { ok: true };
  const minute = getMinuteLimiter();
  const day = getDayLimiter();
  // If Upstash creds aren't set in a demo deploy, fail open with a server
  // warning rather than 500. Selfhost ops should set the env vars before
  // exposing the demo publicly.
  if (!minute || !day) {
    console.warn(
      "[ratelimit] demo mode set but Upstash creds missing — failing open."
    );
    return { ok: true };
  }
  const [m, d] = await Promise.all([minute.limit(ip), day.limit(ip)]);
  if (!m.success) {
    return { ok: false, retryAfterSeconds: secondsUntil(m.reset) };
  }
  if (!d.success) {
    return { ok: false, retryAfterSeconds: secondsUntil(d.reset) };
  }
  return { ok: true };
}

function secondsUntil(epochMs: number): number {
  return Math.max(1, Math.ceil((epochMs - Date.now()) / 1000));
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
}
