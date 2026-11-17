// Shop counter for Comeback Card: watches the shop's address and shows each card payment as it arrives.
// URL: counter.html#a=<shop address>&n=<shop name>&tx=<txid to highlight>. Defaults to the demo shop.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner, Notice, usePoll } from '../src/ui/common';
import { CcFooter, CcHeader } from '../src/ui/cc/common';
import { CounterScreen } from '../src/ui/screens/counter';
import { DEMO_SHOP, NET } from '../src/config';
import { provider, type ChainNet } from '../src/core/chain';
import { lockingBytecodeOf, networkOfAddress } from '../src/core/stamp';
import { electrumScriptHash, readerOn } from '../src/core/status';
import { classifyPayment, newestFirst, type Payment } from '../src/core/shop';
import { formatSats, formatUsd, usdPerBch } from '../src/core/price';

const MAX_SHOWN = 8;

function params() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const address = p.get('a') || DEMO_SHOP.address[NET];
  const name = p.get('n') || DEMO_SHOP.name;
  const tx = p.get('tx') && /^[0-9a-f]{64}$/.test(p.get('tx')!) ? p.get('tx')! : null;
  return { address, name, tx };
}

function App() {
  const { address, name, tx } = useMemo(params, []);
  const net = networkOfAddress(address);
  if (net !== 'mainnet' && net !== 'chipnet') {
    return (
      <div className="counter-page">
        <Banner />
        <CcHeader net={NET} />
        <main className="cc-narrow">
          <Notice kind="bad">This counter link has no valid Bitcoin Cash address.</Notice>
        </main>
      </div>
    );
  }
  return <Counter address={address} name={name} highlight={tx} net={net} />;
}

function Counter({ address, name, highlight, net }: { address: string; name: string; highlight: string | null; net: ChainNet }) {
  const lb = useMemo(() => lockingBytecodeOf(address), [address]);
  const reader = useMemo(() => readerOn(provider(net)), [net]);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  usePoll(
    async () => {
      const history = newestFirst(await reader.history(electrumScriptHash(lb))).slice(0, MAX_SHOWN * 2);
      const list: Payment[] = [];
      for (const h of history) {
        const p = classifyPayment(h.tx_hash, await reader.rawTx(h.tx_hash), h.height, lb);
        if (p.receivedSatoshis > 0n) list.push(p);
        if (list.length >= MAX_SHOWN) break;
      }
      setPayments(list);
      setError(null);
    },
    4000,
    [reader, lb],
    () => setError('Cannot reach the Bitcoin Cash network right now. Retrying…'),
  );
  usePoll(async () => setRate(await usdPerBch()), 60_000, []);

  const focus = payments?.find((p) => p.txid === highlight) ?? null;
  const latest = payments?.find((p) => p.fromCard) ?? null;
  const shown = focus ?? latest;
  const money = (sats: bigint) => formatUsd(sats, rate) ?? formatSats(sats);
  const view = (p: Payment) => ({
    txid: p.txid,
    amount: money(p.receivedSatoshis),
    fromStamp: p.fromCard,
    confirmed: p.confirmed,
    height: p.height,
    highlight: p.txid === highlight,
  });

  return (
    <div className="counter-page">
      <Banner />
      <main>
        <CounterScreen
          product="card"
          net={net}
          shopName={name}
          address={address}
          focus={shown ? { ...view(shown), sats: formatSats(shown.receivedSatoshis), label: focus ? 'This payment' : 'Last card payment' } : null}
          payments={payments ? payments.map(view) : null}
          notices={
            <>
              {error && <Notice kind="warn">{error}</Notice>}
              {!payments && !error && <Notice kind="info">Connecting to the network…</Notice>}
              {highlight && payments && !focus && (
                <Notice kind="info">Waiting for payment {highlight.slice(0, 8)}… to reach this shop. This screen checks every few seconds.</Notice>
              )}
            </>
          }
        />
      </main>
      <CcFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
