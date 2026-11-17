// Card page, presentational: the holder's phone screen (picture "reco", chosen 17.11.2026).
// The page (web-card/card.tsx) reads the chain and passes a view; the preview passes fixtures.
import type { ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { Avatar, NetBadge, StorefrontPhoto, TxLink, shopTitle } from '../common';
import { Bow, CoinMascot, ReturnIcon } from './art';
import { SeenBadge } from './common';

export interface CardActivity {
  key: string;
  /** "−$0.15 · Paid at Maple Street Coffee", "+$1.00 · Gift from Anna", "$0.62 · Sent back to the giver" */
  text: string;
  txid: string;
  confirmed: boolean;
  height: number;
}

export type CashOutResult = { kind: 'rejected'; nodeError: string; why: string } | { kind: 'input'; message: string } | { kind: 'accepted'; txid: string };

export interface CardScreenProps {
  net: ChainNet;
  shopName: string;
  shopSubtitle: string;
  demoShop: boolean;
  /** "$0.80", or sats while the price is unknown. */
  balance: string;
  /** "left of $1.00 · use by Nov 30, 2026" */
  balanceLine: string;
  /** 0..1, share of the gift still on the card. */
  left: number;
  /** The comeback strip: before the end date a promise, after it the Return action. */
  comeback: { kind: 'promise'; text: string } | { kind: 'ended'; text: string; busy: boolean; onReturn: () => void; result?: ReactNode };
  pay:
    | { kind: 'loading'; text: string }
    | { kind: 'empty'; text: string }
    | {
        kind: 'ready';
        chips: { key: string; label: string; on: boolean; onPick: () => void }[];
        buttonLabel: string;
        busy: boolean;
        canPay: boolean;
        onPay: () => void;
        notice?: ReactNode;
      }
    | {
        kind: 'cash-out';
        to: string;
        onTo: (v: string) => void;
        placeholder: string;
        busy: boolean;
        onSend: () => void;
        onBack: () => void;
        result: CashOutResult | null;
      };
  activity: CardActivity[];
  onCashOut?: () => void;
  notice?: ReactNode;
  more?: ReactNode;
}

export function CardScreen(p: CardScreenProps) {
  return (
    <div className="ccs" data-frame="card">
      <header className="ccs-head">
        <a className="ccs-brand" href="./">Comeback Card</a>
        <NetBadge net={p.net} />
      </header>
      {p.notice}

      <section className="ccs-card" aria-label={`Card for ${shopTitle(p.shopName)}`}>
        <div className="ccs-photo">
          {p.demoShop ? <StorefrontPhoto /> : <div className="ccs-photo-plain" />}
          <Bow className="ccs-bow" />
        </div>
        <div className="ccs-card-body">
          <div className="ccs-shop">
            <Avatar name={p.shopName} size={52} tone="solid" />
            <div>
              <div className="ccs-shop-name">{shopTitle(p.shopName)}</div>
              <div className="ccs-shop-sub">{p.shopSubtitle}</div>
            </div>
          </div>
          <div className="ccs-balance">{p.balance}</div>
          <div className="ccs-balance-line">{p.balanceLine}</div>
          <div className="ccs-bar" role="progressbar" aria-label="Left on the card" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.left * 100)}>
            <span style={{ width: `${Math.max(0, Math.min(1, p.left)) * 100}%` }} />
          </div>
        </div>
      </section>

      <section className={`ccs-comeback${p.comeback.kind === 'ended' ? ' ended' : ''}`}>
        <ReturnIcon className="ccs-return-icon" />
        <div className="ccs-comeback-text">
          <p>{p.comeback.text}</p>
          {p.comeback.kind === 'ended' && (
            <>
              <button type="button" className="btn btn-secondary ccs-return-btn" disabled={p.comeback.busy} onClick={p.comeback.onReturn}>
                {p.comeback.busy ? 'Sending…' : 'Send the rest back to the giver'}
              </button>
              {p.comeback.result}
            </>
          )}
        </div>
        <CoinMascot className="ccs-mascot" />
      </section>

      <section className="ccs-pay" aria-label="Pay at the shop">
        {p.pay.kind === 'loading' && <p className="muted center">{p.pay.text}</p>}
        {p.pay.kind === 'empty' && <p className="center">{p.pay.text}</p>}
        {p.pay.kind === 'ready' && (
          <>
            <div className="ccs-chips" role="radiogroup" aria-label="Amount">
              {p.pay.chips.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={c.on} className={`ccs-chip${c.on ? ' on' : ''}`} onClick={c.onPick}>
                  {c.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary ccs-pay-btn" disabled={!p.pay.canPay} onClick={p.pay.onPay}>
              {p.pay.busy ? 'Paying…' : p.pay.buttonLabel}
            </button>
            <p className="ccs-note">No wallet or app needed.</p>
            {p.pay.notice}
          </>
        )}
        {p.pay.kind === 'cash-out' && (
          <div className="ccs-cashout">
            <p>
              <strong>Try to cash it out.</strong> Paste any address, your own wallet for example. The page hands the transaction straight to a Bitcoin Cash node,
              with no check of its own first.
            </p>
            <input className="cc-input mono" value={p.pay.to} placeholder={p.pay.placeholder} onChange={(e) => p.pay.kind === 'cash-out' && p.pay.onTo(e.target.value)} />
            <div className="create-actions">
              <button type="button" className="btn btn-primary" disabled={p.pay.busy || p.pay.to.trim().length < 20} onClick={p.pay.onSend}>
                {p.pay.busy ? 'Sending…' : 'Send it there'}
              </button>
              <button type="button" className="btn-mini" onClick={p.pay.onBack}>
                Back
              </button>
            </div>
            {p.pay.result?.kind === 'rejected' && (
              <div className="notice bad ccs-refusal" role="alert">
                <strong>Refused by the network.</strong> {p.pay.result.why}
                <div className="small" style={{ marginTop: 6 }}>
                  The node’s own words:
                </div>
                <pre className="node">{p.pay.result.nodeError}</pre>
              </div>
            )}
            {p.pay.result?.kind === 'input' && <div className="notice warn">{p.pay.result.message}</div>}
            {p.pay.result?.kind === 'accepted' && (
              <div className="notice bad">
                The network accepted it: <TxLink net={p.net} txid={p.pay.result.txid} />. This should never happen; please report it.
              </div>
            )}
          </div>
        )}
      </section>

      {p.activity.length > 0 && (
        <section className="ccs-activity" aria-label="Card activity">
          <ul>
            {p.activity.map((a) => (
              <li key={a.key}>
                <TxLink net={p.net} txid={a.txid} label={a.text} className="ccs-act-text" />
                <SeenBadge confirmed={a.confirmed} height={a.height} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="ccs-links">
        {p.onCashOut ? (
          <button type="button" className="ccs-link" onClick={p.onCashOut}>
            Try to cash it out
          </button>
        ) : (
          <span />
        )}
        <a className="ccs-link" href="./rules.html">
          Rules of this card
        </a>
      </nav>
      {p.more && <div className="ccs-more">{p.more}</div>}
    </div>
  );
}
