import { describe, expect, it } from 'vitest';
import { pollDelay } from './client';

describe('pollDelay', () => {
  it('uses a short visible-tab interval and exponential backoff', () => {
    expect(pollDelay(0, false)).toBe(3_000);
    expect(pollDelay(1, false)).toBe(6_000);
    expect(pollDelay(5, false)).toBe(48_000);
  });

  it('slows hidden tabs and caps retries at one minute', () => {
    expect(pollDelay(0, true)).toBe(20_000);
    expect(pollDelay(5, true)).toBe(60_000);
    expect(pollDelay(99, true)).toBe(60_000);
  });
});
