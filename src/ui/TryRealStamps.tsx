// "Try a real stamp": a few demo stamps on mainnet that anyone may spend, so a judge can make a real
// mainnet transaction without a wallet of their own. A stamp can only pay the demo shop, so publishing
// its link is safe: whoever presses Buy first sends the coins to the demo shop and nowhere else.
// The links live in web/public/try-stamps.json, outside the JavaScript bundle, so used stamps can be
// replaced without a rebuild. No file, a broken file or another network: the block is not shown.
import { useEffect, useState } from 'react';
import type { ChainNet } from '../core/chain';

export type TryStamps = {
  net: ChainNet;
  amountLabel: string;
  shopName: string;
  stamps: string[];
  /** Campaign page of an expired stamp: its "Return to sponsor" needs no wallet. */
  expiredCampaign?: string;
  campaign?: string;
};

const isStamp = (s: unknown): s is string => typeof s === 'string' && s.startsWith('stamp.html#');
const isCampaign = (s: unknown): s is string => typeof s === 'string' && s.startsWith('campaign.html#');

/** Accepts only links to our own stamp and campaign pages. */
export function parseTryStamps(raw: unknown, net: ChainNet): TryStamps | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.net !== net || typeof r.amountLabel !== 'string' || typeof r.shopName !== 'string') return null;
  const stamps = Array.isArray(r.stamps) ? r.stamps.filter(isStamp) : [];
  if (stamps.length === 0) return null;
  return {
    net,
    amountLabel: r.amountLabel,
    shopName: r.shopName,
    stamps,
    expiredCampaign: isCampaign(r.expiredCampaign) ? r.expiredCampaign : undefined,
    campaign: isCampaign(r.campaign) ? r.campaign : undefined,
  };
}

export function TryRealStamps({ net }: { net: ChainNet }) {
  const [data, setData] = useState<TryStamps | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('./try-stamps.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(parseTryStamps(j, net)))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [net]);
  if (!data) return null;
  return (
    <section className="try">
      <div className="card try-card">
        <h2>Try a real stamp on mainnet</h2>
        <p>
          {data.stamps.length === 1 ? 'A real' : `${data.stamps.length} real`} {data.amountLabel} stamp{data.stamps.length > 1 ? 's' : ''} for{' '}
          {data.shopName}. Open one on your phone and press <strong>Buy</strong>: no wallet needed, and the stamp can only pay
          that shop.
        </p>
        <div className="try-links">
          {data.stamps.map((href, i) => (
            <a key={href} className="btn btn-secondary try-btn" href={href} target="_blank" rel="noreferrer">
              Stamp {i + 1} · {data.amountLabel}
            </a>
          ))}
          {data.expiredCampaign && (
            <a className="btn btn-secondary try-btn" href={data.expiredCampaign} target="_blank" rel="noreferrer">
              Return an expired stamp
            </a>
          )}
          {data.campaign && (
            <a className="btn btn-secondary try-btn" href={data.campaign} target="_blank" rel="noreferrer">
              Campaign page
            </a>
          )}
        </div>
        <p className="muted small">
          First come: if a stamp shows spent, create your own stamps with the form above.
          {data.expiredCampaign ? ' The expired stamp shows the other way out: on its page press Return to sponsor, no wallet needed.' : ''}
        </p>
      </div>
    </section>
  );
}
