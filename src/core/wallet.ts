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

export type PathName = 'receive' | 'change';
const CHILD: Record<PathName, number> = { receive: 0, change: 1 };

export type SignResult = { ok: true; signedHex: string } | { ok: false; error: string };

export class WizardWallet {
  private manager: DappConnectionManager | null = null;
  private relay: DappRelayResult | null = null;
  private relayTimer: ReturnType<typeof setTimeout> | null = null;
  state: WalletState = { kind: 'idle' };

  constructor(
    private readonly dappName: string,
    private readonly dappIcon: string | undefined,
    private readonly onChange: (s: WalletState) => void,
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
      this.clearRelayTimer();
      // Selene 2026.10.02 sends wallet_ready twice: first with no paths (before the person taps
      // "Connect" in the wallet), then with the xpubs. Only the second one is a usable connection.
      if (mgr.getSessionPaths().length === 0) {
        this.set({ kind: 'awaiting-approval', walletName: mgr.walletName });
        return;
      }
      this.set({ kind: 'connected', walletName: mgr.walletName, net: this.network() });
    });
    mgr.on('reconnecting', () => this.set({ kind: 'reconnecting' }));
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
      { explicitRelayUrls: RELAY_URLS },
    );
    this.relay = relay;
    mgr.attachRelay(relay);
    this.set({ kind: 'pairing', uri: relay.uri, qrUri: relay.qrUri, relayUp: false });
    this.relayTimer = setTimeout(() => {
      if (!relayUp && this.state.kind === 'pairing') {
        this.set({
          kind: 'relay-down',
          message:
            'The WizardConnect relay is not answering right now (tried relay.riften.net and relay.cauldron.quest). ' +
            'Nothing was sent. Please try again in a minute.',
        });
      }
    }, RELAY_TIMEOUT_MS);
  }

  stop(): void {
    this.clearRelayTimer();
    if (this.manager) {
      this.manager.sendDisconnect().catch(() => {});
      this.manager.destroy();
    }
    this.relay?.cleanup();
    this.manager = null;
    this.relay = null;
    this.set({ kind: 'idle' });
  }

  private clearRelayTimer() {
    if (this.relayTimer) clearTimeout(this.relayTimer);
    this.relayTimer = null;
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
