// Inline SVG icons and small illustrations. No icon font, no image files: everything scales and takes currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function IconShop(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <path d="M4 10v9.5h16V10" />
      <path d="M3 5.5 4.6 3h14.8L21 5.5v1.8a2.4 2.4 0 0 1-4.5 1.2 2.4 2.4 0 0 1-4.5 0 2.4 2.4 0 0 1-4.5 0A2.4 2.4 0 0 1 3 7.3Z" />
      <path d="M9.5 19.5v-5h5v5" />
    </svg>
  );
}

export function IconCoins(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v4c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 10v4c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-4" />
      <path d="M4.5 14v4c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-4" />
    </svg>
  );
}

export function IconCalendar(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconCheck(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} strokeWidth={3} {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconX(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} strokeWidth={3} {...p}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

export function IconArrowRight(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconRefresh(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function IconQr(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3M20.5 14v6.5H17M14 17.5v3" />
    </svg>
  );
}

export function IconReturn(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <path d="M9 9 4 14l5 5" />
      <path d="M4 14h11a5 5 0 0 0 0-10h-3" />
    </svg>
  );
}

export function IconClock(p: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...line} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Three short strokes: the "it just happened" spark next to an object. */
export function Sparks({ className, color = 'var(--green)' }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round">
      <path d="M8 26 2 10" />
      <path d="M22 30 36 16" />
      <path d="M28 46 46 40" />
    </svg>
  );
}

// ---- illustrations for the network rail (one road for a stamp) -----------------------------------

export function ArtWallet() {
  return (
    <svg viewBox="0 0 150 120" aria-hidden="true" className="art">
      <path d="M26 30 104 10a6 6 0 0 1 7.4 4.3L115 30" fill="#d4f3e2" stroke="#1d2320" strokeWidth="6" strokeLinejoin="round" />
      <rect x="14" y="28" width="122" height="82" rx="16" fill="#c6efd9" stroke="#1d2320" strokeWidth="6" />
      <rect x="98" y="54" width="40" height="32" rx="10" fill="#ffffff" stroke="#1d2320" strokeWidth="6" />
      <circle cx="116" cy="70" r="5.5" fill="#1d2320" />
    </svg>
  );
}

export function ArtStampCoin({ amount }: { amount: string }) {
  const ridges = Array.from({ length: 13 }, (_, i) => 22 + i * 8.6);
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true" className="art">
      <path d="M14 48v24c0 17 32 31 72 31s72-14 72-31V48" fill="#7fe0b2" stroke="#1d2320" strokeWidth="6" />
      {ridges.map((x) => (
        <path key={x} d={`M${x} ${66 + Math.sin(((x - 14) / 144) * Math.PI) * 26}v-16`} stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      ))}
      <ellipse cx="86" cy="48" rx="72" ry="31" fill="#ffffff" stroke="#1d2320" strokeWidth="6" />
      <text x="86" y="60" textAnchor="middle" fontSize="34" fontWeight="800" fill="#15171a" letterSpacing="-1">
        {amount}
      </text>
      <path d="M123 82v-9a14 14 0 0 1 28 0v9" fill="none" stroke="#1d2320" strokeWidth="6" />
      <rect x="112" y="80" width="50" height="44" rx="10" fill="#00bd80" stroke="#1d2320" strokeWidth="6" />
      <circle cx="137" cy="97" r="6" fill="#ffffff" />
      <path d="M137 100v11" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function ArtShop({ sign }: { sign: string }) {
  const words = sign.split(' ');
  const half = Math.ceil(words.length / 2);
  const l1 = words.slice(0, half).join(' ');
  const l2 = words.slice(half).join(' ');
  const stripes = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg viewBox="0 0 230 210" aria-hidden="true" className="art">
      <rect x="40" y="6" width="150" height="58" rx="6" fill="#ffffff" stroke="#1d2320" strokeWidth="5" />
      <text x="115" y="30" textAnchor="middle" fontSize="18" fontWeight="800" fill="#15171a">{l1}</text>
      <text x="115" y="53" textAnchor="middle" fontSize="18" fontWeight="800" fill="#15171a">{l2}</text>
      <rect x="30" y="98" width="170" height="104" fill="#ffffff" stroke="#1d2320" strokeWidth="5" />
      {stripes.map((i) => (
        <path
          key={i}
          d={`M${22 + i * 26.6} 72h26.6v26a13.3 13.3 0 0 1-26.6 0Z`}
          fill={i % 2 === 0 ? '#2fd28a' : '#ffffff'}
          stroke="#1d2320"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      ))}
      <path d="M22 72h186" stroke="#1d2320" strokeWidth="5" />
      <rect x="62" y="122" width="52" height="80" fill="#dff6ea" stroke="#1d2320" strokeWidth="4" />
      <path d="M74 150l16-16M78 170l22-22" stroke="#2fd28a" strokeWidth="4" strokeLinecap="round" />
      <rect x="128" y="122" width="56" height="40" fill="#dff6ea" stroke="#1d2320" strokeWidth="4" />
      <path d="M150 140l10-10" stroke="#2fd28a" strokeWidth="4" strokeLinecap="round" />
      <path d="M8 186h30l-4 18H12Z" fill="#ffffff" stroke="#1d2320" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 186c-8-10-10-22-4-30M22 186c2-14 8-22 16-26M22 186c-4-6-12-8-18-6" fill="none" stroke="#2fd28a" strokeWidth="4" strokeLinecap="round" />
      <path d="M150 176h40M170 176v26M156 202h28" stroke="#1d2320" strokeWidth="4" strokeLinecap="round" />
      <path d="M200 150l6 30h18M206 180l-4 22M224 180v22" fill="none" stroke="#1d2320" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArtPin() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="art">
      <ellipse cx="60" cy="98" rx="36" ry="12" fill="none" stroke="#1d2320" strokeWidth="5" />
      <path d="M60 96S30 66 30 44a30 30 0 0 1 60 0c0 22-30 52-30 52Z" fill="#ffffff" stroke="#1d2320" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="60" cy="44" r="11" fill="none" stroke="#1d2320" strokeWidth="5" />
    </svg>
  );
}

// ---- decorations around the home hero -------------------------------------------------------------

export function ArtCoins({ className }: { className?: string }) {
  const coin = (cx: number, cy: number) => (
    <g>
      <path d={`M${cx - 52} ${cy}v16c0 12 23 21 52 21s52-9 52-21V${cy}`} fill="#11b97b" />
      <ellipse cx={cx} cy={cy} rx="52" ry="21" fill="#8fe8c0" />
      <ellipse cx={cx} cy={cy} rx="38" ry="14" fill="none" stroke="#5fd9a2" strokeWidth="4" />
    </g>
  );
  return (
    <svg className={className} viewBox="0 0 240 140" aria-hidden="true">
      <ellipse cx="120" cy="120" rx="108" ry="14" fill="#eef0f2" />
      {coin(92, 90)}
      {coin(150, 58)}
      <g stroke="#11b97b" strokeWidth="5" strokeLinecap="round">
        <path d="M44 46 26 36" />
        <path d="M60 30 52 12" />
        <path d="M80 24 84 6" />
      </g>
    </svg>
  );
}

export function ArtCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 230" aria-hidden="true">
      <ellipse cx="150" cy="208" rx="128" ry="14" fill="#eef0f2" />
      <g transform="rotate(-9 150 120)">
        <rect x="26" y="60" width="244" height="140" rx="18" fill="#e3f8ee" stroke="#5cd6a0" strokeWidth="5" />
        <g transform="translate(58 92)" fill="#11b97b">
          <path d="M0 28 8 6h56l8 22v6a10 10 0 0 1-18 5 10 10 0 0 1-18 0 10 10 0 0 1-18 0A10 10 0 0 1 0 34Z" />
          <path d="M6 44h60v34H44V58H28v20H6Z" />
        </g>
        <rect x="156" y="102" width="86" height="14" rx="7" fill="#9be6c4" />
        <rect x="156" y="130" width="62" height="14" rx="7" fill="#9be6c4" />
      </g>
      <g stroke="#11b97b" strokeWidth="6" strokeLinecap="round">
        <path d="M236 30 242 10" />
        <path d="M254 44 272 30" />
        <path d="M262 64 284 60" />
      </g>
    </svg>
  );
}
