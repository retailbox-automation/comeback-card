// Core of Comeback Card: build card contracts, the shop's approval of its address,
// and the transactions that move a card. Pure functions, shared by the web pages and the tests.
// No keys are stored here.

import {
  Contract,
  SignatureTemplate,
  TransactionBuilder,
  type NetworkProvider,
  type SpendableUtxo,
  type Unlocker,
} from 'cashscript';
import { flattenBinArray, secp256k1, sha256, utf8ToBin } from '@bitauth/libauth';
import artifactCard from '../contract/card.artifact';
import { DUST_SATS, FEE_SATS_PER_BYTE, lockingBytecodeOf } from './stamp';

/** Cap on the miner fee one spend or the return may take. A card spend is ≈400 bytes at 1 sat/byte. */
export const CARD_MAX_FEE = 1000n;
/** Smallest rest the contract keeps on the card. A smaller rest goes to the shop with the payment. */
export const CARD_MIN_CHANGE = 1000n;
/** Smallest card the UI allows: room for a few spends and their fees. */
export const MIN_CARD_SATS = 5000n;
/**
 * Network fee reserve the giver adds on top of the gift: about three partial payments (≈510 sats each)
 * and the return (≈310 sats) at 1 sat/byte. The shop always receives the full amount of each payment.
 */
export const CARD_FEE_RESERVE_SATS = 2_000n;
/** Domain tag in front of the address the shop signs, so a shop signature from elsewhere can't be reused. */
export const SHOP_APPROVAL_TAG = utf8ToBin('CBC1');

export interface CardTerms {
  /** Compressed public key of the card key (the private key lives only in the card link fragment). */
  cardPk: Uint8Array;
  /** Compressed public key of the shop's signing key. */
  shopPk: Uint8Array;
  /** Where the rest goes after the expiry. */
  giverLockingBytecode: Uint8Array;
  /** Unix time (seconds, >= 500_000_000), checked against network time (median time past). */
  expiry: bigint;
  maxFee: bigint;
  minChange: bigint;
}

/** A shop's signed "pay me here": the receiving address and the shop key's signature over it. */
export interface ShopApproval {
  lockingBytecode: Uint8Array;
  /** 64-byte Schnorr data signature over sha256("CBC1" + lockingBytecode). */
  signature: Uint8Array;
}

export function cardContract(terms: CardTerms, provider: NetworkProvider): Contract {
  if (terms.expiry < 500_000_000n) throw new Error('expiry must be a unix timestamp, not a block height');
  if (terms.minChange < DUST_SATS) throw new Error('minChange must be at least the dust limit');
  return new Contract(
    artifactCard,
    [terms.cardPk, terms.shopPk, terms.giverLockingBytecode, terms.expiry, terms.maxFee, terms.minChange],
    { provider },
  );
}

export function shopApprovalMessage(lockingBytecode: Uint8Array): Uint8Array {
  return flattenBinArray([SHOP_APPROVAL_TAG, lockingBytecode]);
}

/** The shop signs its receiving address once, in its own browser. */
export function approveShopAddress(shopPrivateKey: Uint8Array, lockingBytecode: Uint8Array): ShopApproval {
  const signature = secp256k1.signMessageHashSchnorr(shopPrivateKey, sha256.hash(shopApprovalMessage(lockingBytecode)));
  if (typeof signature === 'string') throw new Error(signature);
  return { lockingBytecode, signature };
}

/** Same check the contract does with OP_CHECKDATASIG, run locally before building anything. */
export function verifyShopApproval(shopPk: Uint8Array, approval: ShopApproval): boolean {
  return secp256k1.verifySignatureSchnorr(approval.signature, shopPk, sha256.hash(shopApprovalMessage(approval.lockingBytecode)));
}

export type CardSpend =
  | { kind: 'part'; builder: TransactionBuilder; fee: bigint; paid: bigint; rest: bigint }
  | { kind: 'all'; builder: TransactionBuilder; fee: bigint; paid: bigint; rest: 0n };

function sizeOf(make: () => TransactionBuilder): bigint {
  return BigInt(make().getTransactionSize());
}

/**
 * Pay `amount` to the shop and keep the rest on the card (same contract address).
 * If the rest after the fee would be below minChange, the whole card goes to the shop instead,
 * which is what the contract allows for a single output.
 */
export function buildCardSpend(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  cardPrivateKey: Uint8Array,
  approval: ShopApproval,
  amount: bigint,
  minChange: bigint = CARD_MIN_CHANGE,
): CardSpend {
  if (amount < DUST_SATS) throw new Error(`amount below the dust limit (${DUST_SATS} sats)`);
  if (amount > utxo.satoshis) throw new Error('amount above the card balance');
  const unlocker = contract.unlock.spend!(new SignatureTemplate(cardPrivateKey), approval.signature, approval.lockingBytecode);
  const cardLockingBytecode = lockingBytecodeOf(contract.address);
  const two = (paid: bigint, rest: bigint) => () => {
    const b = new TransactionBuilder({ provider });
    b.addInput(utxo, unlocker);
    b.addOutput({ to: approval.lockingBytecode, amount: paid });
    b.addOutput({ to: cardLockingBytecode, amount: rest });
    return b;
  };
  const one = (paid: bigint) => () => {
    const b = new TransactionBuilder({ provider });
    b.addInput(utxo, unlocker);
    b.addOutput({ to: approval.lockingBytecode, amount: paid });
    return b;
  };
  const feeTwo = sizeOf(two(amount, minChange)) * FEE_SATS_PER_BYTE;
  const rest = utxo.satoshis - amount - feeTwo;
  if (rest >= minChange) {
    return { kind: 'part', builder: two(amount, rest)(), fee: feeTwo, paid: amount, rest };
  }
  const feeOne = sizeOf(one(utxo.satoshis - CARD_MAX_FEE)) * FEE_SATS_PER_BYTE;
  const paid = utxo.satoshis - feeOne;
  if (paid < DUST_SATS) throw new Error('card balance too small to pay');
  return { kind: 'all', builder: one(paid)(), fee: feeOne, paid, rest: 0n };
}

/**
 * The demo attack: the card holder tries to cash the card out to another address.
 * Uses the shop's real approval (the only valid one), so the node refuses at the output check.
 * Built without local evaluation so the raw transaction can go to the node word for word.
 */
export function buildCardCashOut(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  cardPrivateKey: Uint8Array,
  approval: ShopApproval,
  otherLockingBytecode: Uint8Array,
): { builder: TransactionBuilder; fee: bigint } {
  const unlocker = contract.unlock.spend!(new SignatureTemplate(cardPrivateKey), approval.signature, approval.lockingBytecode);
  return singleOutput(provider, utxo, unlocker, otherLockingBytecode, undefined);
}

/** After the expiry anyone can build it; the money only goes back to the giver. */
export function buildCardReturn(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  giverLockingBytecode: Uint8Array,
  expiry: bigint,
): { builder: TransactionBuilder; fee: bigint } {
  return singleOutput(provider, utxo, contract.unlock.reclaim!(), giverLockingBytecode, Number(expiry));
}

function singleOutput(
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  unlocker: Unlocker,
  to: Uint8Array,
  locktime: number | undefined,
): { builder: TransactionBuilder; fee: bigint } {
  const make = (amount: bigint) => {
    const b = new TransactionBuilder({ provider });
    if (locktime !== undefined) b.setLocktime(locktime);
    b.addInput(utxo, unlocker);
    b.addOutput({ to, amount });
    return b;
  };
  const fee = BigInt(make(utxo.satoshis - CARD_MAX_FEE).getTransactionSize()) * FEE_SATS_PER_BYTE;
  return { builder: make(utxo.satoshis - fee), fee };
}
