// Stamp page: open a stamp link, pay the one shop it allows. No wallet, no account, no server of ours:
// the key is in the URL fragment (never sent anywhere), the transaction goes straight to a Fulcrum node.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeCashAddress, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import '../src/ui/theme.css';
import { Banner, Footer, Header, Notice, Sticker, TxLink, formatDate, usePoll } from '../src/ui/common';
import { decodeStampLink, termsFor, type StampLink } from '../src/core/link';
import { PREFIX, broadcastRaw, medianTimePast, provider, type ChainNet } from '../src/core/chain';
import { addressOf, buildSpend, buildSpendElsewhere, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';
import { readerFor, stampState, type StampState } from '../src/core/status';
import { formatSats, formatUsd, usdPerBch } from '../src/core/price';
import { explainNodeError, stampPhase } from '../src/core/view';
import { binToHex } from '@bitauth/libauth';

type Parsed = { ok: true; link: StampLink } | { ok: false; error: string };

function parse(): Parsed {
  if (!location.hash || location.hash.length < 10) return { ok: false, error: 'This page needs a stamp link. Open the link you were given.' };
  try {
    return { ok: true, link: decodeStampLink(location.hash) };
  } catch (e) {
    return { ok: false, error: `This stamp link is damaged or incomplete (${e instanceof Error ? e.message : 'unknown error'}). Ask for the link again.` };
  }
}

function sponsorLockingBytecode(link: StampLink): Uint8Array {
  if (link.variant === 'cov') return link.sponsor;
  return lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: link.sponsor, prefix: PREFIX[link.net] }).address);
}

function App() {
  const parsed = useMemo(parse, []);
  if (!parsed.ok) {
    return (
      <>
        <Banner />
        <div className="wrap narrow">
          <Header net="mainnet" />
          <Notice kind="bad">{parsed.error}</Notice>
          <a className="button secondary" href="./">What is First Purchase?</a>
        </div>
      </>
    );
  }
  return <StampView link={parsed.link} />;
}

function StampView({ link }: { link: StampLink }) {
  const net: ChainNet = link.net;
  const prov = useMemo(() => provider(net), [net]);
  const contract = useMemo(() => stampContract(termsFor(link, publicKeyOf(link.stampPrivateKey)), prov), [link, prov]);
  const merchantAddress = useMemo(() => addressOf(link.merchantLockingBytecode, PREFIX[net]), [link, net]);
  const sponsorLB = useMemo(() => sponsorLockingBytecode(link), [link]);

  const [state, setState] = useState<StampState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [mtp, setMtp] = useState<bigint | null>(null);
  const [buying, setBuying] = useState(false);
  // fromNode: the text is the node's verbatim answer; otherwise it is our own message (never labelled as the node's).
  const [buyResult, setBuyResult] = useState<{ ok: true; txid: string } | { ok: false; error: string; fromNode: boolean } | null>(null);

  usePoll(
    async () => {
      const s = await stampState(readerFor(contract), contract.lockingBytecode, link.merchantLockingBytecode, sponsorLB);
      setState(s);
      setLoadError(null);
    },
    4000,
    [contract],
    () => setLoadError('Cannot reach the Bitcoin Cash network right now. Retrying…'),
  );
  usePoll(async () => setRate(await usdPerBch()), 60_000, []);
  usePoll(async () => setMtp(await medianTimePast(net)), 60_000, [net]);

  const satoshis = state && 'satoshis' in state ? state.satoshis : state && 'paidSatoshis' in state ? state.paidSatoshis : null;
  const usd = satoshis !== null ? formatUsd(satoshis, rate) : null;
  const phase = stampPhase(state, mtp, link.expiry);

  async function buy() {
    setBuying(true);
    setBuyResult(null);
    try {
      const utxos = (await prov.getUtxos(contract.address)).filter((u) => !u.token);
      if (utxos.length === 0) {
        setBuyResult({ ok: false, fromNode: false, error: 'Someone was first: this stamp was already spent or returned to the sponsor. Its status below shows which.' });
        return;
      }
      const { builder } = buildSpend(contract, prov, utxos[0]!, link.stampPrivateKey, link.merchantLockingBytecode);
      const r = await broadcastRaw(net, builder.build());
      setBuyResult(r.ok ? { ok: true, txid: r.txid } : { ok: false, fromNode: true, error: r.nodeError });
    } catch (e) {
      setBuyResult({ ok: false, fromNode: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBuying(false);
    }
  }

  const shopLink = (txid: string) =>
    `./shop.html#a=${encodeURIComponent(merchantAddress)}&n=${encodeURIComponent(link.merchantName)}&tx=${txid}`;

  return (
    <>
      <Banner />
      <div className="wrap narrow">
        <Header net={net} />
        <div className="card stamp">
          <div className="muted">Your stamp</div>
          <div className="amount">{usd ?? (satoshis !== null ? formatSats(satoshis) : '…')}</div>
          <div>Spend it at</div>
          <div className="shop">{link.merchantName || 'this shop'}</div>
          <div className="muted small" style={{ marginTop: 8 }}>No wallet or app needed.</div>
        </div>

        {loadError && <Notice kind="warn">{loadError}</Notice>}
        {!state && !loadError && <Notice kind="info">Checking this stamp on the network…</Notice>}

        {state?.kind === 'not-funded' && (
          <Notice kind="warn">This stamp has no coins yet. If it was created a moment ago, wait a few seconds: this page checks again on its own.</Notice>
        )}

        {state?.kind === 'waiting' && !buyResult?.ok && (
          <>
            {phase.phase === 'expired-open' && (
              <Notice kind="warn">
                <strong>Expired on {formatDate(link.expiry)}.</strong> {phase.text}
              </Notice>
            )}
            <button onClick={buy} disabled={buying}>
              {buying ? 'Paying…' : `Buy at ${link.merchantName || 'this shop'}${usd ? ` · ${usd}` : ''}`}
            </button>
            <p className="muted small">
              Pays the whole stamp to {link.merchantName || 'the shop'} minus a network fee of about $0.001. Valid until {formatDate(link.expiry)}.
            </p>
          </>
        )}

        {buyResult && !buyResult.ok && !buyResult.fromNode && <Notice kind="warn">{buyResult.error}</Notice>}
        {buyResult && !buyResult.ok && buyResult.fromNode && (
          <Notice kind={explainNodeError(buyResult.error).cls === 'already-gone' ? 'warn' : 'bad'}>
            <strong>{explainNodeError(buyResult.error).plain}</strong>
            <div className="small" style={{ marginTop: 6 }}>The network’s own words:</div>
            <pre className="node">{buyResult.error}</pre>
          </Notice>
        )}

        <Outcome state={state} net={net} shop={link.merchantName} justPaid={buyResult?.ok ? buyResult.txid : null} shopLink={shopLink} />

        {state?.kind === 'waiting' && !buyResult?.ok && (
          <SendElsewhere link={link} net={net} contract={contract} prov={prov} merchantAddress={merchantAddress} />
        )}

        <div className="card">
          <h2>Why can’t this stamp be sent anywhere else?</h2>
          <p className="muted">
            The coins sit in a tiny Bitcoin Cash contract. Its rule: the money may go to exactly one address,{' '}
            <span className="addr">{merchantAddress}</span>, minus a capped fee. Every node checks that rule. If the stamp is not spent, the
            sponsor can take it back after {formatDate(link.expiry)}.
          </p>
          <p className="muted small">The key for this stamp lives only in this link (after the #). Browsers never send that part to any server.</p>
        </div>
        <Footer />
      </div>
    </>
  );
}

function Outcome({
  state,
  net,
  shop,
  justPaid,
  shopLink,
}: {
  state: StampState | null;
  net: ChainNet;
  shop: string;
  justPaid: string | null;
  shopLink: (txid: string) => string;
}) {
  const spent = state?.kind === 'spent' ? state : null;
  const txid = spent?.spend.txid ?? justPaid;
  if (txid) {
    const confirmed = spent?.spend.confirmed ?? false;
    return (
      <div className="card">
        <Notice kind="ok">
          <strong>Paid at {shop || 'the shop'}.</strong> {spent ? `${formatSats(spent.paidSatoshis)} received.` : ''}
        </Notice>
        <p>
          {confirmed ? (
            <span className="pill spent">Confirmed in block {spent!.spend.height}</span>
          ) : (
            <span className="pill zero">Received (0-conf) · waiting for a block</span>
          )}{' '}
          <TxLink net={net} txid={txid} />
        </p>
        <Sticker txid={txid} shop={shop} />
        <a className="button secondary" href={shopLink(txid)}>
          Open the shop counter
        </a>
        <p className="muted small">
          “0-conf” means every node has seen the payment; a block makes it final, usually within 10 minutes.
        </p>
      </div>
    );
  }
  if (state?.kind === 'returned') {
    return (
      <div className="card">
        <Notice kind="info">
          This stamp was not spent and went back to the sponsor: {formatSats(state.paidSatoshis)}.
        </Notice>
        <p>
          <span className={`pill ${state.spend.confirmed ? 'returned' : 'zero'}`}>{state.spend.confirmed ? 'Returned · confirmed' : 'Returned · 0-conf'}</span>{' '}
          <TxLink net={net} txid={state.spend.txid} />
        </p>
      </div>
    );
  }
  if (state?.kind === 'moved-elsewhere') {
    return (
      <Notice kind="warn">
        The coins left this stamp in a way this page does not recognise. <TxLink net={net} txid={state.spend.txid} />
      </Notice>
    );
  }
  return null;
}

function SendElsewhere({
  link,
  net,
  contract,
  prov,
  merchantAddress,
}: {
  link: StampLink;
  net: ChainNet;
  contract: ReturnType<typeof stampContract>;
  prov: ReturnType<typeof provider>;
  merchantAddress: string;
}) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'rejected'; nodeError: string } | { kind: 'input'; message: string } | { kind: 'accepted'; txid: string } | null>(null);

  async function attempt() {
    setResult(null);
    const addr = to.trim();
    const decoded = decodeCashAddress(addr.includes(':') ? addr : `${PREFIX[net]}:${addr}`);
    if (typeof decoded === 'string') return setResult({ kind: 'input', message: 'That does not look like a Bitcoin Cash address.' });
    if (decoded.prefix !== PREFIX[net]) {
      return setResult({ kind: 'input', message: `That address is for ${decoded.prefix === 'bitcoincash' ? 'mainnet' : 'a test network'}; this stamp lives on ${net}.` });
    }
    const target = lockingBytecodeOf(`${decoded.prefix}:${addr.includes(':') ? addr.split(':')[1] : addr}`);
    if (binToHex(target) === binToHex(link.merchantLockingBytecode)) {
      return setResult({ kind: 'input', message: `That is the shop’s own address (${merchantAddress}). Use “Buy” above to pay the shop.` });
    }
    setBusy(true);
    try {
      const utxos = (await prov.getUtxos(contract.address)).filter((u) => !u.token);
      if (utxos.length === 0) return setResult({ kind: 'input', message: 'This stamp has no coins right now.' });
      const { builder } = buildSpendElsewhere(contract, prov, utxos[0]!, link.stampPrivateKey, target);
      // Sent as-is, with no local check first: the refusal below comes from a Bitcoin Cash node.
      const r = await broadcastRaw(net, builder.build());
      setResult(r.ok ? { kind: 'accepted', txid: r.txid } : { kind: 'rejected', nodeError: r.nodeError });
    } catch (e) {
      setResult({ kind: 'input', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" id="try-elsewhere">
      <h2>Try to send it anywhere else</h2>
      <p className="muted">
        Paste any Bitcoin Cash address, your own wallet for example. We sign a transaction that sends this stamp there and hand it straight
        to the network. Watch what the network says.
      </p>
      <label htmlFor="to">Send to</label>
      <input id="to" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder={`${PREFIX[net]}:q…`} value={to} onChange={(e) => setTo(e.target.value)} />
      <div style={{ height: 10 }} />
      <button className="secondary" onClick={attempt} disabled={busy || to.trim().length < 20}>
        {busy ? 'Sending to the network…' : 'Send it there'}
      </button>
      {result?.kind === 'input' && <Notice kind="warn">{result.message}</Notice>}
      {result?.kind === 'rejected' && (
        <Notice kind="bad">
          <strong>Rejected by the network.</strong> The node’s own words:
          <pre className="node">{result.nodeError}</pre>
          <div style={{ marginTop: 8 }}>
            {explainNodeError(result.nodeError).cls === 'contract-refused'
              ? `In plain words: the contract inside this coin only lets it pay ${link.merchantName || 'the shop'}. Your stamp is untouched.`
              : explainNodeError(result.nodeError).plain}
          </div>
        </Notice>
      )}
      {result?.kind === 'accepted' && (
        <Notice kind="bad">
          Unexpected: the network accepted this transaction (<TxLink net={net} txid={result.txid} />). Please report it.
        </Notice>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
