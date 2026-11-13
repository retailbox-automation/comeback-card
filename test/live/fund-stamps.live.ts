// Live helper (chipnet only): fund N stamps from the lab sponsor wallet through the project's own code,
// write the stamp links and the campaign link to OUT_FILE. Links hold stamp keys, so they go to a file,
// never to the console. Run: FUND=1 LIVE=1 VAULT_JS=<path to vault.mjs> OUT_FILE=<path> npx vitest run
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
import { broadcastRaw, provider } from '../../src/core/chain';
import { encodeCampaignLink, encodeStampLink, termsFor, type CampaignTerms } from '../../src/core/link';
import { DEFAULT_MAX_FEE, publicKeyOf, stampContract } from '../../src/core/stamp';

const run = process.env.FUND === '1' ? it : it.skip;

describe('fund chipnet stamps (helper)', () => {
  run('funds stamps and writes links to OUT_FILE', async () => {
    const vault = process.env.VAULT_JS!;
    const out = process.env.OUT_FILE!;
    const count = Number(process.env.COUNT ?? 2);
    const expiryOffset = BigInt(process.env.EXPIRY_OFFSET ?? 7 * 86400);
    const sats = BigInt(process.env.SATS ?? 20_000);
    expect(vault && out).toBeTruthy();

    let mnemonic = execFileSync('node', [vault, 'get', 'BCHFP_CHIPNET_SPONSOR_SEED'], { encoding: 'utf8' }).trim();
    const root = deriveHdPrivateNodeFromBip39Mnemonic(mnemonic);
    mnemonic = '';
    if (typeof root === 'string') throw new Error(root);
    const prov = provider('chipnet');
    const keyAt = (p: string) => {
      const n = deriveHdPath(root, p);
      if (typeof n === 'string') throw new Error(n);
      return n.privateKey;
    };
    const addrOf = (priv: Uint8Array) =>
      publicKeyToP2pkhCashAddress({ publicKey: secp256k1.derivePublicKeyCompressed(priv) as Uint8Array, prefix: 'bchtest' }).address;

    const coins: Array<{ u: Awaited<ReturnType<typeof prov.getUtxos>>[number]; priv: Uint8Array; address: string }> = [];
    for (const chain of [0, 1]) {
      for (let i = 0; i < 5; i++) {
        const priv = keyAt(`m/44'/145'/0'/${chain}/${i}`);
        const address = addrOf(priv);
        for (const u of await prov.getUtxos(address)) if (!u.token) coins.push({ u, priv, address });
      }
    }
    coins.sort((a, b) => Number(b.u.satoshis - a.u.satoshis));
    const payer = coins[0]!;
    const sponsorAddress = addrOf(keyAt("m/44'/145'/0'/0/0"));
    const sponsorLB = (cashAddressToLockingBytecode(sponsorAddress) as { bytecode: Uint8Array }).bytecode;
    const merchantAddress = process.env.MERCHANT ?? 'bchtest:qq7k45t0cjt8ncpxyrqpcmcsapey22am4v46sxwlxj';
    const merchantLB = (cashAddressToLockingBytecode(merchantAddress) as { bytecode: Uint8Array }).bytecode;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const terms: CampaignTerms = {
      net: 'chipnet',
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
    const fee = 200n + 40n * BigInt(count);
    const b = new TransactionBuilder({ provider: prov }).addInput(payer.u, new SignatureTemplate(payer.priv).unlockP2PKH());
    for (const c of contracts) b.addOutput({ to: c.address, amount: sats });
    b.addOutput({ to: payer.address, amount: payer.u.satoshis - total - fee });
    const r = await broadcastRaw('chipnet', b.build());
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
