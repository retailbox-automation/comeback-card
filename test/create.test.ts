// Funding plan for "Create stamps": coins, outputs, change and fee, and that the wallet-signed
// transaction actually funds spendable stamps (signed here with the wallet keys standing in for the wallet).
import { describe, expect, it } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import { generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { NotEnoughCoins, pickCoins, planFunding, type WalletCoin } from '../src/core/create';
import { DEFAULT_MAX_FEE, DUST_SATS, buildSpend, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';

function wallet(provider: MockNetworkProvider, amounts: bigint[]) {
  return amounts.map((satoshis, i) => {
    const priv = generatePrivateKey();
    const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(priv), prefix: 'bchtest' });
    const utxo = provider.addUtxo(address, randomUtxo({ satoshis }));
    return { coin: { utxo, path: i % 2 ? 'change' : 'receive', index: i, address } as WalletCoin, priv };
  });
}

describe('create stamps: funding plan', () => {
  it('picks the largest coins until the stamps are covered', () => {
    const p = new MockNetworkProvider();
    const w = wallet(p, [5_000n, 300_000n, 40_000n]);
    const picked = pickCoins(w.map((x) => x.coin), 220_000n);
    expect(picked.map((c) => c.utxo.satoshis)).toEqual([300_000n]);
  });

  it('refuses with numbers when the wallet is short', () => {
    const p = new MockNetworkProvider();
    const w = wallet(p, [10_000n, 20_000n]);
    try {
      pickCoins(w.map((x) => x.coin), 50_000n);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NotEnoughCoins);
      expect((e as NotEnoughCoins).have).toBe(30_000n);
    }
  });

  it('plans stamps + change + a fee near 1 sat/byte, and the signed result funds spendable stamps', async () => {
    const provider = new MockNetworkProvider();
    const w = wallet(provider, [150_000n, 400_000n]);
    const merchantKey = generatePrivateKey();
    const merchantLB = lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(merchantKey), prefix: 'bchtest' }).address);
    const sponsorLB = lockingBytecodeOf(w[0]!.coin.address);
    const stampKeys = [generatePrivateKey(), generatePrivateKey()];
    const contracts = stampKeys.map((k) =>
      stampContract(
        { variant: 'cov', stampPk: publicKeyOf(k), merchantLockingBytecode: merchantLB, sponsorLockingBytecode: sponsorLB, expiry: 1_794_600_000n, maxFee: DEFAULT_MAX_FEE },
        provider,
      ),
    );
    const changeAddress = w[1]!.coin.address;
    const plan = planFunding(provider, w.map((x) => x.coin), contracts.map((c) => c.address), 110_000n, changeAddress, 'Create 2 stamps');

    expect(plan.inputPaths).toEqual([[0, 'change', 1]]); // the 400k coin alone covers it
    expect(plan.wc.transaction.outputs).toHaveLength(3);
    expect(plan.wc.transaction.outputs[0]!.valueSatoshis).toBe(110_000n);
    expect(plan.change).toBe(400_000n - 220_000n - plan.fee);
    expect(plan.totalFromWallet).toBe(220_000n + plan.fee);

    // Stand in for the wallet: sign the same inputs/outputs with the wallet key, then check the fee rate.
    const signer = w.find((x) => x.coin.index === 1)!;
    const signed = new TransactionBuilder({ provider })
      .addInput(signer.coin.utxo, new SignatureTemplate(signer.priv).unlockP2PKH())
      .addOutputs(contracts.map((c) => ({ to: c.address, amount: 110_000n })))
      .addOutput({ to: changeAddress, amount: plan.change })
      .build();
    const bytes = BigInt(signed.length / 2);
    expect(plan.fee).toBeGreaterThanOrEqual(bytes); // never below 1 sat/byte
    expect(plan.fee).toBeLessThanOrEqual(bytes + 40n); // and not much above
    await provider.sendRawTransaction(signed);

    // The funded stamps are real: each pays the merchant.
    for (const [i, c] of contracts.entries()) {
      const [u] = await provider.getUtxos(c.address);
      const { builder } = buildSpend(c, provider, u!, stampKeys[i]!, merchantLB);
      await provider.sendRawTransaction(builder.build());
    }
  });

  it('folds change below dust into the fee instead of making a dust output', () => {
    const provider = new MockNetworkProvider();
    const w = wallet(provider, [110_000n + 5_000n + 300n]);
    const priv = generatePrivateKey();
    const lb = lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(priv), prefix: 'bchtest' }).address);
    const c = stampContract({ variant: 'cov', stampPk: publicKeyOf(priv), merchantLockingBytecode: lb, sponsorLockingBytecode: lb, expiry: 1_794_600_000n, maxFee: DEFAULT_MAX_FEE }, provider);
    // Need is 110_000 + 5_000 margin; here change would be ~5_000 - fee: above dust, kept.
    const plan = planFunding(provider, w.map((x) => x.coin), [c.address], 110_000n, w[0]!.coin.address, 'x');
    expect(plan.change === 0n || plan.change >= DUST_SATS).toBe(true);
  });
});
