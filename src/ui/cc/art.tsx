// Small drawings for Comeback Card: the bow on the card and the friendly coin (the judges asked for a friendly screen).

export function Bow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M58 0h22v120H58z" fill="#12dc8d" transform="rotate(-38 69 60)" opacity="0.95" />
      <path d="M60 52c-10-22-38-30-44-18s14 26 44 22Z" fill="#12dc8d" stroke="#05a866" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M64 52c18-18 46-18 46-4s-24 18-46 8Z" fill="#12dc8d" stroke="#05a866" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M56 58c-8 16-10 34-6 44l10-8 6 10c6-14 6-30 0-46Z" fill="#0bc77c" stroke="#05a866" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M68 58c10 12 18 28 18 40l-12-4-2 12c-8-12-10-30-4-48Z" fill="#0bc77c" stroke="#05a866" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="62" cy="55" rx="9" ry="8" fill="#19e596" stroke="#05a866" strokeWidth="2.5" />
    </svg>
  );
}

/** A smiling green coin peeking over an edge, with little hands. */
export function CoinMascot({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 110" aria-hidden="true">
      <g stroke="#0b6e47" strokeWidth="3.5" strokeLinecap="round">
        <path d="M84 8l4-8M96 16l8-5M100 30l9 0" />
      </g>
      <circle cx="58" cy="52" r="40" fill="#18c98a" stroke="#0b6e47" strokeWidth="4" />
      <circle cx="58" cy="52" r="31" fill="none" stroke="#0e9e6b" strokeWidth="3" opacity="0.55" />
      <path d="M40 46c3-5 9-5 12 0M64 46c3-5 9-5 12 0" fill="none" stroke="#0b3d27" strokeWidth="4" strokeLinecap="round" />
      <path d="M44 60c4 12 24 12 28 0Z" fill="#0b3d27" />
      <path d="M50 66c4 4 12 4 16 0" fill="#ff8a8a" />
      <ellipse cx="38" cy="58" rx="5" ry="3" fill="#7ee0b8" opacity="0.8" />
      <ellipse cx="78" cy="58" rx="5" ry="3" fill="#7ee0b8" opacity="0.8" />
      <g fill="#ffffff" stroke="#0b6e47" strokeWidth="3.5" strokeLinejoin="round">
        <path d="M14 96c0-9 9-13 15-9 4-5 13-4 14 3 0 6-5 9-14 9H18c-3 0-4-1-4-3Z" />
        <path d="M74 96c0-9 9-13 15-9 4-5 13-4 14 3 0 6-5 9-14 9H78c-3 0-4-1-4-3Z" />
      </g>
    </svg>
  );
}

export function ReturnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5v5h5" />
      <path d="M4.6 14a8 8 0 1 0 1.9-8.3L4 10" />
    </svg>
  );
}
