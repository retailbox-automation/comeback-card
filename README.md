# First Purchase

**A $0.25 Bitcoin Cash stamp that can only be spent at one shop.** A community or event hands out stamps; a newcomer pays with one at a local shop from their phone, no wallet needed. The coin itself refuses to go anywhere else. Unspent stamps go back to the sponsor after a date.

Built for BCH BLAZE 2026. New work, started during the hackathon. MIT licence.

> Draft. Mainnet links and the live site are added before submission.

## Judge it in 2 minutes
| Step | What you do | What you see |
|---|---|---|
| 1 | Open the site, connect a WizardConnect wallet (Selene 2026.10+, Cashonize, Paytaca) | your wallet, network and balance |
| 2 | Create 2 stamps for the demo shop | one transaction; two stamp links |
| 3 | Open stamp 1 on your phone, press **Buy** | “Paid”, 0-conf, then confirmed; a sticker at the shop counter |
| 4 | Open stamp 2, press **Try to send it anywhere else**, paste your own address | the node’s own refusal, word for word |
| 5 | Open the campaign | spent / returned / waiting, each with its transaction |

## Proof
| Claim | Evidence | What you will see |
|---|---|---|
| A stamp can only pay its shop | `contracts/stamp_cov.cash`, `test/stamp.test.ts` | spend to any other address is refused by the node: `mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)` |
| The refusal comes from the network, not from us | `web/stamp.tsx` sends the raw transaction with no local check (`src/core/chain.ts` `broadcastRaw`) | the text above, as returned by a Fulcrum node |
| Unspent stamps go back only to the sponsor | `reclaim()` in `contracts/stamp_cov.cash` | after the date anyone can press Return; the coins can only reach the sponsor’s address |
| No server holds stamps or keys | `src/core/link.ts`: the stamp key and terms live in the URL fragment; the site is static (`dist/`) | pages talk straight to public Fulcrum nodes |
| Every contract rule is tested | `npm test` (65 tests), `npm run test:mutation` | removing any one of 13 rules makes the tests fail |

Chipnet runs of every step (13.11.2026): funding `a7a48104…`, contract-input signing by Cashonize and Selene `b0963c62…`, `95725d86…`, covenant return `90b4ec57…`, shop payment `3fd5d78b…` — full list in `docs/spike/SPIKE-2026-11-13.md`.

## How it works
Each stamp is its own coin locked by a small CashScript contract:

```
spend(sig stampSig)        anyone holding the stamp link
  one input, one output
  output == the shop's address
  output >= stamp - fee cap (2,000 sats)

reclaim()                  anyone, after the expiry date
  tx.time >= expiry
  one input, one output
  output == the sponsor's address
  output >= stamp - fee cap
```

The stamp link carries the stamp key after the `#`. Browsers do not send that part to any server.

## Architecture
- `contracts/` — the stamp contract. `stamp_cov.cash` is the default; `stamp.cash` (sponsor signs the return) stays behind `VITE_STAMP_VARIANT=sig`.
- `src/core/` — plain TypeScript, no UI: `stamp` (contract and transactions), `link` (stamp and campaign links), `status` (spent / returned / waiting from chain history), `create` (funding plan), `wallet` (WizardConnect), `chain` (Fulcrum servers, network time), `view` (plain-language node errors), `shop`, `price`.
- `web/` — pages: create, stamp, shop counter, campaign.
- No backend, no database. A campaign is its link: public keys of its stamps; status is read live from the chain.

## Honest limits
- A shop could open stamp links and spend them itself — the same risk as a paper coupon. The campaign page counts “spent at the shop”, with a link to each transaction, not “purchases”.
- After the expiry date a stamp can still be spent until someone returns it; the network keeps whichever transaction it sees first.
- “0-conf” means every node has seen the payment; a block makes it final.
- WizardConnect uses public relays; if none answers, the page says so and nothing is sent.

## Run it
```
npm install
npm test                 # 65 tests on Mocknet
npm run test:mutation    # 13 mutants, all must be killed
npx vite                 # http://127.0.0.1:5173 (chipnet by default; VITE_NET=mainnet for mainnet)
```

## How AI was used
Built with an AI coding assistant: contract drafts, tests, page code and this README were written with AI help, then checked by running them on Mocknet and chipnet (see Proof).
