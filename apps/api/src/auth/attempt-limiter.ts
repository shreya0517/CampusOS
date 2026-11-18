/**
 * Counts attempts per key within a sliding window, in memory. Each API instance keeps its own counts, which is enough
 * to slow password guessing on one account; a shared store would be needed to limit across several instances.
 */
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Milliseconds until another attempt is allowed for this key, or 0 if it is allowed now. */
  retryAfter(key: string): number {
    const recent = this.recent(key);
    return recent.length >= this.limit ? Math.max(1, recent[0]! + this.windowMs - this.now()) : 0;
  }

  hit(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.attempts.set(key, recent);
    // Keys that are never seen again would otherwise stay forever.
    if (this.attempts.size > 10_000) for (const stale of [...this.attempts.keys()]) this.recent(stale);
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
}
