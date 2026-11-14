// The rail: where a stamp's coins can go. Sponsor → Stamp (locked) → Shop, and the red branch the network refuses.
// Desktop draws it as one picture; phones get the same rail top to bottom.
import { ArtPin, ArtShop, ArtStampCoin, ArtWallet, IconX } from './icons';

export interface NetworkRailProps {
  /** Face value printed on the coin, e.g. "$0.25". */
  amount: string;
  /** Name on the shop sign. */
  shopName: string;
  /** Where "Refused by the network" leads: the place that shows the refusal and how to see it live. */
  refuseHref: string;
}

export function NetworkRail({ amount, shopName, refuseHref }: NetworkRailProps) {
  return (
    <section className="rail" aria-labelledby="rail-title" data-frame="rail">
      <h2 id="rail-title" className="rail-title">A stamp has one road, written into the coin.</h2>
      <RailWide amount={amount} shopName={shopName} refuseHref={refuseHref} />
      <RailTall amount={amount} shopName={shopName} refuseHref={refuseHref} />
    </section>
  );
}

const LABEL = { fontSize: 31, fontWeight: 800, fill: '#15171a', textAnchor: 'middle' } as const;
const SUB = { fontSize: 21, fill: '#3a434b', textAnchor: 'middle' } as const;

function RailWide({ amount, shopName, refuseHref }: NetworkRailProps) {
  return (
    <svg
      className="rail-wide"
      viewBox="0 0 1340 610"
      role="img"
      aria-label={`Sponsor, then a ${amount} stamp locked to ${shopName}, then the shop. A send anywhere else is refused by the network.`}
    >
      {/* the road */}
      <rect x="226" y="136" width="224" height="8" rx="4" fill="#b8bcbf" />
      <rect x="646" y="136" width="374" height="8" rx="4" fill="#00c380" />

      <circle cx="128" cy="140" r="100" fill="#e3f7eb" />
      <svg x="48" y="76" width="160" height="128">
        <ArtWallet />
      </svg>
      <text x="128" y="274" {...LABEL}>Sponsor</text>

      <circle cx="548" cy="140" r="100" fill="#e3f7eb" />
      <svg x="458" y="72" width="184" height="141">
        <ArtStampCoin amount={amount} />
      </svg>
      <text x="548" y="274" {...LABEL}>Stamp</text>

      <circle cx="1150" cy="140" r="132" fill="#e3f7eb" />
      <svg x="1030" y="30" width="240" height="219">
        <ArtShop sign={shopName} />
      </svg>
      <text x="1150" y="306" {...LABEL}>Shop</text>
      <text x="1150" y="342" {...SUB}>Paid in seconds · 0-conf,</text>
      <text x="1150" y="370" {...SUB}>then confirmed</text>

      {/* the branch the network refuses */}
      <a href={refuseHref} aria-label="Refused by the network: see what the network says">
        <path d="M616 210c26 40 38 92 50 140 10 34 16 60 28 84" fill="none" stroke="#e05a5f" strokeWidth="5" strokeDasharray="12 9" strokeLinecap="round" />
        <path d="M694 452c18 32 58 44 120 44h218" fill="none" stroke="#e05a5f" strokeWidth="5" strokeDasharray="12 9" strokeLinecap="round" />
        <rect x="712" y="412" width="300" height="50" rx="12" fill="#fdecee" stroke="#f3b9bd" strokeWidth="2" />
        <text x="866" y="446" textAnchor="middle" fontSize="24" fontWeight="800" fill="#c8202b">Refused by the network</text>
        <circle cx="694" cy="437" r="24" fill="#d7222c" stroke="#ffffff" strokeWidth="4" />
        <path d="M684 427l20 20M704 427l-20 20" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="1104" cy="490" r="66" fill="#eeeff1" />
        <svg x="1062" y="446" width="84" height="84">
          <ArtPin />
        </svg>
        <text x="1104" y="598" {...LABEL}>Anywhere else</text>
      </a>
    </svg>
  );
}

function RailTall({ amount, shopName, refuseHref }: NetworkRailProps) {
  return (
    <ol className="rail-tall" aria-label="Where a stamp can go">
      <li className="rt-node">
        <span className="rt-disc">
          <ArtWallet />
        </span>
        <span className="rt-label">Sponsor</span>
      </li>
      <li className="rt-link grey" aria-hidden="true" />
      <li className="rt-node">
        <span className="rt-disc">
          <ArtStampCoin amount={amount} />
        </span>
        <span className="rt-label">Stamp</span>
      </li>
      <li className="rt-branch">
        <span className="rt-link green" aria-hidden="true" />
        <a className="rt-refuse" href={refuseHref}>
          <svg className="rt-elbow" viewBox="0 0 60 70" aria-hidden="true">
            <path d="M4 0c4 30 18 48 52 56" fill="none" stroke="#e05a5f" strokeWidth="4" strokeDasharray="9 7" strokeLinecap="round" />
          </svg>
          <span className="rt-refused">
            <span className="rt-x">
              <IconX width={16} height={16} />
            </span>
            Refused by the network
          </span>
          <span className="rt-elsewhere">
            <span className="rt-pin">
              <ArtPin />
            </span>
            Anywhere else
          </span>
        </a>
      </li>
      <li className="rt-node">
        <span className="rt-disc big">
          <ArtShop sign={shopName} />
        </span>
        <span className="rt-label">
          Shop
          <small>Paid in seconds · 0-conf, then confirmed</small>
        </span>
      </li>
    </ol>
  );
}
