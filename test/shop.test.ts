import { describe, expect, it } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import { generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { DEFAULT_MAX_FEE, buildSpend, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';
import { classifyPayment, newestFirst } from '../src/core/shop';

function p2pkh(priv: Uint8Array) {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(priv), prefix: 'bchtest' });
  return { address, lb: lockingBytecodeOf(address) };
}

describe('shop: classify incoming payments', () => {
  for (const variant of ['cov', 'sig'] as const) {
    it(`a stamp spend (${variant}) is recognised as a First Purchase payment`, async () => {
      const provider = new MockNetworkProvider();
      const merchant = p2pkh(generatePrivateKey());
      const sponsorKey = generatePrivateKey();
      const stampKey = generatePrivateKey();
      const contract = stampContract(
        {
          variant,
          stampPk: publicKeyOf(stampKey),
          merchantLockingBytecode: merchant.lb,
          sponsorPk: variant === 'sig' ? publicKeyOf(sponsorKey) : undefined,
          sponsorLockingBytecode: variant === 'cov' ? p2pkh(sponsorKey).lb : undefined,
          expiry: 1_794_600_000n,
          maxFee: DEFAULT_MAX_FEE,
        },
        provider,
      );
      const utxo = provider.addUtxo(contract.address, randomUtxo({ satoshis: 110_000n }));
      const { builder, fee } = buildSpend(contract, provider, utxo, stampKey, merchant.lb);
      const p = classifyPayment('aa'.repeat(32), builder.build(), 0, merchant.lb);
      expect(p.fromStamp).toBe(true);
      expect(p.receivedSatoshis).toBe(110_000n - fee);
      expect(p.confirmed).toBe(false);
    });
  }

  it('an ordinary wallet payment is not counted as a stamp', async () => {
    const provider = new MockNetworkProvider();
    const merchant = p2pkh(generatePrivateKey());
    const payerKey = generatePrivateKey();
    const payer = p2pkh(payerKey);
    const u = provider.addUtxo(payer.address, randomUtxo({ satoshis: 50_000n }));
    const hex = new TransactionBuilder({ provider })
      .addInput(u, new SignatureTemplate(payerKey).unlockP2PKH())
      .addOutput({ to: merchant.address, amount: 49_000n })
      .build();
    const p = classifyPayment('bb'.repeat(32), hex, 332_000, merchant.lb);
    expect(p.fromStamp).toBe(false);
    expect(p.receivedSatoshis).toBe(49_000n);
    expect(p.confirmed).toBe(true);
  });

  it('orders unconfirmed first, then newest block', () => {
    const order = newestFirst([{ height: 10 }, { height: 0 }, { height: 12 }, { height: -1 }]).map((x) => x.height);
    expect(order.slice(0, 2).every((h) => h <= 0)).toBe(true);
    expect(order.slice(2)).toEqual([12, 10]);
  });
});
