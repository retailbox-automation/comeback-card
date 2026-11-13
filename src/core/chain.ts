// Chain access: Electrum (Fulcrum) servers per network, explorer links, raw broadcast with the node's own words.
import { ElectrumNetworkProvider } from 'cashscript';

export type ChainNet = 'mainnet' | 'chipnet';

/** Two Fulcrum servers per network: if the first does not answer, the second is tried. */
export const FULCRUM: Record<ChainNet, string[]> = {
  mainnet: ['bch.imaginary.cash', 'electrum.imaginary.cash'],
  chipnet: ['chipnet.bch.ninja', 'chipnet.imaginary.cash'],
};

export const PREFIX: Record<ChainNet, 'bitcoincash' | 'bchtest'> = {
  mainnet: 'bitcoincash',
  chipnet: 'bchtest',
};

// Explorers checked 13.11 16:55Z: chipnet.imaginary.cash serves the tx page (200, txid in HTML);
// chipnet.chaingraph.cash answered 403. Mainnet explorer is re-checked with a real mainnet txid before go-live.
const EXPLORER: Record<ChainNet, string> = {
  mainnet: 'https://bch.loping.net',
  chipnet: 'https://chipnet.imaginary.cash',
};

export function explorerTx(net: ChainNet, txid: string): string {
  return `${EXPLORER[net]}/tx/${txid}`;
}

export function explorerAddress(net: ChainNet, address: string): string {
  return `${EXPLORER[net]}/address/${address}`;
}

export function provider(net: ChainNet, serverIndex = 0): ElectrumNetworkProvider {
  const hostname = FULCRUM[net][serverIndex % FULCRUM[net].length]!;
  return new ElectrumNetworkProvider(net, { hostname });
}

export type BroadcastResult = { ok: true; txid: string } | { ok: false; nodeError: string };

/**
 * Send a raw transaction exactly as built. No local evaluation: if the network refuses it,
 * the caller gets the node's error text verbatim.
 */
export async function broadcastRaw(net: ChainNet, txHex: string): Promise<BroadcastResult> {
  let lastError = '';
  for (let i = 0; i < FULCRUM[net].length; i++) {
    try {
      const txid = await provider(net, i).sendRawTransaction(txHex);
      return { ok: true, txid };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A connection problem is worth retrying on the next server; a rule rejection is final.
      if (/rejected by network rules|mandatory-script|non-mandatory|missing inputs|conflict|dust|non-final|bad-txns/i.test(msg)) {
        return { ok: false, nodeError: msg.trim() };
      }
      lastError = msg;
    }
  }
  return { ok: false, nodeError: `could not reach any Fulcrum server: ${lastError}` };
}
