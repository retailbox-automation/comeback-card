// Campaign page: every stamp of a campaign and what happened to it, read from the chain.
// The list of stamps is the campaign link itself (public keys after the #); there is no database.
import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { TransactionBuilder, placeholderSignature } from 'cashscript';
import '../src/ui/theme.css';
import { Banner, Footer, Header, Notice, TxLink, formatDate, usePoll } from '../src/ui/common';
import { PREFIX, broadcastRaw, medianTimePast, provider, type ChainNet } from '../src/core/chain';
import { decodeCampaignLink, termsFor, type CampaignLink } from '../src/core/link';
import { addressOf, buildReclaimCov, lockingBytecodeOf, stampContract } from '../src/core/stamp';
import { readerFor, stampState, type StampState } from '../src/core/status';
import { formatSats, formatUsd, usdPerBch } from '../src/core/price';
import { explainNodeError, stampPhase } from '../src/core/view';
import { WizardWallet, type WalletState } from '../src/core/wallet';

type Parsed = { ok: true; link: CampaignLink } | { ok: false; error: string };
function parse(): Parsed {
  if (!location.hash || location.hash.length < 10) return { ok: false, error: 'This page needs a campaign link.' };
  try {
    return { ok: true, link: decodeCampaignLink(location.hash) };
  } catch (e) {
    return { ok: false, error: `This campaign link is damaged (${e instanceof Error ? e.message : 'unknown error'}).` };
  }
}

function App() {
  const parsed = useMemo(parse, []);
  if (!parsed.ok) {
    return (
      <>
        <Banner />
        <div className="wrap">
          <Header net="mainnet" />
          <Notice kind="bad">{parsed.error}</Notice>
        </div>
      </>
    );
  }
  return <CampaignView link={parsed.link} />;
}

type Row = { i: number; contract: ReturnType<typeof stampContract>; state: StampState | null };
type ReturnResult = { ok: true; txid: string; sats: bigint } | { ok: false; plain: string; verbatim?: string };

function CampaignView({ link }: { link: CampaignLink }) {
  const net: ChainNet = link.net;
  const prov = useMemo(() => provider(net), [net]);
  const contracts = useMemo(() => link.stampPublicKeys.map((pk) => stampContract(termsFor(link, pk), prov)), [link, prov]);
  const sponsorLB = useMemo(
    () => (link.variant === 'cov' ? link.sponsor : lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: link.sponsor, prefix: PREFIX[net] }).address)),
    [link, net],
  );
  const sponsorAddress = useMemo(() => addressOf(sponsorLB, PREFIX[net]), [sponsorLB, net]);
  const shopAddress = useMemo(() => addressOf(link.merchantLockingBytecode, PREFIX[net]), [link, net]);

  const [rows, setRows] = useState<Row[]>(contracts.map((contract, i) => ({ i, contract, state: null })));
  const [error, setError] = useState<string | null>(null);
  const [mtp, setMtp] = useState<bigint | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [returning, setReturning] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, ReturnResult>>({});

  usePoll(
    async () => {
      const states = await Promise.all(
        contracts.map((c) => stampState(readerFor(c), c.lockingBytecode, link.merchantLockingBytecode, sponsorLB)),
      );
      setRows(contracts.map((contract, i) => ({ i, contract, state: states[i]! })));
      setError(null);
    },
    6000,
    [contracts],
    () => setError('Cannot reach the Bitcoin Cash network right now. Retrying…'),
  );
  usePoll(async () => setMtp(await medianTimePast(net)), 60_000, [net]);
  usePoll(async () => setRate(await usdPerBch()), 60_000, []);

  const count = (k: StampState['kind']) => rows.filter((r) => r.state?.kind === k).length;
  const expiredByNetwork = mtp !== null && mtp >= link.expiry;

  async function returnCov(r: Row) {
    setReturning(r.i);
    try {
      const utxos = (await prov.getUtxos(r.contract.address)).filter((u) => !u.token);
      if (utxos.length === 0) {
        setResults((x) => ({ ...x, [r.i]: { ok: false, plain: 'This stamp has no coins any more: it was just spent or returned.' } }));
        return;
      }
      const { builder, fee } = buildReclaimCov(r.contract, prov, utxos[0]!, sponsorLB, link.expiry);
      const sent = await broadcastRaw(net, builder.build());
      if (sent.ok) {
        // The contract allows exactly one output, to the sponsor: stamp value minus the fee.
        setResults((x) => ({ ...x, [r.i]: { ok: true, txid: sent.txid, sats: utxos[0]!.satoshis - fee } }));
      } else {
        const ex = explainNodeError(sent.nodeError);
        setResults((x) => ({ ...x, [r.i]: { ok: false, plain: ex.plain, verbatim: sent.nodeError } }));
      }
    } catch (e) {
      setResults((x) => ({ ...x, [r.i]: { ok: false, plain: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setReturning(null);
    }
  }

  return (
    <>
      <Banner />
      <div className="wrap">
        <Header net={net} />
        <h1>Campaign: {link.campaignName}</h1>
        <p className="lead">
          {link.stampPublicKeys.length} stamp{link.stampPublicKeys.length > 1 ? 's' : ''} for {link.merchantName}. Unspent stamps can go back to the
          sponsor after {formatDate(link.expiry)}.
        </p>
        <div className="stats">
          <div className="stat spent">
            Spent at the shop<b>{count('spent')}</b>
          </div>
          <div className="stat">
            Returned to sponsor<b>{count('returned')}</b>
          </div>
          <div className="stat">
            Waiting<b>{count('waiting')}</b>
          </div>
        </div>
        {error && <Notice kind="warn">{error}</Notice>}
        {expiredByNetwork && count('waiting') > 0 && (
          <Notice kind="warn">
            These stamps have expired. Each one goes back to the sponsor once anyone presses “Return”. Until then it can still be spent at the shop:
            the network keeps whichever transaction it sees first.
          </Notice>
        )}

        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Stamp</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <StampRow
                  key={r.i}
                  r={r}
                  net={net}
                  rate={rate}
                  mtp={mtp}
                  expiry={link.expiry}
                  variant={link.variant}
                  returning={returning === r.i}
                  onReturn={() => returnCov(r)}
                  result={results[r.i]}
                  sponsorAddress={sponsorAddress}
                />
              ))}
            </tbody>
          </table>
        </div>

        {link.variant === 'sig' && expiredByNetwork && count('waiting') > 0 && (
          <SponsorSignReturn link={link} rows={rows} net={net} sponsorAddress={sponsorAddress} />
        )}

        <div className="card">
          <h2>What these numbers mean</h2>
          <p className="muted">
            “Spent at the shop” counts stamps whose coins went to the shop’s address <span className="addr">{shopAddress}</span>, each with a link to its
            transaction. It does not prove a purchase: a shop could open stamp links and spend them itself, the same risk as a paper coupon.
          </p>
          <p className="muted small">
            Sponsor address (where returns go): <span className="addr">{sponsorAddress}</span>. Statuses are read live from public Bitcoin Cash nodes; this
            page stores nothing.
          </p>
        </div>
        <Footer />
      </div>
    </>
  );
}

function StampRow({
  r,
  net,
  rate,
  mtp,
  expiry,
  variant,
  returning,
  onReturn,
  result,
  sponsorAddress,
}: {
  r: Row;
  net: ChainNet;
  rate: number | null;
  mtp: bigint | null;
  expiry: bigint;
  variant: 'sig' | 'cov';
  returning: boolean;
  onReturn: () => void;
  result: ReturnResult | undefined;
  sponsorAddress: string;
}) {
  const s = r.state;
  const phase = stampPhase(s, mtp, expiry);
  const amount = s && 'satoshis' in s ? s.satoshis : s && 'paidSatoshis' in s ? s.paidSatoshis : null;
  const conf = (c: boolean) => (c ? 'confirmed' : '0-conf');
  return (
    <>
      <tr>
        <td>#{r.i + 1}</td>
        <td>
          {phase.phase === 'loading' && <span className="pill zero">checking…</span>}
          {phase.phase === 'not-funded' && <span className="pill zero">not funded yet</span>}
          {phase.phase === 'active' && <span className="pill waiting">waiting</span>}
          {phase.phase === 'expired-open' && <span className="pill waiting">expired · not yet returned</span>}
          {phase.phase === 'spent' && <span className="pill spent">spent at the shop · {conf(phase.confirmed)}</span>}
          {phase.phase === 'returned' && <span className="pill returned">returned · {conf(phase.confirmed)}</span>}
          {phase.phase === 'other' && <span className="pill bad">moved elsewhere</span>}
        </td>
        <td>{amount !== null ? <>{formatSats(amount)}{rate ? <div className="muted small">{formatUsd(amount, rate)}</div> : null}</> : '…'}</td>
        <td>
          {s && 'spend' in s ? <TxLink net={net} txid={s.spend.txid} /> : s && 'funding' in s ? <TxLink net={net} txid={s.funding.txid} label="funding" /> : null}
          {phase.phase === 'expired-open' && variant === 'cov' && !result?.ok && (
            <div style={{ marginTop: 6 }}>
              <button className="inline" onClick={onReturn} disabled={returning}>{returning ? 'Returning…' : 'Return to sponsor'}</button>
            </div>
          )}
        </td>
      </tr>
      {result && (
        <tr>
          <td colSpan={4}>
            {result.ok ? (
              <Notice kind="ok">
                Returned {formatSats(result.sats)} to the sponsor, <span className="addr">{sponsorAddress}</span>. <TxLink net={net} txid={result.txid} />
              </Notice>
            ) : (
              <Notice kind={explainNodeError(result.verbatim ?? '').cls === 'already-gone' ? 'warn' : 'bad'}>
                {result.plain}
                {result.verbatim && <pre className="node">{result.verbatim}</pre>}
              </Notice>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Variant A (behind the VITE_STAMP_VARIANT=sig flag): the sponsor's wallet signs each return. */
function SponsorSignReturn({ link, rows, net, sponsorAddress }: { link: CampaignLink; rows: Row[]; net: ChainNet; sponsorAddress: string }) {
  const [ws, setWs] = useState<WalletState>({ kind: 'idle' });
  const [log, setLog] = useState<string[]>([]);
  const walletRef = useRef<WizardWallet | null>(null);
  if (!walletRef.current) walletRef.current = new WizardWallet('First Purchase', undefined, setWs);
  const wallet = walletRef.current;
  const prov = useMemo(() => provider(net), [net]);

  async function returnAll() {
    for (const r of rows.filter((x) => x.state?.kind === 'waiting')) {
      const utxos = (await prov.getUtxos(r.contract.address)).filter((u) => !u.token);
      if (!utxos[0]) continue;
      const make = (amount: bigint) =>
        new TransactionBuilder({ provider: prov })
          .setLocktime(Number(link.expiry))
          .addInput(utxos[0]!, r.contract.unlock.reclaim!(placeholderSignature()))
          .addOutput({ to: sponsorAddress, amount });
      const fee = BigInt(make(utxos[0]!.satoshis - 2_000n).getTransactionSize()) + 10n;
      const signed = await wallet.sign(make(utxos[0]!.satoshis - fee).generateWcTransactionObject({ broadcast: false, userPrompt: `Return stamp #${r.i + 1}` }), [[0, 'receive', 0]]);
      if (!signed.ok) {
        setLog((l) => [...l, `#${r.i + 1}: wallet did not sign (${signed.error})`]);
        continue;
      }
      const sent = await broadcastRaw(net, signed.signedHex);
      setLog((l) => [...l, sent.ok ? `#${r.i + 1}: returned, tx ${sent.txid}` : `#${r.i + 1}: ${explainNodeError(sent.nodeError).plain} (${sent.nodeError})`]);
    }
  }

  return (
    <div className="card">
      <h2>Return expired stamps (sponsor signs)</h2>
      <p className="muted small">
        Your wallet will ask you to sign each return. Some wallets (Selene) show only the network fee as the amount, about 300 sats, not the stamp
        coming back: that is expected.
      </p>
      {ws.kind !== 'connected' ? (
        <button onClick={() => wallet.start()}>Connect the sponsor wallet</button>
      ) : (
        <button onClick={returnAll}>Return all expired stamps</button>
      )}
      {ws.kind === 'pairing' && <p className="addr small">{ws.uri}</p>}
      {log.map((l) => (
        <div key={l} className="small">{l}</div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
