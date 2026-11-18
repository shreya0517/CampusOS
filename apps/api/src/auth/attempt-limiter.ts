/** How many keys are tracked at most; past this the oldest are dropped, so memory stays bounded. */
const MAX_KEYS = 100_000;
/** Expired attempts are swept out at most this often, not on every hit. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Counts attempts per key within a sliding window, in memory. Each API instance keeps its own counts, which is enough
 * to slow password guessing on one account; a shared store would be needed to limit across several instances.
 *
 * `take` checks and records an attempt in one synchronous step, so concurrent requests can't all pass the check
 * before any of them is counted.
 */
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Records an attempt for the key if one is allowed, and returns 0. If the limit is reached, records nothing and
   * returns the milliseconds until another attempt is allowed.
   */
  take(key: string): number {
    const wait = this.retryAfter(key);
    if (wait) return wait;
    this.hit(key);
    return 0;
  }

  /** Milliseconds until another attempt is allowed for this key, or 0 if it is allowed now. */
  retryAfter(key: string): number {
    const recent = this.recent(key);
    return recent.length >= this.limit ? Math.max(1, recent[0]! + this.windowMs - this.now()) : 0;
  }

  hit(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    // Re-inserted at the end, so the map stays ordered from least to most recently used.
    this.attempts.delete(key);
    this.attempts.set(key, recent);
    this.sweep();
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length) this.attempts.set(key, recent);
    else this.attempts.delete(key);
    return recent;
  }

  /** Drops keys with nothing left in the window, at most once a minute, then the oldest keys past the cap. */
  private sweep(): void {
    const now = this.now();
    if (now - this.lastSweep >= SWEEP_INTERVAL_MS) {
      this.lastSweep = now;
      const cutoff = now - this.windowMs;
      for (const [key, times] of this.attempts) if (times[times.length - 1]! <= cutoff) this.attempts.delete(key);
    }
    for (const key of this.attempts.keys()) {
      if (this.attempts.size <= MAX_KEYS) break;
      this.attempts.delete(key);
    }
  }
}
