// Live run of Comeback Card on a real network, through the project's own code.
// Funds two cards from the demo sponsor wallet in one transaction: card A (open) and card B (already expired).
// Card A: pay the shop part, try to cash it out (the node must refuse), try a thief's own "shop" signature
// (refused), pay a second part, then read the card back from Fulcrum. Card B: return it to the giver.
// Card links hold card keys, so they go to OUT_FILE, never to the console.
// Run: CARD_LIVE=1 LIVE=1 VAULT_JS=<vault.mjs> OUT_FILE=<file> npx vitest run test/live/card.live.ts
// NET=mainnet spends real coins and also needs CONFIRM_MAINNET=1. SHOP_KEY_SECRET names a vault secret
// holding the shop's signing key (hex); without it a one-off key is made for the run (chipnet only).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cashAddressToLockingBytecode,
  deriveHdPath,
  deriveHdPrivateNodeFromBip39Mnemonic,
  generatePrivateKey,
  hexToBin,
  publicKeyToP2pkhCashAddress,
  secp256k1,
} from '@bitauth/libauth';
import { SignatureTemplate, TransactionBuilder, type SpendableUtxo } from 'cashscript';
import { broadcastRaw, medianTimePast, PREFIX, provider, type ChainNet } from '../../src/core/chain';
import { DEMO_SHOP } from '../../src/config';
import {
  CARD_MAX_FEE,
  CARD_MIN_CHANGE,
  approveShopAddress,
  buildCardCashOut,
  buildCardReturn,
  buildCardSpend,
  cardContract,
} from '../../src/core/card';
import { encodeCardLink, encodeShopKeyLink, encodeShopLink, shopLinkOf, type CardLink } from '../../src/core/cardlink';
import { cardState } from '../../src/core/cardstatus';
import { readerOn } from '../../src/core/status';
import { lockingBytecodeOf, publicKeyOf } from '../../src/core/stamp';

const run = process.env.CARD_LIVE === '1' ? it : it.skip;
const lbOf = (address: string) => (cashAddressToLockingBytecode(address) as { bytecode: Uint8Array }).bytecode;
const log: string[] = [];
const note = (s: string) => {
  log.push(s);
  console.log(s);
};

describe('comeback card on a live network', () => {
  run(
    'gift, partial payments, refusals, read-back, return',
    async () => {
      const net = (process.env.NET ?? 'chipnet') as ChainNet;
      if (net !== 'chipnet' && net !== 'mainnet') throw new Error(`NET must be chipnet or mainnet, got ${net}`);
      if (net === 'mainnet' && process.env.CONFIRM_MAINNET !== '1') throw new Error('mainnet spends real coins: set CONFIRM_MAINNET=1');
      const vault = process.env.VAULT_JS!;
      const out = process.env.OUT_FILE!;
      expect(vault && out).toBeTruthy();
      const satsA = BigInt(process.env.SATS_A ?? 30_000);
      const satsB = BigInt(process.env.SATS_B ?? 8_000);
      const pay1 = BigInt(process.env.PAY1 ?? 8_000);
      const pay2 = BigInt(process.env.PAY2 ?? 5_000);

      // Sponsor wallet (the giver in this run).
      let mnemonic = execFileSync('node', [vault, 'get', `BCHFP_${net.toUpperCase()}_SPONSOR_SEED`], { encoding: 'utf8' }).trim();
      const root = deriveHdPrivateNodeFromBip39Mnemonic(mnemonic);
      mnemonic = '';
      if (typeof root === 'string') throw new Error(root);
      const keyAt = (p: string) => {
        const n = deriveHdPath(root, p);
        if (typeof n === 'string') throw new Error(n);
        return n.privateKey;
      };
      const addrOf = (priv: Uint8Array) =>
        publicKeyToP2pkhCashAddress({ publicKey: secp256k1.derivePublicKeyCompressed(priv) as Uint8Array, prefix: PREFIX[net] }).address;
      const prov = provider(net);
      const coins: Array<{ u: SpendableUtxo; priv: Uint8Array; address: string }> = [];
      for (const chain of [0, 1]) {
        for (let i = 0; i < 5; i++) {
          const priv = keyAt(`m/44'/145'/0'/${chain}/${i}`);
          const address = addrOf(priv);
          for (const u of await prov.getUtxos(address)) if (!u.token) coins.push({ u: u as SpendableUtxo, priv, address });
        }
      }
      coins.sort((a, b) => Number(b.u.satoshis - a.u.satoshis));
      const payer = coins[0];
      if (!payer) throw new Error(`no coins in the ${net} sponsor wallet`);
      note(`net ${net} payer coin ${payer.u.satoshis} sats`);
      const giverAddress = addrOf(keyAt("m/44'/145'/0'/0/0"));
      const giverLB = lbOf(giverAddress);

      // Shop: the demo shop's address, approved by a shop signing key.
      const shopKey = process.env.SHOP_KEY_SECRET
        ? hexToBin(execFileSync('node', [vault, 'get', process.env.SHOP_KEY_SECRET], { encoding: 'utf8' }).trim())
        : net === 'chipnet'
          ? generatePrivateKey()
          : (() => {
              throw new Error('mainnet needs SHOP_KEY_SECRET (a stable shop key from the vault)');
            })();
      const shopAddress = DEMO_SHOP.address[net];
      const shopKeyLink = { net, shopName: DEMO_SHOP.name, shopPrivateKey: shopKey, lockingBytecode: lbOf(shopAddress) };
      const shop = shopLinkOf(shopKeyLink);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const mk = (expiry: bigint, fromName: string): CardLink => ({
        ...shop,
        giverLockingBytecode: giverLB,
        expiry,
        maxFee: CARD_MAX_FEE,
        minChange: CARD_MIN_CHANGE,
        fromName,
        cardPrivateKey: generatePrivateKey(),
      });
      const cardA = mk(now + BigInt(process.env.EXPIRY_A ?? 30 * 86400), process.env.FROM_A ?? 'Live run');
      const cardB = mk(now - 7_200n, process.env.FROM_B ?? 'Live run, expired');
      const termsOf = (c: CardLink) => ({
        cardPk: publicKeyOf(c.cardPrivateKey),
        shopPk: c.shopPk,
        giverLockingBytecode: c.giverLockingBytecode,
        expiry: c.expiry,
        maxFee: c.maxFee,
        minChange: c.minChange,
      });
      const contractA = cardContract(termsOf(cardA), prov);
      const contractB = cardContract(termsOf(cardB), prov);

      // 1. Funding: both cards in one transaction from the giver's wallet.
      const fee = 10n + 148n + 44n * 2n + 34n + 120n;
      const change = payer.u.satoshis - satsA - satsB - fee;
      if (change < 546n) throw new Error(`payer coin too small: ${payer.u.satoshis}`);
      const fundHex = new TransactionBuilder({ provider: prov })
        .addInput(payer.u, new SignatureTemplate(payer.priv).unlockP2PKH())
        .addOutput({ to: contractA.address, amount: satsA })
        .addOutput({ to: contractB.address, amount: satsB })
        .addOutput({ to: payer.address, amount: change })
        .build();
      const fund = await broadcastRaw(net, fundHex);
      if (!fund.ok) note(`NODE REFUSED funding: ${fund.nodeError}`);
      expect(fund.ok).toBe(true);
      const fundTxid = fund.ok ? fund.txid : '';
      note(`funding ${fundTxid}`);
      const utxoA: SpendableUtxo = { txid: fundTxid, vout: 0, satoshis: satsA, lockingBytecode: contractA.lockingBytecode };
      const utxoB: SpendableUtxo = { txid: fundTxid, vout: 1, satoshis: satsB, lockingBytecode: contractB.lockingBytecode };

      // 2. Card A, first partial payment.
      const s1 = buildCardSpend(contractA, prov, utxoA, cardA.cardPrivateKey, cardA.approval, pay1);
      expect(s1.kind).toBe('part');
      const r1 = await broadcastRaw(net, s1.builder.build());
      if (!r1.ok) note(`NODE REFUSED pay1: ${r1.nodeError}`);
      expect(r1.ok).toBe(true);
      const tx1 = r1.ok ? r1.txid : '';
      note(`pay1 ${tx1} paid ${s1.paid} rest ${s1.rest} fee ${s1.fee}`);
      const rest1: SpendableUtxo = { txid: tx1, vout: 1, satoshis: s1.rest, lockingBytecode: contractA.lockingBytecode };

      // 3. Cash out to the giver's own address with the shop's real signature: the node must refuse.
      const cash = buildCardCashOut(contractA, prov, rest1, cardA.cardPrivateKey, cardA.approval, giverLB);
      const rc = await broadcastRaw(net, cash.builder.build());
      expect(rc.ok).toBe(false);
      note(`cash-out refused: ${rc.ok ? 'ACCEPTED?!' : rc.nodeError}`);

      // 4. A thief signs their own address as "the shop": the node must refuse (OP_CHECKDATASIG).
      const thiefKey = generatePrivateKey();
      const thiefLB = giverLB; // any address that is not the shop's
      const fake = approveShopAddress(thiefKey, thiefLB);
      const forged = new TransactionBuilder({ provider: prov })
        .addInput(rest1, contractA.unlock.spend!(new SignatureTemplate(cardA.cardPrivateKey), fake.signature, fake.lockingBytecode))
        .addOutput({ to: thiefLB, amount: rest1.satoshis - 800n })
        .build();
      const rf = await broadcastRaw(net, forged);
      expect(rf.ok).toBe(false);
      note(`forged shop signature refused: ${rf.ok ? 'ACCEPTED?!' : rf.nodeError}`);

      // 5. Second partial payment from the rest (same card link).
      const s2 = buildCardSpend(contractA, prov, rest1, cardA.cardPrivateKey, cardA.approval, pay2);
      const r2 = await broadcastRaw(net, s2.builder.build());
      if (!r2.ok) note(`NODE REFUSED pay2: ${r2.nodeError}`);
      expect(r2.ok).toBe(true);
      note(`pay2 ${r2.ok ? r2.txid : ''} paid ${s2.paid} rest ${s2.kind === 'part' ? s2.rest : 0n} fee ${s2.fee}`);

      // 6. Card B is already expired (network time): anyone returns it to the giver.
      const mtp = await medianTimePast(net);
      note(`network time ${mtp}, card B expiry ${cardB.expiry}, expired ${mtp >= cardB.expiry}`);
      const ret = buildCardReturn(contractB, prov, utxoB, giverLB, cardB.expiry);
      const rr = await broadcastRaw(net, ret.builder.build());
      if (!rr.ok) note(`NODE REFUSED return: ${rr.nodeError}`);
      expect(rr.ok).toBe(true);
      note(`return ${rr.ok ? rr.txid : ''} back ${satsB - ret.fee} fee ${ret.fee}`);

      // 7. Read card A back from Fulcrum through the app's own reader (0-conf is enough to be listed).
      await new Promise((r) => setTimeout(r, 3_000));
      const sA = await cardState(readerOn(prov), lockingBytecodeOf(contractA.address), cardA.approval.lockingBytecode, giverLB);
      note(`card A read-back: funded ${sA.fundedSatoshis} balance ${sA.balanceSatoshis} events ${sA.events.map((e) => e.kind).join(',')}`);
      expect(sA.fundedSatoshis).toBe(satsA);
      expect(sA.events.filter((e) => e.kind === 'paid')).toHaveLength(2);
      expect(sA.balanceSatoshis).toBe(satsA - s1.paid - s1.fee - s2.paid - s2.fee);

      const base = process.env.LINK_BASE ?? 'http://127.0.0.1:5173';
      writeFileSync(
        out,
        [
          ...log,
          `shop ${base}/give.html#${encodeShopLink(shop)}`,
          `shopkey ${base}/for-shops.html#${encodeShopKeyLink(shopKeyLink)}`,
          `cardA ${base}/card.html#${encodeCardLink(cardA)}`,
          `cardB ${base}/card.html#${encodeCardLink(cardB)}`,
        ].join('\n') + '\n',
        { mode: 0o600 },
      );
      console.log(`LINKS file=${out}`);
    },
    120_000,
  );
});
