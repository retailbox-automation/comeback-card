// "Give a card": the giver connects a wallet, picks an amount and an end date, signs one transaction.
// The card key is made here, in the browser, and goes only into the card link.
import { useEffect, useMemo, useState } from 'react';
import { generatePrivateKey } from '@bitauth/libauth';
import { NET } from '../../config';
import { PREFIX, broadcastRaw, provider } from '../../core/chain';
import { CARD_FEE_RESERVE_SATS, CARD_MAX_FEE, CARD_MIN_CHANGE, MIN_CARD_SATS, cardContract } from '../../core/card';
import { cardTermsOf, encodeCardLink, type CardLink, type ShopLink } from '../../core/cardlink';
import { NotEnoughCoins, planFunding, type WalletCoin } from '../../core/create';
import { addressOf, lockingBytecodeOf } from '../../core/stamp';
import { formatSats, formatUsd, usdPerBch, usdToSats } from '../../core/price';
import { explainNodeError } from '../../core/view';
import type { WizardWallet } from '../../core/wallet';
import { CopyButton, Notice, QrReveal, TxLink, formatDate, formatDay, shortAddress } from '../common';
import { Chips, WalletGate } from './common';

const SCAN_DEPTH = 20;
const STORE = 'comeback-cards-v1';
const AMOUNTS = [0.05, 0.25, 1];
const DAYS = [7, 14, 30];

export interface GivenCard {
  createdAt: number;
  net: typeof NET;
  shopName: string;
  usd: number;
  fundingTxid: string;
  cardUrl: string;
  expiry: string;
}

export function loadGiven(): GivenCard[] {
  try {
    return (JSON.parse(localStorage.getItem(STORE) ?? '[]') as GivenCard[]).filter((c) => c.net === NET);
  } catch {
    return [];
  }
}
function saveGiven(c: GivenCard) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '[]') as GivenCard[];
    localStorage.setItem(STORE, JSON.stringify([c, ...all].slice(0, 20)));
  } catch {
    /* private mode: the result is still on screen */
  }
}

const pageUrl = (page: string, fragment: string) => new URL(`./${page}#${fragment}`, location.href).toString();
const dayFromNow = (days: number) => formatDay(BigInt(Math.floor(Date.now() / 1000) + days * 86400));
const money = (usd: number) => (usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd % 1 ? 2 : 0)}`);

export function GivePanel({ shop }: { shop: ShopLink }) {
  const shopAddress = addressOf(shop.approval.lockingBytecode, PREFIX[shop.net]);
  return (
    <section className="create cc-give" aria-label="Give a card">
      <h2 className="create-title">Give a card</h2>
      <div className="cc-shopline">
        <strong>{shop.shopName}</strong>
        <span className="muted small" title={shopAddress}>
          signed address {shortAddress(shopAddress)}
        </span>
      </div>
      {shop.net !== NET ? (
        <Notice kind="bad">This shop link is for {shop.net}; this site runs on {NET}.</Notice>
      ) : (
        <WalletGate
          appName="Comeback Card"
          idle={(connect) => (
            <>
              <p className="cc-give-lead">
                A card only {shop.shopName} can take. It’s spent there in parts, and whatever is left after the end date can only go back to you.
              </p>
              <button type="button" className="btn btn-primary btn-create" onClick={connect}>
                Connect wallet to give
              </button>
              <p className="muted small cc-walletline">WizardConnect: Selene (2026.10 or newer), Cashonize or Paytaca</p>
            </>
          )}
        >
          {(wallet, walletName) => <Connected wallet={wallet} walletName={walletName} shop={shop} />}
        </WalletGate>
      )}
    </section>
  );
}

function Connected({ wallet, walletName, shop }: { wallet: WizardWallet; walletName: string | null; shop: ShopLink }) {
  const walletNet = wallet.network();
  const prov = useMemo(() => provider(NET), []);
  const giverAddress = useMemo(() => (walletNet === NET ? wallet.address('receive', 0) : ''), [wallet, walletNet]);
  const [coins, setCoins] = useState<WalletCoin[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null | undefined>(undefined);
  const [usd, setUsd] = useState(0.25);
  const [days, setDays] = useState(14);
  const [fromName, setFromName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ plain: string; verbatim?: string } | null>(null);
  const [given, setGiven] = useState<GivenCard | null>(null);

  async function scan() {
    setScanError(null);
    try {
      const found: WalletCoin[] = [];
      const jobs: Promise<void>[] = [];
      for (const path of ['receive', 'change'] as const) {
        for (let index = 0; index < SCAN_DEPTH; index++) {
          const address = wallet.address(path, index);
          jobs.push(
            prov.getUtxos(address).then((us) => {
              for (const utxo of us) if (!utxo.token) found.push({ utxo, path, index, address });
            }),
          );
        }
      }
      await Promise.all(jobs);
      setCoins(found);
    } catch {
      setScanError('Could not read your wallet’s coins from the network. Try again in a moment.');
    }
  }
  useEffect(() => {
    if (walletNet === NET) scan();
    usdPerBch().then(setRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletNet]);

  if (walletNet !== NET) {
    return (
      <div className="create-panel">
        <Notice kind="bad">
          {walletName ?? 'Your wallet'} is on {walletNet === 'unknown' ? 'an unknown network' : walletNet}. This site runs on {NET}. Switch the wallet’s network,
          then connect again.
        </Notice>
        <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
          Connect again
        </button>
      </div>
    );
  }
  if (given) return <GivenView c={given} />;

  const balance = coins?.reduce((s, c) => s + c.utxo.satoshis, 0n) ?? null;
  const giftSats = rate ? usdToSats(usd, rate) : null;
  const total = giftSats !== null ? giftSats + CARD_FEE_RESERVE_SATS : null;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
  const canGive = !!rate && giftSats !== null && giftSats >= MIN_CARD_SATS && !busy;

  async function give() {
    if (!rate || giftSats === null || total === null) return;
    setError(null);
    setBusy('Preparing…');
    try {
      const link: CardLink = {
        ...shop,
        giverLockingBytecode: lockingBytecodeOf(giverAddress),
        expiry,
        maxFee: CARD_MAX_FEE,
        minChange: CARD_MIN_CHANGE,
        fromName: fromName.trim().slice(0, 40),
        cardPrivateKey: generatePrivateKey(),
      };
      const contract = cardContract(cardTermsOf(link), prov);
      const plan = planFunding(prov, coins ?? [], [contract.address], total, wallet.address('change', 0), `Give a ${money(usd)} Comeback Card for ${shop.shopName}`);
      setBusy(`Approve in ${walletName ?? 'your wallet'}…`);
      const signed = await wallet.sign(plan.wc, plan.inputPaths);
      if (!signed.ok) return setError({ plain: `The wallet did not sign: ${signed.error}` });
      setBusy('Sending to the network…');
      const r = await broadcastRaw(NET, signed.signedHex);
      if (!r.ok) return setError({ plain: explainNodeError(r.nodeError).plain, verbatim: r.nodeError });
      const c: GivenCard = {
        createdAt: Date.now(),
        net: NET,
        shopName: shop.shopName,
        usd,
        fundingTxid: r.txid,
        cardUrl: pageUrl('card.html', encodeCardLink(link)),
        expiry: expiry.toString(),
      };
      saveGiven(c);
      setGiven(c);
    } catch (e) {
      if (e instanceof NotEnoughCoins) setError({ plain: `Your wallet has ${formatSats(e.have)}; this card needs about ${formatSats(e.need)}.` });
      else setError({ plain: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="create-panel cc-form">
      <label className="cc-label">Amount</label>
      <Chips label="Amount" options={AMOUNTS.map((a) => ({ value: a, label: money(a) }))} value={usd} onChange={setUsd} disabled={!rate} />
      <label className="cc-label">Use by</label>
      <Chips label="Use by" options={DAYS.map((d) => ({ value: d, label: dayFromNow(d) }))} value={days} onChange={setDays} />
      <label className="cc-label" htmlFor="cc-from">
        From (optional)
      </label>
      <input id="cc-from" className="cc-input" value={fromName} maxLength={40} placeholder="Your name" onChange={(e) => setFromName(e.target.value)} />

      <div className="cc-sum">
        <div>
          <span>Gift</span>
          <strong>{money(usd)}</strong>
        </div>
        <div>
          <span>Network fee reserve, paid by you</span>
          <strong>{formatUsd(CARD_FEE_RESERVE_SATS, rate ?? null) ?? formatSats(CARD_FEE_RESERVE_SATS)}</strong>
        </div>
        <p className="muted small">
          The shop gets the full amount of every payment. The reserve pays the network fee of each payment (about $0.001); what it doesn’t use stays on the card.
          {rate ? ` ${formatSats(total ?? 0n)} at $${rate.toFixed(2)}/BCH.` : rate === undefined ? ' Loading the BCH price…' : ' The price service is not answering; try again shortly.'}
        </p>
      </div>
      {scanError && <Notice kind="warn">{scanError}</Notice>}
      {balance !== null && total !== null && balance < total + 1_000n && (
        <Notice kind="warn">
          Not enough coins in {walletName ?? 'your wallet'} ({formatSats(balance)}). {NET === 'chipnet' ? 'Get test coins first.' : 'Add a little BCH, then press ↻.'}
        </Notice>
      )}
      <button type="button" className="btn btn-primary btn-create" disabled={!canGive} onClick={give}>
        {busy ?? `Give a ${money(usd)} card`}
      </button>
      {error && (
        <Notice kind="bad">
          {error.plain}
          {error.verbatim && <pre className="node">{error.verbatim}</pre>}
        </Notice>
      )}
      <p className="muted small">
        One transaction on Bitcoin Cash {NET}. Whatever is left after {formatDate(expiry)} can only go back to <span className="addr">{giverAddress}</span>.{' '}
        {walletName ?? 'Wallet'}: {balance === null ? 'reading coins…' : formatSats(balance)}{' '}
        <button type="button" className="btn-mini" onClick={scan} aria-label="Read the wallet’s coins again">
          ↻
        </button>
      </p>
    </div>
  );
}

function GivenView({ c }: { c: GivenCard }) {
  return (
    <div className="create-panel">
      <Notice kind="ok">
        <strong>Your {money(c.usd)} card is ready.</strong> <TxLink net={c.net} txid={c.fundingTxid} label="See the transaction" />
      </Notice>
      <p>Send this link to the person you’re giving it to. Whoever has the link can spend the card at {c.shopName}, in parts.</p>
      <div className="create-actions">
        <a className="btn btn-primary" href={c.cardUrl} target="_blank" rel="noreferrer">
          Open the card
        </a>
        <CopyButton text={c.cardUrl} label="Copy card link" />
        <QrReveal text={c.cardUrl} label="QR" warning="Anyone who scans this can spend the card at the shop. Show it only to the person you’re giving it to." />
      </div>
      <p className="muted small">
        Saved in this browser only. You also know this link, so you could spend the card at the same shop yourself; after {formatDay(BigInt(c.expiry))} what’s left can only go back to you.
      </p>
    </div>
  );
}
