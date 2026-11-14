// Stamp page: open a stamp link, pay the one shop it allows. No wallet, no account, no server of ours:
// the key is in the URL fragment (never sent anywhere), the transaction goes straight to a Fulcrum node.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { binToHex, decodeCashAddress, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import '../src/ui/theme.css';
import { Banner, Footer, Notice, formatDate, formatDay, formatMonthDay, shopTitle, shortAddress, usePoll } from '../src/ui/common';
import { StampLinkError, StampScreen, type ElsewhereResult, type StampView } from '../src/ui/screens/stamp';
import { DEMO_SHOP } from '../src/config';
import { decodeStampLink, termsFor, type StampLink } from '../src/core/link';
import { PREFIX, broadcastRaw, medianTimePast, provider, type ChainNet } from '../src/core/chain';
import { addressOf, buildSpend, buildSpendElsewhere, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';
import { readerFor, stampState, type StampState } from '../src/core/status';
import { formatSats, formatUsd, usdPerBch } from '../src/core/price';
import { explainNodeError, stampPhase } from '../src/core/view';

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
      <div className="stamp-page">
        <Banner />
        <StampLinkError net="mainnet" message={parsed.error} />
      </div>
    );
  }
  return <StampPage link={parsed.link} />;
}

type BuyResult = { ok: true; txid: string } | { ok: false; error: string; fromNode: boolean };

function StampPage({ link }: { link: StampLink }) {
  const net: ChainNet = link.net;
  const prov = useMemo(() => provider(net), [net]);
  const contract = useMemo(() => stampContract(termsFor(link, publicKeyOf(link.stampPrivateKey)), prov), [link, prov]);
  const merchantAddress = useMemo(() => addressOf(link.merchantLockingBytecode, PREFIX[net]), [link, net]);
  const sponsorLB = useMemo(() => sponsorLockingBytecode(link), [link]);
  const isDemoShop = merchantAddress === DEMO_SHOP.address[net];
  const shopName = link.merchantName || 'this shop';

  const [state, setState] = useState<StampState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [mtp, setMtp] = useState<bigint | null>(null);
  const [buying, setBuying] = useState(false);
  // fromNode: the text is the node's verbatim answer; otherwise it is our own message (never labelled as the node's).
  const [buyResult, setBuyResult] = useState<BuyResult | null>(null);
  const [mode, setMode] = useState<'buy' | 'elsewhere'>('buy');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [elsewhere, setElsewhere] = useState<ElsewhereResult | null>(null);

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
  const amount = usd ?? (satoshis !== null ? formatSats(satoshis) : '…');
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

  async function sendElsewhere() {
    setElsewhere(null);
    const addr = to.trim();
    const decoded = decodeCashAddress(addr.includes(':') ? addr : `${PREFIX[net]}:${addr}`);
    if (typeof decoded === 'string') return setElsewhere({ kind: 'input', message: 'That does not look like a Bitcoin Cash address.' });
    if (decoded.prefix !== PREFIX[net]) {
      return setElsewhere({ kind: 'input', message: `That address is for ${decoded.prefix === 'bitcoincash' ? 'mainnet' : 'a test network'}; this stamp lives on ${net}.` });
    }
    const target = lockingBytecodeOf(`${decoded.prefix}:${addr.includes(':') ? addr.split(':')[1] : addr}`);
    if (binToHex(target) === binToHex(link.merchantLockingBytecode)) {
      return setElsewhere({ kind: 'input', message: `That is the shop’s own address (${merchantAddress}). Use “Buy” to pay the shop.` });
    }
    setSending(true);
    try {
      const utxos = (await prov.getUtxos(contract.address)).filter((u) => !u.token);
      if (utxos.length === 0) return setElsewhere({ kind: 'input', message: 'This stamp has no coins right now.' });
      const { builder } = buildSpendElsewhere(contract, prov, utxos[0]!, link.stampPrivateKey, target);
      // Sent as-is, with no local check first: the refusal below comes from a Bitcoin Cash node.
      const r = await broadcastRaw(net, builder.build());
      if (r.ok) {
        setElsewhere({ kind: 'accepted', txid: r.txid });
      } else {
        const ex = explainNodeError(r.nodeError);
        setElsewhere({
          kind: 'rejected',
          nodeError: r.nodeError,
          why: ex.cls === 'contract-refused' ? `The contract only lets this stamp pay ${shopTitle(shopName)}. Your stamp is untouched.` : ex.plain,
        });
      }
    } catch (e) {
      setElsewhere({ kind: 'input', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  const shopLink = (txid: string) => `./shop.html#a=${encodeURIComponent(merchantAddress)}&n=${encodeURIComponent(link.merchantName)}&tx=${txid}`;

  const buyNotice =
    buyResult && !buyResult.ok ? (
      buyResult.fromNode ? (
        <Notice kind={explainNodeError(buyResult.error).cls === 'already-gone' ? 'warn' : 'bad'}>
          <strong>{explainNodeError(buyResult.error).plain}</strong>
          <div className="small" style={{ marginTop: 6 }}>The network’s own words:</div>
          <pre className="node">{buyResult.error}</pre>
        </Notice>
      ) : (
        <Notice kind="warn">{buyResult.error}</Notice>
      )
    ) : null;

  const view: StampView = (() => {
    const spent = state?.kind === 'spent' ? state : null;
    const paidTxid = spent?.spend.txid ?? (buyResult?.ok ? buyResult.txid : null);
    if (paidTxid) {
      return {
        kind: 'paid',
        txid: paidTxid,
        confirmed: spent?.spend.confirmed ?? false,
        height: spent?.spend.height ?? null,
        received: spent ? formatSats(spent.paidSatoshis) : null,
        counterHref: shopLink(paidTxid),
      };
    }
    if (state?.kind === 'returned') return { kind: 'returned', txid: state.spend.txid, confirmed: state.spend.confirmed, received: formatSats(state.paidSatoshis) };
    if (state?.kind === 'moved-elsewhere') return { kind: 'moved', txid: state.spend.txid };
    if (state?.kind === 'not-funded') return { kind: 'not-funded' };
    if (state?.kind === 'waiting') {
      if (mode === 'elsewhere') {
        return {
          kind: 'elsewhere',
          to,
          onTo: setTo,
          placeholder: `${PREFIX[net]}:q… (your own wallet)`,
          busy: sending,
          canSend: !sending && to.trim().length >= 20,
          onSend: sendElsewhere,
          onBack: () => {
            setMode('buy');
            setElsewhere(null);
          },
          result: elsewhere,
        };
      }
      return {
        kind: 'ready',
        expired: phase.phase === 'expired-open',
        expiryShort: formatMonthDay(link.expiry),
        expiryDay: formatDay(link.expiry),
        expiredText: phase.phase === 'expired-open' ? phase.text : '',
        buyLabel: `Buy · ${usd ?? amount}`,
        buying,
        onBuy: buy,
        onTryElsewhere: () => setMode('elsewhere'),
        buyNotice,
      };
    }
    return { kind: 'loading' };
  })();

  return (
    <div className="stamp-page">
      <Banner />
      <StampScreen
        net={net}
        shop={{ name: shopName, subtitle: isDemoShop ? 'Demo shop' : shortAddress(merchantAddress), demo: isDemoShop }}
        amount={amount}
        view={view}
        notice={loadError ? <div className="sp-pad"><Notice kind="warn">{loadError}</Notice></div> : undefined}
        more={
          <>
            <h2>Why can’t this stamp be sent anywhere else?</h2>
            <p>
              The coins sit in a tiny Bitcoin Cash contract. Its rule: the money may go to exactly one address, <span className="addr">{merchantAddress}</span>,
              minus a capped fee. Every node checks that rule. If the stamp is not spent, the sponsor can take it back after {formatDate(link.expiry)}.
            </p>
            <p>The key for this stamp lives only in this link (after the #). Browsers never send that part to any server.</p>
            <p>“0-conf” means every node has seen the payment; a block makes it final, usually within 10 minutes.</p>
          </>
        }
      />
      <Footer />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
