import { describe, expect, it } from 'vitest';
import { MIN_CARD_SATS } from '../src/core/card';
import { CARD_FEE_RESERVE_SATS, CARD_MAX_FEE, CARD_MIN_CHANGE } from '../src/core/card';
import { CARD_AMOUNTS_USD, amountOptions, keepAllowed, payPresets, usdLabel } from '../src/core/cardamounts';
import { usdToSats } from '../src/core/price';

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

  it('a $0.01 card still offers a partial payment ($0.005) that leaves a rest on the card', () => {
    for (const rate of [150, 190.54, 200]) {
      const cardSats = usdToSats(0.01, rate) + CARD_FEE_RESERVE_SATS; // what the Give form puts on the card
      const balanceUsd = (Number(cardSats) / 1e8) * rate;
      const p = payPresets(balanceUsd);
      expect(p).toContain(0.005);
      const part = usdToSats(Math.max(...p), rate);
      expect(cardSats - part - CARD_MAX_FEE).toBeGreaterThanOrEqual(CARD_MIN_CHANGE); // the rest stays on the card
    }
  });

  it('bigger cards keep their usual partial amounts', () => {
    expect(payPresets(0.0538)).toEqual([0.01, 0.02]); // $0.05 card with its fee reserve, at $190.54/BCH
    expect(payPresets(0.2538)).toEqual([0.05, 0.1]); // $0.25 card
    expect(payPresets(1.0038)).toEqual([0.25, 0.5]); // $1 card
    expect(payPresets(null)).toEqual([]);
  });

  it('labels: $0.005 keeps three decimals, cents two, dollars none', () => {
    expect(usdLabel(0.005)).toBe('$0.005');
    expect(usdLabel(0.01)).toBe('$0.01');
    expect(usdLabel(0.25)).toBe('$0.25');
    expect(usdLabel(1)).toBe('$1');
    expect(usdLabel(2.5)).toBe('$2.50');
  });

  it('keeps the chosen amount while allowed, otherwise moves to the smallest allowed one', () => {
    expect(keepAllowed(0.01, amountOptions(192.15))).toBe(0.01);
    expect(keepAllowed(0.01, amountOptions(250))).toBe(0.05);
    expect(keepAllowed(0.25, amountOptions(250))).toBe(0.25);
    expect(keepAllowed(0.25, amountOptions(null))).toBe(0.25);
  });
});
