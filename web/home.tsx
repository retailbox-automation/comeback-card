// Home: what First Purchase is, and "Create stamps" with a wallet over WizardConnect.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeCashAddress, generatePrivateKey } from '@bitauth/libauth';
import '../src/ui/theme.css';
import { Banner, CopyButton, Footer, Header, Notice, Qr, TxLink, formatDate } from '../src/ui/common';
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

function App() {
  return (
    <>
      <Banner />
      <div className="wrap">
        <Header net={NET} />
        <h1>A $0.25 stamp that can only be spent at one shop.</h1>
        <p className="lead">
          Hand out Bitcoin Cash that turns into a first purchase. Each stamp is a tiny contract: it pays one shop, or goes back to you after
          the date you pick. The person who gets it needs no wallet.
        </p>
        <Notice kind="ok">
          Gift links elsewhere hand out coins that can go anywhere. These are locked to one shop <strong>inside the coin itself</strong>, with
          no server holding them. Open a stamp and press “Try to send it anywhere else”: the network refuses.
        </Notice>
        <Create />
        <MyCampaigns />
        <HowItWorks />
        <Footer />
      </div>
    </>
  );
}

function Create() {
  const [ws, setWs] = useState<WalletState>({ kind: 'idle' });
  const walletRef = useRef<WizardWallet | null>(null);
  if (!walletRef.current) walletRef.current = new WizardWallet('First Purchase', new URL('./favicon.svg', location.href).toString(), setWs);
  const wallet = walletRef.current;
  useEffect(() => () => wallet.stop(), [wallet]);

  return (
    <div className="card" id="create">
      <h2>Create stamps</h2>
      {ws.kind === 'idle' && (
        <>
          <p className="muted">Connect a Bitcoin Cash wallet that speaks WizardConnect: Selene (2026.10 or newer), Cashonize or Paytaca.</p>
          <button onClick={() => wallet.start()}>Connect wallet</button>
        </>
      )}
      {ws.kind === 'pairing' && (
        <>
          <p>Scan this code with your wallet’s WizardConnect scanner, or copy the link into the wallet.</p>
          <Qr text={ws.qrUri} />
          <div className="row">
            <CopyButton text={ws.uri} label="Copy pairing link" />
            <button className="secondary inline" onClick={() => wallet.stop()}>Cancel</button>
          </div>
          <p className="muted small">{ws.relayUp ? 'Waiting for your wallet…' : 'Opening a secure channel…'} Do not show this code on a stream: whoever scans it first gets the session.</p>
        </>
      )}
      {ws.kind === 'relay-down' && (
        <>
          <Notice kind="warn">{ws.message}</Notice>
          <button onClick={() => wallet.start()}>Try again</button>
        </>
      )}
      {ws.kind === 'awaiting-approval' && <Notice kind="info">Approve the connection in {ws.walletName ?? 'your wallet'}.</Notice>}
      {ws.kind === 'reconnecting' && <Notice kind="info">The connection dropped for a moment. Reconnecting…</Notice>}
      {ws.kind === 'disconnected' && (
        <>
          <Notice kind="warn">The wallet disconnected{ws.message ? `: ${ws.message}` : ''}.</Notice>
          <button onClick={() => wallet.start()}>Connect again</button>
        </>
      )}
      {ws.kind === 'connected' && <Connected wallet={wallet} walletName={ws.walletName} />}
    </div>
  );
}

function Connected({ wallet, walletName }: { wallet: WizardWallet; walletName: string | null }) {
  const walletNet = wallet.network();
  const sponsorAddress = useMemo(() => (walletNet === NET ? wallet.address('receive', 0) : ''), [wallet, walletNet]);
  const prov = useMemo(() => provider(NET), []);
  const [coins, setCoins] = useState<WalletCoin[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);

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
      <Notice kind="bad">
        {walletName ?? 'Your wallet'} is on {walletNet === 'unknown' ? 'an unknown network' : walletNet}. This site runs on {NET}. Switch the
        wallet’s network, then connect again.
      </Notice>
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
  const canCreate = shopCheck.ok && satsPerStamp >= MIN_STAMP_SATS && count >= 1 && count <= 10 && !busy && !created;

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

  return (
    <>
      <Notice kind="ok">
        Connected: {walletName ?? 'wallet'} · {NET} · balance {balance === null ? '…' : `${formatSats(balance)}${rate ? ` (${formatUsd(balance, rate)})` : ''}`}{' '}
        <button className="secondary inline" onClick={scan}>Refresh</button>
      </Notice>
      {scanError && <Notice kind="warn">{scanError}</Notice>}
      {balance !== null && balance < total + 2_000n && (
        <Notice kind="warn">
          Not enough coins for {count} stamp{count > 1 ? 's' : ''}. {NET === 'chipnet' ? 'Get free test coins at tbch.googol.cash, then press Refresh.' : 'Add a little BCH, then press Refresh.'}
        </Notice>
      )}

      <label>Shop</label>
      <div className="choices">
        <label>
          <input type="radio" checked={shopMode === 'demo'} onChange={() => setShopMode('demo')} />
          {DEMO_SHOP.name}
        </label>
        <label>
          <input type="radio" checked={shopMode === 'own'} onChange={() => setShopMode('own')} />
          My own shop address
        </label>
      </div>
      {shopMode === 'own' && (
        <>
          <input type="text" placeholder={`${PREFIX[NET]}:q…`} value={ownShop} onChange={(e) => setOwnShop(e.target.value)} spellCheck={false} autoComplete="off" />
          <div style={{ height: 8 }} />
          <input type="text" placeholder="Shop name (shown on the stamp)" value={ownShopName} maxLength={40} onChange={(e) => setOwnShopName(e.target.value)} />
          {!shopCheck.ok && shopAddressInput && <Notice kind="warn">{shopCheck.why}</Notice>}
        </>
      )}

      <label>Amount per stamp</label>
      <div className="choices">
        {[0.25, 0.5, 1].map((v) => (
          <label key={v}>
            <input type="radio" checked={usd === v} onChange={() => setUsd(v)} disabled={!rate} />${v.toFixed(2)}
          </label>
        ))}
      </div>
      <p className="muted small">
        = {formatSats(satsPerStamp)} per stamp{rate ? ` at $${rate.toFixed(2)}/BCH` : ' (price service unavailable, using a fixed amount)'}
        {NET === 'chipnet' ? '. Test coins have no value.' : '.'}
      </p>

      <div className="row">
        <div>
          <label htmlFor="count">How many</label>
          <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="days">Unspent stamps come back to you after</label>
          <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>
      <label htmlFor="cname">Campaign name</label>
      <input id="cname" type="text" value={campaignName} maxLength={40} onChange={(e) => setCampaignName(e.target.value)} />

      <p className="muted small" style={{ marginTop: 12 }}>
        One transaction on Bitcoin Cash {NET}. Locks {formatSats(total)} into {count} stamp contract{count > 1 ? 's' : ''} for{' '}
        {shopCheck.ok ? shopCheck.name : 'the shop'}. Network fee about $0.001. Anything not spent by {formatDate(expiry)} can only go back to{' '}
        <span className="addr">{sponsorAddress}</span>.
      </p>
      <button onClick={create} disabled={!canCreate}>
        {busy ?? `Create ${count} stamp${count > 1 ? 's' : ''}`}
      </button>
      {error && (
        <Notice kind="bad">
          {error.plain}
          {error.verbatim && <pre className="node">{error.verbatim}</pre>}
        </Notice>
      )}
    </>
  );
}

function CreatedView({ c }: { c: Created }) {
  const [qrFor, setQrFor] = useState<number | null>(null);
  return (
    <>
      <Notice kind="ok">
        <strong>{c.stampUrls.length} stamp{c.stampUrls.length > 1 ? 's' : ''} created.</strong> <TxLink net={c.net} txid={c.fundingTxid} label="See the transaction" />
      </Notice>
      <p>
        Open a stamp on your phone (or in a new tab) and press <strong>Buy</strong>. Then open another one and press <strong>Try to send it anywhere else</strong>.
      </p>
      <table>
        <tbody>
          {c.stampUrls.map((u, i) => (
            <tr key={u}>
              <td>Stamp {i + 1}</td>
              <td style={{ textAlign: 'right' }}>
                <a className="button inline" style={{ width: 'auto', padding: '8px 12px', fontSize: 14 }} href={u} target="_blank" rel="noreferrer">
                  Open
                </a>{' '}
                <CopyButton text={u} />{' '}
                <button className="secondary inline" onClick={() => setQrFor(qrFor === i ? null : i)}>{qrFor === i ? 'Hide QR' : 'QR'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {qrFor !== null && (
        <>
          <Qr text={c.stampUrls[qrFor]!} />
          <p className="muted small" style={{ textAlign: 'center' }}>Anyone who scans this can spend the stamp. Do not show it on a stream.</p>
        </>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <a className="button secondary" href={c.campaignUrl} target="_blank" rel="noreferrer">Track this campaign</a>
        <a className="button secondary" href={`./shop.html#a=${encodeURIComponent(DEMO_SHOP.address[c.net])}&n=${encodeURIComponent(DEMO_SHOP.name)}`} target="_blank" rel="noreferrer">
          Open the shop counter
        </a>
      </div>
      <p className="muted small">Saved in this browser only. Stamp links hold the stamp keys: share each one with one person.</p>
    </>
  );
}

function MyCampaigns() {
  const list = useMemo(loadCreated, []);
  if (list.length === 0) return null;
  return (
    <div className="card">
      <h2>Your campaigns in this browser</h2>
      <table>
        <tbody>
          {list.map((c) => (
            <tr key={c.fundingTxid}>
              <td>
                {c.campaignName}
                <div className="muted small">
                  {c.stampUrls.length} × {formatSats(BigInt(c.satsPerStamp))} · {c.merchantName}
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <a href={c.campaignUrl} target="_blank" rel="noreferrer">Open</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="card">
      <h2>How it works</h2>
      <p className="muted">Every stamp is its own coin locked by a small CashScript contract with two ways out:</p>
      <pre className="node" style={{ background: '#13241b', color: '#d7f5e3' }}>{`spend(sig stampSig)   // anyone holding the stamp link
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
        Honest limits: a shop could open stamp links and spend them itself, the same risk as a paper coupon. So the campaign page counts
        “spent at the shop” with a link to each transaction, not “purchases”. After the expiry date a stamp can still be spent until someone
        returns it; the network keeps whichever comes first.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
