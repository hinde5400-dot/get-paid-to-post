/**
 * Best-effort in-memory rate limiting for public POST routes
 * (submissions, campaign creates, brand-chat messages).
 *
 * LIMITATION (by design, free tier): on serverless (Vercel) each
 * function instance keeps its own map, so this is a soft limit —
 * it stops casual abuse, accidental double-submits and runaway
 * loops, not a distributed attack. A hard limit would need a
 * shared store (Upstash Redis etc.), which is a paid add-on and
 * out of scope for the free-only rule.
 *
 * Keys are per-user (never per-IP alone — many users share IPs),
 * windows are fixed, and the map prunes expired entries when it
 * grows so it cannot grow without bound in a long-lived instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_BUCKETS = 5000;

function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

/**
 * One hit against `key`. Returns ok:false with a retry-after in
 * seconds when the limit is hit. Callers return HTTP 429 with
 * that message.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  prune(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return { ok: true };
}
