// Stamp and campaign links. Everything needed lives in the URL fragment (#), which browsers never send
// to a server. A stamp link alone + any Fulcrum server is enough to pay the merchant: no backend involved.
import { base64ToBin, binToBase64, utf8ToBin, binToUtf8 } from '@bitauth/libauth';
import type { ChainNet } from './chain';
import type { StampTerms, Variant } from './stamp';
import { publicKeyOf } from './stamp';

const VERSION = 1;
const NET_CODE: Record<ChainNet, number> = { mainnet: 0, chipnet: 1 };
const CODE_NET: ChainNet[] = ['mainnet', 'chipnet'];
const VARIANT_CODE: Record<Variant, number> = { sig: 0, cov: 1 };
const CODE_VARIANT: Variant[] = ['sig', 'cov'];
export const MAX_NAME_BYTES = 48;
export const MAX_CAMPAIGN_STAMPS = 50;

/** Terms shared by every stamp of one campaign (no keys). */
export interface CampaignTerms {
  net: ChainNet;
  variant: Variant;
  merchantLockingBytecode: Uint8Array;
  /** 'sig': 33-byte sponsor public key; 'cov': sponsor locking bytecode. */
  sponsor: Uint8Array;
  expiry: bigint;
  maxFee: bigint;
  merchantName: string;
}

export interface StampLink extends CampaignTerms {
  stampPrivateKey: Uint8Array;
}

export interface CampaignLink extends CampaignTerms {
  campaignName: string;
  stampPublicKeys: Uint8Array[];
}

export function termsFor(c: CampaignTerms, stampPk: Uint8Array): StampTerms {
  return {
    variant: c.variant,
    stampPk,
    merchantLockingBytecode: c.merchantLockingBytecode,
    sponsorPk: c.variant === 'sig' ? c.sponsor : undefined,
    sponsorLockingBytecode: c.variant === 'cov' ? c.sponsor : undefined,
    expiry: c.expiry,
    maxFee: c.maxFee,
  };
}

// ---- byte helpers -------------------------------------------------------------------------------

export class Writer {
  private parts: number[] = [];
  u8(n: number) {
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`u8 out of range: ${n}`);
    this.parts.push(n);
  }
  u32(n: bigint) {
    if (n < 0n || n > 0xffffffffn) throw new Error(`u32 out of range: ${n}`);
    for (let i = 3; i >= 0; i--) this.parts.push(Number((n >> BigInt(8 * i)) & 0xffn));
  }
  bytes(b: Uint8Array, fixed?: number) {
    if (fixed !== undefined && b.length !== fixed) throw new Error(`expected ${fixed} bytes, got ${b.length}`);
    this.parts.push(...b);
  }
  varBytes(b: Uint8Array) {
    this.u8(b.length);
    this.bytes(b);
  }
  text(s: string) {
    const b = utf8ToBin(s);
    if (b.length > MAX_NAME_BYTES) throw new Error(`name too long (${b.length} bytes, max ${MAX_NAME_BYTES})`);
    this.varBytes(b);
  }
  done(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

export class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.i + n > this.b.length) throw new Error('link is cut short');
  }
  u8(): number {
    this.need(1);
    return this.b[this.i++]!;
  }
  u32(): bigint {
    this.need(4);
    let v = 0n;
    for (let k = 0; k < 4; k++) v = (v << 8n) | BigInt(this.b[this.i++]!);
    return v;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.b.slice(this.i, this.i + n);
    this.i += n;
    return out;
  }
  varBytes(): Uint8Array {
    return this.bytes(this.u8());
  }
  text(): string {
    return binToUtf8(this.varBytes());
  }
  end() {
    if (this.i !== this.b.length) throw new Error('link has extra bytes');
  }
}

export const toB64Url = (b: Uint8Array) => binToBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromB64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('link contains characters that do not belong in it');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBin(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

function writeTerms(w: Writer, c: CampaignTerms) {
  w.u8(NET_CODE[c.net]);
  w.u8(VARIANT_CODE[c.variant]);
  w.varBytes(c.merchantLockingBytecode);
  if (c.variant === 'sig') w.bytes(c.sponsor, 33);
  else w.varBytes(c.sponsor);
  w.u32(c.expiry);
  w.u32(c.maxFee);
  w.text(c.merchantName);
}

function readTerms(r: Reader): CampaignTerms {
  const net = CODE_NET[r.u8()];
  const variant = CODE_VARIANT[r.u8()];
  if (!net) throw new Error('unknown network in link');
  if (!variant) throw new Error('unknown stamp type in link');
  const merchantLockingBytecode = r.varBytes();
  const sponsor = variant === 'sig' ? r.bytes(33) : r.varBytes();
  const expiry = r.u32();
  const maxFee = r.u32();
  const merchantName = r.text();
  return { net, variant, merchantLockingBytecode, sponsor, expiry, maxFee, merchantName };
}

// ---- stamp link ---------------------------------------------------------------------------------

export function encodeStampLink(s: StampLink): string {
  const w = new Writer();
  w.u8(VERSION);
  writeTerms(w, s);
  w.bytes(s.stampPrivateKey, 32);
  return toB64Url(w.done());
}

export function decodeStampLink(fragment: string): StampLink {
  const r = new Reader(fromB64Url(fragment.replace(/^#/, '')));
  if (r.u8() !== VERSION) throw new Error('this stamp link is from an unknown version');
  const terms = readTerms(r);
  const stampPrivateKey = r.bytes(32);
  r.end();
  publicKeyOf(stampPrivateKey); // throws on an invalid key
  return { ...terms, stampPrivateKey };
}

// ---- campaign link ------------------------------------------------------------------------------

export function encodeCampaignLink(c: CampaignLink): string {
  if (c.stampPublicKeys.length < 1 || c.stampPublicKeys.length > MAX_CAMPAIGN_STAMPS) {
    throw new Error(`a campaign holds 1 to ${MAX_CAMPAIGN_STAMPS} stamps`);
  }
  const w = new Writer();
  w.u8(VERSION);
  writeTerms(w, c);
  w.text(c.campaignName);
  w.u8(c.stampPublicKeys.length);
  for (const pk of c.stampPublicKeys) w.bytes(pk, 33);
  return toB64Url(w.done());
}

export function decodeCampaignLink(fragment: string): CampaignLink {
  const r = new Reader(fromB64Url(fragment.replace(/^#/, '')));
  if (r.u8() !== VERSION) throw new Error('this campaign link is from an unknown version');
  const terms = readTerms(r);
  const campaignName = r.text();
  const n = r.u8();
  if (n < 1 || n > MAX_CAMPAIGN_STAMPS) throw new Error('campaign link has a bad stamp count');
  const stampPublicKeys = Array.from({ length: n }, () => r.bytes(33));
  r.end();
  return { ...terms, campaignName, stampPublicKeys };
}
