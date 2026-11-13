// Shared UI pieces. Plain React, no UI framework.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { BANNER } from '../config';
import { explorerTx, type ChainNet } from '../core/chain';

export function Banner() {
  return (
    <div className="banner" role="region" aria-label="BCH BLAZE 2026 entry">
      <div className="wrap">
        <strong>BCH BLAZE 2026 entry</strong>
        {BANNER.slidesUrl ? (
          <a href={BANNER.slidesUrl} target="_blank" rel="noreferrer">Slides (Widget Factory)</a>
        ) : (
          <span className="pending">Slides: added before submission</span>
        )}
        {BANNER.repoUrl ? (
          <a href={BANNER.repoUrl} target="_blank" rel="noreferrer">Source code</a>
        ) : (
          <span className="pending">Source code: published before submission</span>
        )}
        {BANNER.emberTokenAddress ? (
          <span>
            EMBER2026 votes: <code>{BANNER.emberTokenAddress}</code> <CopyButton text={BANNER.emberTokenAddress} label="Copy" />
          </span>
        ) : (
          <span className="pending">EMBER2026 address: added before submission</span>
        )}
      </div>
    </div>
  );
}

export function NetBadge({ net }: { net: ChainNet }) {
  return (
    <span className={`net ${net}`} title={net === 'mainnet' ? 'Bitcoin Cash mainnet: real money' : 'chipnet: test network, coins have no value'}>
      {net === 'mainnet' ? 'BCH mainnet' : 'chipnet (test)'}
    </span>
  );
}

export function Header({ net }: { net: ChainNet }) {
  return (
    <div className="top">
      <a className="brand" href="./">First Purchase</a>
      <NetBadge net={net} />
    </div>
  );
}

export function TxLink({ net, txid, label }: { net: ChainNet; txid: string; label?: string }) {
  return (
    <a className="tx" href={explorerTx(net, txid)} target="_blank" rel="noreferrer">
      {label ?? `${txid.slice(0, 8)}…${txid.slice(-6)}`}
    </a>
  );
}

export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  return <div className="qr" style={{ width: size, margin: '10px auto' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary inline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt('Copy this:', text);
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function Notice({ kind, children }: { kind: 'ok' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Calls fn now and then every `ms`, until unmounted. Errors are handed to onError, never thrown. */
export function usePoll(fn: () => Promise<void>, ms: number, deps: unknown[], onError?: (e: unknown) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await fnRef.current();
      } catch (e) {
        onError?.(e);
      }
      if (alive) timer = setTimeout(tick, ms);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function formatDate(unix: bigint): string {
  return new Date(Number(unix) * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A digital sticker drawn from the payment's txid: same payment, same sticker. */
export function Sticker({ txid, shop }: { txid: string; shop: string }) {
  const hue = parseInt(txid.slice(0, 2), 16) % 360;
  const cups = ['☕', '🧁', '🍪', '🥐', '🍵', '🍩'];
  const icon = cups[parseInt(txid.slice(2, 4), 16) % cups.length];
  return (
    <div className="sticker" aria-label={`Sticker for payment ${txid}`}>
      <svg viewBox="0 0 220 220" role="img">
        <circle cx="110" cy="110" r="104" fill={`hsl(${hue} 55% 92%)`} stroke={`hsl(${hue} 45% 38%)`} strokeWidth="6" strokeDasharray="10 7" />
        <text x="110" y="100" textAnchor="middle" fontSize="64">{icon}</text>
        <text x="110" y="138" textAnchor="middle" fontSize="15" fontWeight="700" fill={`hsl(${hue} 45% 25%)`}>FIRST PURCHASE</text>
        <text x="110" y="158" textAnchor="middle" fontSize="12" fill={`hsl(${hue} 30% 30%)`}>
          {[...shop].length > 26 ? `${[...shop].slice(0, 25).join('')}…` : shop}
        </text>
        <text x="110" y="178" textAnchor="middle" fontSize="11" fontFamily="monospace" fill={`hsl(${hue} 30% 35%)`}>{txid.slice(0, 12)}</text>
      </svg>
    </div>
  );
}

export function Footer() {
  return (
    <footer>
      Each stamp is its own small Bitcoin Cash contract. The contract, not a server, decides where its coins may go.
    </footer>
  );
}
