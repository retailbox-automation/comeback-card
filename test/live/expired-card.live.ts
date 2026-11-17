// Live helper: fund ONE Comeback Card whose end date is already past (network time), for the home page's
// "A card past its end date" button: a judge opens it and presses Return, no wallet needed, and the coins go back
// to the giver (the demo sponsor). Uses all of the sponsor's coins; the card link goes to OUT_FILE only.
// Run: EXPIRED_CARD=1 LIVE=1 NET=mainnet CONFIRM_MAINNET=1 SHOP_KEY_SECRET=BCHCC_MAINNET_DEMO_SHOP_SIGNING_KEY \
//      VAULT_JS=<vault.mjs> OUT_FILE=<file> npx vitest run test/live/expired-card.live.ts
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
import { CARD_MAX_FEE, CARD_MIN_CHANGE, cardContract } from '../../src/core/card';
import { cardTermsOf, encodeCardLink, shopLinkOf, type CardLink } from '../../src/core/cardlink';
import { DUST_SATS } from '../../src/core/stamp';

const run = process.env.EXPIRED_CARD === '1' ? it : it.skip;
const lbOf = (address: string) => (cashAddressToLockingBytecode(address) as { bytecode: Uint8Array }).bytecode;

describe('expired demo card (helper)', () => {
  run(
    'funds one card that has already ended and writes its link to OUT_FILE',
    async () => {
      const net = (process.env.NET ?? 'chipnet') as ChainNet;
      if (net === 'mainnet' && process.env.CONFIRM_MAINNET !== '1') throw new Error('mainnet spends real coins: set CONFIRM_MAINNET=1');
      const vault = process.env.VAULT_JS!;
      const out = process.env.OUT_FILE!;
      const shopSecret = process.env.SHOP_KEY_SECRET!;
      expect(vault && out && shopSecret).toBeTruthy();
      const sats = BigInt(process.env.SATS ?? 2_000);
      const ago = BigInt(process.env.EXPIRY_AGO ?? 7_200);

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
      const coins: Array<{ u: SpendableUtxo; priv: Uint8Array }> = [];
      for (const chain of [0, 1]) {
        for (let i = 0; i < 5; i++) {
          const priv = keyAt(`m/44'/145'/0'/${chain}/${i}`);
          for (const u of await prov.getUtxos(addrOf(priv))) if (!u.token) coins.push({ u: u as SpendableUtxo, priv });
        }
      }
      const sum = coins.reduce((s, c) => s + c.u.satoshis, 0n);
      console.log(`sponsor coins ${coins.length}, ${sum} sats`);
      const giverAddress = addrOf(keyAt("m/44'/145'/0'/0/0"));

      const shopKey = hexToBin(execFileSync('node', [vault, 'get', shopSecret], { encoding: 'utf8' }).trim());
      const shop = shopLinkOf({ net, shopName: DEMO_SHOP.name, shopPrivateKey: shopKey, lockingBytecode: lbOf(DEMO_SHOP.address[net]) });
      shopKey.fill(0);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const card: CardLink = {
        ...shop,
        giverLockingBytecode: lbOf(giverAddress),
        expiry: now - ago,
        maxFee: CARD_MAX_FEE,
        minChange: CARD_MIN_CHANGE,
        fromName: process.env.FROM ?? 'Comeback Card demo, ended',
        cardPrivateKey: generatePrivateKey(),
      };
      const contract = cardContract(cardTermsOf(card), prov);
      const mtp = await medianTimePast(net);
      expect(mtp >= card.expiry).toBe(true); // already ended by network time, or the button would lie

      const make = (change: bigint) => {
        const b = new TransactionBuilder({ provider: prov });
        for (const c of coins) b.addInput(c.u, new SignatureTemplate(c.priv).unlockP2PKH());
        b.addOutput({ to: contract.address, amount: sats });
        if (change >= DUST_SATS) b.addOutput({ to: giverAddress, amount: change });
        return b;
      };
      const size = BigInt(make(DUST_SATS).build().length / 2);
      const fee = size + 10n;
      const change = sum - sats - fee;
      if (change < DUST_SATS) throw new Error(`not enough: ${sum} sats for ${sats} + fee ${fee} + change`);
      const hex = make(change).build();
      expect(BigInt(hex.length / 2)).toBeLessThanOrEqual(fee);
      const r = await broadcastRaw(net, hex);
      if (!r.ok) console.log(`NODE REFUSED: ${r.nodeError}`);
      expect(r.ok).toBe(true);
      const base = process.env.LINK_BASE ?? 'http://127.0.0.1:5174';
      writeFileSync(out, `funding ${r.ok ? r.txid : ''}\nnetwork-time ${mtp} expiry ${card.expiry}\ncardC ${base}/card.html#${encodeCardLink(card)}\n`, { mode: 0o600 });
      console.log(`FUNDED ${r.ok ? r.txid : ''} card ${sats} sats fee ${fee} change ${change} file=${out}`);
    },
    120_000,
  );
});
