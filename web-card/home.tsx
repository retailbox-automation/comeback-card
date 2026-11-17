// Comeback Card home: one job — give a card for one shop. Then: try a real card, how it works, how it differs.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner, StorefrontPhoto } from '../src/ui/common';
import { CcFooter, CcHeader, FP_SITE } from '../src/ui/cc/common';
import { GivePanel, loadGiven } from '../src/ui/cc/GivePanel';
import { CARD_DEMO_SHOP_LINK, NET } from '../src/config';
import { decodeShopLink } from '../src/core/cardlink';
import { formatDay } from '../src/ui/common';

interface TryCards {
  net: string;
  amountLabel: string;
  shopName: string;
  cards: string[];
  expiredCard?: string;
}

function TryRealCards() {
  const [t, setT] = useState<TryCards | null>(null);
  useEffect(() => {
    fetch('./try-cards.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: TryCards | null) => setT(j && j.net === NET && j.cards.length > 0 ? j : null))
      .catch(() => setT(null));
  }, []);
  if (!t) return null;
  return (
    <section className="try cc-try" aria-labelledby="try-title">
      <h2 id="try-title">Try a real card on {NET}</h2>
      <p>
        {t.cards.length} real {t.amountLabel} card{t.cards.length > 1 ? 's' : ''} for {t.shopName}. Open one on your phone and pay part of it: no wallet needed,
        and it can only pay that shop.
      </p>
      <div className="try-links">
        {t.cards.map((href, i) => (
          <a key={href} className="try-btn" href={href}>
            Card {i + 1} · {t.amountLabel}
          </a>
        ))}
        {t.expiredCard && (
          <a className="try-btn" href={t.expiredCard}>
            A card past its end date
          </a>
        )}
      </div>
      <p className="muted small">First come: if a card is empty, give your own with the form above.</p>
    </section>
  );
}

function App() {
  const shop = useMemo(() => decodeShopLink(CARD_DEMO_SHOP_LINK[NET]), []);
  const mine = useMemo(loadGiven, []);
  return (
    <div className="home cc-home">
      <Banner />
      <CcHeader net={NET} />
      <section className="cc-hero">
        <div className="cc-hero-text">
          <p className="cc-kicker">For Thanksgiving week, give the café down the street</p>
          <h1>The gift card that gives back what isn’t spent.</h1>
          <p className="cc-lead">
            Give someone a card for one shop. They spend it there in parts. Whatever is left after the end date can only go back to you. The shop pays nothing,
            and Bitcoin Cash enforces every rule, not us.
          </p>
          <p className="muted small">
            43% of US adults have at least one unused gift card, $244 on average (
            <a href="https://www.bankrate.com/archive/gift-cards-survey/" target="_blank" rel="noreferrer">
              Bankrate, Sep 2024
            </a>
            ).
          </p>
        </div>
        <div className="cc-hero-panel">
          <div className="cc-hero-photo" aria-hidden="true">
            <StorefrontPhoto />
          </div>
          <GivePanel shop={shop} />
        </div>
      </section>

      <TryRealCards />

      {mine.length > 0 && (
        <section className="mine cc-mine" aria-label="Cards you gave">
          <h2>Cards you gave</h2>
          <ul className="mine-list">
            {mine.map((c) => (
              <li key={c.fundingTxid}>
                <a href={c.cardUrl}>
                  ${c.usd.toFixed(2)} at {c.shopName}
                </a>{' '}
                <span className="muted small">until {formatDay(BigInt(c.expiry))}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Saved in this browser only.</p>
        </section>
      )}

      <section className="cc-how" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="cc-steps">
          <li>
            <strong>Give.</strong> Pick a shop, an amount and an end date, and sign one transaction from your wallet. You get a card link.
          </li>
          <li>
            <strong>Spend in parts.</strong> Whoever has the link pays the shop from their phone, any amount up to what’s left. No wallet or app needed.
          </li>
          <li>
            <strong>The rest comes back.</strong> After the end date the card can only pay you back. Anyone can press Return, no wallet needed.
          </li>
        </ol>
        <p className="cc-diff">
          Paytaca Gifts and CashStamps take back a gift nobody claims, but once claimed the coins can be spent anywhere. Regulars rewards are paid by the shop itself.
          Here anyone gives a purchase at one shop: the card can only be spent there, and whatever the person doesn’t spend comes back to the giver.
        </p>
        <p>
          <a href="./rules.html">Rules of this card</a>: the contract, what it guarantees and what it doesn’t, with a real transaction or a network refusal for each case.
        </p>
        <p className="muted small">
          Comeback Card grew out of <a href={FP_SITE}>First Purchase</a>, the earlier demo of the same engine: stamps for one shop, built in the first days of BCH
          BLAZE 2026.
        </p>
      </section>
      <CcFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
