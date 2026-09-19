/**
 * A token bucket rate limiter. Each caller gets a bucket that refills at a
 * steady rate up to a burst capacity; a request is allowed only if a token is
 * available, which is what smooths bursty traffic without a fixed window's
 * edge effects.
 */
export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  allow(callerId: string, nowMs: number = Date.now()): boolean {
    const bucket = this.buckets.get(callerId) ?? { tokens: this.capacity, lastRefillMs: nowMs };
    const elapsedSeconds = (nowMs - bucket.lastRefillMs) / 1000;

    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.lastRefillMs = nowMs;

    if (bucket.tokens < 1) {
      this.buckets.set(callerId, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(callerId, bucket);
    return true;
  }
}
