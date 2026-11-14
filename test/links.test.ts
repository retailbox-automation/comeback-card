import { describe, expect, it } from 'vitest';
import { counterHref } from '../src/ui/links';
import { DEMO_SHOP } from '../src/config';

// The counter page reads `a` and `n` back with URLSearchParams on the fragment (web/shop.tsx).
function readBack(href: string) {
  const p = new URLSearchParams(href.split('#')[1]);
  return { a: p.get('a'), n: p.get('n'), tx: p.get('tx') };
}

describe('shop counter link', () => {
  it('opens the counter of the shop the stamps were made for, not the demo shop', () => {
    const own = 'bitcoincash:qpg228tg5gdnuaqvk78kr7jdureu4gpywsd437jwvh';
    const back = readBack(counterHref(own, 'Corner Bakery & Café'));
    expect(back.a).toBe(own);
    expect(back.a).not.toBe(DEMO_SHOP.address.mainnet);
    expect(back.n).toBe('Corner Bakery & Café');
    expect(back.tx).toBeNull();
  });

  it('carries the payment to highlight when there is one', () => {
    const back = readBack(counterHref(DEMO_SHOP.address.chipnet, DEMO_SHOP.name, 'ab'.repeat(32)));
    expect(back).toEqual({ a: DEMO_SHOP.address.chipnet, n: DEMO_SHOP.name, tx: 'ab'.repeat(32) });
  });
});
