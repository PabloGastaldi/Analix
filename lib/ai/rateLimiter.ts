/**
 * In-memory per-IP fixed-window rate limiter (design §1 "Rate limiting").
 *
 * PROD CAVEAT: this limiter is per-instance, in-process state. It resets on
 * cold start and does NOT span multiple serverless replicas or instances —
 * two replicas each enforce their own independent budget, so the effective
 * limit under horizontal scaling is `limit * replicaCount`, not `limit`.
 * That's an acceptable tradeoff for this single-file demo. The production
 * upgrade path is a shared store (e.g. Upstash/Redis) so all replicas read
 * and write the same counter — out of scope for Phase 2.
 */

type WindowState = {
  count: number;
  resetAt: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type RateLimiterOptions = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

const DEFAULT_OPTIONS: RateLimiterOptions = {
  limit: 10,
  windowMs: 60_000,
};

/**
 * Creates an isolated limiter instance with its own `Map`. Also exported as
 * a ready-to-use module-scope singleton (`planRateLimiter`) for the route
 * handler, and as a factory so tests can create isolated instances instead
 * of sharing global state across test cases.
 */
export function createRateLimiter(options: Partial<RateLimiterOptions> = {}) {
  const { limit, windowMs } = { ...DEFAULT_OPTIONS, ...options };
  const windows = new Map<string, WindowState>();

  return {
    /** Checks and records one request attempt for `key` (typically client IP). */
    check(key: string, now: number = Date.now()): RateLimitResult {
      const existing = windows.get(key);

      if (!existing || now >= existing.resetAt) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
      }

      if (existing.count < limit) {
        existing.count += 1;
        return { allowed: true };
      }

      return { allowed: false, retryAfterMs: existing.resetAt - now };
    },
    /** Test/debug helper — not used by the route handler. */
    reset(): void {
      windows.clear();
    },
  };
}

/** Module-scope singleton used by `app/api/plan/route.ts`. */
export const planRateLimiter = createRateLimiter();

/** Module-scope singleton used by `app/api/joins/route.ts` — its own budget, independent of `planRateLimiter`. */
export const joinsRateLimiter = createRateLimiter();
