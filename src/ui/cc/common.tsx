// Shared pieces of the Comeback Card pages. The look is the First Purchase system B (theme.css) plus cc.css.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChainNet } from '../../core/chain';
import { WizardWallet, type WalletState } from '../../core/wallet';
import { CopyButton, NetBadge, Notice, QrReveal } from '../common';

export const FP_SITE = 'https://firstpurchase.retailbox-automation.com';

export function CcHeader({ net }: { net: ChainNet }) {
  return (
    <div className="top cc-top">
      <a className="brand" href="./">Comeback Card</a>
      <NetBadge net={net} />
    </div>
  );
}

export function CcFooter() {
  return (
    <footer className="cc-footer">
      <p>Each card is its own small Bitcoin Cash contract. The contract, not a server, decides where its coins may go.</p>
      <p>
        <a href="./rules.html">Rules of this card</a> · <a href="./for-shops.html">For shops</a> · <a href="./counter.html">Shop counter</a> ·{' '}
        <a href={FP_SITE}>The earlier demo: First Purchase stamps</a>
      </p>
    </footer>
  );
}

/** "0-conf" and "in a block" are different facts; they always look different. */
export function SeenBadge({ confirmed, height }: { confirmed: boolean; height: number }) {
  return confirmed ? (
    <span className="cc-badge cc-badge-ok">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      Confirmed · block {height.toLocaleString('en-US')}
    </span>
  ) : (
    <span className="cc-badge cc-badge-wait">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      0-conf (seen by the network)
    </span>
  );
}

/** The WizardConnect panel: pairing, approval, relay trouble. Renders `children(wallet)` once connected. */
export function WalletGate({
  appName,
  idle,
  children,
}: {
  appName: string;
  /** What to show before the person presses Connect (the form preview and the button live here). */
  idle: (connect: () => void) => ReactNode;
  children: (wallet: WizardWallet, walletName: string | null) => ReactNode;
}) {
  const [ws, setWs] = useState<WalletState>({ kind: 'idle' });
  const ref = useRef<WizardWallet | null>(null);
  if (!ref.current) ref.current = new WizardWallet(appName, new URL('./favicon.svg', location.href).toString(), setWs);
  const wallet = ref.current;
  useEffect(() => () => wallet.stop(), [wallet]);
  const foot = <p className="muted small cc-walletline">WizardConnect: Selene (2026.10 or newer), Cashonize or Paytaca</p>;

  if (ws.kind === 'connected') return <>{children(wallet, ws.walletName)}</>;
  if (ws.kind === 'idle') return <>{idle(() => wallet.start())}</>;
  return (
    <div className="create-panel">
      {ws.kind === 'pairing' && (
        <>
          <p>Scan the code with your wallet’s WizardConnect scanner, or copy the link into the wallet.</p>
          <div className="create-actions">
            <CopyButton text={ws.uri} label="Copy pairing link" />
            <QrReveal text={ws.qrUri} label="Show QR code" warning="Do not show this code on a stream: whoever scans it first gets the session." />
            <button type="button" className="btn-mini" onClick={() => wallet.stop()}>
              Cancel
            </button>
          </div>
          <p className="muted small">{ws.relayUp ? 'Waiting for your wallet…' : 'Opening a secure channel…'}</p>
        </>
      )}
      {ws.kind === 'relay-down' && (
        <>
          <Notice kind="warn">{ws.message}</Notice>
          <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
            Try again
          </button>
        </>
      )}
      {ws.kind === 'awaiting-approval' && <Notice kind="info">Approve the connection in {ws.walletName ?? 'your wallet'}.</Notice>}
      {ws.kind === 'reconnecting' && <Notice kind="info">The connection dropped for a moment. Reconnecting…</Notice>}
      {ws.kind === 'disconnected' && (
        <>
          <Notice kind="warn">The wallet disconnected{ws.message ? `: ${ws.message}` : ''}.</Notice>
          <button type="button" className="btn btn-primary btn-create" onClick={() => wallet.start()}>
            Connect again
          </button>
        </>
      )}
      {foot}
    </div>
  );
}

/** A row of choice chips (amount, days). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="cc-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`cc-chip${o.value === value ? ' on' : ''}`}
          disabled={disabled || o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
