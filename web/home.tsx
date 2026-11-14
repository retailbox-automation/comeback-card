// Home: what First Purchase is, and "Create stamps" with a wallet over WizardConnect.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeCashAddress, generatePrivateKey } from '@bitauth/libauth';
import '../src/ui/theme.css';
import { Banner, CopyButton, Footer, Notice, QrReveal, TxLink, formatDate, formatDay } from '../src/ui/common';
import { NetworkRail } from '../src/ui/NetworkRail';
import { CreateCard, CreateForm, CreatePreviewRows, HomeHero, HowItWorks, MyCampaigns, WalletLine } from '../src/ui/screens/home';
import { DEMO_SHOP, NET, STAMP_VARIANT } from '../src/config';
import { PREFIX, broadcastRaw, provider } from '../src/core/chain';
import { WizardWallet, type WalletState } from '../src/core/wallet';
import { NotEnoughCoins, planFunding, type WalletCoin } from '../src/core/create';
import { encodeCampaignLink, encodeStampLink, termsFor, type CampaignTerms } from '../src/core/link';
import { DEFAULT_MAX_FEE, MIN_STAMP_SATS, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';
import { formatSats, formatUsd, usdPerBch, usdToSats } from '../src/core/price';
import { explainNodeError } from '../src/core/view';

const SCAN_DEPTH = 20;
const STORE = 'first-purchase-campaigns-v1';
const REFUSE_ID = 'refuse';
const DAY_CHOICES = [1, 7, 30];

type Created = {
  createdAt: number;
  net: typeof NET;
  campaignName: string;
  merchantName: string;
  fundingTxid: string;
  campaignUrl: string;
  stampUrls: string[];
  satsPerStamp: string;
  expiry: string;
};

function loadCreated(): Created[] {
  try {
    return (JSON.parse(localStorage.getItem(STORE) ?? '[]') as Created[]).filter((c) => c.net === NET);
  } catch {
    return [];
  }
}
function saveCreated(c: Created) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Created[];
    localStorage.setItem(STORE, JSON.stringify([c, ...all].slice(0, 20)));
  } catch {
    /* private mode: the result is still on screen */
  }
}

const pageUrl = (page: string, fragment: string) => new URL(`./${page}#${fragment}`, location.href).toString();
const dayFromNow = (days: number) => formatDay(BigInt(Math.floor(Date.now() / 1000) + days * 86400));

function App() {
  const mine = useMemo(loadCreated, []);
  const latest = mine[0];
  return (
    <div className="home">
      <Banner />
      <HomeHero net={NET} create={<Create />} preview={{ shopName: DEMO_SHOP.name, amount: '$0.25' }} refuseHref={`#${REFUSE_ID}`} />
      <NetworkRail amount="$0.25" shopName="Maple Street Coffee" refuseHref={`#${REFUSE_ID}`} />
      <MyCampaigns
        list={mine.map((c) => ({
          key: c.fundingTxid,
          name: c.campaignName,
          detail: `${c.stampUrls.length} × ${formatSats(BigInt(c.satsPerStamp))} · ${c.merchantName}`,
          href: c.campaignUrl,
        }))}
      />
      <HowItWorks refuseId={REFUSE_ID} yourStamps={latest ? latest.stampUrls.map((href, i) => ({ label: `Stamp ${i + 1}`, href })) : []} />
      <Footer />
    </div>
  );
}

function Create() {
  const [ws, setWs] = useState<WalletState>({ kind: 'idle' });
  const walletRef = useRef<WizardWallet | null>(null);
  if (!walletRef.current) {
    // Dev-only hook for the red-team check "relay is down": ?relays=wss://host1,wss://host2
    const devRelays = import.meta.env.DEV ? new URLSearchParams(location.search).get('relays') : null;
    walletRef.current = new WizardWallet(
      'First Purchase',
      new URL('./favicon.svg', location.href).toString(),
      setWs,
      devRelays ? devRelays.split(',') : undefined,
    );
  }
  const wallet = walletRef.current;
  useEffect(() => () => wallet.stop(), [wallet]);
  const notConnectedFoot = <WalletLine connected={false} text="WizardConnect: Selene (2026.10 or newer), Cashonize or Paytaca" />;

  if (ws.kind === 'connected') {
    return (
      <CreateCard>
        <Connected wallet={wallet} walletName={ws.walletName} />
      </CreateCard>
    );
  }

  return (
    <CreateCard>
      {ws.kind === 'idle' && (
        <>
          <CreatePreviewRows shopName={DEMO_SHOP.name} expiryDay={dayFromNow(7)} />
          <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
            Connect wallet
          </button>
          {notConnectedFoot}
        </>
      )}
      {ws.kind === 'pairing' && (
        <div className="create-panel">
          <p>Scan the code with your wallet’s WizardConnect scanner, or copy the link into the wallet.</p>
          <div className="create-actions">
            <CopyButton text={ws.uri} label="Copy pairing link" />
            <QrReveal text={ws.qrUri} label="Show QR code" warning="Do not show this code on a stream: whoever scans it first gets the session." />
            <button type="button" className="btn-mini" onClick={() => wallet.stop()}>
              Cancel
            </button>
          </div>
          <p className="muted small">{ws.relayUp ? 'Waiting for your wallet…' : 'Opening a secure channel…'}</p>
          {notConnectedFoot}
        </div>
      )}
      {ws.kind === 'relay-down' && (
        <div className="create-panel">
          <Notice kind="warn">{ws.message}</Notice>
          <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
            Try again
          </button>
          {notConnectedFoot}
        </div>
      )}
      {ws.kind === 'awaiting-approval' && (
        <div className="create-panel">
          <Notice kind="info">Approve the connection in {ws.walletName ?? 'your wallet'}.</Notice>
          {notConnectedFoot}
        </div>
      )}
      {ws.kind === 'reconnecting' && (
        <div className="create-panel">
          <Notice kind="info">The connection dropped for a moment. Reconnecting…</Notice>
          {notConnectedFoot}
        </div>
      )}
      {ws.kind === 'disconnected' && (
        <div className="create-panel">
          <Notice kind="warn">The wallet disconnected{ws.message ? `: ${ws.message}` : ''}.</Notice>
          <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
            Connect again
          </button>
          {notConnectedFoot}
        </div>
      )}
    </CreateCard>
  );
}

function Connected({ wallet, walletName }: { wallet: WizardWallet; walletName: string | null }) {
  const walletNet = wallet.network();
  const sponsorAddress = useMemo(() => (walletNet === NET ? wallet.address('receive', 0) : ''), [wallet, walletNet]);
  const prov = useMemo(() => provider(NET), []);
  const [coins, setCoins] = useState<WalletCoin[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  // undefined while the price is loading, null if the price service did not answer.
  const [rate, setRate] = useState<number | null | undefined>(undefined);

  const [shopMode, setShopMode] = useState<'demo' | 'own'>('demo');
  const [ownShop, setOwnShop] = useState('');
  const [ownShopName, setOwnShopName] = useState('');
  const [usd, setUsd] = useState(0.25);
  const [count, setCount] = useState(2);
  const [days, setDays] = useState(7);
  const [campaignName, setCampaignName] = useState('My first stamps');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ plain: string; verbatim?: string } | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

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
          {walletName ?? 'Your wallet'} is on {walletNet === 'unknown' ? 'an unknown network' : walletNet}. This site runs on {NET}. Switch the wallet’s
          network, then connect again.
        </Notice>
        <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
          Connect again
        </button>
      </div>
    );
  }

  const balance = coins?.reduce((s, c) => s + c.utxo.satoshis, 0n) ?? null;
  const satsPerStamp = rate ? usdToSats(usd, rate) : 110_000n;
  const shopAddressInput = ownShop.trim();
  const shopCheck = (() => {
    if (shopMode === 'demo') return { ok: true as const, address: DEMO_SHOP.address[NET], name: DEMO_SHOP.name };
    const d = decodeCashAddress(shopAddressInput);
    if (typeof d === 'string') return { ok: false as const, why: 'Paste the shop’s Bitcoin Cash address.' };
    if (d.prefix !== PREFIX[NET]) return { ok: false as const, why: `That address is not on ${NET}.` };
    if (d.type !== 'p2pkh' && d.type !== 'p2sh') return { ok: false as const, why: 'Use a regular (non-token) address.' };
    return { ok: true as const, address: shopAddressInput, name: ownShopName.trim() || 'My shop' };
  })();
  const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
  const total = satsPerStamp * BigInt(count);
  const canCreate =
    rate !== undefined && shopCheck.ok && satsPerStamp >= MIN_STAMP_SATS && count >= 1 && count <= 10 && !busy && !created;

  async function create() {
    if (!shopCheck.ok) return;
    setError(null);
    setBusy('Preparing…');
    try {
      const allCoins = coins ?? [];
      const merchantLB = lockingBytecodeOf(shopCheck.address);
      const terms: CampaignTerms = {
        net: NET,
        variant: STAMP_VARIANT,
        merchantLockingBytecode: merchantLB,
        sponsor: STAMP_VARIANT === 'cov' ? lockingBytecodeOf(sponsorAddress) : wallet.pubkey('receive', 0),
        expiry,
        maxFee: DEFAULT_MAX_FEE,
        merchantName: shopCheck.name.slice(0, 40),
      };
      const keys = Array.from({ length: count }, () => generatePrivateKey());
      const contracts = keys.map((k) => stampContract(termsFor(terms, publicKeyOf(k)), prov));
      const plan = planFunding(
        prov,
        allCoins,
        contracts.map((c) => c.address),
        satsPerStamp,
        wallet.address('change', 0),
        `Create ${count} First Purchase stamp${count > 1 ? 's' : ''} for ${terms.merchantName}`,
      );
      setBusy(`Approve in ${walletName ?? 'your wallet'}…`);
      const signed = await wallet.sign(plan.wc, plan.inputPaths);
      if (!signed.ok) {
        setError({ plain: `The wallet did not sign: ${signed.error}` });
        return;
      }
      setBusy('Sending to the network…');
      const r = await broadcastRaw(NET, signed.signedHex);
      if (!r.ok) {
        setError({ plain: explainNodeError(r.nodeError).plain, verbatim: r.nodeError });
        return;
      }
      const c: Created = {
        createdAt: Date.now(),
        net: NET,
        campaignName: campaignName.trim().slice(0, 40) || 'My stamps',
        merchantName: terms.merchantName,
        fundingTxid: r.txid,
        campaignUrl: pageUrl('campaign.html', encodeCampaignLink({ ...terms, campaignName: campaignName.trim().slice(0, 40) || 'My stamps', stampPublicKeys: keys.map(publicKeyOf) })),
        stampUrls: keys.map((k) => pageUrl('stamp.html', encodeStampLink({ ...terms, stampPrivateKey: k }))),
        satsPerStamp: satsPerStamp.toString(),
        expiry: expiry.toString(),
      };
      saveCreated(c);
      setCreated(c);
    } catch (e) {
      if (e instanceof NotEnoughCoins) {
        setError({ plain: `Your wallet has ${formatSats(e.have)}; these stamps need about ${formatSats(e.need)}.` });
      } else {
        setError({ plain: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(null);
    }
  }

  if (created) return <CreatedView c={created} />;

  const priceNote = rate ? ` at $${rate.toFixed(2)}/BCH` : rate === undefined ? ' (loading the BCH price…)' : ' (price service unavailable, using a fixed amount)';
  return (
    <CreateForm
      shopMode={shopMode}
      onShopMode={setShopMode}
      demoShopName={DEMO_SHOP.name}
      ownShop={ownShop}
      onOwnShop={setOwnShop}
      ownShopName={ownShopName}
      onOwnShopName={setOwnShopName}
      ownShopError={!shopCheck.ok && shopAddressInput ? shopCheck.why : null}
      addressPlaceholder={`${PREFIX[NET]}:q…`}
      usd={usd}
      usdOptions={[0.25, 0.5, 1]}
      onUsd={setUsd}
      usdDisabled={!rate}
      count={count}
      countOptions={[1, 2, 3, 4, 5, 10]}
      onCount={setCount}
      days={days}
      dayOptions={DAY_CHOICES.map((d) => ({ days: d, label: dayFromNow(d) }))}
      onDays={setDays}
      campaignName={campaignName}
      onCampaignName={setCampaignName}
      notices={
        <>
          {scanError && <Notice kind="warn">{scanError}</Notice>}
          {balance !== null && balance < total + 2_000n && (
            <Notice kind="warn">
              Not enough coins for {count} stamp{count > 1 ? 's' : ''}.{' '}
              {NET === 'chipnet' ? 'Get free test coins at tbch.googol.cash, then press ↻ next to the balance.' : 'Add a little BCH, then press ↻ next to the balance.'}
            </Notice>
          )}
        </>
      }
      buttonLabel={busy ?? `Create ${count} stamp${count > 1 ? 's' : ''}`}
      canCreate={canCreate}
      onCreate={create}
      details={
        <>
          One transaction on Bitcoin Cash {NET}, network fee about $0.001. Locks {formatSats(total)} into {count} stamp contract{count > 1 ? 's' : ''} for{' '}
          {shopCheck.ok ? shopCheck.name : 'the shop'} ({formatSats(satsPerStamp)} each{priceNote}
          {NET === 'chipnet' ? '; test coins have no value' : ''}). Anything not spent by {formatDate(expiry)} can only go back to{' '}
          <span className="addr">{sponsorAddress}</span>.
        </>
      }
      error={
        error && (
          <Notice kind="bad">
            {error.plain}
            {error.verbatim && <pre className="node">{error.verbatim}</pre>}
          </Notice>
        )
      }
      wallet={{
        name: walletName ?? 'WizardConnect',
        balance: balance === null ? null : `${formatSats(balance)}${rate ? ` (${formatUsd(balance, rate)})` : ''}`,
        onRefresh: scan,
      }}
    />
  );
}

function CreatedView({ c }: { c: Created }) {
  const n = c.stampUrls.length;
  return (
    <div className="create-panel">
      <Notice kind="ok">
        <strong>
          {n} stamp{n > 1 ? 's' : ''} created.
        </strong>{' '}
        <TxLink net={c.net} txid={c.fundingTxid} label="See the transaction" />
      </Notice>
      <p>
        Open a stamp on your phone (or in a new tab) and press <strong>Buy</strong>. Then open another one and press <strong>Try to send it anywhere else</strong>.
      </p>
      <ul className="create-done-list">
        {c.stampUrls.map((u, i) => (
          <li key={u}>
            <span>Stamp {i + 1}</span>
            <a className="btn-mini" href={u} target="_blank" rel="noreferrer">
              Open
            </a>
            <CopyButton text={u} />
            <QrReveal text={u} label="QR" warning="Anyone who scans this can spend the stamp. Do not show it on a stream." />
          </li>
        ))}
      </ul>
      <div className="create-links">
        <a className="btn btn-secondary" href={c.campaignUrl} target="_blank" rel="noreferrer">
          Track this campaign
        </a>
        <a
          className="btn btn-secondary"
          href={`./shop.html#a=${encodeURIComponent(DEMO_SHOP.address[c.net])}&n=${encodeURIComponent(DEMO_SHOP.name)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open the shop counter
        </a>
      </div>
      <p className="muted small">Saved in this browser only. Stamp links hold the stamp keys: share each one with one person.</p>
      <WalletLine connected text={<>Stamps for {c.merchantName} · back to you after {formatDay(BigInt(c.expiry))}</>} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
