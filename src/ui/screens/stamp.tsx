// Stamp page, presentational: the phone screen of one stamp in each of its states.
// The page itself (web/stamp.tsx) reads the chain and passes a view; the preview passes fixtures.
import type { ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { Avatar, NetBadge, Sticker, StorefrontPhoto, TxLink, shopTitle } from '../common';
import { IconCheck, IconReturn, IconX } from '../icons';

export interface StampShop {
  /** Name as the stamp link carries it, e.g. "Maple Street Coffee (demo)". */
  name: string;
  /** Second line under the name: "Demo shop" or the shop's short address. */
  subtitle: string;
  /** The demo shop has a storefront photo; other shops get a plain header (no made-up picture). */
  demo: boolean;
}

export type ElsewhereResult =
  | { kind: 'rejected'; nodeError: string; why: string }
  | { kind: 'input'; message: string }
  | { kind: 'accepted'; txid: string };

export type StampView =
  | { kind: 'loading' }
  | { kind: 'not-funded' }
  | {
      kind: 'ready';
      expired: boolean;
      /** "Nov 20" for the expired pill, "Nov 20, 2026" for the line above the amount. */
      expiryShort: string;
      expiryDay: string;
      expiredText: string;
      buyLabel: string;
      buying: boolean;
      onBuy: () => void;
      onTryElsewhere: () => void;
      /** The answer to a Buy that did not go through (node words or our own message). */
      buyNotice?: ReactNode;
    }
  | {
      kind: 'elsewhere';
      to: string;
      onTo: (v: string) => void;
      placeholder: string;
      busy: boolean;
      canSend: boolean;
      onSend: () => void;
      onBack: () => void;
      result: ElsewhereResult | null;
    }
  | { kind: 'paid'; txid: string; confirmed: boolean; height: number | null; received: string | null; counterHref: string }
  | { kind: 'returned'; txid: string; confirmed: boolean; received: string }
  | { kind: 'moved'; txid: string };

export interface StampScreenProps {
  net: ChainNet;
  shop: StampShop;
  amount: string;
  view: StampView;
  /** Network trouble while reading the stamp. */
  notice?: ReactNode;
  /** The explanation under the screen (contract rule, shop address, key in the link). */
  more?: ReactNode;
}

export function StampScreen({ net, shop, amount, view, notice, more }: StampScreenProps) {
  const tone = view.kind === 'ready' && view.expired ? 'grey' : view.kind === 'returned' ? 'grey' : view.kind === 'elsewhere' ? 'dim' : 'plain';
  return (
    <div className={`sp sp-${view.kind}${view.kind === 'ready' && view.expired ? ' sp-expired' : ''}`} data-frame="stamp">
      <div className="sp-screen">
      <header className="sp-head">
        <a className="sp-brand" href="./">First Purchase</a>
        <NetBadge net={net} />
      </header>

      {view.kind !== 'paid' && <ShopHero shop={shop} tone={tone} />}
      {notice}

      {view.kind === 'loading' && (
        <>
          <Amount amount={amount} line="Checking this stamp on the network…" />
          <Sheet>
            <div className="sp-wait">Reading the stamp from a Bitcoin Cash node…</div>
          </Sheet>
        </>
      )}

      {view.kind === 'not-funded' && (
        <>
          <Amount amount={amount} line="This stamp has no coins yet." />
          <Sheet>
            <div className="sp-wait">If it was created a moment ago, wait a few seconds: this page checks again on its own.</div>
          </Sheet>
        </>
      )}

      {view.kind === 'ready' && !view.expired && (
        <>
          <Amount amount={amount} line={`Your stamp · use by ${view.expiryDay}`} caption={net === 'chipnet' ? 'No wallet or app needed. Test coins, no real value.' : 'No wallet or app needed.'} />
          <Sheet>
            {view.buyNotice}
            <button type="button" className="btn btn-primary sp-buy" onClick={view.onBuy} disabled={view.buying}>
              {view.buying ? 'Paying…' : view.buyLabel}
            </button>
            <button type="button" className="sp-link" onClick={view.onTryElsewhere}>
              Try to send it anywhere else
            </button>
          </Sheet>
        </>
      )}

      {view.kind === 'ready' && view.expired && (
        <>
          <div className="sp-expired-pill">Expired {view.expiryShort}</div>
          <p className="sp-expired-text">{view.expiredText}</p>
          <Sheet>
            {view.buyNotice}
            <button type="button" className="btn btn-primary sp-buy" onClick={view.onBuy} disabled={view.buying}>
              {view.buying ? 'Paying…' : view.buyLabel}
            </button>
            <button type="button" className="sp-link" onClick={view.onTryElsewhere}>
              Try to send it anywhere else
            </button>
          </Sheet>
        </>
      )}

      {view.kind === 'elsewhere' && <Elsewhere view={view} shop={shop} net={net} />}

      {view.kind === 'paid' && (
        <div className="sp-paid-body">
          <span className="sp-check" aria-hidden="true">
            <IconCheck width={52} height={52} />
          </span>
          <h1 className="sp-paid-title">
            Paid at
            <br />
            {shopTitle(shop.name)}
          </h1>
          <div className="sp-amount sp-amount-paid">{amount}</div>
          <Sticker txid={view.txid} shop={shop.name} />
          <div className={`sp-status ${view.confirmed ? 'confirmed' : 'zero'}`}>
            <span className="sp-status-icon" aria-hidden="true">
              <IconCheck width={16} height={16} />
            </span>
            {view.confirmed ? `Confirmed in block ${view.height}` : 'Received (0-conf) · confirming'}
          </div>
          {/* The amount in sats sits on the link: the explorer rounds a $0.02 stamp down to "0.00 BCH". */}
          <TxLink net={net} txid={view.txid} label={view.received ? `View transaction · ${view.received}` : 'View transaction'} className="sp-link" />
          <a className="sp-counter" href={view.counterHref}>
            Open the shop counter
          </a>
        </div>
      )}

      {view.kind === 'returned' && (
        <>
          <div className="sp-expired-pill">
            <IconReturn width={22} height={22} /> Back with the sponsor
          </div>
          <p className="sp-expired-text">This stamp was not spent and went back to the sponsor: {view.received}.</p>
          <div className="sp-center">
            <span className={`pill ${view.confirmed ? 'pill-grey' : 'pill-outline'}`}>{view.confirmed ? 'Returned · confirmed' : 'Returned · 0-conf'}</span>{' '}
            <TxLink net={net} txid={view.txid} label="View transaction" className="sp-link inline" />
          </div>
        </>
      )}

      {view.kind === 'moved' && (
        <div className="sp-pad">
          <div className="notice warn">
            The coins left this stamp in a way this page does not recognise. <TxLink net={net} txid={view.txid} />
          </div>
        </div>
      )}
      </div>

      {more && <div className="sp-more">{more}</div>}
    </div>
  );
}

function ShopHero({ shop, tone }: { shop: StampShop; tone: 'plain' | 'grey' | 'dim' }) {
  return (
    <div className={`sp-hero ${tone}`}>
      <div className="sp-photo-wrap">{shop.demo ? <StorefrontPhoto className="sp-photo" /> : <div className="sp-photo sp-photo-plain" aria-hidden="true" />}</div>
      <div className="sp-shop">
        <Avatar name={shop.name} size={64} tone={tone === 'grey' ? 'grey' : 'solid'} />
        <div className="sp-shop-text">
          <div className="sp-shop-name">{shopTitle(shop.name)}</div>
          <div className="sp-shop-sub">{shop.subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function Amount({ amount, line, caption }: { amount: string; line: string; caption?: string }) {
  return (
    <div className="sp-body">
      <div className="sp-from">{line}</div>
      <div className="sp-amount">{amount}</div>
      {caption && <div className="sp-caption">{caption}</div>}
    </div>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="sp-sheet">
      <span className="sp-handle" aria-hidden="true" />
      {children}
    </div>
  );
}

function Elsewhere({ view, shop, net }: { view: Extract<StampView, { kind: 'elsewhere' }>; shop: StampShop; net: ChainNet }) {
  const r = view.result;
  return (
    <div className="sp-sheet sp-sheet-up" id="try-elsewhere">
      <span className="sp-handle" aria-hidden="true" />
      <label className="sp-label" htmlFor="to">Send to</label>
      <input
        id="to"
        className="sp-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={view.placeholder}
        value={view.to}
        onChange={(e) => view.onTo(e.target.value)}
      />
      <button type="button" className="btn btn-primary sp-send" onClick={view.onSend} disabled={!view.canSend}>
        {view.busy ? 'Sending to the network…' : 'Send'}
      </button>
      {!r && (
        <p className="sp-help">
          Paste any Bitcoin Cash address, your own wallet for example. This page signs a transaction that sends the stamp there and hands it straight to
          the network. Watch what the network says.
        </p>
      )}
      {r?.kind === 'rejected' && (
        <div className="sp-refusal" role="alert">
          <div className="sp-rejected">
            <span className="sp-x" aria-hidden="true">
              <IconX width={16} height={16} />
            </span>
            Rejected by the network
          </div>
          <pre className="node sp-node">{r.nodeError}</pre>
          <p className="sp-why">{r.why}</p>
          <p className="sp-verbatim">The grey box is the node’s own answer, word for word.</p>
        </div>
      )}
      {r?.kind === 'input' && <div className="notice warn">{r.message}</div>}
      {r?.kind === 'accepted' && (
        <div className="notice bad">
          Unexpected: the network accepted this transaction (<TxLink net={net} txid={r.txid} />). Please report it.
        </div>
      )}
      <button type="button" className="sp-link" onClick={view.onBack}>
        Back to the stamp at {shopTitle(shop.name)}
      </button>
    </div>
  );
}

/** Stamp link missing or damaged. */
export function StampLinkError({ net, message }: { net: ChainNet; message: string }) {
  return (
    <div className="sp sp-error" data-frame="stamp">
      <header className="sp-head">
        <a className="sp-brand" href="./">First Purchase</a>
        <NetBadge net={net} />
      </header>
      <div className="sp-pad">
        <div className="notice bad">{message}</div>
        <a className="btn btn-secondary" href="./">What is First Purchase?</a>
      </div>
    </div>
  );
}
