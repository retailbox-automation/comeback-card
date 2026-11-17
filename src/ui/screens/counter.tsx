// Shop counter, presentational: the screen a shop keeps open at the till.
import type { ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { Avatar, NetBadge, TxLink, shopTitle } from '../common';
import { IconCheck, Sparks } from '../icons';

export interface CounterPaymentView {
  txid: string;
  /** "$0.25" when the price is known, otherwise sats. */
  amount: string;
  fromStamp: boolean;
  confirmed: boolean;
  height: number;
  highlight: boolean;
}

export interface CounterScreenProps {
  net: ChainNet;
  shopName: string;
  focus: (CounterPaymentView & { sats: string; label: string }) | null;
  payments: CounterPaymentView[] | null;
  notices?: ReactNode;
  address: string;
  /** Which product's payments get the sticker. "fromStamp" in the views means "from this product". */
  product?: 'stamp' | 'card';
}

const PRODUCT = {
  stamp: { brand: 'First Purchase · counter', paid: 'Paid with a First Purchase stamp', row: 'First Purchase stamp', idle: 'Waiting for a stamp…', idleSub: 'Stamps paid here show up within seconds.', label: 'stamp', foot: '“Stamp” means the coins came out of a First Purchase stamp contract (its code is visible in the transaction).' },
  card: { brand: 'Comeback Card · counter', paid: 'Paid with a Comeback Card', row: 'Comeback Card', idle: 'Waiting for a card payment…', idleSub: 'Card payments made here show up within seconds.', label: 'card', foot: '“Comeback Card” means the coins came out of a Comeback Card contract (its code is visible in the transaction).' },
} as const;

export function CounterScreen(p: CounterScreenProps) {
  const t = PRODUCT[p.product ?? 'stamp'];
  return (
    <div className="ct" data-frame="counter">
      <header className="ct-head">
        <a className="ct-brand" href="./">{t.brand}</a>
        <NetBadge net={p.net} />
      </header>
      <div className="ct-shop">
        <Avatar name={p.shopName} size={80} tone="forest" />
        <h1 className="ct-name">{shopTitle(p.shopName)}</h1>
      </div>
      {p.notices}
      {p.focus ? (
        <div className="ct-focus" aria-live="polite">
          <div className="ct-amount" title={p.focus.sats}>
            +{p.focus.amount}
          </div>
          <div className="ct-with">{p.focus.fromStamp ? t.paid : 'Paid to this shop'}</div>
          <span className={`ct-status ${p.focus.confirmed ? 'confirmed' : 'zero'}`}>
            {p.focus.confirmed ? `Confirmed in block ${p.focus.height}` : 'Received (0-conf) · confirming'}
          </span>
          <div className="ct-sticker">
            <img src="./img/cup.jpg" alt={`Sticker for payment ${p.focus.txid}`} decoding="async" />
            <Sparks className="ct-sparks" />
          </div>
          <TxLink
            net={p.net}
            txid={p.focus.txid}
            className="ct-code"
            label={`${p.focus.label} · ${p.focus.sats} · #${p.focus.txid.slice(0, 8)}`}
          />
        </div>
      ) : (
        p.payments && (
          <div className="ct-idle">
            <div className="ct-idle-title">{t.idle}</div>
            <div className="muted small">{t.idleSub}</div>
          </div>
        )
      )}
      <hr className="ct-rule" />
      <h2 className="ct-recent">Recent payments</h2>
      {p.payments && p.payments.length === 0 && <div className="muted ct-empty">No payments yet.</div>}
      {p.payments && p.payments.length > 0 && (
        <ul className="ct-list">
          {p.payments.map((x) => (
            <li key={x.txid} className={x.highlight ? 'hl' : undefined}>
              <span className={`ct-tick ${x.fromStamp ? 'stamp' : 'other'}`} aria-hidden="true">
                <IconCheck width={16} height={16} />
              </span>
              <span className="ct-what">{x.fromStamp ? t.row : 'Other payment'}</span>
              <span className="ct-plus">+{x.amount}</span>
              <TxLink net={p.net} txid={x.txid} label={x.confirmed ? `block ${x.height.toLocaleString('en-US')}` : '0-conf'} className="ct-when" />
            </li>
          ))}
        </ul>
      )}
      <p className="ct-foot">
        Shop address: <span className="addr">{p.address}</span>. {t.foot}
      </p>
    </div>
  );
}
