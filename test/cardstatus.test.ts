// Card status from a fake Fulcrum fed with REAL transactions built and accepted on Mocknet:
// a giver funds the card from a P2PKH wallet, the holder spends twice in parts, then the rest is returned.
import { describe, expect, it } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo, type SpendableUtxo } from 'cashscript';
import { generatePrivateKey, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { approveShopAddress, buildCardReturn, buildCardSpend, cardContract, CARD_MAX_FEE, CARD_MIN_CHANGE } from '../src/core/card';
import { cardState } from '../src/core/cardstatus';
import { electrumScriptHash, type ChainReader } from '../src/core/status';
import { lockingBytecodeOf, publicKeyOf } from '../src/core/stamp';

const EXPIRY = 1_795_800_000n;
const GIFT = 100_000n;

function setup() {
  const provider = new MockNetworkProvider();
  const giverKey = generatePrivateKey();
  const giverAddress = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(giverKey), prefix: 'bchtest' }).address;
  const giverLB = lockingBytecodeOf(giverAddress);
  const shopKey = generatePrivateKey();
  const shopLB = lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(generatePrivateKey()), prefix: 'bchtest' }).address);
  const approval = approveShopAddress(shopKey, shopLB);
  const cardKey = generatePrivateKey();
  const contract = cardContract(
    { cardPk: publicKeyOf(cardKey), shopPk: publicKeyOf(shopKey), giverLockingBytecode: giverLB, expiry: EXPIRY, maxFee: CARD_MAX_FEE, minChange: CARD_MIN_CHANGE },
    provider,
  );
  const cardLB = lockingBytecodeOf(contract.address);
  const raw = new Map<string, string>();
  const heights = new Map<string, number>();
  const send = async (b: TransactionBuilder, height: number) => {
    const hex = b.build();
    const txid = await provider.sendRawTransaction(hex);
    raw.set(txid, hex);
    heights.set(txid, height);
    return txid;
  };
  const giverUtxo = provider.addUtxo(giverAddress, randomUtxo({ satoshis: 300_000n }));
  return { provider, giverKey, giverAddress, giverLB, giverUtxo, shopLB, approval, cardKey, contract, cardLB, raw, heights, send };
}

type World = ReturnType<typeof setup>;

function fakeChain(w: World, order?: string[]): ChainReader {
  return {
    history: async (sh) => {
      expect(sh).toBe(electrumScriptHash(w.cardLB));
      const ids = order ?? [...w.raw.keys()];
      return ids.map((tx_hash) => ({ tx_hash, height: w.heights.get(tx_hash)! }));
    },
    rawTx: async (txid) => w.raw.get(txid)!,
  };
}

async function fund(w: World, amount: bigint, height: number) {
  const b = new TransactionBuilder({ provider: w.provider })
    .addInput(w.giverUtxo, new SignatureTemplate(w.giverKey).unlockP2PKH())
    .addOutput({ to: w.contract.address, amount })
    .addOutput({ to: w.giverAddress, amount: w.giverUtxo.satoshis - amount - 500n });
  return w.send(b, height);
}

const coin = async (w: World) => ((await w.contract.getUtxos()) as SpendableUtxo[]).sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1))[0]!;

describe('card status from the chain', () => {
  it('a card nobody funded has no balance and no story', async () => {
    const w = setup();
    const s = await cardState(fakeChain(w), w.cardLB, w.shopLB, w.giverLB);
    expect(s).toEqual({ fundedSatoshis: 0n, balanceSatoshis: 0n, coins: [], events: [] });
  });

  it('gift, two partial spends and the return: amounts, balance and order', async () => {
    const w = setup();
    const f = await fund(w, GIFT, 977_400);
    const a = buildCardSpend(w.contract, w.provider, await coin(w), w.cardKey, w.approval, 15_000n);
    const ta = await w.send(a.builder, 977_401);
    const b = buildCardSpend(w.contract, w.provider, await coin(w), w.cardKey, w.approval, 5_000n);
    const tb = await w.send(b.builder, 0); // seen, not yet in a block

    let s = await cardState(fakeChain(w), w.cardLB, w.shopLB, w.giverLB);
    expect(s.fundedSatoshis).toBe(GIFT);
    expect(s.balanceSatoshis).toBe(GIFT - 15_000n - a.fee - 5_000n - b.fee);
    expect(s.coins).toHaveLength(1);
    expect(s.events.map((e) => e.kind)).toEqual(['paid', 'paid', 'funded']);
    expect(s.events[0]).toMatchObject({ kind: 'paid', paidSatoshis: 5_000n, seen: { txid: tb, confirmed: false } });
    expect(s.events[1]).toMatchObject({ kind: 'paid', paidSatoshis: 15_000n, seen: { txid: ta, confirmed: true, height: 977_401 } });
    expect(s.events[2]).toMatchObject({ kind: 'funded', satoshis: GIFT, seen: { txid: f, confirmed: true } });

    const r = buildCardReturn(w.contract, w.provider, await coin(w), w.giverLB, EXPIRY);
    const tr = await w.send(r.builder, 0);
    s = await cardState(fakeChain(w), w.cardLB, w.shopLB, w.giverLB);
    expect(s.balanceSatoshis).toBe(0n);
    expect(s.coins).toHaveLength(0);
    expect(s.events.filter((e) => e.kind === 'returned')).toEqual([
      { kind: 'returned', seen: { txid: tr, confirmed: false, height: 0 }, returnedSatoshis: GIFT - 20_000n - a.fee - b.fee - r.fee },
    ]);
  });

  it('gives the same answer whatever order Fulcrum lists the transactions in', async () => {
    const w = setup();
    await fund(w, GIFT, 977_400);
    await w.send(buildCardSpend(w.contract, w.provider, await coin(w), w.cardKey, w.approval, 15_000n).builder, 0);
    await w.send(buildCardSpend(w.contract, w.provider, await coin(w), w.cardKey, w.approval, 5_000n).builder, -1);
    const ids = [...w.raw.keys()];
    const forward = await cardState(fakeChain(w, ids), w.cardLB, w.shopLB, w.giverLB);
    const backward = await cardState(fakeChain(w, [...ids].reverse()), w.cardLB, w.shopLB, w.giverLB);
    expect(backward.balanceSatoshis).toBe(forward.balanceSatoshis);
    expect(backward.fundedSatoshis).toBe(forward.fundedSatoshis);
    expect(backward.coins).toEqual(forward.coins);
    expect(new Set(backward.events.map((e) => e.seen.txid))).toEqual(new Set(forward.events.map((e) => e.seen.txid)));
  });

  it('a second gift on the same card adds up (anyone can top it up)', async () => {
    const w = setup();
    await fund(w, GIFT, 977_400);
    const second = provider2(w);
    await w.send(second, 977_402);
    const s = await cardState(fakeChain(w), w.cardLB, w.shopLB, w.giverLB);
    expect(s.fundedSatoshis).toBe(GIFT + 40_000n);
    expect(s.balanceSatoshis).toBe(GIFT + 40_000n);
    expect(s.coins.map((c) => c.satoshis)).toEqual([GIFT, 40_000n]);
  });

  it('labels a spend that went anywhere else (only possible with a broken contract) instead of hiding it', async () => {
    const w = setup();
    await fund(w, GIFT, 977_400);
    // Built but never accepted: the node would refuse it. Fed to the fake chain only to test the reader.
    const thief = lockingBytecodeOf(publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(generatePrivateKey()), prefix: 'bchtest' }).address);
    const hex = new TransactionBuilder({ provider: w.provider })
      .addInput(await coin(w), w.contract.unlock.spend!(new SignatureTemplate(w.cardKey), w.approval.signature, w.approval.lockingBytecode))
      .addOutput({ to: thief, amount: GIFT - 800n })
      .build();
    w.raw.set('ff'.repeat(32), hex);
    w.heights.set('ff'.repeat(32), 0);
    const s = await cardState(fakeChain(w), w.cardLB, w.shopLB, w.giverLB);
    expect(s.events[0]).toMatchObject({ kind: 'moved-elsewhere' });
    expect(s.balanceSatoshis).toBe(0n);
  });
});

/** A second gift from another wallet. */
function provider2(w: World): TransactionBuilder {
  const k = generatePrivateKey();
  const addr = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(k), prefix: 'bchtest' }).address;
  const u = w.provider.addUtxo(addr, randomUtxo({ satoshis: 50_000n }));
  return new TransactionBuilder({ provider: w.provider })
    .addInput(u, new SignatureTemplate(k).unlockP2PKH())
    .addOutput({ to: w.contract.address, amount: 40_000n })
    .addOutput({ to: addr, amount: 9_500n });
}
