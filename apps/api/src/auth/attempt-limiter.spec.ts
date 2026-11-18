import { AttemptLimiter } from './attempt-limiter';

describe('AttemptLimiter', () => {
  it('allows up to the limit in the window, then says how long to wait', () => {
    let now = 1_000_000;
    const limiter = new AttemptLimiter(3, 60_000, () => now);
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.retryAfter('a')).toBe(0);
      limiter.hit('a');
      now += 1_000;
    }
    expect(limiter.retryAfter('a')).toBe(57_000);
    expect(limiter.retryAfter('b')).toBe(0);
    // The oldest attempt leaves the window.
    now += 57_000;
    expect(limiter.retryAfter('a')).toBe(0);
  });

  it('checks and records an attempt in one step', () => {
    const limiter = new AttemptLimiter(2, 60_000);
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBeGreaterThan(0);
  });

  it('sweeps expired keys at most once a minute, not on every attempt', () => {
    let now = 0;
    const limiter = new AttemptLimiter(5, 1_000, () => now);
    const size = () => (limiter as unknown as { attempts: Map<string, number[]> }).attempts.size;
    for (let i = 0; i < 100; i += 1) limiter.hit(`k${i}`);
    now = 30_000;
    limiter.hit('fresh');
    // Within the minute since the last sweep, nothing is swept.
    expect(size()).toBe(101);
    now = 61_000;
    limiter.hit('later');
    // Everything but the attempt just made has left its one-second window.
    expect(size()).toBe(1);
  });

  it('starts over after a reset', () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.hit('a');
    expect(limiter.retryAfter('a')).toBeGreaterThan(0);
    limiter.reset('a');
    expect(limiter.retryAfter('a')).toBe(0);
  });
});
