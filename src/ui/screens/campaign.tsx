// Campaign page, presentational: counts, one row per stamp with its transaction, the honest-limits line.
import type { ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { Avatar, NetBadge, StorefrontPhoto, TxLink, shopTitle } from '../common';

export type RowTone = 'spent' | 'returned' | 'waiting' | 'expired' | 'pending' | 'bad';

export interface CampaignRowView {
  key: string;
  tone: RowTone;
  /** "Stamp #12 spent at Maple Street Coffee" */
  title: string;
  amount: string | null;
  amountTitle?: string;
  pill: { label: string; tone: 'green' | 'outline' | 'grey' | 'amber' | 'red' };
  /** When it happened, from chain data only: "block 291,402" or "not in a block yet". */
  when: string | null;
  tx: { txid: string; label: string } | null;
  action?: ReactNode;
  result?: ReactNode;
}

export interface CampaignScreenProps {
  net: ChainNet;
  name: string;
  /** Preview only: marks invented numbers. */
  sampleData?: boolean;
  sponsor: { label: string; title: string };
  shopName: string;
  showPhoto: boolean;
  counts: { spent: number; returned: number; waiting: number; total: number };
  rows: CampaignRowView[];
  notices?: ReactNode;
  footnote: string;
  below?: ReactNode;
}

export function CampaignScreen(p: CampaignScreenProps) {
  return (
    <div className="cp" data-frame="campaign">
      <header className="cp-head">
        <a className="cp-brand" href="./">First Purchase</a>
        <NetBadge net={p.net} />
      </header>
      <div className="cp-body">
        <div className="cp-title-row">
          <h1 className="cp-title">{p.name}</h1>
          {p.sampleData && <span className="pill pill-grey cp-sample">sample data</span>}
        </div>
        <div className="cp-meta">
          <span className="cp-sponsor">
            Sponsor:{' '}
            <span className="pill pill-green cp-sponsor-pill" title={p.sponsor.title}>
              {p.sponsor.label}
            </span>
          </span>
          <span className="cp-sep" aria-hidden="true" />
          <span className="cp-shop">
            <Avatar name={p.shopName} size={46} tone="forest" />
            {shopTitle(p.shopName)}
          </span>
        </div>
        {p.notices}
        <div className="cp-grid">
          <aside className="cp-card cp-stats" aria-label="Counts">
            <Donut spent={p.counts.spent} total={p.counts.total} />
            <ul className="cp-legend">
              <li>
                <span className="cp-dot returned" aria-hidden="true" />
                <span>
                  <b>{p.counts.returned}</b> returned to the sponsor
                </span>
              </li>
              <li>
                <span className="cp-dot waiting" aria-hidden="true" />
                <span>
                  <b>{p.counts.waiting}</b> waiting
                </span>
              </li>
            </ul>
            {p.showPhoto && <StorefrontPhoto className="cp-photo" />}
          </aside>
          <section className="cp-card cp-list" aria-label="Stamps">
            <ul>
              {p.rows.map((r) => (
                <li key={r.key} className={`cp-row ${r.tone}`}>
                  <div className="cp-row-main">
                    <span className={`cp-thumb ${r.tone}`} aria-hidden="true">
                      <img src="./img/cup.jpg" alt="" decoding="async" />
                    </span>
                    <span className="cp-row-title">{r.title}</span>
                    <span className="cp-amount" title={r.amountTitle}>
                      {r.amount ?? '…'}
                    </span>
                    <span className={`pill pill-${r.pill.tone} cp-pill`}>{r.pill.label}</span>
                    <span className="cp-when">{r.when ?? ''}</span>
                    <span className="cp-view">{r.tx ? <TxLink net={p.net} txid={r.tx.txid} label={r.tx.label} className="cp-tx" /> : null}</span>
                  </div>
                  {r.action && <div className="cp-row-action">{r.action}</div>}
                  {r.result && <div className="cp-row-result">{r.result}</div>}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="cp-foot">{p.footnote}</p>
        {p.below}
      </div>
    </div>
  );
}

function Donut({ spent, total }: { spent: number; total: number }) {
  const r = 128;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, spent / total) : 0;
  return (
    <div className="cp-donut">
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r={r} fill="none" stroke="#dcdee1" strokeWidth="26" />
        <circle
          cx="150"
          cy="150"
          r={r}
          fill="none"
          stroke="#00c271"
          strokeWidth="26"
          strokeDasharray={`${(c * share).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 150 150)"
        />
      </svg>
      <div className="cp-donut-text">
        <b>{spent}</b>
        <span className="cp-of">of {total}</span>
        <span>spent at the shop</span>
      </div>
    </div>
  );
}
