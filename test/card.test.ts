// Comeback Card contract tests on Mocknet. Every "rejected" case is checked twice, as for the stamp:
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
import { binToHex, generatePrivateKey, publicKeyToP2pkhCashAddress, secp256k1, sha256 } from '@bitauth/libauth';
import {
  CARD_MAX_FEE,
  CARD_MIN_CHANGE,
  MIN_CARD_SATS,
  SHOP_APPROVAL_TAG,
  approveShopAddress,
  buildCardCashOut,
  buildCardReturn,
  buildCardSpend,
  cardContract,
  shopApprovalMessage,
  verifyShopApproval,
  type CardTerms,
  type ShopApproval,
} from '../src/core/card';
import { DUST_SATS, lockingBytecodeOf, publicKeyOf } from '../src/core/stamp';

const CARD_SATS = 100_000n; // ≈ $0.21 at $209/BCH
const NOW = 1_794_900_000n; // 2026-11-17
const EXPIRY = NOW + 10n * 86_400n;

function p2pkhLockingBytecode(privateKey: Uint8Array): Uint8Array {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(privateKey), prefix: 'bchtest' });
  return lockingBytecodeOf(address);
}

interface World {
  provider: MockNetworkProvider;
  cardKey: Uint8Array;
  shopKey: Uint8Array;
  shopLB: Uint8Array;
  giverLB: Uint8Array;
  thiefKey: Uint8Array;
  thiefLB: Uint8Array;
  approval: ShopApproval;
  terms: CardTerms;
  contract: Contract;
  cardLB: Uint8Array;
  utxo: SpendableUtxo;
}

function makeWorld(sats: bigint = CARD_SATS, vout?: number): World {
  const provider = new MockNetworkProvider();
  const cardKey = generatePrivateKey();
  const shopKey = generatePrivateKey();
  const shopLB = p2pkhLockingBytecode(generatePrivateKey());
  const giverLB = p2pkhLockingBytecode(generatePrivateKey());
  const thiefKey = generatePrivateKey();
  const thiefLB = p2pkhLockingBytecode(thiefKey);
  const approval = approveShopAddress(shopKey, shopLB);
  const terms: CardTerms = {
    cardPk: publicKeyOf(cardKey),
    shopPk: publicKeyOf(shopKey),
    giverLockingBytecode: giverLB,
    expiry: EXPIRY,
    maxFee: CARD_MAX_FEE,
    minChange: CARD_MIN_CHANGE,
  };
  const contract = cardContract(terms, provider);
  const utxo = provider.addUtxo(contract.address, randomUtxo(vout === undefined ? { satoshis: sats } : { satoshis: sats, vout }));
  return { provider, cardKey, shopKey, shopLB, giverLB, thiefKey, thiefLB, approval, terms, contract, cardLB: lockingBytecodeOf(contract.address), utxo };
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

const spendUnlocker = (w: World, key: Uint8Array = w.cardKey, approval: ShopApproval = w.approval) =>
  w.contract.unlock.spend!(new SignatureTemplate(key), approval.signature, approval.lockingBytecode);

async function cardUtxos(w: World): Promise<SpendableUtxo[]> {
  return (await w.contract.getUtxos()) as SpendableUtxo[];
}

describe('card: the shop approves its address', () => {
  it('an approval verifies under the shop key for exactly that address', () => {
    const w = makeWorld();
    expect(verifyShopApproval(w.terms.shopPk, w.approval)).toBe(true);
    expect(w.approval.signature).toHaveLength(64);
  });

  it('the same signature does not verify for another address, another key, or a flipped bit', () => {
    const w = makeWorld();
    expect(verifyShopApproval(w.terms.shopPk, { ...w.approval, lockingBytecode: w.thiefLB })).toBe(false);
    expect(verifyShopApproval(publicKeyOf(w.thiefKey), w.approval)).toBe(false);
    const flipped = Uint8Array.from(w.approval.signature);
    flipped[10] = flipped[10]! ^ 1;
    expect(verifyShopApproval(w.terms.shopPk, { ...w.approval, signature: flipped })).toBe(false);
  });

  it('the signed message is "CBC1" followed by the locking bytecode', () => {
    const w = makeWorld();
    const m = shopApprovalMessage(w.shopLB);
    expect(binToHex(m.slice(0, 4))).toBe(binToHex(SHOP_APPROVAL_TAG));
    expect(binToHex(SHOP_APPROVAL_TAG)).toBe('43424331');
    expect(binToHex(m.slice(4))).toBe(binToHex(w.shopLB));
  });
});

describe('card: spend in parts', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld();
  });

  it('pays the shop exactly the amount and returns the rest to the same card address', async () => {
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 30_000n);
    expect(s.kind).toBe('part');
    expect(s.builder).not.toFailRequire();
    expect(s.fee).toBeGreaterThan(0n);
    expect(s.fee).toBeLessThanOrEqual(CARD_MAX_FEE);
    await w.provider.sendRawTransaction(s.builder.build());
    const shop = await w.provider.getUtxosForLockingBytecode(w.shopLB);
    expect(shop.map((u) => u.satoshis)).toEqual([30_000n]);
    const card = await cardUtxos(w);
    expect(card.map((u) => u.satoshis)).toEqual([CARD_SATS - 30_000n - s.fee]);
  });

  it('spends three times from one link: part, part, then the rest', async () => {
    const a = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 25_000n);
    await w.provider.sendRawTransaction(a.builder.build());
    const [u1] = await cardUtxos(w);
    const b = buildCardSpend(w.contract, w.provider, u1!, w.cardKey, w.approval, 25_000n);
    expect(b.kind).toBe('part');
    await w.provider.sendRawTransaction(b.builder.build());
    const [u2] = await cardUtxos(w);
    const c = buildCardSpend(w.contract, w.provider, u2!, w.cardKey, w.approval, u2!.satoshis);
    expect(c.kind).toBe('all');
    await w.provider.sendRawTransaction(c.builder.build());
    expect(await cardUtxos(w)).toHaveLength(0);
    const shop = await w.provider.getUtxosForLockingBytecode(w.shopLB);
    const paid = shop.reduce((t, u) => t + u.satoshis, 0n);
    expect(paid).toBe(CARD_SATS - a.fee - b.fee - c.fee);
  });

  it('a rest below the minimum goes to the shop with the payment (one output)', async () => {
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, CARD_SATS - CARD_MIN_CHANGE);
    expect(s.kind).toBe('all');
    expect(s.paid).toBe(CARD_SATS - s.fee);
    expect(s.builder).not.toFailRequire();
    await w.provider.sendRawTransaction(s.builder.build());
    expect(await cardUtxos(w)).toHaveLength(0);
  });

  it('refuses to build an amount below dust or above the balance', () => {
    expect(() => buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, DUST_SATS - 1n)).toThrow(/dust/);
    expect(() => buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, CARD_SATS + 1n)).toThrow(/balance/);
  });

  it('rejects cashing out to any other address, even with the shop’s real approval', async () => {
    const { builder } = buildCardCashOut(w.contract, w.provider, w.utxo, w.cardKey, w.approval, w.thiefLB);
    expect(builder).toFailRequireWith('output 0 must pay the shop');
    // Mocknet (libauth) words it "Program failed an OP_VERIFY operation"; a mainnet node says
    // "Script failed an OP_EQUALVERIFY operation" for the same opcode (seen live on the stamp, 14.11).
    const msg = await nodeRejects(w.provider, builder);
    expect(msg).toMatch(/VERIFY/);
  });

  it('rejects a thief who signs their own address with their own key', async () => {
    const fake = approveShopAddress(w.thiefKey, w.thiefLB);
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w, w.cardKey, fake))
      .addOutput({ to: w.thiefLB, amount: CARD_SATS - 800n });
    expect(b).toFailRequireWith('shop must have signed this address');
    await nodeRejects(w.provider, b);
  });

  it('rejects the shop’s signature reused for a different address', async () => {
    const reused: ShopApproval = { lockingBytecode: w.thiefLB, signature: w.approval.signature };
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w, w.cardKey, reused))
      .addOutput({ to: w.thiefLB, amount: CARD_SATS - 800n });
    expect(b).toFailRequireWith('shop must have signed this address');
    await nodeRejects(w.provider, b);
  });

  it('rejects a shop signature made without the CBC1 tag (a signature from another protocol)', async () => {
    const raw = secp256k1.signMessageHashSchnorr(w.shopKey, sha256.hash(w.shopLB));
    if (typeof raw === 'string') throw new Error(raw);
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w, w.cardKey, { lockingBytecode: w.shopLB, signature: raw }))
      .addOutput({ to: w.shopLB, amount: CARD_SATS - 800n });
    expect(b).toFailRequireWith('shop must have signed this address');
    await nodeRejects(w.provider, b);
  });

  it('rejects sending the rest anywhere but back to this card', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: w.thiefLB, amount: CARD_SATS - 10_000n - 800n });
    expect(b).toFailRequireWith('output 1 must return to this card');
    await nodeRejects(w.provider, b);
  });

  it('rejects sending the rest to another card with the same shop (a card with a later expiry)', async () => {
    const other = cardContract({ ...w.terms, expiry: EXPIRY + 86_400n }, w.provider);
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: lockingBytecodeOf(other.address), amount: CARD_SATS - 10_000n - 800n });
    expect(b).toFailRequireWith('output 1 must return to this card');
    await nodeRejects(w.provider, b);
  });

  it('rejects a rest below the minimum kept on the card', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: CARD_SATS - CARD_MIN_CHANGE + 1n - 800n })
      .addOutput({ to: w.cardLB, amount: CARD_MIN_CHANGE - 1n });
    expect(b).toFailRequireWith('rest below the minimum: give it to the shop');
    await nodeRejects(w.provider, b);
  });

  it('rejects a fee above the cap on a partial spend', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: w.cardLB, amount: CARD_SATS - 10_000n - CARD_MAX_FEE - 1n });
    expect(b).toFailRequireWith('fee above the cap');
    await nodeRejects(w.provider, b);
  });

  it('accepts a fee exactly at the cap on a partial spend', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: w.cardLB, amount: CARD_SATS - 10_000n - CARD_MAX_FEE });
    expect(b).not.toFailRequire();
    await w.provider.sendRawTransaction(b.build());
  });

  it('rejects a fee above the cap when the whole card goes to the shop', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: CARD_SATS - CARD_MAX_FEE - 1n });
    expect(b).toFailRequireWith('fee above the cap');
    await nodeRejects(w.provider, b);
  });

  it('rejects a third output', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: w.cardLB, amount: 50_000n })
      .addOutput({ to: w.thiefLB, amount: CARD_SATS - 60_000n - 800n });
    expect(b).toFailRequireWith('one or two outputs only');
    await nodeRejects(w.provider, b);
  });

  it('rejects spending two cards in one transaction', async () => {
    const second = w.provider.addUtxo(w.contract.address, randomUtxo({ satoshis: CARD_SATS }));
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addInput(second, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 2n * CARD_SATS - 1_500n });
    expect(b).toFailRequireWith('card must be spent alone');
    await nodeRejects(w.provider, b);
  });

  it('rejects a signature from any key other than the card key', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w, w.thiefKey))
      .addOutput({ to: w.shopLB, amount: CARD_SATS - 800n });
    expect(b).toFailRequireWith('card key signature required');
    await nodeRejects(w.provider, b);
  });

  it('rejects a double spend: a second, different transaction on the same card UTXO', async () => {
    const first = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 20_000n);
    await w.provider.sendRawTransaction(first.builder.build());
    const second = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 21_000n);
    await nodeRejects(w.provider, second.builder);
  });
});

describe('card: no tokens can be minted out of a card', () => {
  // A token genesis needs input 0 to spend output index 0 of its parent; the category is the parent txid.
  it('rejects a token minted onto the shop output', async () => {
    const w = makeWorld(CARD_SATS, 0);
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: CARD_SATS - 1_000n, token: { category: w.utxo.txid, amount: 1_000n } });
    expect(b).toFailRequireWith('no tokens on the shop output');
    await nodeRejects(w.provider, b);
  });

  it('rejects a token minted onto the card output', async () => {
    const w = makeWorld(CARD_SATS, 0);
    const b = new TransactionBuilder({ provider: w.provider })
      .addInput(w.utxo, spendUnlocker(w))
      .addOutput({ to: w.shopLB, amount: 10_000n })
      .addOutput({ to: w.cardLB, amount: CARD_SATS - 10_000n - 1_000n, token: { category: w.utxo.txid, amount: 1_000n } });
    expect(b).toFailRequireWith('no tokens on the card output');
    await nodeRejects(w.provider, b);
  });

  it('rejects a token minted onto the giver output of a return', async () => {
    const w = makeWorld(CARD_SATS, 0);
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addOutput({ to: w.giverLB, amount: CARD_SATS - 1_000n, token: { category: w.utxo.txid, amount: 1_000n } });
    expect(b).toFailRequireWith('no tokens on the giver output');
    await nodeRejects(w.provider, b);
  });
});

describe('card: the rest goes back to the giver after the expiry', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld();
  });

  it('rejects a return before the expiry', async () => {
    const { builder } = buildCardReturn(w.contract, w.provider, w.utxo, w.giverLB, EXPIRY - 1n);
    expect(builder).toFailRequireWith('card has not expired yet');
    await nodeRejects(w.provider, builder);
  });

  it('after the expiry anyone returns the card: the money lands at the giver, no signature', async () => {
    const { builder, fee } = buildCardReturn(w.contract, w.provider, w.utxo, w.giverLB, EXPIRY);
    expect(builder).not.toFailRequire();
    await w.provider.sendRawTransaction(builder.build());
    const giver = await w.provider.getUtxosForLockingBytecode(w.giverLB);
    expect(giver.map((u) => u.satoshis)).toEqual([CARD_SATS - fee]);
  });

  it('after a partial spend, only the rest goes back', async () => {
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 40_000n);
    await w.provider.sendRawTransaction(s.builder.build());
    const [rest] = await cardUtxos(w);
    const r = buildCardReturn(w.contract, w.provider, rest!, w.giverLB, EXPIRY);
    await w.provider.sendRawTransaction(r.builder.build());
    const giver = await w.provider.getUtxosForLockingBytecode(w.giverLB);
    expect(giver.map((u) => u.satoshis)).toEqual([CARD_SATS - 40_000n - s.fee - r.fee]);
  });

  it('rejects a return to anyone but the giver', async () => {
    const { builder } = buildCardReturn(w.contract, w.provider, w.utxo, w.thiefLB, EXPIRY);
    expect(builder).toFailRequireWith('output must pay the giver');
    await nodeRejects(w.provider, builder);
  });

  it('rejects a return with an extra output', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addOutput({ to: w.giverLB, amount: CARD_SATS - 20_000n })
      .addOutput({ to: w.thiefLB, amount: 19_000n });
    expect(b).toFailRequireWith('exactly one output: the giver');
    await nodeRejects(w.provider, b);
  });

  it('rejects returning two cards in one transaction (one could be burned as miner fee)', async () => {
    const second = w.provider.addUtxo(w.contract.address, randomUtxo({ satoshis: CARD_SATS }));
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addInput(second, w.contract.unlock.reclaim!())
      .addOutput({ to: w.giverLB, amount: CARD_SATS });
    expect(b).toFailRequireWith('card must be returned alone');
    await nodeRejects(w.provider, b);
  });

  it('rejects a return that burns value to miners above the cap', async () => {
    const b = new TransactionBuilder({ provider: w.provider })
      .setLocktime(Number(EXPIRY))
      .addInput(w.utxo, w.contract.unlock.reclaim!())
      .addOutput({ to: w.giverLB, amount: CARD_SATS - CARD_MAX_FEE - 1n });
    expect(b).toFailRequireWith('fee above the cap');
    await nodeRejects(w.provider, b);
  });
});

describe('card: after the expiry the network keeps whichever comes first', () => {
  it('return first, then the shop spend is refused by the node', async () => {
    const w = makeWorld();
    const r = buildCardReturn(w.contract, w.provider, w.utxo, w.giverLB, EXPIRY);
    await w.provider.sendRawTransaction(r.builder.build());
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 10_000n);
    await nodeRejects(w.provider, s.builder);
  });

  it('shop spend first, then the return of the same coin is refused by the node', async () => {
    const w = makeWorld();
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 10_000n);
    await w.provider.sendRawTransaction(s.builder.build());
    const r = buildCardReturn(w.contract, w.provider, w.utxo, w.giverLB, EXPIRY);
    await nodeRejects(w.provider, r.builder);
  });
});

describe('card: terms', () => {
  it('refuses a block height as expiry and a minimum rest below dust', () => {
    const w = makeWorld();
    expect(() => cardContract({ ...w.terms, expiry: 900_000n }, w.provider)).toThrow(/unix timestamp/);
    expect(() => cardContract({ ...w.terms, minChange: DUST_SATS - 1n }, w.provider)).toThrow(/dust/);
  });

  it('the same terms give the same address (the link keeps working); another shop key gives another', () => {
    const w = makeWorld();
    expect(cardContract(w.terms, w.provider).address).toBe(w.contract.address);
    expect(cardContract({ ...w.terms, shopPk: publicKeyOf(w.thiefKey) }, w.provider).address).not.toBe(w.contract.address);
  });

  it('a minimum card pays a part and still keeps a rest above dust', async () => {
    const w = makeWorld(MIN_CARD_SATS);
    const s = buildCardSpend(w.contract, w.provider, w.utxo, w.cardKey, w.approval, 1_000n);
    expect(s.kind).toBe('part');
    expect(s.rest).toBeGreaterThanOrEqual(CARD_MIN_CHANGE);
    await w.provider.sendRawTransaction(s.builder.build());
  });
});
