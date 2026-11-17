// What a shop sees: payments into its address, and whether each one came from a First Purchase stamp.
import { binToHex, decodeTransaction, hexToBin } from '@bitauth/libauth';
import artifactSig from '../contract/stamp.artifact';
import artifactCov from '../contract/stamp_cov.artifact';
import artifactCard from '../contract/card.artifact';

/** Contract code of a Comeback Card; finding it in an input means the coins came out of a card. */
export const CARD_CODE_HEX: string = artifactCard.debug.bytecode;

/**
 * Contract code shared by every stamp (constructor arguments are pushed before it in the redeem script).
 * Finding it inside an input's unlocking bytecode means the coins came out of a stamp contract.
 */
export const STAMP_CODE_HEX: string[] = [artifactCov.debug.bytecode, artifactSig.debug.bytecode];

export interface Payment {
  txid: string;
  receivedSatoshis: bigint;
  fromStamp: boolean;
  /** The coins came out of a Comeback Card contract. */
  fromCard: boolean;
  confirmed: boolean;
  height: number;
}

export function classifyPayment(txid: string, txHex: string, height: number, merchantLockingBytecode: Uint8Array): Payment {
  const tx = decodeTransaction(hexToBin(txHex));
  if (typeof tx === 'string') throw new Error(`cannot decode ${txid}: ${tx}`);
  const lb = binToHex(merchantLockingBytecode);
  const receivedSatoshis = tx.outputs
    .filter((o) => binToHex(o.lockingBytecode) === lb)
    .reduce((s, o) => s + o.valueSatoshis, 0n);
  const fromStamp = tx.inputs.some((i) => {
    const u = binToHex(i.unlockingBytecode);
    return STAMP_CODE_HEX.some((code) => u.includes(code));
  });
  const fromCard = tx.inputs.some((i) => binToHex(i.unlockingBytecode).includes(CARD_CODE_HEX));
  return { txid, receivedSatoshis, fromStamp, fromCard, confirmed: height > 0, height };
}

/** Newest first: unconfirmed (height <= 0) on top, then by block height. */
export function newestFirst<T extends { height: number }>(items: T[]): T[] {
  const rank = (h: number) => (h <= 0 ? Number.MAX_SAFE_INTEGER : h);
  return [...items].sort((a, b) => rank(b.height) - rank(a.height));
}
