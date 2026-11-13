// Live helper: fund N stamps from the demo sponsor wallet through the project's own code,
// write the stamp links and the campaign link to OUT_FILE. Links hold stamp keys, so they go to a file,
// never to the console. Run: FUND=1 LIVE=1 VAULT_JS=<path to vault.mjs> OUT_FILE=<path> npx vitest run
// NET=mainnet spends real coins and also needs CONFIRM_MAINNET=1. EXPIRY_OFFSET may be negative
// (seconds) to make an already expired stamp; MTP trails the clock by about an hour, so use -7200 or less.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cashAddressToLockingBytecode,
  deriveHdPath,
  deriveHdPrivateNodeFromBip39Mnemonic,
  generatePrivateKey,
  publicKeyToP2pkhCashAddress,
  secp256k1,
} from '@bitauth/libauth';
import { SignatureTemplate, TransactionBuilder } from 'cashscript';
import { broadcastRaw, PREFIX, provider, type ChainNet } from '../../src/core/chain';
import { DEMO_SHOP } from '../../src/config';
import { encodeCampaignLink, encodeStampLink, termsFor, type CampaignTerms } from '../../src/core/link';
import { DEFAULT_MAX_FEE, MIN_STAMP_SATS, publicKeyOf, stampContract } from '../../src/core/stamp';

const run = process.env.FUND === '1' ? it : it.skip;

/** One P2PKH input, N p2sh32 stamp outputs and a change output, at 1 sat/byte, rounded up with room to spare. */
export function fundingFee(count: number): bigint {
  const size = 10 + 148 + 44 * count + 34;
  return BigInt(size + 100 + 10 * count);
}

describe('fund stamps (helper)', () => {
  run('funds stamps and writes links to OUT_FILE', async () => {
    const net = (process.env.NET ?? 'chipnet') as ChainNet;
    if (net !== 'chipnet' && net !== 'mainnet') throw new Error(`NET must be chipnet or mainnet, got ${net}`);
    if (net === 'mainnet' && process.env.CONFIRM_MAINNET !== '1') throw new Error('mainnet spends real coins: set CONFIRM_MAINNET=1');
    const vault = process.env.VAULT_JS!;
    const out = process.env.OUT_FILE!;
    const count = Number(process.env.COUNT ?? 2);
    const expiryOffset = BigInt(process.env.EXPIRY_OFFSET ?? 7 * 86400);
    const sats = BigInt(process.env.SATS ?? 20_000);
    expect(vault && out).toBeTruthy();
    expect(count >= 1 && count <= 50).toBe(true);
    expect(sats >= MIN_STAMP_SATS).toBe(true);

    let mnemonic = execFileSync('node', [vault, 'get', `BCHFP_${net.toUpperCase()}_SPONSOR_SEED`], { encoding: 'utf8' }).trim();
    const root = deriveHdPrivateNodeFromBip39Mnemonic(mnemonic);
    mnemonic = '';
    if (typeof root === 'string') throw new Error(root);
    const prov = provider(net);
    const keyAt = (p: string) => {
      const n = deriveHdPath(root, p);
      if (typeof n === 'string') throw new Error(n);
      return n.privateKey;
    };
    const addrOf = (priv: Uint8Array) =>
      publicKeyToP2pkhCashAddress({ publicKey: secp256k1.derivePublicKeyCompressed(priv) as Uint8Array, prefix: PREFIX[net] }).address;

    const coins: Array<{ u: Awaited<ReturnType<typeof prov.getUtxos>>[number]; priv: Uint8Array; address: string }> = [];
    for (const chain of [0, 1]) {
      for (let i = 0; i < 5; i++) {
        const priv = keyAt(`m/44'/145'/0'/${chain}/${i}`);
        const address = addrOf(priv);
        for (const u of await prov.getUtxos(address)) if (!u.token) coins.push({ u, priv, address });
      }
    }
    coins.sort((a, b) => Number(b.u.satoshis - a.u.satoshis));
    const payer = coins[0];
    if (!payer) throw new Error(`no coins in the ${net} sponsor wallet (first 5 receive and change addresses)`);
    const sponsorAddress = addrOf(keyAt("m/44'/145'/0'/0/0"));
    const sponsorLB = (cashAddressToLockingBytecode(sponsorAddress) as { bytecode: Uint8Array }).bytecode;
    const merchantAddress = process.env.MERCHANT ?? DEMO_SHOP.address[net];
    const merchantLB = (cashAddressToLockingBytecode(merchantAddress) as { bytecode: Uint8Array }).bytecode;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const terms: CampaignTerms = {
      net,
      variant: 'cov',
      merchantLockingBytecode: merchantLB,
      sponsor: sponsorLB,
      expiry: now + expiryOffset,
      maxFee: DEFAULT_MAX_FEE,
      merchantName: process.env.MERCHANT_NAME ?? 'Maple Street Coffee (demo)',
    };
    const keys = Array.from({ length: count }, () => generatePrivateKey());
    const contracts = keys.map((k) => stampContract(termsFor(terms, publicKeyOf(k)), prov));
    const total = sats * BigInt(count);
    const fee = fundingFee(count);
    const change = payer.u.satoshis - total - fee;
    if (change < 546n) throw new Error(`largest coin ${payer.u.satoshis} sats is too small for ${count} × ${sats} + fee ${fee}`);
    const b = new TransactionBuilder({ provider: prov }).addInput(payer.u, new SignatureTemplate(payer.priv).unlockP2PKH());
    for (const c of contracts) b.addOutput({ to: c.address, amount: sats });
    b.addOutput({ to: payer.address, amount: change });
    const hex = b.build();
    expect(BigInt(hex.length / 2)).toBeLessThanOrEqual(fee); // at least 1 sat/byte
    const r = await broadcastRaw(net, hex);
    if (!r.ok) console.log(`NODE REFUSED: ${r.nodeError}`);
    expect(r.ok).toBe(true);
    // Not BASE_URL: vitest sets that one to "/".
    const base = process.env.LINK_BASE ?? 'http://127.0.0.1:5173';
    const lines = [
      `funding ${r.ok ? r.txid : ''}`,
      `campaign ${base}/campaign.html#${encodeCampaignLink({ ...terms, campaignName: process.env.CAMPAIGN ?? 'Lab test', stampPublicKeys: keys.map(publicKeyOf) })}`,
      ...keys.map((k, i) => `stamp${i + 1} ${base}/stamp.html#${encodeStampLink({ ...terms, stampPrivateKey: k })}`),
    ];
    writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
    // Only the public part goes to the console.
    console.log(`FUNDED ${r.ok ? r.txid : ''} stamps=${count} file=${out}`);
  });
});
