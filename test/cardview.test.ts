import { describe, expect, it } from 'vitest';
import { endedAgo, endedText } from '../src/core/cardview';

const E = 1_795_000_000n;

describe('card end, by network time', () => {
  it('is not ended before the expiry', () => {
    expect(endedAgo(E - 1n, E)).toBeNull();
  });
  it('counts minutes, then hours, then days', () => {
    expect(endedAgo(E, E)).toBe('1 min');
    expect(endedAgo(E + 35n * 60n, E)).toBe('35 min');
    expect(endedAgo(E + 2n * 3600n + 59n, E)).toBe('2 h');
    expect(endedAgo(E + 47n * 3600n, E)).toBe('47 h');
    expect(endedAgo(E + 3n * 86400n, E)).toBe('3 days');
  });
  it('says network time and who can act', () => {
    expect(endedText(E + 2n * 3600n, E, true)).toBe(
      'This card ended 2 h ago (network time). What’s left can only go back to the giver, and anyone can send it now.',
    );
    expect(endedText(E + 2n * 3600n, E, false)).toBe('This card ended 2 h ago (network time).');
  });
});
