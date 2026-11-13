// Contract tests on Mocknet. Every "rejected" case is checked twice:
//  1) debug evaluation names the failed require (what our code expects),
//  2) the raw transaction goes to MockNetworkProvider.sendRawTransaction, which evaluates it
//     against the real locking bytecode like a node would (what the network does).
import { describe, expect, it, beforeEach } from 'vitest';
import 'cashscript/vitest';
import {
  MockNetworkProvider,
  SignatureTemplate,
  TransactionBuilder,
  randomUtxo,
  type Contract,
  type SpendableUtxo,
} from 'cashscript';
import { generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import {
  DEFAULT_MAX_FEE,
  DUST_SATS,
  MIN_STAMP_SATS,
  buildReclaimCov,
  buildReclaimSig,
  buildSpend,
  buildSpendElsewhere,
  lockingBytecodeOf,
  networkOfAddress,
  publicKeyOf,
  stampContract,
  type StampTerms,
  type Variant,
} from '../src/core/stamp';

const STAMP_SATS = 110_000n; // ≈ $0.25 at $227/BCH
const NOW = 1_794_600_000n; // 2026-11-13
const EXPIRY = NOW + 7n * 86_400n;

/** P2PKH locking bytecode via a chipnet address, the same path the app uses for wallet addresses. */
function p2pkhLockingBytecode(privateKey: Uint8Array): Uint8Array {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(privateKey), prefix: 'bchtest' });
  return lockingBytecodeOf(address);
}

interface World {
  provider: MockNetworkProvider;
  stampKey: Uint8Array;
  sponsorKey: Uint8Array;
  merchantLB: Uint8Array;
  sponsorLB: Uint8Array;
  thiefLB: Uint8Array;
  contract: Contract;
  utxo: SpendableUtxo;
  terms: StampTerms;
}

function makeWorld(variant: Variant): World {
  const provider = new MockNetworkProvider();
  const stampKey = generatePrivateKey();
  const sponsorKey = generatePrivateKey();
  const merchantLB = p2pkhLockingBytecode(generatePrivateKey());
  const sponsorLB = p2pkhLockingBytecode(sponsorKey);
  const thiefLB = p2pkhLockingBytecode(generatePrivateKey());
  const terms: StampTerms = {
    variant,
    stampPk: publicKeyOf(stampKey),
    merchantLockingBytecode: merchantLB,
    sponsorPk: variant === 'sig' ? publicKeyOf(sponsorKey) : undefined,
    sponsorLockingBytecode: variant === 'cov' ? sponsorLB : undefined,
    expiry: EXPIRY,
    maxFee: DEFAULT_MAX_FEE,
  };
  const contract = stampContract(terms, provider);
  const utxo = provider.addUtxo(contract.address, randomUtxo({ satoshis: STAMP_SATS }));
  return { provider, stampKey, sponsorKey, merchantLB, sponsorLB, thiefLB, contract, utxo, terms };
}

async function nodeRejects(provider: MockNetworkProvider, builder: TransactionBuilder): Promise<string> {
  const hex = builder.build();
  try {
    await provider.sendRawTransaction(hex);
  } catch (e) {
    return String((e as Error).message ?? e);
  }
  throw new Error('node accepted a transaction it should have rejected');
}

for (const variant of ['sig', 'cov'] as const) {
  describe(`stamp variant ${variant}: spend`, () => {
    let w: World;
    beforeEach(() => {
      w = makeWorld(variant);
    });

    it('pays the merchant: whole stamp minus a fee under the cap', async () => {
      const { builder, fee } = buildSpend(w.contract, w.provider, w.utxo, w.stampKey, w.merchantLB);
      expect(builder).not.toFailRequire();
      expect(fee).toBeGreaterThan(0n);
      expect(fee).toBeLessThanOrEqual(DEFAULT_MAX_FEE);
      const txid = await w.provider.sendRawTransaction(builder.build());
      expect(txid).toMatch(/^[0-9a-f]{64}$/);
      const paid = await w.provider.getUtxosForLockingBytecode(w.merchantLB);
      expect(paid).toHaveLength(1);
      expect(paid[0]!.satoshis).toBe(STAMP_SATS - fee);
    });

    it('rejects paying any other address', async () => {
      const { builder } = buildSpendElsewhere(w.contract, w.provider, w.utxo, w.stampKey, w.thiefLB);
      expect(builder).toFailRequireWith('output must pay the merchant');
      await nodeRejects(w.provider, builder);
    });

    it('rejects an extra output (e.g. change to the holder)', async () => {
      const b = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(w.stampKey)))
        .addOutput({ to: w.merchantLB, amount: 50_000n })
        .addOutput({ to: w.thiefLB, amount: STAMP_SATS - 50_000n - 1_000n });
      expect(b).toFailRequireWith('exactly one output: the merchant');
      await nodeRejects(w.provider, b);
    });

    it('rejects a fee above the cap (value burned to miners)', async () => {
      const b = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(w.stampKey)))
        .addOutput({ to: w.merchantLB, amount: STAMP_SATS - DEFAULT_MAX_FEE - 1n });
      expect(b).toFailRequireWith('fee above the cap');
      await nodeRejects(w.provider, b);
    });

    it('accepts a fee exactly at the cap', async () => {
      const b = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(w.stampKey)))
        .addOutput({ to: w.merchantLB, amount: STAMP_SATS - DEFAULT_MAX_FEE });
      expect(b).not.toFailRequire();
      await w.provider.sendRawTransaction(b.build());
    });

    it('rejects a signature from any key other than the stamp key', async () => {
      const b = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(generatePrivateKey())))
        .addOutput({ to: w.merchantLB, amount: STAMP_SATS - 1_000n });
      expect(b).toFailRequireWith('stamp key signature required');
      await nodeRejects(w.provider, b);
    });

    it('rejects spending two stamps in one transaction', async () => {
      const second = w.provider.addUtxo(w.contract.address, randomUtxo({ satoshis: STAMP_SATS }));
      const unlocker = w.contract.unlock.spend!(new SignatureTemplate(w.stampKey));
      const b = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, unlocker)
        .addInput(second, unlocker)
        .addOutput({ to: w.merchantLB, amount: STAMP_SATS * 2n - 1_000n });
      expect(b).toFailRequireWith('stamp must be spent alone');
      await nodeRejects(w.provider, b);
    });

    it('rejects a double spend: a second, different transaction on the same stamp UTXO', async () => {
      const first = buildSpend(w.contract, w.provider, w.utxo, w.stampKey, w.merchantLB);
      await w.provider.sendRawTransaction(first.builder.build());
      // Different amount -> different txid, same input: a real conflicting spend, not a resubmission.
      const second = new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(w.stampKey)))
        .addOutput({ to: w.merchantLB, amount: STAMP_SATS - first.fee - 1n });
      expect(second.build()).not.toBe(first.builder.build());
      await nodeRejects(w.provider, second);
    });
  });
}

describe('stamp variant sig: reclaim', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld('sig');
  });

  it('rejects reclaim before expiry', async () => {
    const { builder } = buildReclaimSig(
      w.contract, w.provider, w.utxo, new SignatureTemplate(w.sponsorKey), w.sponsorLB, EXPIRY - 1n,
    );
    expect(builder).toFailRequireWith('stamp has not expired yet');
    await nodeRejects(w.provider, builder);
  });

  it('allows reclaim after expiry with the sponsor key', async () => {
    const { builder } = buildReclaimSig(
      w.contract, w.provider, w.utxo, new SignatureTemplate(w.sponsorKey), w.sponsorLB, EXPIRY,
    );
    expect(builder).not.toFailRequire();
    await w.provider.sendRawTransaction(builder.build());
    expect(await w.provider.getUtxosForLockingBytecode(w.sponsorLB)).toHaveLength(1);
  });

  it('rejects reclaim after expiry with any other key', async () => {
    const { builder } = buildReclaimSig(
      w.contract, w.provider, w.utxo, new SignatureTemplate(generatePrivateKey()), w.thiefLB, EXPIRY,
    );
    expect(builder).toFailRequireWith('sponsor signature required');
    await nodeRejects(w.provider, builder);
  });
});

describe('stamp variant cov: reclaim', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld('cov');
  });

  it('rejects reclaim before expiry', async () => {
    const { builder } = buildReclaimCov(w.contract, w.provider, w.utxo, w.sponsorLB, EXPIRY - 1n);
    expect(builder).toFailRequireWith('stamp has not expired yet');
    await nodeRejects(w.provider, builder);
  });

  it('allows reclaim after expiry, money lands at the sponsor, no signature', async () => {
    const { builder, fee } = buildReclaimCov(w.contract, w.provider, w.utxo, w.sponsorLB, EXPIRY);
    expect(builder).not.toFailRequire();
    await w.provider.sendRawTransaction(builder.build());
    const back = await w.provider.getUtxosForLockingBytecode(w.sponsorLB);
    expect(back).toHaveLength(1);
    expect(back[0]!.satoshis).toBe(STAMP_SATS - fee);
  });

  it('rejects reclaim after expiry to anyone but the sponsor', async () => {
    const { builder } = buildReclaimCov(w.contract, w.provider, w.utxo, w.thiefLB, EXPIRY);
    expect(builder).toFailRequireWith('output must pay the sponsor');
    await nodeRejects(w.provider, builder);
  });

  it('rejects reclaim with an extra output', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addOutput({ to: w.sponsorLB, amount: 50_000n })
      .addOutput({ to: w.thiefLB, amount: STAMP_SATS - 50_000n - 1_000n });
    expect(b).toFailRequireWith('exactly one output: the sponsor');
    await nodeRejects(w.provider, b);
  });

  it('rejects reclaim that burns value to miners above the cap', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addOutput({ to: w.sponsorLB, amount: STAMP_SATS - DEFAULT_MAX_FEE - 1n });
    expect(b).toFailRequireWith('fee above the cap');
    await nodeRejects(w.provider, b);
  });
});

describe('stamp variant cov: after expiry both outcomes are possible, exactly one wins', () => {
  // After the expiry a reclaim and a shop spend race; the network takes the first one seen.
  it('reclaim first, then the shop spend is refused by the node', async () => {
    const w = makeWorld('cov');
    const reclaim = buildReclaimCov(w.contract, w.provider, w.utxo, w.sponsorLB, EXPIRY);
    const spend = buildSpend(w.contract, w.provider, w.utxo, w.stampKey, w.merchantLB);
    await w.provider.sendRawTransaction(reclaim.builder.build());
    await nodeRejects(w.provider, spend.builder);
    expect(await w.provider.getUtxosForLockingBytecode(w.sponsorLB)).toHaveLength(1);
    expect(await w.provider.getUtxosForLockingBytecode(w.merchantLB)).toHaveLength(0);
  });

  it('shop spend first, then the reclaim is refused by the node', async () => {
    const w = makeWorld('cov');
    const reclaim = buildReclaimCov(w.contract, w.provider, w.utxo, w.sponsorLB, EXPIRY);
    const spend = buildSpend(w.contract, w.provider, w.utxo, w.stampKey, w.merchantLB);
    await w.provider.sendRawTransaction(spend.builder.build());
    await nodeRejects(w.provider, reclaim.builder);
    expect(await w.provider.getUtxosForLockingBytecode(w.merchantLB)).toHaveLength(1);
    expect(await w.provider.getUtxosForLockingBytecode(w.sponsorLB)).toHaveLength(0);
  });
});

describe('fees and dust, in numbers', () => {
  // Smallest stamp the app allows: MIN_STAMP_SATS. Every output must stay above dust (546 sats).
  for (const variant of ['sig', 'cov'] as const) {
    it(`variant ${variant}: a minimum stamp pays the merchant well above dust`, async () => {
      const w = makeWorld(variant);
      const small = w.provider.addUtxo(w.contract.address, randomUtxo({ satoshis: MIN_STAMP_SATS }));
      const { builder, fee } = buildSpend(w.contract, w.provider, small, w.stampKey, w.merchantLB);
      expect(fee).toBeGreaterThanOrEqual(200n);
      expect(fee).toBeLessThanOrEqual(400n);
      expect(MIN_STAMP_SATS - fee).toBeGreaterThan(DUST_SATS * 10n);
      await w.provider.sendRawTransaction(builder.build());
    });
  }

  it('variant cov: a minimum stamp returns to the sponsor well above dust', async () => {
    const w = makeWorld('cov');
    const small = w.provider.addUtxo(w.contract.address, randomUtxo({ satoshis: MIN_STAMP_SATS }));
    const { builder, fee } = buildReclaimCov(w.contract, w.provider, small, w.sponsorLB, EXPIRY);
    expect(fee).toBeLessThan(300n); // no signature in the unlocking bytecode
    expect(MIN_STAMP_SATS - fee).toBeGreaterThan(DUST_SATS * 10n);
    await w.provider.sendRawTransaction(builder.build());
  });

  it('the fee cap leaves at least dust even for a stamp exactly at cap + dust', () => {
    // If a stamp held only maxFee + 546, the worst allowed spend still pays the merchant 546 sats.
    expect(DEFAULT_MAX_FEE + DUST_SATS).toBeLessThan(MIN_STAMP_SATS);
  });

  it('the library refuses to build a dust output (a stamp that tiny never reaches the node)', () => {
    const w = makeWorld('cov');
    expect(() =>
      new TransactionBuilder({ provider: w.provider })
        .addInput(w.utxo, w.contract.unlock.spend!(new SignatureTemplate(w.stampKey)))
        .addOutput({ to: w.merchantLB, amount: DUST_SATS - 1n }),
    ).toThrow(/output with 545 satoshis/);
  });
});

describe('network by address prefix', () => {
  it('tells mainnet from chipnet', () => {
    expect(networkOfAddress('bitcoincash:qqeq2t4548gkgp4p8fx5jv2ghtjvhunlgvaxa340ej')).toBe('mainnet');
    expect(networkOfAddress('bchtest:qqeq2t4548gkgp4p8fx5jv2ghtjvhunlgve5ekhc7w')).toBe('chipnet');
    expect(networkOfAddress('qqeq2t4548gkgp4p8fx5jv2ghtjvhunlgvaxa340ej')).toBe('unknown');
  });
});
