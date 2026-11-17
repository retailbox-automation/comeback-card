import { describe, expect, it } from 'vitest';
import { binToHex, generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { approveShopAddress, CARD_MAX_FEE, CARD_MIN_CHANGE } from '../src/core/card';
import {
  cardTermsOf,
  decodeCardLink,
  decodeShopKeyLink,
  decodeShopLink,
  encodeCardLink,
  encodeShopKeyLink,
  encodeShopLink,
  shopLinkOf,
  type CardLink,
  type ShopKeyLink,
} from '../src/core/cardlink';
import { encodeStampLink } from '../src/core/link';
import { lockingBytecodeOf, publicKeyOf } from '../src/core/stamp';

const lb = (k: Uint8Array) => lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(k), prefix: 'bitcoincash' }).address);

function shopKeyLink(): ShopKeyLink {
  return { net: 'mainnet', shopName: 'Maple Street Coffee', shopPrivateKey: generatePrivateKey(), lockingBytecode: lb(generatePrivateKey()) };
}

function cardLink(): CardLink {
  return {
    ...shopLinkOf(shopKeyLink()),
    giverLockingBytecode: lb(generatePrivateKey()),
    expiry: 1_796_000_000n,
    maxFee: CARD_MAX_FEE,
    minChange: CARD_MIN_CHANGE,
    fromName: 'Anna',
    cardPrivateKey: generatePrivateKey(),
  };
}

const same = (a: Uint8Array, b: Uint8Array) => expect(binToHex(a)).toBe(binToHex(b));

describe('shop links', () => {
  it('a shop key link round-trips and gives a public shop link whose signature verifies', () => {
    const k = shopKeyLink();
    const back = decodeShopKeyLink(encodeShopKeyLink(k));
    same(back.shopPrivateKey, k.shopPrivateKey);
    same(back.lockingBytecode, k.lockingBytecode);
    expect(back.shopName).toBe(k.shopName);
    const pub = decodeShopLink('#' + encodeShopLink(shopLinkOf(back)));
    same(pub.shopPk, publicKeyOf(k.shopPrivateKey));
    same(pub.approval.lockingBytecode, k.lockingBytecode);
  });

  it('the public shop link holds no private key', () => {
    const k = shopKeyLink();
    const pub = encodeShopLink(shopLinkOf(k));
    const keyHex = binToHex(k.shopPrivateKey);
    // The link is base64url; decode back and look for the key bytes.
    const raw = Buffer.from(pub.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
    expect(raw.includes(keyHex)).toBe(false);
    // Control: the key link does contain it, so the search can see a key when one is there.
    const rawKey = Buffer.from(encodeShopKeyLink(k).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
    expect(rawKey.includes(keyHex)).toBe(true);
  });

  it('refuses a shop link whose signature does not match the address', () => {
    const real = shopLinkOf(shopKeyLink());
    const forged = { ...real, approval: { lockingBytecode: lb(generatePrivateKey()), signature: real.approval.signature } };
    expect(() => decodeShopLink(encodeShopLink(forged))).toThrow(/does not match/);
  });

  it('refuses a shop link signed by a different key than the one it names', () => {
    const k = shopKeyLink();
    const other = generatePrivateKey();
    const forged = { ...shopLinkOf(k), approval: approveShopAddress(other, k.lockingBytecode) };
    expect(() => decodeShopLink(encodeShopLink(forged))).toThrow(/does not match/);
  });
});

describe('card links', () => {
  it('round-trips every field', () => {
    const c = cardLink();
    const back = decodeCardLink('#' + encodeCardLink(c));
    expect(back.net).toBe('mainnet');
    expect(back.shopName).toBe(c.shopName);
    expect(back.fromName).toBe('Anna');
    expect(back.expiry).toBe(c.expiry);
    expect(back.maxFee).toBe(c.maxFee);
    expect(back.minChange).toBe(c.minChange);
    same(back.shopPk, c.shopPk);
    same(back.approval.lockingBytecode, c.approval.lockingBytecode);
    same(back.approval.signature, c.approval.signature);
    same(back.giverLockingBytecode, c.giverLockingBytecode);
    same(back.cardPrivateKey, c.cardPrivateKey);
    same(cardTermsOf(back).cardPk, publicKeyOf(c.cardPrivateKey));
  });

  it('an empty "from" line is allowed', () => {
    const c = { ...cardLink(), fromName: '' };
    expect(decodeCardLink(encodeCardLink(c)).fromName).toBe('');
  });

  it('tells card, shop, shop key and stamp links apart', () => {
    const c = cardLink();
    const k = shopKeyLink();
    expect(() => decodeShopLink(encodeCardLink(c))).toThrow(/not a shop link/);
    expect(() => decodeCardLink(encodeShopLink(shopLinkOf(k)))).toThrow(/not a card link/);
    expect(() => decodeCardLink(encodeShopKeyLink(k))).toThrow(/not a card link/);
    const stamp = encodeStampLink({
      net: 'mainnet',
      variant: 'cov',
      merchantLockingBytecode: k.lockingBytecode,
      sponsor: c.giverLockingBytecode,
      expiry: c.expiry,
      maxFee: 2000n,
      merchantName: 'x',
      stampPrivateKey: generatePrivateKey(),
    });
    expect(() => decodeCardLink(stamp)).toThrow(/not a card link/);
  });

  it('refuses a cut link, a link with extra bytes and foreign characters', () => {
    const s = encodeCardLink(cardLink());
    expect(() => decodeCardLink(s.slice(0, -10))).toThrow();
    expect(() => decodeCardLink(s + 'AAAA')).toThrow(/extra bytes/);
    expect(() => decodeCardLink(s.slice(0, 20) + '!' + s.slice(21))).toThrow(/characters/);
  });

  it('refuses a "from" line longer than 48 bytes', () => {
    expect(() => encodeCardLink({ ...cardLink(), fromName: 'x'.repeat(49) })).toThrow(/too long/);
  });

  it('a card link fits a phone QR code comfortably (under 400 characters)', () => {
    expect(encodeCardLink(cardLink()).length).toBeLessThan(400);
  });
});
