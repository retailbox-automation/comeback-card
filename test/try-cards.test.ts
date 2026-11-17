// The ready-made demo cards on the Comeback Card home page (web/public/try-cards.json).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { binToHex } from '@bitauth/libauth';
import { DEMO_SHOP } from '../src/config';
import { decodeCardLink } from '../src/core/cardlink';
import { lockingBytecodeOf } from '../src/core/stamp';

const SPONSOR_MAINNET = 'bitcoincash:qpg228tg5gdnuaqvk78kr7jdureu4gpywsd437jwvh';
const t = JSON.parse(readFileSync(new URL('../web/public/try-cards.json', import.meta.url), 'utf8')) as {
  net: string;
  cards: string[];
  expiredCard?: string;
};

describe('try-cards.json', () => {
  it('is for mainnet and every link is a relative card link', () => {
    expect(t.net).toBe('mainnet');
    for (const href of [...t.cards, ...(t.expiredCard ? [t.expiredCard] : [])]) expect(href.startsWith('card.html#')).toBe(true);
  });

  it('the ended card pays only the demo shop, has already ended, and goes back to the demo sponsor', () => {
    expect(t.expiredCard).toBeTruthy();
    const c = decodeCardLink(t.expiredCard!.split('#')[1]!);
    expect(c.net).toBe('mainnet');
    expect(binToHex(c.approval.lockingBytecode)).toBe(binToHex(lockingBytecodeOf(DEMO_SHOP.address.mainnet)));
    expect(binToHex(c.giverLockingBytecode)).toBe(binToHex(lockingBytecodeOf(SPONSOR_MAINNET)));
    expect(c.expiry).toBeLessThan(BigInt(Math.floor(Date.now() / 1000)));
  });
});
