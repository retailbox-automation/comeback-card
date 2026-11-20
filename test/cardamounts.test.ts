import { describe, expect, it } from 'vitest';
import { MIN_CARD_SATS } from '../src/core/card';
import { CARD_AMOUNTS_USD, amountOptions, keepAllowed } from '../src/core/cardamounts';

const opt = (rate: number | null, usd: number) => amountOptions(rate).find((o) => o.usd === usd)!;

describe('Give form amounts', () => {
  it('offers $0.01 next to $0.05, $0.25 and $1, smallest first', () => {
    expect([...CARD_AMOUNTS_USD]).toEqual([0.01, 0.05, 0.25, 1]);
  });

  it('$0.01 is allowed at today’s price ($192.15/BCH): 5,204 sats, above the 5,000-sat minimum', () => {
    const o = opt(192.15, 0.01);
    expect(o.sats).toBe(5204n);
    expect(o.allowed).toBe(true);
  });

  it('exactly at the minimum is allowed ($200/BCH gives 5,000 sats for $0.01)', () => {
    const o = opt(200, 0.01);
    expect(o.sats).toBe(MIN_CARD_SATS);
    expect(o.allowed).toBe(true);
  });

  it('after a price jump $0.01 falls below the minimum and is not allowed; the bigger amounts still are', () => {
    const at = (usd: number) => opt(250, usd);
    expect(at(0.01).sats).toBe(4000n);
    expect(at(0.01).allowed).toBe(false);
    expect(at(0.05).allowed).toBe(true);
    expect(at(0.25).allowed).toBe(true);
    expect(at(1).allowed).toBe(true);
  });

  it('while the price is unknown nothing can be picked', () => {
    for (const o of amountOptions(null)) expect(o).toMatchObject({ sats: null, allowed: false });
    for (const o of amountOptions(undefined)) expect(o.allowed).toBe(false);
  });

  it('keeps the chosen amount while allowed, otherwise moves to the smallest allowed one', () => {
    expect(keepAllowed(0.01, amountOptions(192.15))).toBe(0.01);
    expect(keepAllowed(0.01, amountOptions(250))).toBe(0.05);
    expect(keepAllowed(0.25, amountOptions(250))).toBe(0.25);
    expect(keepAllowed(0.25, amountOptions(null))).toBe(0.25);
  });
});
