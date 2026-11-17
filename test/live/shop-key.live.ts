// One-time helper: make the demo shop's signing key for each network straight into the vault, read it back,
// and print the PUBLIC shop link (shop public key + its signature over the demo shop's address) for src/config.
// The private key never reaches the console or a file. Refuses to overwrite an existing key.
// Run: SHOPKEY=1 LIVE=1 VAULT_JS=<vault.mjs> npx vitest run test/live/shop-key.live.ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { binToHex, cashAddressToLockingBytecode, generatePrivateKey, hexToBin } from '@bitauth/libauth';
import { DEMO_SHOP } from '../../src/config';
import { encodeShopLink, shopLinkOf } from '../../src/core/cardlink';
import { verifyShopApproval } from '../../src/core/card';
import { publicKeyOf } from '../../src/core/stamp';
import type { ChainNet } from '../../src/core/chain';

const run = process.env.SHOPKEY === '1' ? it : it.skip;

describe('demo shop signing keys (helper)', () => {
  run('creates the keys in the vault and prints the public shop links', () => {
    const vault = process.env.VAULT_JS!;
    expect(vault).toBeTruthy();
    for (const net of ['chipnet', 'mainnet'] as ChainNet[]) {
      const name = `BCHCC_${net.toUpperCase()}_DEMO_SHOP_SIGNING_KEY`;
      if (process.env.SHOPKEY_READ_ONLY !== '1') {
        const key = generatePrivateKey();
        const pkBefore = binToHex(publicKeyOf(key));
        execFileSync('node', [vault, 'set', name, `Comeback Card demo shop signing key (${net}), signs ${DEMO_SHOP.address[net]}; made 17.11.2026`], {
          input: binToHex(key),
          stdio: ['pipe', 'ignore', 'inherit'],
        });
        key.fill(0);
        const check = hexToBin(execFileSync('node', [vault, 'get', name], { encoding: 'utf8' }).trim());
        expect(binToHex(publicKeyOf(check))).toBe(pkBefore);
        check.fill(0);
      }
      const back = hexToBin(execFileSync('node', [vault, 'get', name], { encoding: 'utf8' }).trim());
      const lb = (cashAddressToLockingBytecode(DEMO_SHOP.address[net]) as { bytecode: Uint8Array }).bytecode;
      const shop = shopLinkOf({ net, shopName: DEMO_SHOP.name, shopPrivateKey: back, lockingBytecode: lb });
      back.fill(0);
      expect(verifyShopApproval(shop.shopPk, shop.approval)).toBe(true);
      process.stderr.write(`PUBLIC ${net} shopPk=${binToHex(shop.shopPk)} sig=${binToHex(shop.approval.signature)} link=${encodeShopLink(shop)}\n`);
    }
  });
});
