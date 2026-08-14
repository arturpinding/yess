export interface RateLimitPolicy {
  /** Number of tokens available in a full bucket. */
  limit: number;
  /** Time required to refill an empty bucket. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: Date;
}

export interface RateLimiter {
  consume(key: string, policy: RateLimitPolicy, cost?: number): Promise<RateLimitDecision>;
  reset(key: string): Promise<void>;
}

interface Bucket {
  tokens: number;
  updatedAtMs: number;
  lastSeenAtMs: number;
  limit: number;
  windowMs: number;
}

export interface InMemoryRateLimiterOptions {
  clock?: () => number;
  maxEntries?: number;
}

/**
 * A bounded token-bucket adapter for local development and unit tests. It is
 * deliberately behind an interface: multiple production replicas require an
 * atomic shared implementation (for example a Redis Lua script).
 */
export class InMemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #clock: () => number;
  readonly #maxEntries: number;

  constructor(options: InMemoryRateLimiterOptions = {}) {
    this.#clock = options.clock ?? Date.now;
    this.#maxEntries = options.maxEntries ?? 10_000;
    if (!Number.isInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
  }

  async consume(key: string, policy: RateLimitPolicy, cost = 1): Promise<RateLimitDecision> {
    validatePolicy(policy, cost);
    if (key.length === 0) {
      throw new RangeError("Rate-limit key must not be empty");
    }

    const now = this.#clock();
    let bucket = this.#buckets.get(key);
    if (!bucket || bucket.limit !== policy.limit || bucket.windowMs !== policy.windowMs) {
      this.#makeSpace(now);
      bucket = {
        tokens: policy.limit,
        updatedAtMs: now,
        lastSeenAtMs: now,
        limit: policy.limit,
        windowMs: policy.windowMs,
      };
      this.#buckets.set(key, bucket);
    }

    const refillRate = policy.limit / policy.windowMs;
    const elapsed = Math.max(0, now - bucket.updatedAtMs);
    bucket.tokens = Math.min(policy.limit, bucket.tokens + elapsed * refillRate);
    bucket.updatedAtMs = now;
    bucket.lastSeenAtMs = now;

    const allowed = bucket.tokens >= cost;
    if (allowed) {
      bucket.tokens -= cost;
    }

    const missingTokens = allowed ? 0 : cost - bucket.tokens;
    const retryAfterMs = allowed ? 0 : Math.ceil(missingTokens / refillRate);
    const timeToFullMs = Math.ceil((policy.limit - bucket.tokens) / refillRate);

    return {
      allowed,
      limit: policy.limit,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs,
      resetAt: new Date(now + timeToFullMs),
    };
  }

  async reset(key: string): Promise<void> {
    this.#buckets.delete(key);
  }

  #makeSpace(now: number): void {
    if (this.#buckets.size < this.#maxEntries) {
      return;
    }

    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.lastSeenAtMs < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = bucket.lastSeenAtMs;
      }
    }
    if (oldestKey !== undefined) {
      this.#buckets.delete(oldestKey);
    }

    // Keep `now` in the signature so a future expiry policy remains deterministic.
    void now;
  }
}

function validatePolicy(policy: RateLimitPolicy, cost: number): void {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new RangeError("Rate-limit limit must be a positive integer");
  }
  if (!Number.isFinite(policy.windowMs) || policy.windowMs <= 0) {
    throw new RangeError("Rate-limit windowMs must be positive");
  }
  if (!Number.isFinite(cost) || cost <= 0 || cost > policy.limit) {
    throw new RangeError("Rate-limit cost must be positive and no greater than the limit");
  }
}
