// WizardConnect wallet session for the dapp side. One session at a time.
// What we rely on (read in the wallet sources, 13.11.2026):
//  - Selene 2026.10.02 requires the transaction as a hex string ("WizardConnect transaction must be hex encoded").
//  - Selene and Cashonize fill 65-byte sig placeholders inside contract inputs listed in inputPaths.
//  - The handshake does not tell the dapp the chain; the xpub version does (xpub = mainnet, tpub = test networks).
import { initiateDappRelay, type DappRelayResult } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { binToHex, encodeTransaction, publicKeyToP2pkhCashAddress, stringify } from '@bitauth/libauth';
import type { WcTransactionObject } from 'cashscript';
import type { ChainNet } from './chain';

/** Primary relay first, second one if the first is down. */
export const RELAY_URLS = ['wss://relay.riften.net:443', 'wss://relay.cauldron.quest:443'];
/** If no relay accepts us within this time, we say so instead of spinning forever. */
export const RELAY_TIMEOUT_MS = 12_000;
/** How long we wait for the person to approve a signature in their wallet. */
export const SIGN_TIMEOUT_MS = 5 * 60_000;

export type WalletState =
  | { kind: 'idle' }
  | { kind: 'pairing'; uri: string; qrUri: string; relayUp: boolean }
  | { kind: 'relay-down'; message: string }
  | { kind: 'awaiting-approval'; walletName: string | null }
  | { kind: 'connected'; walletName: string | null; net: ChainNet | 'unknown' }
  | { kind: 'reconnecting' }
  | { kind: 'disconnected'; message?: string };

/**
 * Independent relay check. @wizardconnect/core reports "connected" after a 5 s EOSE timeout even when
 * no relay answered (relay-client.js: "EOSE timeout, assuming ready"), so its status cannot tell us the
 * relay is down. Resolves true as soon as any relay accepts a WebSocket, false after `timeoutMs`.
 */
export function probeRelays(urls: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let pending = urls.length;
    const sockets: WebSocket[] = [];
    const done = (ok: boolean) => {
      clearTimeout(timer);
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* already closed */
        }
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    if (pending === 0) return done(false);
    for (const u of urls) {
      try {
        const s = new WebSocket(u);
        sockets.push(s);
        s.onopen = () => done(true);
        s.onerror = () => {
          if (--pending === 0) done(false);
        };
      } catch {
        if (--pending === 0) done(false);
      }
    }
  });
}

export type PathName = 'receive' | 'change';
const CHILD: Record<PathName, number> = { receive: 0, change: 1 };

export type SignResult = { ok: true; signedHex: string } | { ok: false; error: string };

export class WizardWallet {
  private manager: DappConnectionManager | null = null;
  private relay: DappRelayResult | null = null;
  state: WalletState = { kind: 'idle' };

  constructor(
    private readonly dappName: string,
    private readonly dappIcon: string | undefined,
    private readonly onChange: (s: WalletState) => void,
    private readonly relayUrls: string[] = RELAY_URLS,
  ) {}

  private set(s: WalletState) {
    this.state = s;
    this.onChange(s);
  }

  start(): void {
    this.stop();
    const mgr = new DappConnectionManager(this.dappName, this.dappIcon, { session: false });
    this.manager = mgr;
    mgr.on('walletready', () => {
      // Selene 2026.10.02 sends wallet_ready twice: first with no paths (before the person taps
      // "Connect" in the wallet), then with the xpubs. Only the second one is a usable connection.
      if (mgr.getSessionPaths().length === 0) {
        this.set({ kind: 'awaiting-approval', walletName: mgr.walletName });
        return;
      }
      this.set({ kind: 'connected', walletName: mgr.walletName, net: this.network() });
    });
    // A relay retry before any wallet connected is not a "dropped connection": stay in pairing,
    // the relay timer below decides when to say the relay is down.
    mgr.on('reconnecting', () => {
      if (this.state.kind === 'connected') this.set({ kind: 'reconnecting' });
    });
    mgr.on('disconnect', (_reason, message) => {
      this.set({ kind: 'disconnected', message: message ?? undefined });
      this.relay?.cleanup();
      this.relay = null;
    });
    let relayUp = false;
    const relay = initiateDappRelay(
      (payload) => {
        mgr.updateConnection(payload.client, payload.status);
        if (payload.status.status === 'connected' && !relayUp) {
          relayUp = true;
          if (this.state.kind === 'pairing') this.set({ ...this.state, relayUp: true });
        }
      },
      { explicitRelayUrls: this.relayUrls },
    );
    this.relay = relay;
    mgr.attachRelay(relay);
    this.set({ kind: 'pairing', uri: relay.uri, qrUri: relay.qrUri, relayUp: false });
    void probeRelays(this.relayUrls, RELAY_TIMEOUT_MS).then((reachable) => {
      if (reachable || this.manager !== mgr || this.state.kind === 'connected') return;
      // Stop the background retries; the person gets a clear message and a "Try again" button.
      mgr.destroy();
      relay.cleanup();
      this.manager = null;
      this.relay = null;
      this.set({
        kind: 'relay-down',
        message:
          `The WizardConnect relay is not answering right now (tried ${this.relayUrls.map((u) => new URL(u).hostname).join(' and ')}). ` +
          'Nothing was sent. Please try again in a minute.',
      });
    });
  }

  stop(): void {
    const mgr = this.manager;
    const relay = this.relay;
    this.manager = null;
    this.relay = null;
    this.set({ kind: 'idle' });
    if (!mgr) {
      relay?.cleanup();
      return;
    }
    // F7 (17.11): sending "disconnect" while the sockets were already being closed logged
    // "WebSocket is already in CLOSING or CLOSED state". Say goodbye only to a wallet that is
    // actually connected, and close the sockets after that message (or after a short wait).
    const connected = mgr.getSessionPaths().length > 0;
    const bye = connected ? mgr.sendDisconnect().catch(() => {}) : Promise.resolve();
    void Promise.race([bye, new Promise((r) => setTimeout(r, 800))]).then(() => {
      mgr.destroy();
      relay?.cleanup();
    });
  }

  /** Chain of the connected wallet, read from the xpub version of its receive path. */
  network(): ChainNet | 'unknown' {
    const receive = this.manager?.getSessionPaths().find((p) => p.name === 'receive');
    if (!receive) return 'unknown';
    if (receive.xpub.startsWith('xpub')) return 'mainnet';
    if (receive.xpub.startsWith('tpub')) return 'chipnet';
    return 'unknown';
  }

  /** Public, non-secret description of what the wallet shared: path names and xpub version prefixes. */
  describePaths(): string {
    return (this.manager?.getSessionPaths() ?? []).map((p) => `${p.name}:${p.xpub.slice(0, 4)}`).join(' ');
  }

  pubkey(path: PathName, index: number): Uint8Array {
    const pk = this.manager?.getPubkey(CHILD[path], BigInt(index));
    if (!pk) throw new Error(`wallet did not share the ${path} path`);
    return pk;
  }

  address(path: PathName, index: number): string {
    const net = this.network();
    if (net === 'unknown') throw new Error('wallet network unknown');
    const prefix = net === 'mainnet' ? 'bitcoincash' : 'bchtest';
    return publicKeyToP2pkhCashAddress({ publicKey: this.pubkey(path, index), prefix }).address;
  }

  /**
   * Ask the wallet to sign. The transaction goes as hex (Selene requires it).
   * We never let the wallet broadcast: we broadcast ourselves to show the node's answer verbatim.
   */
  async sign(tx: WcTransactionObject, inputPaths: [number, PathName, number][]): Promise<SignResult> {
    if (!this.manager || this.state.kind !== 'connected') return { ok: false, error: 'wallet not connected' };
    // The relay sends plain JSON.stringify, which cannot carry bigint or Uint8Array.
    // libauth's stringify turns them into "<bigint: 1n>" / "<Uint8Array: 0x..>", which wallets parse back.
    const transaction = JSON.parse(
      stringify({
        ...tx,
        transaction: binToHex(encodeTransaction(tx.transaction)),
        broadcast: false,
      }),
    );
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SIGN_TIMEOUT_MS);
    try {
      const res = await this.manager.signTransaction(
        // The wire type accepts a hex transaction; cashscript's type is the decoded object.
        { transaction: transaction as never, inputPaths },
        { signal: ac.signal },
      );
      if (res.error) return { ok: false, error: res.error };
      if (!res.signedTransaction) return { ok: false, error: 'wallet returned no transaction' };
      return { ok: true, signedHex: res.signedTransaction };
    } catch (e) {
      if (ac.signal.aborted) return { ok: false, error: 'no answer from the wallet within 5 minutes' };
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timer);
    }
  }
}
