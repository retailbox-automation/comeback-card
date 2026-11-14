// Home: presentational pieces only (props in, markup out). The live page (web/home.tsx) and the
// dev preview (web/preview.tsx) both render these, so what the preview shows is what judges get.
import type { ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { Avatar, NetBadge, StorefrontPhoto, shopTitle } from '../common';
import { ArtCard, ArtCoins, IconArrowRight, IconCalendar, IconCoins, IconRefresh, IconShop } from '../icons';

export const HEADLINE = 'A $0.25 stamp that can only be spent at one shop.';
export const DIFFERENCE = 'Gift links send coins anywhere. This one is locked to one shop inside the coin.';

export interface HomeHeroProps {
  net: ChainNet;
  /** The "Create stamps" card (live: wallet states and the form; preview: a fixture). */
  create: ReactNode;
  /** The demo stamp drawn in the phone. */
  preview: { shopName: string; amount: string };
  refuseHref: string;
}

export function HomeHero({ net, create, preview, refuseHref }: HomeHeroProps) {
  return (
    <section className="hero" data-frame="home">
      <div className="hero-left">
        <div className="hero-brand">
          <a className="wordmark" href="./">First Purchase</a>
          <span className="hero-net-inline">
            <NetBadge net={net} />
          </span>
        </div>
        <h1 className="hero-title">{HEADLINE}</h1>
        <p className="hero-lead">{DIFFERENCE}</p>
        {create}
        <ArtCoins className="hero-coins" />
      </div>
      <div className="hero-phone">
        <PhoneMock>
          <StampPreview shopName={preview.shopName} amount={preview.amount} />
        </PhoneMock>
      </div>
      <div className="hero-right">
        <div className="hero-net">
          <NetBadge net={net} />
        </div>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>Create
          </li>
          <li>
            <span className="step-n">2</span>Open on a phone
          </li>
          <li>
            <span className="step-n">3</span>Pay at the shop
          </li>
        </ol>
        <a className="refuse-link" href={refuseHref}>
          See the network refuse a stamp sent elsewhere <IconArrowRight className="refuse-arrow" width={22} height={22} />
        </a>
        <ArtCard className="hero-card-art" />
      </div>
    </section>
  );
}

/** A phone outline around a sample stamp. Only on the home page, as an illustration. */
export function PhoneMock({ children }: { children: ReactNode }) {
  return (
    <figure className="phone" aria-label="What a stamp looks like on a phone">
      <div className="phone-screen">
        <span className="phone-island" aria-hidden="true" />
        {children}
        <span className="phone-home" aria-hidden="true" />
      </div>
    </figure>
  );
}

/** The sample stamp inside the home page phone. Not a button: it shows what the person you give a stamp sees. */
export function StampPreview({ shopName, amount }: { shopName: string; amount: string }) {
  return (
    <div className="pv">
      <span className="pv-badge">Preview</span>
      <StorefrontPhoto className="pv-photo" />
      <div className="pv-avatar">
        <Avatar name={shopName} size={88} tone="soft" />
      </div>
      <div className="pv-name">{shopTitle(shopName)}</div>
      <div className="pv-sub">Demo shop</div>
      <hr className="pv-rule" />
      <div className="pv-amount">{amount}</div>
      <div className="pv-caption">Spend it here. No wallet or app needed.</div>
      <span className="pv-buy" aria-hidden="true">
        Buy · {amount}
      </span>
    </div>
  );
}

/** The white card that holds every "Create stamps" state. */
export function CreateCard({ title = 'Create stamps', children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card create" id="create" aria-labelledby="create-title">
      <h2 id="create-title" className="create-title">{title}</h2>
      {children}
    </section>
  );
}

/** One line of the card: a green icon tile, then the value. */
export function CreateRow({ icon, pick, children }: { icon: 'shop' | 'coins' | 'calendar'; pick?: boolean; children: ReactNode }) {
  const Icon = icon === 'shop' ? IconShop : icon === 'coins' ? IconCoins : IconCalendar;
  return (
    <div className={`create-row${pick ? ' has-pick' : ''}`}>
      <span className="create-tile">
        <Icon width={26} height={26} />
      </span>
      <div className="create-value">{children}</div>
    </div>
  );
}

/** Foot of the card: the wallet line. */
export function WalletLine({ connected, text, right }: { connected: boolean; text: ReactNode; right?: ReactNode }) {
  return (
    <div className="create-foot">
      <span className={`dot ${connected ? 'on' : 'off'}`} aria-hidden="true" />
      <span className="create-foot-text">{text}</span>
      {right}
    </div>
  );
}

/** The rows before a wallet is connected: what will be created, with the default choices. */
export function CreatePreviewRows({ shopName, expiryDay }: { shopName: string; expiryDay: string }) {
  return (
    <div className="create-rows">
      <CreateRow icon="shop">{shopName}</CreateRow>
      <CreateRow icon="coins">$0.25 × 2</CreateRow>
      <CreateRow icon="calendar">Back to you after {expiryDay}</CreateRow>
    </div>
  );
}

export interface CreateFormProps {
  shopMode: 'demo' | 'own';
  onShopMode: (m: 'demo' | 'own') => void;
  demoShopName: string;
  ownShop: string;
  onOwnShop: (v: string) => void;
  ownShopName: string;
  onOwnShopName: (v: string) => void;
  ownShopError: string | null;
  addressPlaceholder: string;
  usd: number;
  usdOptions: number[];
  onUsd: (v: number) => void;
  usdDisabled: boolean;
  count: number;
  countOptions: number[];
  onCount: (v: number) => void;
  days: number;
  dayOptions: Array<{ days: number; label: string }>;
  onDays: (v: number) => void;
  campaignName: string;
  onCampaignName: (v: string) => void;
  /** Warnings above the button (coins, scan errors). */
  notices?: ReactNode;
  buttonLabel: string;
  canCreate: boolean;
  onCreate: () => void;
  /** One quiet line under the button: what exactly gets locked and where it goes back. */
  details: ReactNode;
  error?: ReactNode;
  wallet: { name: string; balance: string | null; onRefresh: () => void };
}

/**
 * A choice that reads like plain text in the row: the visible label is ordinary text, and the native select lies
 * over it, transparent, so a click or a key opens the system picker. Renders the same in every browser.
 */
function Pick({ id, label, value, options, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <span className={`pick${disabled ? ' disabled' : ''}`}>
      <span className="pick-text" aria-hidden="true">{current}</span>
      <select id={id} aria-label={label} className="pick-native" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </span>
  );
}

export function CreateForm(p: CreateFormProps) {
  return (
    <>
      <div className="create-rows">
        <CreateRow icon="shop" pick>
          <Pick
            id="shop"
            label="Shop"
            value={p.shopMode}
            options={[
              { value: 'demo', label: p.demoShopName },
              { value: 'own', label: 'My own shop address…' },
            ]}
            onChange={(v) => p.onShopMode(v === 'own' ? 'own' : 'demo')}
          />
        </CreateRow>
        {p.shopMode === 'own' && (
          <div className="create-own">
            <input
              type="text"
              aria-label="Shop address"
              placeholder={p.addressPlaceholder}
              value={p.ownShop}
              onChange={(e) => p.onOwnShop(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <input type="text" aria-label="Shop name" placeholder="Shop name (shown on the stamp)" value={p.ownShopName} maxLength={40} onChange={(e) => p.onOwnShopName(e.target.value)} />
            {p.ownShopError && <div className="field-error">{p.ownShopError}</div>}
          </div>
        )}
        <CreateRow icon="coins" pick>
          <Pick
            id="usd"
            label="Amount per stamp"
            value={String(p.usd)}
            disabled={p.usdDisabled}
            options={p.usdOptions.map((v) => ({ value: String(v), label: `$${v.toFixed(2)}` }))}
            onChange={(v) => p.onUsd(Number(v))}
          />
          <span className="times">×</span>
          <Pick
            id="count"
            label="Number of stamps"
            value={String(p.count)}
            options={p.countOptions.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => p.onCount(Number(v))}
          />
        </CreateRow>
        <CreateRow icon="calendar" pick>
          <span>Back to you after</span>
          <Pick
            id="days"
            label="Unspent stamps come back to you after"
            value={String(p.days)}
            options={p.dayOptions.map((o) => ({ value: String(o.days), label: o.label }))}
            onChange={(v) => p.onDays(Number(v))}
          />
        </CreateRow>
      </div>
      {p.notices}
      <button type="button" className="btn btn-primary btn-create" onClick={p.onCreate} disabled={!p.canCreate}>
        {p.buttonLabel}
      </button>
      {p.error}
      <details className="create-more">
        <summary>Details · campaign “{p.campaignName || 'My stamps'}”</summary>
        <div className="create-details">{p.details}</div>
        <input id="cname" type="text" aria-label="Campaign name" value={p.campaignName} maxLength={40} onChange={(e) => p.onCampaignName(e.target.value)} />
      </details>
      <WalletLine
        connected
        text={<>Wallet connected · {p.wallet.name}</>}
        right={
          <span className="wallet-balance">
            {p.wallet.balance ?? '…'}
            <button type="button" className="wallet-refresh" onClick={p.wallet.onRefresh} title="Read the balance again" aria-label="Refresh the balance">
              <IconRefresh width={15} height={15} />
            </button>
          </span>
        }
      />
    </>
  );
}

/** Below the hero: the contract's two ways out, honest limits, and where the refusal can be seen live. */
export function HowItWorks({ refuseId, yourStamps }: { refuseId: string; yourStamps: Array<{ label: string; href: string }> }) {
  return (
    <section className="how">
      <div className="how-grid">
        <div className="card how-card" id={refuseId}>
          <h2>See the network refuse a stamp</h2>
          <ol className="how-steps">
            <li>Create stamps above, or open a stamp link you were given.</li>
            <li>
              On the stamp, press <strong>Try to send it anywhere else</strong> and paste any address, your own wallet for example.
            </li>
            <li>The page hands that transaction straight to a Bitcoin Cash node, with no check of its own first. The node answers in its own words:</li>
          </ol>
          <pre className="node">mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)</pre>
          <p className="muted small">That is the answer a mainnet node gave to a real $0.02 stamp on Nov 14, 2026. On your stamp it comes live from the network, word for word.</p>
          {yourStamps.length > 0 && (
            <div className="how-yours">
              <span className="muted small">Your latest stamps:</span>
              {yourStamps.map((s) => (
                <a key={s.href} className="btn-mini" href={s.href} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="card how-card">
          <h2>How it works</h2>
          <p className="muted">Every stamp is its own coin locked by a small CashScript contract with two ways out:</p>
          <pre className="code">{`spend(sig stampSig)   // anyone holding the stamp link
  one input, one output
  output == the shop's address
  output >= stamp - fee cap

reclaim()             // anyone, after the expiry date
  tx.time >= expiry
  one input, one output
  output == the sponsor's address`}</pre>
          <p className="muted small">
            The stamp key travels inside the link, after the #. Browsers never send that part to a server, and this site has no server of its own:
            pages talk straight to public Bitcoin Cash nodes (Fulcrum).
          </p>
          <p className="muted small">
            Honest limits: a shop could open stamp links and spend them itself, the same risk as a paper coupon. So the campaign page counts “spent
            at the shop” with a link to each transaction, not “purchases”. After the expiry date a stamp can still be spent until someone returns
            it; the network keeps whichever comes first.
          </p>
        </div>
      </div>
    </section>
  );
}

export function MyCampaigns({ list }: { list: Array<{ key: string; name: string; detail: string; href: string }> }) {
  if (list.length === 0) return null;
  return (
    <section className="mine">
      <div className="card">
        <h2>Your campaigns in this browser</h2>
        <ul className="mine-list">
          {list.map((c) => (
            <li key={c.key}>
              <span>
                {c.name}
                <span className="muted small block">{c.detail}</span>
              </span>
              <a href={c.href} target="_blank" rel="noreferrer">Open</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
