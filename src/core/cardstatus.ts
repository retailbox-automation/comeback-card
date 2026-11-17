// What happened to a card, read straight from the chain (Fulcrum). No database of our own.
// A card keeps one address for life: gifts (funding) land there, every partial spend sends the rest back
// there, and the return after the expiry empties it. The history of that address is the card's story.
// The order Fulcrum lists unconfirmed transactions in is not guaranteed, so nothing here depends on it.
import { binToHex, decodeTransaction, hexToBin } from '@bitauth/libauth';
import { electrumScriptHash, type ChainReader, type Seen } from './status';

export type CardEvent =
  | { kind: 'funded'; seen: Seen; satoshis: bigint }
  | { kind: 'paid'; seen: Seen; paidSatoshis: bigint; restSatoshis: bigint }
  | { kind: 'returned'; seen: Seen; returnedSatoshis: bigint }
  | { kind: 'moved-elsewhere'; seen: Seen };

export interface CardCoin {
  txid: string;
  vout: number;
  satoshis: bigint;
  seen: Seen;
}

export interface CardState {
  /** Sum of all gifts put on the card. */
  fundedSatoshis: bigint;
  /** What is on the card right now (sum of unspent card coins). */
  balanceSatoshis: bigint;
  /** Unspent card coins, largest first (a spend uses one coin). */
  coins: CardCoin[];
  /** Newest first: unconfirmed on top, then by block height. */
  events: CardEvent[];
}

const seen = (txid: string, height: number): Seen => ({ txid, height, confirmed: height > 0 });
/** Newer first: unconfirmed above confirmed; Fulcrum marks unconfirmed-with-unconfirmed-parents as -1. */
const rank = (h: number) => (h > 0 ? h : h === 0 ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER);

export async function cardState(
  chain: ChainReader,
  cardLockingBytecode: Uint8Array,
  shopLockingBytecode: Uint8Array,
  giverLockingBytecode: Uint8Array,
): Promise<CardState> {
  const cardHex = binToHex(cardLockingBytecode);
  const shopHex = binToHex(shopLockingBytecode);
  const giverHex = binToHex(giverLockingBytecode);
  const history = await chain.history(electrumScriptHash(cardLockingBytecode));

  const txs = [];
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await chain.rawTx(h.tx_hash)));
    if (typeof tx === 'string') throw new Error(`could not decode ${h.tx_hash}: ${tx}`);
    txs.push({ txid: h.tx_hash, height: h.height, tx });
  }

  // Pass 1: every coin ever paid to the card.
  const coins = new Map<string, CardCoin>();
  for (const { txid, height, tx } of txs) {
    tx.outputs.forEach((o, vout) => {
      if (binToHex(o.lockingBytecode) === cardHex) coins.set(`${txid}:${vout}`, { txid, vout, satoshis: o.valueSatoshis, seen: seen(txid, height) });
    });
  }

  // Pass 2: which transactions spend card coins, and what each one was.
  const spent = new Set<string>();
  const events: CardEvent[] = [];
  let fundedSatoshis = 0n;
  // Depth in the card's own chain (a gift is 0, a payment from its rest is 1, …): orders events in one block.
  const parents = new Map<string, string[]>();
  for (const { txid, tx } of txs) {
    parents.set(
      txid,
      tx.inputs.map((i) => `${binToHex(i.outpointTransactionHash)}:${i.outpointIndex}`).filter((k) => coins.has(k)).map((k) => coins.get(k)!.txid),
    );
  }
  const depth = new Map<string, number>();
  const depthOf = (txid: string, guard = 0): number => {
    const known = depth.get(txid);
    if (known !== undefined) return known;
    const ps = parents.get(txid) ?? [];
    const d = ps.length === 0 || guard > txs.length ? 0 : 1 + Math.max(...ps.map((p) => depthOf(p, guard + 1)));
    depth.set(txid, d);
    return d;
  };
  for (const { txid, height, tx } of txs) {
    const spends = tx.inputs
      .map((i) => `${binToHex(i.outpointTransactionHash)}:${i.outpointIndex}`)
      .filter((k) => coins.has(k));
    const toCard = tx.outputs.filter((o) => binToHex(o.lockingBytecode) === cardHex).reduce((s, o) => s + o.valueSatoshis, 0n);
    if (spends.length === 0) {
      if (toCard > 0n) {
        fundedSatoshis += toCard;
        events.push({ kind: 'funded', seen: seen(txid, height), satoshis: toCard });
      }
      continue;
    }
    spends.forEach((k) => spent.add(k));
    const first = tx.outputs[0];
    const firstHex = first ? binToHex(first.lockingBytecode) : '';
    if (first && firstHex === shopHex) {
      events.push({ kind: 'paid', seen: seen(txid, height), paidSatoshis: first.valueSatoshis, restSatoshis: toCard });
    } else if (first && firstHex === giverHex) {
      events.push({ kind: 'returned', seen: seen(txid, height), returnedSatoshis: first.valueSatoshis });
    } else {
      events.push({ kind: 'moved-elsewhere', seen: seen(txid, height) });
    }
  }

  const unspent = [...coins.entries()].filter(([k]) => !spent.has(k)).map(([, c]) => c);
  unspent.sort((a, b) => (a.satoshis === b.satoshis ? 0 : a.satoshis > b.satoshis ? -1 : 1));
  events.sort((a, b) => rank(b.seen.height) - rank(a.seen.height) || depthOf(b.seen.txid) - depthOf(a.seen.txid));
  return {
    fundedSatoshis,
    balanceSatoshis: unspent.reduce((s, c) => s + c.satoshis, 0n),
    coins: unspent,
    events,
  };
}
