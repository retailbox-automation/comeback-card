// For shops: a shop that already takes BCH makes its signing key here, in its own browser, and signs its
// receiving address once. Out come three links: one for givers (public), one to keep (holds the key),
// and the counter. Nothing is sent to any server; the shop pays nothing.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeCashAddress, generatePrivateKey } from '@bitauth/libauth';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner, CopyButton, Notice, QrReveal, shortAddress } from '../src/ui/common';
import { CcFooter, CcHeader } from '../src/ui/cc/common';
import { NET } from '../src/config';
import { PREFIX } from '../src/core/chain';
import { decodeShopKeyLink, encodeShopKeyLink, encodeShopLink, shopLinkOf, type ShopKeyLink } from '../src/core/cardlink';
import { addressOf, lockingBytecodeOf } from '../src/core/stamp';

const pageUrl = (page: string, fragment: string) => new URL(`./${page}#${fragment}`, location.href).toString();

function fromHash(): ShopKeyLink | string | null {
  if (!location.hash || location.hash.length < 10) return null;
  try {
    return decodeShopKeyLink(location.hash);
  } catch (e) {
    return `This shop key link is damaged or incomplete (${e instanceof Error ? e.message : 'unknown error'}).`;
  }
}

function App() {
  const initial = useMemo(fromHash, []);
  const [made, setMade] = useState<ShopKeyLink | null>(typeof initial === 'object' ? initial : null);
  return (
    <div className="home cc-home">
      <Banner />
      <CcHeader net={NET} />
      <main className="cc-narrow">
        <h1 className="cc-h1-small">For shops that already take Bitcoin Cash</h1>
        <p className="cc-lead">
          People can give your customers a card that only your shop can take. You get each payment in full, straight to your own address, and you pay nothing.
          Cards that aren’t used go back to the giver after their end date.
        </p>
        {typeof initial === 'string' && <Notice kind="bad">{initial}</Notice>}
        {made ? <Done k={made} /> : <Form onMade={setMade} />}
        <section className="cc-how">
          <h2>What you need</h2>
          <ul>
            <li>Your shop’s Bitcoin Cash receiving address, the one your wallet or POS already shows.</li>
            <li>One minute on this page. It makes a signing key in your browser and signs that address once. Cards check the signature, so they can only pay you.</li>
          </ul>
          <p className="muted small">
            Honest limit: the card pays the address you sign here. A POS that shows a new address for every sale is not supported yet; use one fixed address for cards.
          </p>
        </section>
      </main>
      <CcFooter />
    </div>
  );
}

function Form({ onMade }: { onMade: (k: ShopKeyLink) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const check = (() => {
    const a = address.trim();
    if (!a) return { ok: false as const, why: '' };
    const d = decodeCashAddress(a.includes(':') ? a : `${PREFIX[NET]}:${a}`);
    if (typeof d === 'string') return { ok: false as const, why: 'That does not look like a Bitcoin Cash address.' };
    if (d.prefix !== PREFIX[NET]) return { ok: false as const, why: `That address is not on ${NET}.` };
    if (d.type !== 'p2pkh' && d.type !== 'p2sh') return { ok: false as const, why: 'Use a regular (non-token) address.' };
    return { ok: true as const, address: a.includes(':') ? a : `${PREFIX[NET]}:${a}` };
  })();
  const canMake = check.ok && name.trim().length > 0;
  return (
    <section className="create cc-give">
      <h2 className="create-title">Set up your shop</h2>
      <div className="create-panel cc-form">
        <label className="cc-label" htmlFor="shop-name">
          Shop name
        </label>
        <input id="shop-name" className="cc-input" value={name} maxLength={40} placeholder="Corner Bakery" onChange={(e) => setName(e.target.value)} />
        <label className="cc-label" htmlFor="shop-addr">
          Receiving address
        </label>
        <input id="shop-addr" className="cc-input mono" value={address} placeholder={`${PREFIX[NET]}:q…`} onChange={(e) => setAddress(e.target.value)} />
        {!check.ok && check.why && <p className="field-error">{check.why}</p>}
        <button
          type="button"
          className="btn btn-primary btn-create"
          disabled={!canMake}
          onClick={() => {
            if (!check.ok) return;
            onMade({ net: NET, shopName: name.trim().slice(0, 40), shopPrivateKey: generatePrivateKey(), lockingBytecode: lockingBytecodeOf(check.address) });
          }}
        >
          Make my shop key and sign this address
        </button>
      </div>
    </section>
  );
}

function Done({ k }: { k: ShopKeyLink }) {
  const shop = useMemo(() => shopLinkOf(k), [k]);
  const address = addressOf(k.lockingBytecode, PREFIX[k.net]);
  const giverUrl = pageUrl('give.html', encodeShopLink(shop));
  const keyUrl = pageUrl('for-shops.html', encodeShopKeyLink(k));
  const counterUrl = pageUrl('counter.html', `a=${encodeURIComponent(address)}&n=${encodeURIComponent(k.shopName)}`);
  return (
    <section className="create cc-give">
      <h2 className="create-title">{k.shopName} is ready</h2>
      <div className="create-panel">
        <Notice kind="ok">
          Cards made from your link can only pay <span className="addr" title={address}>{shortAddress(address)}</span>.
        </Notice>
        <h3 className="cc-h3">1. Link for givers</h3>
        <p className="muted small">Share it anywhere: a sign at the till, your social page, a message to regulars. It holds no secret.</p>
        <div className="create-actions">
          <a className="btn-mini" href={giverUrl} target="_blank" rel="noreferrer">
            Open
          </a>
          <CopyButton text={giverUrl} label="Copy link for givers" />
          <QrReveal text={giverUrl} label="QR for the till" warning="Safe to print: this link only lets people give cards for your shop." />
        </div>
        <h3 className="cc-h3">2. Your shop key — keep it private</h3>
        <p className="muted small">
          This link holds your signing key. Save it somewhere safe (a password manager or a note only you can read). You need it only to sign a new address
          later; cards already given keep working without it.
        </p>
        <div className="create-actions">
          <CopyButton text={keyUrl} label="Copy shop key link" />
        </div>
        <h3 className="cc-h3">3. Counter</h3>
        <p className="muted small">Keep it open at the till: card payments show up within seconds.</p>
        <div className="create-actions">
          <a className="btn-mini" href={counterUrl} target="_blank" rel="noreferrer">
            Open the counter
          </a>
          <CopyButton text={counterUrl} label="Copy counter link" />
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
