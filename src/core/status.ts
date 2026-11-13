// What happened to a stamp, read straight from the chain (Fulcrum). No database of our own.
//   waiting  - the stamp coin is still in its contract
//   spent    - it paid the merchant
//   returned - it went back to the sponsor
// Each state says whether the deciding transaction is only seen (0-conf) or already in a block.
import { binToHex, decodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import type { Contract } from 'cashscript';

export type Seen = { txid: string; confirmed: boolean; height: number };

export type StampState =
  | { kind: 'not-funded' }
  | { kind: 'waiting'; funding: Seen; satoshis: bigint }
  | { kind: 'spent'; funding: Seen; spend: Seen; paidSatoshis: bigint }
  | { kind: 'returned'; funding: Seen; spend: Seen; paidSatoshis: bigint }
  | { kind: 'moved-elsewhere'; funding: Seen; spend: Seen };

/** The subset of an Electrum client we need; lets tests pass a fake. */
export interface ChainReader {
  history(scriptHash: string): Promise<Array<{ tx_hash: string; height: number }>>;
  rawTx(txid: string): Promise<string>;
}

export function electrumScriptHash(lockingBytecode: Uint8Array): string {
  return binToHex(sha256.hash(lockingBytecode).reverse());
}

const seen = (txid: string, height: number): Seen => ({ txid, height, confirmed: height > 0 });

export async function stampState(
  chain: ChainReader,
  contractLockingBytecodeHex: string,
  merchantLockingBytecode: Uint8Array,
  sponsorLockingBytecode: Uint8Array | undefined,
): Promise<StampState> {
  const lb = hexToBin(contractLockingBytecodeHex);
  const history = await chain.history(electrumScriptHash(lb));
  if (history.length === 0) return { kind: 'not-funded' };

  let funding: Seen | undefined;
  let fundingVoutValue = 0n;
  let spend: { s: Seen; outLb: Uint8Array; value: bigint } | undefined;
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await chain.rawTx(h.tx_hash)));
    if (typeof tx === 'string') throw new Error(`could not decode ${h.tx_hash}: ${tx}`);
    const paysContract = tx.outputs.findIndex((o) => binToHex(o.lockingBytecode) === contractLockingBytecodeHex);
    if (paysContract >= 0) {
      if (!funding) {
        funding = seen(h.tx_hash, h.height);
        fundingVoutValue = tx.outputs[paysContract]!.valueSatoshis;
      }
      continue;
    }
    // Not paying the contract => it spends from it (a stamp tx has exactly one output).
    const out = tx.outputs[0];
    if (out) spend = { s: seen(h.tx_hash, h.height), outLb: out.lockingBytecode, value: out.valueSatoshis };
  }
  if (!funding) return { kind: 'not-funded' };
  if (!spend) return { kind: 'waiting', funding, satoshis: fundingVoutValue };
  const outHex = binToHex(spend.outLb);
  if (outHex === binToHex(merchantLockingBytecode)) {
    return { kind: 'spent', funding, spend: spend.s, paidSatoshis: spend.value };
  }
  if (sponsorLockingBytecode && outHex === binToHex(sponsorLockingBytecode)) {
    return { kind: 'returned', funding, spend: spend.s, paidSatoshis: spend.value };
  }
  return { kind: 'moved-elsewhere', funding, spend: spend.s };
}

/** Electrum-backed reader built on a CashScript contract's provider. */
export function readerFor(contract: Contract): ChainReader {
  const p = contract.provider as unknown as {
    performRequest: (name: string, ...params: (string | number | boolean)[]) => Promise<unknown>;
    getRawTransaction: (txid: string) => Promise<string>;
  };
  return {
    history: async (sh) => (await p.performRequest('blockchain.scripthash.get_history', sh)) as Array<{ tx_hash: string; height: number }>,
    rawTx: (txid) => p.getRawTransaction(txid),
  };
}
