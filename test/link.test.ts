import { describe, expect, it } from 'vitest';
import { binToHex, generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import {
  decodeCampaignLink,
  decodeStampLink,
  encodeCampaignLink,
  encodeStampLink,
  type CampaignTerms,
} from '../src/core/link';
import { lockingBytecodeOf, publicKeyOf } from '../src/core/stamp';

function lb(): Uint8Array {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(generatePrivateKey()), prefix: 'bitcoincash' });
  return lockingBytecodeOf(address);
}

const base = (variant: 'sig' | 'cov'): CampaignTerms => ({
  net: 'mainnet',
  variant,
  merchantLockingBytecode: lb(),
  sponsor: variant === 'sig' ? publicKeyOf(generatePrivateKey()) : lb(),
  expiry: 1_795_000_000n,
  maxFee: 2_000n,
  merchantName: 'Maple Street Coffee ☕',
});

describe('stamp link', () => {
  for (const variant of ['sig', 'cov'] as const) {
    it(`round-trips every field (${variant})`, () => {
      const t = base(variant);
      const key = generatePrivateKey();
      const frag = encodeStampLink({ ...t, stampPrivateKey: key });
      expect(frag).toMatch(/^[A-Za-z0-9_-]+$/); // safe in a URL fragment, no padding
      expect(frag.length).toBeLessThan(200);
      const back = decodeStampLink('#' + frag);
      expect(back.net).toBe(t.net);
      expect(back.variant).toBe(variant);
      expect(binToHex(back.merchantLockingBytecode)).toBe(binToHex(t.merchantLockingBytecode));
      expect(binToHex(back.sponsor)).toBe(binToHex(t.sponsor));
      expect(back.expiry).toBe(t.expiry);
      expect(back.maxFee).toBe(t.maxFee);
      expect(back.merchantName).toBe(t.merchantName);
      expect(binToHex(back.stampPrivateKey)).toBe(binToHex(key));
    });
  }

  it('rejects a cut link', () => {
    const frag = encodeStampLink({ ...base('cov'), stampPrivateKey: generatePrivateKey() });
    expect(() => decodeStampLink(frag.slice(0, -10))).toThrow(/cut short|extra bytes/);
  });

  it('rejects a link with extra bytes', () => {
    const frag = encodeStampLink({ ...base('cov'), stampPrivateKey: generatePrivateKey() });
    expect(() => decodeStampLink(frag + 'AAAA')).toThrow(/extra bytes/);
  });

  it('rejects junk characters', () => {
    expect(() => decodeStampLink('not a link!')).toThrow(/characters/);
  });

  it('rejects a merchant name that is too long', () => {
    expect(() => encodeStampLink({ ...base('cov'), merchantName: 'x'.repeat(49), stampPrivateKey: generatePrivateKey() })).toThrow(/too long/);
  });

  it('rejects an expiry that does not fit 4 bytes', () => {
    expect(() => encodeStampLink({ ...base('cov'), expiry: 2n ** 32n, stampPrivateKey: generatePrivateKey() })).toThrow(/out of range/);
  });
});

describe('campaign link', () => {
  it('round-trips 10 stamps and stays QR-sized', () => {
    const t = base('cov');
    const pks = Array.from({ length: 10 }, () => publicKeyOf(generatePrivateKey()));
    const frag = encodeCampaignLink({ ...t, campaignName: 'Newcomers Night', stampPublicKeys: pks });
    expect(frag.length).toBeLessThan(700);
    const back = decodeCampaignLink(frag);
    expect(back.campaignName).toBe('Newcomers Night');
    expect(back.stampPublicKeys.map(binToHex)).toEqual(pks.map(binToHex));
    expect(back.merchantName).toBe(t.merchantName);
  });

  it('refuses 0 or more than 50 stamps', () => {
    const t = base('cov');
    expect(() => encodeCampaignLink({ ...t, campaignName: 'x', stampPublicKeys: [] })).toThrow(/1 to 50/);
    const many = Array.from({ length: 51 }, () => publicKeyOf(generatePrivateKey()));
    expect(() => encodeCampaignLink({ ...t, campaignName: 'x', stampPublicKeys: many })).toThrow(/1 to 50/);
  });

  it('a stamp link is not accepted as a campaign link', () => {
    const frag = encodeStampLink({ ...base('cov'), stampPrivateKey: generatePrivateKey() });
    expect(() => decodeCampaignLink(frag)).toThrow();
  });
});
