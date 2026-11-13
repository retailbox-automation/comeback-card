// Core of First Purchase: build stamp contracts and the transactions that move them.
// Pure functions, shared by the web pages and the tests. No keys are stored here.

import {
  Contract,
  SignatureTemplate,
  TransactionBuilder,
  type NetworkProvider,
  type SpendableUtxo,
  type Unlocker,
} from 'cashscript';
import {
  binToHex,
  cashAddressToLockingBytecode,
  hexToBin,
  lockingBytecodeToCashAddress,
  secp256k1,
} from '@bitauth/libauth';
import artifactSig from '../contract/stamp.artifact';
import artifactCov from '../contract/stamp_cov.artifact';

/** 'sig' = reclaim needs the sponsor's signature; 'cov' = reclaim is a covenant to the sponsor's address. */
export type Variant = 'sig' | 'cov';

/** Smallest output a node relays. Every stamp must stay well above it. */
export const DUST_SATS = 546n;
/** Cap on the miner fee the contract lets a spend or reclaim take. */
export const DEFAULT_MAX_FEE = 2000n;
/** Fee rate we pay: 1 sat/byte is the network minimum. */
export const FEE_SATS_PER_BYTE = 1n;
/** Smallest stamp we allow in the UI: fee cap plus a clear margin over dust. */
export const MIN_STAMP_SATS = 10_000n;

export interface StampTerms {
  variant: Variant;
  /** Compressed public key of the stamp key (the private key lives only in the link fragment). */
  stampPk: Uint8Array;
  /** Locking bytecode of the one merchant this stamp may pay. */
  merchantLockingBytecode: Uint8Array;
  /** Variant 'sig': sponsor public key. */
  sponsorPk?: Uint8Array;
  /** Variant 'cov': sponsor locking bytecode (where reclaimed money goes). */
  sponsorLockingBytecode?: Uint8Array;
  /** Unix time (seconds, >= 500_000_000) after which the sponsor may reclaim. */
  expiry: bigint;
  /** Fee cap enforced by the contract. */
  maxFee: bigint;
}

export function stampContract(terms: StampTerms, provider: NetworkProvider): Contract {
  if (terms.expiry < 500_000_000n) throw new Error('expiry must be a unix timestamp, not a block height');
  if (terms.variant === 'sig') {
    if (!terms.sponsorPk) throw new Error('variant sig needs sponsorPk');
    return new Contract(
      artifactSig,
      [terms.stampPk, terms.merchantLockingBytecode, terms.sponsorPk, terms.expiry, terms.maxFee],
      { provider },
    );
  }
  if (!terms.sponsorLockingBytecode) throw new Error('variant cov needs sponsorLockingBytecode');
  return new Contract(
    artifactCov,
    [terms.stampPk, terms.merchantLockingBytecode, terms.sponsorLockingBytecode, terms.expiry, terms.maxFee],
    { provider },
  );
}

export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  const pk = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof pk === 'string') throw new Error(pk);
  return pk;
}

export function lockingBytecodeOf(address: string): Uint8Array {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(`bad address: ${r}`);
  return r.bytecode;
}

export function addressOf(lockingBytecode: Uint8Array, prefix: 'bitcoincash' | 'bchtest' | 'bchreg'): string {
  const r = lockingBytecodeToCashAddress({ bytecode: lockingBytecode, prefix });
  if (typeof r === 'string') throw new Error(r);
  return r.address;
}

/** Network by address prefix. WizardConnect does not tell the dapp which chain the wallet is on. */
export function networkOfAddress(address: string): 'mainnet' | 'chipnet' | 'regtest' | 'unknown' {
  const prefix = address.split(':')[0]?.toLowerCase();
  if (prefix === 'bitcoincash') return 'mainnet';
  if (prefix === 'bchtest') return 'chipnet';
  if (prefix === 'bchreg') return 'regtest';
  return 'unknown';
}

/**
 * Two-pass fee: build once to learn the size, then set the output to input - size*rate.
 * The unlocker must produce final-size unlocking bytecode (a real signature or a placeholder of the same size).
 */
function singleOutputTx(
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
  const probe = make(utxo.satoshis - DEFAULT_MAX_FEE);
  const size = BigInt(probe.getTransactionSize());
  const fee = size * FEE_SATS_PER_BYTE;
  return { builder: make(utxo.satoshis - fee), fee };
}

/** The honest spend: the whole stamp to the merchant, minus the fee. */
export function buildSpend(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  stampPrivateKey: Uint8Array,
  merchantLockingBytecode: Uint8Array,
): { builder: TransactionBuilder; fee: bigint } {
  const unlocker = contract.unlock.spend!(new SignatureTemplate(stampPrivateKey));
  return singleOutputTx(provider, utxo, unlocker, merchantLockingBytecode, undefined);
}

/**
 * The demo attack: the stamp holder tries to pay somewhere else.
 * Built without local evaluation (build(), not send()) so the raw transaction can go to the node
 * and the node's own rejection can be shown word for word.
 */
export function buildSpendElsewhere(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  stampPrivateKey: Uint8Array,
  otherLockingBytecode: Uint8Array,
): { builder: TransactionBuilder; fee: bigint } {
  const unlocker = contract.unlock.spend!(new SignatureTemplate(stampPrivateKey));
  return singleOutputTx(provider, utxo, unlocker, otherLockingBytecode, undefined);
}

/** Variant 'cov': reclaim after expiry, anyone can build it, money only goes to the sponsor. */
export function buildReclaimCov(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  sponsorLockingBytecode: Uint8Array,
  expiry: bigint,
): { builder: TransactionBuilder; fee: bigint } {
  return singleOutputTx(provider, utxo, contract.unlock.reclaim!(), sponsorLockingBytecode, Number(expiry));
}

/** Variant 'sig': reclaim after expiry with the sponsor's key (a SignatureTemplate, or a wallet placeholder). */
export function buildReclaimSig(
  contract: Contract,
  provider: NetworkProvider,
  utxo: SpendableUtxo,
  sponsorSigner: SignatureTemplate | Uint8Array,
  to: Uint8Array,
  expiry: bigint,
): { builder: TransactionBuilder; fee: bigint } {
  return singleOutputTx(provider, utxo, contract.unlock.reclaim!(sponsorSigner), to, Number(expiry));
}

export { binToHex, hexToBin };
