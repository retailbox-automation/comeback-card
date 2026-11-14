// Demo shop counter: watches the shop's address and hands out a sticker for every stamp payment.
// URL: shop.html#a=<shop address>&n=<shop name>&tx=<txid to highlight>. Defaults to the demo shop.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import { Banner, Footer, Header, Notice, usePoll } from '../src/ui/common';
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
        <main>
          <div className="ct">
            <Header net={NET} />
            <Notice kind="bad">This shop link has no valid Bitcoin Cash address.</Notice>
          </div>
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
  const latestStamp = payments?.find((p) => p.fromStamp) ?? null;
  const shown = focus ?? latestStamp;
  const money = (sats: bigint) => formatUsd(sats, rate) ?? formatSats(sats);
  const view = (p: Payment) => ({
    txid: p.txid,
    amount: money(p.receivedSatoshis),
    fromStamp: p.fromStamp,
    confirmed: p.confirmed,
    height: p.height,
    highlight: p.txid === highlight,
  });

  return (
    <div className="counter-page">
      <Banner />
      <main>
        <CounterScreen
          net={net}
          shopName={name}
          address={address}
          focus={shown ? { ...view(shown), sats: formatSats(shown.receivedSatoshis), label: focus ? 'This payment' : 'Last stamp payment' } : null}
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
      <Footer />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
