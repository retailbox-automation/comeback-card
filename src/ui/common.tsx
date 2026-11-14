// Shared UI pieces. Plain React, no UI framework.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { BANNER } from '../config';
import { explorerTx, type ChainNet } from '../core/chain';
import { IconQr } from './icons';

/** Short form of a long address or code: start…end. The full value stays in the title and in Copy. */
export function shortAddress(address: string, head = 6, tail = 6): string {
  const i = address.indexOf(':');
  const prefix = i >= 0 ? address.slice(0, i + 1) : '';
  const body = i >= 0 ? address.slice(i + 1) : address;
  if (body.length <= head + tail + 1) return address;
  return `${prefix}${body.slice(0, head)}…${body.slice(-tail)}`;
}

export function Banner() {
  return (
    <div className="banner" role="region" aria-label="BCH BLAZE 2026 entry">
      <div className="banner-in">
        <strong className="banner-title">BCH BLAZE 2026 entry</strong>
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
          <span className="banner-ember">
            EMBER2026 votes: <code className="addr-full" title={BANNER.emberTokenAddress}>{BANNER.emberTokenAddress}</code>
            <code className="addr-short" title={BANNER.emberTokenAddress}>{shortAddress(BANNER.emberTokenAddress, 8, 6)}</code>{' '}
            <CopyButton text={BANNER.emberTokenAddress} label="Copy" />
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

/** App header for the inner pages: the wordmark on the left, the network on the right. */
export function Header({ net }: { net: ChainNet }) {
  return (
    <div className="top">
      <a className="brand" href="./">First Purchase</a>
      <NetBadge net={net} />
    </div>
  );
}

export function TxLink({ net, txid, label, className }: { net: ChainNet; txid: string; label?: string; className?: string }) {
  return (
    <a className={className ?? 'tx'} href={explorerTx(net, txid)} target="_blank" rel="noreferrer">
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

/** A QR code that stays hidden until asked for, with the warning next to it (whoever scans it can use it). */
export function QrReveal({ text, warning, label = 'Show QR' }: { text: string; warning: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qr-reveal">
      <button type="button" className="btn-mini" onClick={() => setOpen(!open)} aria-expanded={open}>
        <IconQr width={16} height={16} /> {open ? 'Hide QR' : label}
      </button>
      {open && (
        <>
          <Qr text={text} />
          <p className="muted small center">{warning}</p>
        </>
      )}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-mini"
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

/** "Nov 20, 2026" */
export function formatDay(unix: bigint): string {
  return new Date(Number(unix) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Nov 20" */
export function formatMonthDay(unix: bigint): string {
  return new Date(Number(unix) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Shop name for headings: the "(demo)" tail moves to the subtitle. */
export function shopTitle(name: string): string {
  return name.replace(/\s*\(demo\)\s*$/i, '').trim() || name;
}

/** Two letters for the round shop badge, from the shop's own name. */
export function initialsOf(name: string): string {
  const words = shopTitle(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0]!.toUpperCase());
  return letters.join('') || '?';
}

export function Avatar({ name, size = 64, tone = 'solid' }: { name: string; size?: number; tone?: 'soft' | 'solid' | 'forest' | 'grey' }) {
  return (
    <span className={`avatar ${tone}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/** Photo of the demo shop's storefront (decorative, only for the demo shop). */
export function StorefrontPhoto({ className }: { className?: string }) {
  return <img className={`photo ${className ?? ''}`} src="./img/storefront.jpg" alt="" aria-hidden="true" decoding="async" />;
}

function scallop(cx: number, cy: number, r: number, bumps: number, depth: number): string {
  let d = '';
  for (let i = 0; i < bumps; i++) {
    const a0 = (i / bumps) * Math.PI * 2;
    const a1 = ((i + 1) / bumps) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const p = (a: number, rr: number) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
    d += `${i === 0 ? `M${p(a0, r)}` : ''} Q${p(am, r + depth)} ${p(a1, r)}`;
  }
  return `${d} Z`;
}
const SEAL = scallop(120, 120, 104, 22, 13);

/** A digital sticker for one payment: the seal carries the payment's own code, so the same payment shows the same sticker. */
export function Sticker({ txid, shop }: { txid: string; shop: string }) {
  return (
    <div className="sticker" aria-label={`Sticker from ${shop} for payment ${txid}`} role="img">
      <svg viewBox="0 0 240 240">
        <path d={SEAL} fill="#fbf0de" stroke="#ead6b2" strokeWidth="2" />
        <circle cx="120" cy="120" r="92" fill="#fdf7ec" stroke="#2c6a4d" strokeWidth="3" />
        <g transform="translate(120 88) scale(1.28) translate(-120 -88)">
          <g fill="none" stroke="#2c6a4d" strokeWidth="2.6" strokeLinecap="round">
            <path d="M107 60c-5-5 5-9 0-15M120 60c-5-5 5-9 0-15M133 60c-5-5 5-9 0-15" />
          </g>
          <ellipse cx="120" cy="113" rx="45" ry="7" fill="#e3efe7" stroke="#2c6a4d" strokeWidth="2.4" />
          <path d="M88 78h64v10c0 14-13 25-32 25s-32-11-32-25Z" fill="#ffffff" stroke="#2c6a4d" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M151 83c11-2 16 4 13 10s-9 8-16 7" fill="none" stroke="#2c6a4d" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="120" cy="78" rx="32" ry="6.5" fill="#b9773e" stroke="#2c6a4d" strokeWidth="2.4" />
          <path d="M120 81.5c-4.5-2.7-7.5-4.6-5.8-6.4s4.8 0 5.8 1.9c1-1.9 4.1-3.7 5.8-1.9s-1.3 3.7-5.8 6.4Z" fill="#f6e6cf" />
        </g>
        <text x="120" y="158" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1f5e43">First</text>
        <text x="120" y="184" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1f5e43">Purchase</text>
        <text x="120" y="200" textAnchor="middle" fontSize="10" fontFamily="ui-monospace, Menlo, monospace" fill="#6b5a3e">
          #{txid.slice(0, 8)}
        </text>
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
