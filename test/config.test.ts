import { describe, expect, it } from 'vitest';
import { decodeCashAddress } from '@bitauth/libauth';
import { BANNER, DEMO_SHOP } from '../src/config';

// The banner and the demo shop are public addresses typed by hand. A single wrong character
// would send EMBER2026 votes or demo payments into nowhere, so the checksum is checked here.
function decoded(address: string) {
  const result = decodeCashAddress(address);
  if (typeof result === 'string') throw new Error(`${address}: ${result}`);
  return result;
}

describe('banner addresses', () => {
  it('EMBER2026 address is a mainnet CashTokens address with a valid checksum', () => {
    const { prefix, type } = decoded(BANNER.emberTokenAddress);
    expect(prefix).toBe('bitcoincash');
    expect(type).toBe('p2pkhWithTokens');
  });

  it('a one-character typo in that address is caught', () => {
    const typo = BANNER.emberTokenAddress.slice(0, -1) + (BANNER.emberTokenAddress.endsWith('3') ? '4' : '3');
    expect(typeof decodeCashAddress(typo)).toBe('string');
  });

  it('slides and repo links are either not set yet or https', () => {
    for (const url of [BANNER.slidesUrl, BANNER.repoUrl]) {
      if (url) expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('demo shop addresses', () => {
  it('each network has a valid address with its own prefix', () => {
    expect(decoded(DEMO_SHOP.address.mainnet).prefix).toBe('bitcoincash');
    expect(decoded(DEMO_SHOP.address.chipnet).prefix).toBe('bchtest');
  });
});
