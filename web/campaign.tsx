// Campaign page: every stamp of a campaign and what happened to it, read from the chain.
// The list of stamps is the campaign link itself (public keys after the #); there is no database.
import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { TransactionBuilder, placeholderSignature } from 'cashscript';
import '../src/ui/theme.css';
import { Banner, Footer, Notice, TxLink, formatDate, shortAddress, usePoll } from '../src/ui/common';
import { CampaignScreen, type CampaignRowView } from '../src/ui/screens/campaign';
import { DEMO_SHOP } from '../src/config';
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
      <div className="campaign-page">
        <Banner />
        <main>
          <div className="cp">
            <header className="cp-head">
              <a className="cp-brand" href="./">First Purchase</a>
            </header>
            <div className="cp-body">
              <Notice kind="bad">{parsed.error}</Notice>
            </div>
          </div>
        </main>
      </div>
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
  const shopName = link.merchantName || 'the shop';

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

  const rowViews: CampaignRowView[] = rows.map((r): CampaignRowView => {
    const s = r.state;
    const phase = stampPhase(s, mtp, link.expiry);
    const sats = s && 'satoshis' in s ? s.satoshis : s && 'paidSatoshis' in s ? s.paidSatoshis : null;
    const usd = sats !== null ? formatUsd(sats, rate) : null;
    const conf = (c: boolean) => (c ? 'confirmed' : '0-conf');
    const block = (seen: { confirmed: boolean; height: number }) => (seen.confirmed ? `block ${seen.height.toLocaleString('en-US')}` : 'no block yet');
    const n = `Stamp #${r.i + 1}`;
    const result = results[r.i];
    const base = {
      key: String(r.i),
      amount: sats === null ? null : usd ?? formatSats(sats),
      amountTitle: sats === null ? undefined : formatSats(sats),
      tx: s && 'spend' in s ? { txid: s.spend.txid, label: 'view' } : s && 'funding' in s ? { txid: s.funding.txid, label: 'view' } : null,
      result: result ? (
        result.ok ? (
          <Notice kind="ok">
            Returned {formatSats(result.sats)} to the sponsor, <span className="addr">{sponsorAddress}</span>. <TxLink net={net} txid={result.txid} />
          </Notice>
        ) : (
          <Notice kind={explainNodeError(result.verbatim ?? '').cls === 'already-gone' ? 'warn' : 'bad'}>
            {result.plain}
            {result.verbatim && <pre className="node">{result.verbatim}</pre>}
          </Notice>
        )
      ) : undefined,
    };
    switch (phase.phase) {
      case 'spent':
        return { ...base, tone: 'spent', title: `${n} spent at ${shopName}`, pill: { label: conf(phase.confirmed), tone: phase.confirmed ? 'green' : 'outline' }, when: s && 'spend' in s ? block(s.spend) : null };
      case 'returned':
        return { ...base, tone: 'returned', title: `${n} returned to the sponsor`, pill: { label: conf(phase.confirmed), tone: phase.confirmed ? 'grey' : 'outline' }, when: s && 'spend' in s ? block(s.spend) : null };
      case 'active':
        return { ...base, tone: 'waiting', title: `${n} is waiting to be spent`, pill: { label: 'waiting', tone: 'amber' }, when: s && 'funding' in s ? block(s.funding) : null };
      case 'expired-open':
        return {
          ...base,
          tone: 'expired',
          title: `${n} expired, not yet returned`,
          pill: { label: 'expired', tone: 'amber' },
          when: s && 'funding' in s ? block(s.funding) : null,
          action:
            link.variant === 'cov' && !result?.ok ? (
              <button type="button" className="btn btn-primary" onClick={() => returnCov(r)} disabled={returning === r.i}>
                {returning === r.i ? 'Returning…' : 'Return to sponsor'}
              </button>
            ) : undefined,
        };
      case 'not-funded':
        return { ...base, tone: 'pending', title: `${n} not funded yet`, pill: { label: 'not funded', tone: 'outline' }, when: null };
      case 'other':
        return { ...base, tone: 'bad', title: `${n} moved elsewhere`, pill: { label: 'moved', tone: 'red' }, when: null };
      case 'loading':
      default:
        return { ...base, tone: 'pending', title: `${n} checking…`, pill: { label: 'checking', tone: 'outline' }, when: null };
    }
  });

  return (
    <div className="campaign-page">
      <Banner />
      <main>
        <CampaignScreen
          net={net}
          name={link.campaignName}
          sponsor={{ label: shortAddress(sponsorAddress, 5, 5).replace(/^[a-z]+:/, ''), title: sponsorAddress }}
          shopName={shopName}
          showPhoto={shopAddress === DEMO_SHOP.address[net]}
          counts={{ spent: count('spent'), returned: count('returned'), waiting: count('waiting'), total: rows.length }}
          rows={rowViews}
          notices={
            <>
              {error && <Notice kind="warn">{error}</Notice>}
              {expiredByNetwork && count('waiting') > 0 && (
                <Notice kind="warn">
                  These stamps have expired. Each one goes back to the sponsor once anyone presses “Return”. Until then it can still be spent at the shop: the
                  network keeps whichever transaction it sees first.
                </Notice>
              )}
            </>
          }
          footnote="Counts stamps spent at the shop’s address. A shop could spend stamps itself — same risk as a paper coupon."
          below={
            <>
              {link.variant === 'sig' && expiredByNetwork && count('waiting') > 0 && (
                <SponsorSignReturn link={link} rows={rows} net={net} sponsorAddress={sponsorAddress} />
              )}
              <div className="cp-more">
                <p>
                  “Spent at the shop” counts stamps whose coins went to the shop’s address <span className="addr">{shopAddress}</span>, each with a link to its
                  transaction. It does not prove a purchase. Unspent stamps can go back to the sponsor after {formatDate(link.expiry)}.
                </p>
                <p>
                  Sponsor address (where returns go): <span className="addr">{sponsorAddress}</span>. Statuses are read live from public Bitcoin Cash nodes; this
                  page stores nothing.
                </p>
              </div>
            </>
          }
        />
      </main>
      <Footer />
    </div>
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
    <div className="cp-card" style={{ padding: 18, margin: '14px 10px 0' }}>
      <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Return expired stamps (sponsor signs)</h2>
      <p className="muted small">
        Your wallet will ask you to sign each return. Some wallets (Selene) show only the network fee as the amount, about 300 sats, not the stamp coming back:
        that is expected.
      </p>
      {ws.kind !== 'connected' ? (
        <button type="button" className="btn btn-primary" onClick={() => wallet.start()}>
          Connect the sponsor wallet
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={returnAll}>
          Return all expired stamps
        </button>
      )}
      {ws.kind === 'pairing' && <p className="addr small">{ws.uri}</p>}
      {log.map((l) => (
        <div key={l} className="small">{l}</div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
