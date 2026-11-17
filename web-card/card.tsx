// Card page: open a card link, pay the one shop in parts, watch the rest; after the end date anyone can send
// the rest back to the giver. No wallet, no account, no server of ours: the key is in the URL fragment and
// transactions go straight to a Fulcrum node.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { binToHex, decodeCashAddress } from '@bitauth/libauth';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner, Notice, TxLink, formatDate, formatDay, formatMonthDay, shopTitle, shortAddress, usePoll } from '../src/ui/common';
import { CcFooter } from '../src/ui/cc/common';
import { CardScreen, type CardActivity, type CashOutResult } from '../src/ui/cc/CardScreen';
import { DEMO_SHOP } from '../src/config';
import { PREFIX, broadcastRaw, medianTimePast, provider } from '../src/core/chain';
import { buildCardCashOut, buildCardReturn, buildCardSpend, cardContract } from '../src/core/card';
import { cardTermsOf, decodeCardLink, type CardLink } from '../src/core/cardlink';
import { cardState, type CardState } from '../src/core/cardstatus';
import { readerOn } from '../src/core/status';
import { addressOf, lockingBytecodeOf } from '../src/core/stamp';
import { formatSats, formatUsd, usdPerBch, usdToSats } from '../src/core/price';
import { explainNodeError } from '../src/core/view';

const PRESETS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20];

function parse(): { ok: true; link: CardLink } | { ok: false; error: string } {
  if (!location.hash || location.hash.length < 10) return { ok: false, error: 'This page needs a card link. Open the link you were given.' };
  try {
    return { ok: true, link: decodeCardLink(location.hash) };
  } catch (e) {
    return { ok: false, error: `This card link is damaged or incomplete (${e instanceof Error ? e.message : 'unknown error'}). Ask for the link again.` };
  }
}

function App() {
  const p = useMemo(parse, []);
  if (!p.ok) {
    return (
      <div className="cc-card-page">
        <Banner />
        <main className="cc-narrow">
          <Notice kind="bad">{p.error}</Notice>
        </main>
        <CcFooter />
      </div>
    );
  }
  return <CardPage link={p.link} />;
}

type PayResult = { ok: true; txid: string; paid: bigint } | { ok: false; error: string; fromNode: boolean };

function CardPage({ link }: { link: CardLink }) {
  const net = link.net;
  const prov = useMemo(() => provider(net), [net]);
  const contract = useMemo(() => cardContract(cardTermsOf(link), prov), [link, prov]);
  const cardLB = useMemo(() => lockingBytecodeOf(contract.address), [contract]);
  const shopAddress = useMemo(() => addressOf(link.approval.lockingBytecode, PREFIX[net]), [link, net]);
  const demo = shopAddress === DEMO_SHOP.address[net];
  const shop = shopTitle(link.shopName);

  const [state, setState] = useState<CardState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [mtp, setMtp] = useState<bigint | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<PayResult | null>(null);
  const [mode, setMode] = useState<'pay' | 'cash-out'>('pay');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [cashOut, setCashOut] = useState<CashOutResult | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnResult, setReturnResult] = useState<{ ok: boolean; text: string; verbatim?: string; txid?: string } | null>(null);

  usePoll(
    async () => {
      setState(await cardState(readerOn(prov), cardLB, link.approval.lockingBytecode, link.giverLockingBytecode));
      setLoadError(null);
    },
    4000,
    [contract],
    () => setLoadError('Cannot reach the Bitcoin Cash network right now. Retrying…'),
  );
  usePoll(async () => setRate(await usdPerBch()), 60_000, []);
  usePoll(async () => setMtp(await medianTimePast(net)), 60_000, [net]);

  const money = (sats: bigint) => formatUsd(sats, rate) ?? formatSats(sats);
  const balance = state?.balanceSatoshis ?? null;
  const funded = state?.fundedSatoshis ?? 0n;
  const ended = mtp !== null && mtp >= link.expiry;
  const cardCoin = state?.coins[0] ?? null;
  const coin = useMemo(
    () => (cardCoin ? { txid: cardCoin.txid, vout: cardCoin.vout, satoshis: cardCoin.satoshis, lockingBytecode: contract.lockingBytecode } : null),
    [cardCoin, contract],
  );

  // Amount chips: the two largest round amounts well under the balance, then "All".
  const balanceUsd = balance !== null && rate ? (Number(balance) / 1e8) * rate : null;
  const presets = balanceUsd ? PRESETS.filter((u) => u <= balanceUsd * 0.7).slice(-2) : [];
  const chipKeys = [...presets.map((u) => `usd:${u}`), 'all'];
  const chosen = pick && chipKeys.includes(pick) ? pick : chipKeys[0]!;
  const chosenSats = (() => {
    if (!coin) return null;
    if (chosen === 'all' || !rate) return coin.satoshis;
    const s = usdToSats(Number(chosen.slice(4)), rate);
    return s > coin.satoshis ? coin.satoshis : s;
  })();
  const usdLabel = (u: number) => (u < 1 ? `$${u.toFixed(2)}` : `$${u % 1 ? u.toFixed(2) : u.toFixed(0)}`);
  const buttonLabel =
    chosen === 'all' ? `Pay all ${balance !== null ? money(balance) : ''} at ${shop}` : `Pay ${usdLabel(Number(chosen.slice(4)))} at ${shop}`;

  async function doPay() {
    if (!coin || chosenSats === null) return;
    setPaying(true);
    setPayResult(null);
    try {
      const s = buildCardSpend(contract, prov, coin, link.cardPrivateKey, link.approval, chosenSats);
      const r = await broadcastRaw(net, s.builder.build());
      setPayResult(r.ok ? { ok: true, txid: r.txid, paid: s.paid } : { ok: false, fromNode: true, error: r.nodeError });
    } catch (e) {
      setPayResult({ ok: false, fromNode: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setPaying(false);
    }
  }

  async function sendElsewhere() {
    setCashOut(null);
    const a = to.trim();
    const full = a.includes(':') ? a : `${PREFIX[net]}:${a}`;
    const d = decodeCashAddress(full);
    if (typeof d === 'string') return setCashOut({ kind: 'input', message: 'That does not look like a Bitcoin Cash address.' });
    if (d.prefix !== PREFIX[net]) return setCashOut({ kind: 'input', message: `That address is not on ${net}; this card lives on ${net}.` });
    const target = lockingBytecodeOf(full);
    if (binToHex(target) === binToHex(link.approval.lockingBytecode)) {
      return setCashOut({ kind: 'input', message: `That is the shop’s own address. Use “Pay” to pay ${shop}.` });
    }
    if (!coin) return setCashOut({ kind: 'input', message: 'This card has no coins right now.' });
    setSending(true);
    try {
      const { builder } = buildCardCashOut(contract, prov, coin, link.cardPrivateKey, link.approval, target);
      // Sent as-is, with no local check first: the refusal below comes from a Bitcoin Cash node.
      const r = await broadcastRaw(net, builder.build());
      if (r.ok) setCashOut({ kind: 'accepted', txid: r.txid });
      else {
        const ex = explainNodeError(r.nodeError);
        setCashOut({
          kind: 'rejected',
          nodeError: r.nodeError,
          why: ex.cls === 'contract-refused' ? `The contract only lets this card pay ${shop}. Your card is untouched.` : ex.plain,
        });
      }
    } catch (e) {
      setCashOut({ kind: 'input', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  async function returnRest() {
    if (!coin) return;
    setReturning(true);
    setReturnResult(null);
    try {
      const { builder } = buildCardReturn(contract, prov, coin, link.giverLockingBytecode, link.expiry);
      const r = await broadcastRaw(net, builder.build());
      if (r.ok) setReturnResult({ ok: true, text: 'Sent back to the giver.', txid: r.txid });
      else setReturnResult({ ok: false, text: explainNodeError(r.nodeError).plain, verbatim: r.nodeError });
    } catch (e) {
      setReturnResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setReturning(false);
    }
  }

  const counterHref = (txid: string) => `./counter.html#a=${encodeURIComponent(shopAddress)}&n=${encodeURIComponent(link.shopName)}&tx=${txid}`;

  const payNotice = payResult ? (
    payResult.ok ? (
      <Notice kind="ok">
        <strong>
          Paid {money(payResult.paid)} at {shop}.
        </strong>{' '}
        <TxLink net={net} txid={payResult.txid} label="View the transaction" /> · <a href={counterHref(payResult.txid)}>Shop counter</a>
      </Notice>
    ) : payResult.fromNode ? (
      <Notice kind={explainNodeError(payResult.error).cls === 'already-gone' ? 'warn' : 'bad'}>
        <strong>{explainNodeError(payResult.error).plain}</strong>
        <div className="small" style={{ marginTop: 6 }}>
          The network’s own words:
        </div>
        <pre className="node">{payResult.error}</pre>
      </Notice>
    ) : (
      <Notice kind="warn">{payResult.error}</Notice>
    )
  ) : null;

  const activity: CardActivity[] = (state?.events ?? []).map((e) => {
    const base = { key: `${e.kind}:${e.seen.txid}`, txid: e.seen.txid, confirmed: e.seen.confirmed, height: e.seen.height };
    if (e.kind === 'paid') return { ...base, text: `−${money(e.paidSatoshis)} · Paid at ${shop}` };
    if (e.kind === 'funded') return { ...base, text: `+${money(e.satoshis)} · Gift${link.fromName ? ` from ${link.fromName}` : ''}` };
    if (e.kind === 'returned') return { ...base, text: `${money(e.returnedSatoshis)} · Sent back to the giver` };
    return { ...base, text: 'Moved elsewhere (should be impossible; please report it)' };
  });

  const pay = (() => {
    if (!state) return { kind: 'loading' as const, text: 'Checking this card on the network…' };
    if (state.events.length === 0) return { kind: 'empty' as const, text: 'No gift on this card yet. If it was just given, it shows up within seconds.' };
    if (!coin) {
      const returned = state.events.some((e) => e.kind === 'returned');
      return { kind: 'empty' as const, text: returned ? 'What was left went back to the giver. This card is closed.' : 'This card is used up. Thank you!' };
    }
    if (mode === 'cash-out') {
      return {
        kind: 'cash-out' as const,
        to,
        onTo: setTo,
        placeholder: `${PREFIX[net]}:q… (your own wallet)`,
        busy: sending,
        onSend: sendElsewhere,
        onBack: () => {
          setMode('pay');
          setCashOut(null);
        },
        result: cashOut,
      };
    }
    return {
      kind: 'ready' as const,
      chips: chipKeys.map((k) => ({
        key: k,
        label: k === 'all' ? 'All' : usdLabel(Number(k.slice(4))),
        on: k === chosen,
        onPick: () => setPick(k),
      })),
      buttonLabel,
      busy: paying,
      canPay: !paying && chosenSats !== null,
      onPay: doPay,
      notice: payNotice,
    };
  })();

  const comeback = ended
    ? {
        kind: 'ended' as const,
        text: coin
          ? `This card ended on ${formatMonthDay(link.expiry)}. What’s left can only go back to the giver, and anyone can send it now.`
          : `This card ended on ${formatMonthDay(link.expiry)}.`,
        busy: returning,
        onReturn: returnRest,
        result: returnResult ? (
          returnResult.ok ? (
            <Notice kind="ok">
              {returnResult.text} {returnResult.txid && <TxLink net={net} txid={returnResult.txid} label="View the transaction" />}
            </Notice>
          ) : (
            <Notice kind="warn">
              {returnResult.text}
              {returnResult.verbatim && <pre className="node">{returnResult.verbatim}</pre>}
            </Notice>
          )
        ) : undefined,
      }
    : { kind: 'promise' as const, text: `After ${formatMonthDay(link.expiry)} it can only go back to the giver. Anyone can send it back, no wallet needed.` };

  return (
    <div className="cc-card-page">
      <Banner />
      <CardScreen
        net={net}
        shopName={link.shopName}
        shopSubtitle={demo ? 'Demo shop' : shortAddress(shopAddress)}
        demoShop={demo}
        balance={balance === null ? '…' : money(balance)}
        balanceLine={`left of ${funded > 0n ? money(funded) : '…'} · use by ${formatDay(link.expiry)}`}
        left={funded > 0n && balance !== null ? Number(balance) / Number(funded) : 0}
        comeback={ended && !coin ? { kind: 'promise', text: comeback.text } : comeback}
        pay={pay}
        activity={activity}
        onCashOut={coin && mode === 'pay' ? () => setMode('cash-out') : undefined}
        notice={loadError ? <div className="ccs-pad"><Notice kind="warn">{loadError}</Notice></div> : undefined}
        more={
          <>
            <h2>Why can’t this card be spent anywhere else?</h2>
            <p>
              The coins sit in a small Bitcoin Cash contract. It lets them go only to the address {shop} signed with its key, <span className="addr">{shopAddress}</span>,
              or back onto this card, and after {formatDate(link.expiry)} only back to the giver. Every node checks that.
            </p>
            <p>The key for this card lives only in this link (after the #). Browsers never send that part to any server.</p>
            <p>“0-conf” means every node has seen the payment; a block makes it final, usually within 10 minutes.</p>
          </>
        }
      />
      <CcFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
