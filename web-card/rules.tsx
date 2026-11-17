// Rules of this card: the contract itself, what it guarantees and what it doesn't, and proof for each "what if".
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import cardSource from '../contracts/card.cash?raw';
import { Banner, TxLink } from '../src/ui/common';
import { CcFooter, CcHeader } from '../src/ui/cc/common';
import { EVIDENCE } from '../src/ui/cc/evidence';
import { NET } from '../src/config';
import type { ChainNet } from '../src/core/chain';
import { CARD_FEE_RESERVE_SATS, CARD_MAX_FEE, CARD_MIN_CHANGE } from '../src/core/card';

const evNet: ChainNet | null = EVIDENCE[NET] ? NET : EVIDENCE.chipnet ? 'chipnet' : null;
const ev = evNet ? EVIDENCE[evNet]! : null;

function Proof({ txid, label }: { txid: string; label: string }) {
  return evNet ? <TxLink net={evNet} txid={txid} label={label} /> : null;
}

function App() {
  return (
    <div className="home cc-home">
      <Banner />
      <CcHeader net={NET} />
      <main className="cc-narrow cc-rules">
        <h1 className="cc-h1-small">Rules of this card</h1>
        <p className="cc-lead">
          Every Comeback Card is its own small Bitcoin Cash contract. The rules below are checked by every node on the network, not by this website. The website
          only builds transactions; a node accepts or refuses them.
        </p>

        <h2>What it guarantees, and what it doesn’t</h2>
        <table className="cc-table">
          <thead>
            <tr>
              <th>Guaranteed by the network</th>
              <th>Not guaranteed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Money on the card can only go to the one address the shop signed with its key, or back onto the same card.</td>
              <td>The giver knows the card link too, and could spend at the same shop first.</td>
            </tr>
            <tr>
              <td>After the end date, what’s left can only go back to the giver’s address.</td>
              <td>The return isn’t automatic. After the end date someone has to press Return; anyone can, no wallet needed. Until then the card can still be spent at the shop, and the network keeps whichever transaction it sees first.</td>
            </tr>
            <tr>
              <td>The shop gets the full amount of every payment. The network fee comes out of the card, at most {CARD_MAX_FEE.toString()} sats per transaction.</td>
              <td>The shop could open a card link it was shown and spend it itself, the same risk as a paper coupon.</td>
            </tr>
            <tr>
              <td>A rest smaller than {CARD_MIN_CHANGE.toString()} sats can’t be kept on the card; it goes to the shop with the payment.</td>
              <td>“End date” means network time, which runs about an hour behind the clock.</td>
            </tr>
            <tr>
              <td>No tokens can be created out of a card, and a card can’t be spent together with other coins.</td>
              <td>The dollar value moves with the BCH price. The card holds BCH; dollars are shown for convenience.</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Why the network fee is not a separate output: a card is spent one input at a time, so the coins that pay future fees have to sit inside the card. The
          giver adds a fee reserve of {CARD_FEE_RESERVE_SATS.toString()} sats on top of the gift; what it doesn’t use stays on the card and goes to the shop or back
          to the giver.
        </p>

        <h2>What if…</h2>
        {ev && (
          <p className="muted small">
            Proof from the {ev.source}
            {evNet !== NET ? ' — test network; the mainnet run comes next.' : '.'}
          </p>
        )}
        <dl className="cc-whatif">
          <dt>…the card holder tries to cash the card out to their own wallet?</dt>
          <dd>
            The network refuses. On the card press “Try to cash it out” and paste any address; the page sends that transaction straight to a node with no check of
            its own. {ev && <>A node answered, word for word:</>}
            {ev && <pre className="node">{ev.cashOutRefusal}</pre>}
          </dd>
          <dt>…someone signs their own address as “the shop”?</dt>
          <dd>
            The network refuses: the contract checks the shop’s signature with OP_CHECKDATASIG against the shop key fixed in the card.
            {ev && <pre className="node">{ev.forgedShopRefusal}</pre>}
          </dd>
          <dt>…the holder only wants to spend part of it?</dt>
          <dd>
            They pay any amount up to what’s left; the rest returns to the same card in the same transaction, and the card link keeps working.{' '}
            {ev && (
              <>
                Proof: <Proof txid={ev.partial1} label="first part" />, then <Proof txid={ev.partial2} label="second part" /> from the same card.
              </>
            )}
          </dd>
          <dt>…nobody spends it?</dt>
          <dd>
            After the end date anyone can press Return, and the rest goes to the giver’s address. {ev && <Proof txid={ev.returned} label="A card returned to its giver" />}
          </dd>
          <dt>…this website disappears?</dt>
          <dd>
            The card link holds everything needed: the card key, the shop’s signed address and the giver’s address. Any copy of this open-source page, or a short
            script, can spend or return a card with any public Bitcoin Cash server. There is no server of ours in between.
          </dd>
          <dt>…the shop changes its address or closes?</dt>
          <dd>
            Cards already given keep paying the address the shop signed. If the shop can no longer use it, the card simply waits for its end date and then goes
            back to the giver.
          </dd>
        </dl>

        <h2>The contract</h2>
        <p className="muted small">
          CashScript 0.14, compiled to 132 bytes. Tests: every rule has a test that builds the forbidden transaction and checks that both the contract and a
          node-like verifier refuse it; a mutation test removes or weakens each rule in turn and the tests must catch it (35 of 35 caught).
        </p>
        <pre className="cc-source">{cardSource}</pre>
      </main>
      <CcFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
