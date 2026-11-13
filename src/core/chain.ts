// Chain access: Electrum (Fulcrum) servers per network, explorer links, raw broadcast with the node's own words.
import { ElectrumNetworkProvider, type NetworkProvider } from 'cashscript';

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
// chipnet.chaingraph.cash answered 403. Mainnet, checked 13.11 19:06Z in a real browser with a real txid:
// bch.loping.net shows the full shop address, confirmations, and reads the node's mempool (0-conf); a first-time
// visitor waits ~5 s on its bot check (Anubis). blockchain.com opens at once but covers the page with a sign-up
// pop-up and shortens addresses. Kept: loping. 0-conf display to be confirmed with the first mainnet stamp spend.
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

/** One Fulcrum server (no failover). Used for broadcast, where each server is tried explicitly. */
export function singleServer(net: ChainNet, serverIndex = 0): ElectrumNetworkProvider {
  const hostname = FULCRUM[net][serverIndex % FULCRUM[net].length]!;
  return new ElectrumNetworkProvider(net, { hostname });
}

/**
 * Reads with failover: a request that fails on one Fulcrum server is retried on the next.
 * The server that answered last is tried first next time. Rule rejections are not retried
 * (they would be the same everywhere); broadcast goes through broadcastRaw, not through here.
 */
export class FailoverProvider implements NetworkProvider {
  readonly network: ChainNet;
  private readonly servers: ElectrumNetworkProvider[];
  private current = 0;

  constructor(net: ChainNet, servers?: ElectrumNetworkProvider[]) {
    this.network = net;
    this.servers = servers ?? FULCRUM[net].map((_, i) => singleServer(net, i));
  }

  private async attempt<T>(fn: (p: ElectrumNetworkProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let k = 0; k < this.servers.length; k++) {
      const i = (this.current + k) % this.servers.length;
      try {
        const out = await fn(this.servers[i]!);
        this.current = i;
        return out;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  getUtxos(address: string) {
    return this.attempt((p) => p.getUtxos(address));
  }
  getUtxosForLockingBytecode(lockingBytecode: Uint8Array | string) {
    return this.attempt((p) => p.getUtxosForLockingBytecode(lockingBytecode));
  }
  getBlockHeight() {
    return this.attempt((p) => p.getBlockHeight());
  }
  getRawTransaction(txid: string) {
    return this.attempt((p) => p.getRawTransaction(txid));
  }
  sendRawTransaction(txHex: string) {
    // Not retried on another server: a rule rejection would repeat there; callers use broadcastRaw.
    return this.servers[this.current]!.sendRawTransaction(txHex);
  }
  performRequest(name: string, ...params: (string | number | boolean)[]) {
    return this.attempt((p) => p.performRequest(name, ...params));
  }
}

const shared: Partial<Record<ChainNet, FailoverProvider>> = {};
/** The app-wide reader for a network, with failover between its Fulcrum servers. */
export function provider(net: ChainNet): FailoverProvider {
  return (shared[net] ??= new FailoverProvider(net));
}

/**
 * Median time past of the last 11 blocks, in unix seconds. A node accepts a transaction whose
 * timestamp locktime is below this value, so a stamp can be returned only once MTP > expiry.
 * MTP usually trails the wall clock by about an hour.
 */
export async function medianTimePast(net: ChainNet): Promise<bigint> {
  const p = provider(net);
  const tip = (await p.performRequest('blockchain.headers.get_tip')) as { height: number };
  const res = (await p.performRequest('blockchain.block.headers', tip.height - 10, 11)) as { hex: string; count: number };
  const times: number[] = [];
  for (let i = 0; i < res.count; i++) {
    const header = res.hex.slice(i * 160, i * 160 + 160);
    const tsHex = header.slice(136, 144); // bytes 68..71, little-endian
    const le = tsHex.match(/../g)!.reverse().join('');
    times.push(parseInt(le, 16));
  }
  times.sort((a, b) => a - b);
  return BigInt(times[Math.floor(times.length / 2)]!);
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
      const txid = await singleServer(net, i).sendRawTransaction(txHex);
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
