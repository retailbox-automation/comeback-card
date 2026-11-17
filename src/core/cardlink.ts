// Comeback Card links. As with stamps, everything lives in the URL fragment (#), which browsers never send
// to a server: a card link plus any Fulcrum server is enough to spend the card. No backend involved.
//   card link      - the card: terms + the card key. Whoever holds it can spend at the shop.
//   shop link      - public, for givers: the shop's key and its signed receiving address.
//   shop key link  - private, kept by the shop: its signing key, to sign another address later.
// The first byte tells the three apart (and from stamp links, which start with 0x01).
import type { ChainNet } from './chain';
import { Reader, Writer, fromB64Url, toB64Url } from './link';
import { publicKeyOf } from './stamp';
import { approveShopAddress, verifyShopApproval, type CardTerms, type ShopApproval } from './card';

const KIND_CARD = 0xc1;
const KIND_SHOP = 0xc2;
const KIND_SHOP_KEY = 0xc3;
const NET_CODE: Record<ChainNet, number> = { mainnet: 0, chipnet: 1 };
const CODE_NET: ChainNet[] = ['mainnet', 'chipnet'];

/** What a giver needs to make a card for a shop. */
export interface ShopLink {
  net: ChainNet;
  shopName: string;
  shopPk: Uint8Array;
  approval: ShopApproval;
}

export interface ShopKeyLink {
  net: ChainNet;
  shopName: string;
  shopPrivateKey: Uint8Array;
  lockingBytecode: Uint8Array;
}

export interface CardLink extends ShopLink {
  giverLockingBytecode: Uint8Array;
  expiry: bigint;
  maxFee: bigint;
  minChange: bigint;
  /** Optional "from" line shown on the card, may be empty. */
  fromName: string;
  cardPrivateKey: Uint8Array;
}

export function cardTermsOf(c: CardLink): CardTerms {
  return {
    cardPk: publicKeyOf(c.cardPrivateKey),
    shopPk: c.shopPk,
    giverLockingBytecode: c.giverLockingBytecode,
    expiry: c.expiry,
    maxFee: c.maxFee,
    minChange: c.minChange,
  };
}

function readKind(r: Reader, expected: number, what: string) {
  const k = r.u8();
  if (k !== expected) throw new Error(`this is not a ${what} link`);
}

function readNet(r: Reader): ChainNet {
  const net = CODE_NET[r.u8()];
  if (!net) throw new Error('unknown network in link');
  return net;
}

function writeShop(w: Writer, s: ShopLink) {
  w.u8(NET_CODE[s.net]);
  w.text(s.shopName);
  w.bytes(s.shopPk, 33);
  w.varBytes(s.approval.lockingBytecode);
  w.bytes(s.approval.signature, 64);
}

function readShop(r: Reader): ShopLink {
  const net = readNet(r);
  const shopName = r.text();
  const shopPk = r.bytes(33);
  const lockingBytecode = r.varBytes();
  const signature = r.bytes(64);
  const shop = { net, shopName, shopPk, approval: { lockingBytecode, signature } };
  // A link whose signature does not match would build cards the shop can never be paid from.
  if (!verifyShopApproval(shopPk, shop.approval)) throw new Error('the shop signature in this link does not match its address');
  return shop;
}

// ---- shop link ----------------------------------------------------------------------------------

export function encodeShopLink(s: ShopLink): string {
  const w = new Writer();
  w.u8(KIND_SHOP);
  writeShop(w, s);
  return toB64Url(w.done());
}

export function decodeShopLink(fragment: string): ShopLink {
  const r = new Reader(fromB64Url(fragment.replace(/^#/, '')));
  readKind(r, KIND_SHOP, 'shop');
  const s = readShop(r);
  r.end();
  return s;
}

// ---- shop key link (kept by the shop) -----------------------------------------------------------

export function encodeShopKeyLink(s: ShopKeyLink): string {
  const w = new Writer();
  w.u8(KIND_SHOP_KEY);
  w.u8(NET_CODE[s.net]);
  w.text(s.shopName);
  w.bytes(s.shopPrivateKey, 32);
  w.varBytes(s.lockingBytecode);
  return toB64Url(w.done());
}

export function decodeShopKeyLink(fragment: string): ShopKeyLink {
  const r = new Reader(fromB64Url(fragment.replace(/^#/, '')));
  readKind(r, KIND_SHOP_KEY, 'shop key');
  const net = readNet(r);
  const shopName = r.text();
  const shopPrivateKey = r.bytes(32);
  const lockingBytecode = r.varBytes();
  r.end();
  publicKeyOf(shopPrivateKey); // throws on an invalid key
  return { net, shopName, shopPrivateKey, lockingBytecode };
}

/** The public shop link that belongs to a shop key link. */
export function shopLinkOf(k: ShopKeyLink): ShopLink {
  return {
    net: k.net,
    shopName: k.shopName,
    shopPk: publicKeyOf(k.shopPrivateKey),
    approval: approveShopAddress(k.shopPrivateKey, k.lockingBytecode),
  };
}

// ---- card link ----------------------------------------------------------------------------------

export function encodeCardLink(c: CardLink): string {
  const w = new Writer();
  w.u8(KIND_CARD);
  writeShop(w, c);
  w.varBytes(c.giverLockingBytecode);
  w.u32(c.expiry);
  w.u32(c.maxFee);
  w.u32(c.minChange);
  w.text(c.fromName);
  w.bytes(c.cardPrivateKey, 32);
  return toB64Url(w.done());
}

export function decodeCardLink(fragment: string): CardLink {
  const r = new Reader(fromB64Url(fragment.replace(/^#/, '')));
  readKind(r, KIND_CARD, 'card');
  const shop = readShop(r);
  const giverLockingBytecode = r.varBytes();
  const expiry = r.u32();
  const maxFee = r.u32();
  const minChange = r.u32();
  const fromName = r.text();
  const cardPrivateKey = r.bytes(32);
  r.end();
  publicKeyOf(cardPrivateKey); // throws on an invalid key
  return { ...shop, giverLockingBytecode, expiry, maxFee, minChange, fromName, cardPrivateKey };
}
