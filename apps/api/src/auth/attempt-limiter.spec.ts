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

  it('starts over after a reset', () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.hit('a');
    expect(limiter.retryAfter('a')).toBeGreaterThan(0);
    limiter.reset('a');
    expect(limiter.retryAfter('a')).toBe(0);
  });
});
