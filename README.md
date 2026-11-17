# Comeback Card

**The gift card that gives back what isn’t spent.** Anyone gives a Bitcoin Cash card for one shop. The person who gets it spends it there in parts, from a phone, with no wallet. Whatever is left after the end date can only go back to the giver. The shop pays nothing, and every rule is checked by the network, not by a server.

Live: https://comebackcard.retailbox-automation.com (mainnet). Built for BCH BLAZE 2026, MIT licence.
Earlier demo of the same engine: [First Purchase](https://firstpurchase.retailbox-automation.com), stamps for one shop (see the end of this page).

> Draft. Slides and the public repository link are added before submission.

## Judge it in 2 minutes
| Step | What you do | What you see |
|---|---|---|
| 1 | Open the site, press **Connect wallet to give** (WizardConnect: Selene 2026.10+, Cashonize, Paytaca) | your wallet and balance |
| 2 | Pick an amount and an end date, press **Give** | one transaction; a card link |
| 3 | Open the card on your phone, press **Pay** | the shop gets that amount; the rest stays on the same card; “0-conf”, then “Confirmed” |
| 4 | On the card press **Try to cash it out**, paste your own address | the node’s own refusal, word for word |

## Proof on mainnet (Nov 17, 2026)
| Claim | Transaction or node answer |
|---|---|
| A card is funded by the giver | `ddf4eff8f1ca08f81ababb161ea074a3206b1ea203540819aebf05f1cacacd5a` |
| It is spent in parts; the rest returns to the same card | `d36b481a0cba12b21966200a1095796cc25a1e0ffd2fe3a60ff32835f0a8642c`, then `9ee228ce100142ac9c042522eff1cac5ff3236e901cf655a56c216d043758edf` |
| It can’t be cashed out to any other address | node: `mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)` |
| Nobody can sign their own address as “the shop” | node: `mandatory-script-verify-flag-failed (Signature must be zero for failed CHECK(MULTI)SIG operation) (code 16)` |
| After the end date the rest goes back to the giver | `ca723a5da01ea0da320e5f32f417a233b145166b0b1525a9405eaa3eb6d0c1e9` |
| A card that has already ended waits on the home page (“A card past its end date”); anyone can send it back | funded `397143bc6069a562861c3e9458295921484c1923d5468bce1274dd0262559c20` |

The same run on chipnet: funding `7bce8b7e…`, parts `7721b3d3…` and `066a06f2…`, return `8ab08dc0…`, and the same two refusals (`src/ui/cc/evidence.ts`).

## What it guarantees, and what it doesn’t
| Guaranteed by the network | Not guaranteed |
|---|---|
| Money on the card can only go to the one address the shop signed with its key, or back onto the same card. | The giver knows the card link too and could spend at the same shop first. |
| After the end date, what’s left can only go back to the giver. | The return isn’t automatic: someone has to press Return (anyone can, no wallet). Until then the card can still be spent at the shop; the network keeps whichever transaction it sees first. |
| The shop gets the full amount of every payment; the fee comes from the card, at most 1,000 sats per transaction. | The shop could spend a card link it was shown, like a paper coupon. |
| No tokens can be created out of a card; a card is never spent together with other coins. | “End date” is network time, about an hour behind the clock. Dollar amounts move with the BCH price. |

**Why the network fee is not a separate output.** A card is spent one input at a time, so the coins that pay future fees have to sit inside it. The giver adds a fee reserve (2,000 sats) on top of the gift and sees it as a separate line before signing; the shop is never charged.

**The shop needs one signing key.** On the For shops page a shop makes a key in its own browser and signs its receiving address once. Cards check that signature with `OP_CHECKDATASIG`. A POS that shows a new address for every sale is not supported yet.

**How it differs.** Paytaca Gifts and CashStamps take back a gift nobody claims, but once claimed the coins can be spent anywhere. Regulars rewards are paid by the shop itself. Here anyone gives a purchase at one shop, and whatever the person doesn’t spend comes back to the giver.

## How it works
```
spend(sig cardSig, datasig shopSig, bytes shopLockingBytecode)   whoever holds the card link
  checkSig(cardSig, cardPk)
  checkDataSig(shopSig, "CBC1" + shopLockingBytecode, shopPk)    the shop signed this address
  one input; no tokens on any output
  output 0 == the shop's address
  two outputs: output 1 == this same card, >= 1,000 sats; outputs >= input - fee cap
  one output:  output 0 >= input - fee cap                       (a rest too small to keep goes to the shop)

reclaim()                                                         anyone, after the end date
  tx.time >= expiry; one input; one output == the giver's address; >= input - fee cap
```
The card link carries the card key, the shop’s signed address and the giver’s address after the `#`. Browsers never send that part to a server, and the site has no server of its own.

## Tests
- `npm test` — 139 tests on Mocknet. Every card rule has a test that builds the forbidden transaction and checks that both the contract and a node-like verifier refuse it. The card status is tested on real transactions in shuffled order.
- `npm run test:mutation` — 35 mutants (each rule removed or weakened in turn), all must be killed.
- `CARD_LIVE=1 LIVE=1 npx vitest run test/live/card.live.ts` — the live run above (keys from a vault, links written to a file).

## Architecture
- `contracts/card.cash` — the card. `contracts/stamp_cov.cash`, `stamp.cash` — First Purchase stamps.
- `src/core/` — plain TypeScript: `card` (contract, shop approval, transactions), `cardlink` (card, shop and shop-key links), `cardstatus` (gifts, payments, return from the address history), `chain` (Fulcrum, network time), `wallet` (WizardConnect), `create` (funding plan), `shop` (counter), `price`.
- `web-card/` — Comeback Card pages: home, give, card, rules, for shops, counter. `web/` — First Purchase pages.
- No backend, no database.

## Run it
```
npm install
npm test
npm run test:mutation
npx vite -c vite.card.config.ts      # http://127.0.0.1:5174 (chipnet by default; VITE_NET=mainnet for mainnet)
```

## First Purchase (the earlier demo)
Comeback Card grew out of First Purchase, built in the first days of BCH BLAZE 2026: a $0.25 stamp that can only be spent at one shop, with the whole stamp paid at once. Live at https://firstpurchase.retailbox-automation.com with real mainnet stamps (a stamp paid at the demo shop: `0826c62adac57aa91227336eedb7e8d5f0e8d5e14fcbf4fa102f7bdb40cfd4b6`). Run it with `npx vite` (port 5173).
