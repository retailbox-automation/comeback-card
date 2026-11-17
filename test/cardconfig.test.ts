import { describe, expect, it } from 'vitest';
import { binToHex } from '@bitauth/libauth';
import { CARD_DEMO_SHOP_LINK, DEMO_SHOP } from '../src/config';
import { decodeShopLink } from '../src/core/cardlink';
import { lockingBytecodeOf } from '../src/core/stamp';
import type { ChainNet } from '../src/core/chain';

describe('Comeback Card demo shop link in the config', () => {
  for (const net of ['chipnet', 'mainnet'] as ChainNet[]) {
    it(`${net}: decodes, the signature verifies, and it signs the demo shop address`, () => {
      const s = decodeShopLink(CARD_DEMO_SHOP_LINK[net]); // throws if the signature does not verify
      expect(s.net).toBe(net);
      expect(s.shopName).toBe(DEMO_SHOP.name);
      expect(binToHex(s.approval.lockingBytecode)).toBe(binToHex(lockingBytecodeOf(DEMO_SHOP.address[net])));
    });
  }

  it('the two networks use different shop keys', () => {
    expect(binToHex(decodeShopLink(CARD_DEMO_SHOP_LINK.chipnet).shopPk)).not.toBe(binToHex(decodeShopLink(CARD_DEMO_SHOP_LINK.mainnet).shopPk));
  });
});
