// Demo shop counter: watches the shop's address and hands out a sticker for every stamp payment.
// URL: shop.html#a=<shop address>&n=<shop name>&tx=<txid to highlight>. Defaults to the demo shop.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import { Banner, Footer, Header, Notice, Sticker, TxLink, usePoll } from '../src/ui/common';
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
      <>
        <Banner />
        <div className="wrap narrow">
          <Header net={NET} />
          <Notice kind="bad">This shop link has no valid Bitcoin Cash address.</Notice>
        </div>
      </>
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

  return (
    <>
      <Banner />
      <div className="wrap narrow">
        <Header net={net} />
        <h1>{name}</h1>
        <p className="lead">Counter screen. Stamps paid here show up within seconds.</p>
        {error && <Notice kind="warn">{error}</Notice>}
        {!payments && !error && <Notice kind="info">Connecting to the network…</Notice>}

        {highlight && payments && !focus && (
          <Notice kind="info">Waiting for payment {highlight.slice(0, 8)}… to reach this shop. This screen checks every few seconds.</Notice>
        )}

        {shown && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">{focus ? 'This payment' : 'Last stamp payment'}</div>
            <div className="stamp" style={{ border: 0, padding: '6px 0' }}>
              <div className="amount">{formatUsd(shown.receivedSatoshis, rate) ?? formatSats(shown.receivedSatoshis)}</div>
            </div>
            <div style={{ margin: '6px 0' }}>
              <span className={`pill ${shown.confirmed ? 'spent' : 'zero'}`}>
                {shown.confirmed ? `Confirmed in block ${shown.height}` : 'Received (0-conf) · confirming'}
              </span>
            </div>
            <Sticker txid={shown.txid} shop={name} />
            <div className="muted small">
              {formatSats(shown.receivedSatoshis)} · <TxLink net={net} txid={shown.txid} />
              {shown.fromStamp ? ' · paid with a First Purchase stamp' : ''}
            </div>
          </div>
        )}

        {payments && payments.length === 0 && <Notice kind="info">No payments yet. Waiting for the first stamp…</Notice>}

        {payments && payments.length > 0 && (
          <div className="card">
            <h2>Recent payments</h2>
            <table>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>From</th>
                  <th>Status</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.txid} style={p.txid === highlight ? { background: 'var(--green-soft)' } : undefined}>
                    <td>{formatSats(p.receivedSatoshis)}</td>
                    <td>{p.fromStamp ? 'Stamp' : 'Other'}</td>
                    <td>
                      <span className={`pill ${p.confirmed ? 'spent' : 'zero'}`}>{p.confirmed ? 'Confirmed' : '0-conf'}</span>
                    </td>
                    <td>
                      <TxLink net={net} txid={p.txid} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small" style={{ marginTop: 10 }}>
              Shop address: <span className="addr">{address}</span>. “Stamp” means the coins came out of a First Purchase stamp contract (its
              code is visible in the transaction).
            </p>
          </div>
        )}
        <Footer />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
