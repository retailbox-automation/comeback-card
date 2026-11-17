// Give a card for the shop named in the link (a shop's own "link for givers"). Same panel as the home page.
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner, Notice } from '../src/ui/common';
import { CcFooter, CcHeader } from '../src/ui/cc/common';
import { GivePanel } from '../src/ui/cc/GivePanel';
import { NET } from '../src/config';
import { decodeShopLink, type ShopLink } from '../src/core/cardlink';

function parse(): { ok: true; shop: ShopLink } | { ok: false; error: string } {
  if (!location.hash || location.hash.length < 10) return { ok: false, error: 'This page needs a shop link. Ask the shop for its “link for givers”.' };
  try {
    return { ok: true, shop: decodeShopLink(location.hash) };
  } catch (e) {
    return { ok: false, error: `This shop link is damaged or incomplete (${e instanceof Error ? e.message : 'unknown error'}).` };
  }
}

function App() {
  const p = useMemo(parse, []);
  return (
    <div className="home cc-home">
      <Banner />
      <CcHeader net={NET} />
      <main className="cc-narrow">
        {p.ok ? (
          <>
            <h1 className="cc-h1-small">Give a card for {p.shop.shopName}</h1>
            <p className="cc-lead">They spend it there in parts. Whatever is left after the end date can only go back to you. The shop pays nothing.</p>
            <GivePanel shop={p.shop} />
          </>
        ) : (
          <Notice kind="bad">{p.error}</Notice>
        )}
      </main>
      <CcFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
