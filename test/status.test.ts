// Stamp status from chain history. Real transactions are built and validated on MockNetworkProvider;
// a small fake Electrum reader serves their history the way Fulcrum would (height 0 = mempool).
import { describe, expect, it } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import { binToHex, generatePrivateKey, hexToBin, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { DEFAULT_MAX_FEE, buildReclaimCov, buildSpend, lockingBytecodeOf, publicKeyOf, stampContract } from '../src/core/stamp';
import { electrumScriptHash, stampState, type ChainReader } from '../src/core/status';

function p2pkh(priv: Uint8Array) {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(priv), prefix: 'bchtest' });
  return { address, lb: lockingBytecodeOf(address) };
}

const EXPIRY = 1_794_600_000n;

function world() {
  const provider = new MockNetworkProvider();
  const sponsorKey = generatePrivateKey();
  const sponsor = p2pkh(sponsorKey);
  const merchant = p2pkh(generatePrivateKey());
  const stampKey = generatePrivateKey();
  const contract = stampContract(
    {
      variant: 'cov',
      stampPk: publicKeyOf(stampKey),
      merchantLockingBytecode: merchant.lb,
      sponsorLockingBytecode: sponsor.lb,
      expiry: EXPIRY,
      maxFee: DEFAULT_MAX_FEE,
    },
    provider,
  );
  // A real funding transaction: sponsor P2PKH -> stamp contract.
  const sponsorUtxo = provider.addUtxo(sponsor.address, randomUtxo({ satoshis: 200_000n }));
  const fundingHex = new TransactionBuilder({ provider })
    .addInput(sponsorUtxo, new SignatureTemplate(sponsorKey).unlockP2PKH())
    .addOutput({ to: contract.address, amount: 110_000n })
    .addOutput({ to: sponsor.address, amount: 89_000n })
    .build();
  const heights = new Map<string, number>();
  const raw = new Map<string, string>();
  const history: string[] = [];
  const reader: ChainReader = {
    history: async (sh) => {
      expect(sh).toBe(electrumScriptHash(hexToBin(contract.lockingBytecode)));
      return history.map((tx_hash) => ({ tx_hash, height: heights.get(tx_hash) ?? 0 }));
    },
    rawTx: async (txid) => raw.get(txid)!,
  };
  const record = async (hex: string, height = 0) => {
    const txid = await provider.sendRawTransaction(hex);
    raw.set(txid, hex);
    heights.set(txid, height);
    history.push(txid);
    return txid;
  };
  return { provider, contract, stampKey, sponsor, merchant, reader, record, fundingHex, heights };
}

describe('stamp status from chain history', () => {
  it('not funded when the address has no history', async () => {
    const w = world();
    expect((await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, w.sponsor.lb)).kind).toBe('not-funded');
  });

  it('waiting, 0-conf then confirmed', async () => {
    const w = world();
    const fundTxid = await w.record(w.fundingHex, 0);
    let s = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, w.sponsor.lb);
    expect(s).toMatchObject({ kind: 'waiting', satoshis: 110_000n, funding: { txid: fundTxid, confirmed: false } });
    w.heights.set(fundTxid, 332_200);
    s = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, w.sponsor.lb);
    expect(s).toMatchObject({ kind: 'waiting', funding: { confirmed: true, height: 332_200 } });
  });

  it('spent at the shop, with the paid amount and 0-conf flag', async () => {
    const w = world();
    await w.record(w.fundingHex, 332_200);
    const [utxo] = await w.provider.getUtxos(w.contract.address);
    const { builder, fee } = buildSpend(w.contract, w.provider, utxo!, w.stampKey, w.merchant.lb);
    const spendTxid = await w.record(builder.build(), 0);
    const s = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, w.sponsor.lb);
    expect(s).toMatchObject({ kind: 'spent', spend: { txid: spendTxid, confirmed: false }, paidSatoshis: 110_000n - fee });
  });

  it('returned to the sponsor', async () => {
    const w = world();
    await w.record(w.fundingHex, 332_200);
    const [utxo] = await w.provider.getUtxos(w.contract.address);
    const { builder } = buildReclaimCov(w.contract, w.provider, utxo!, w.sponsor.lb, EXPIRY);
    await w.record(builder.build(), 332_210);
    const s = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, w.sponsor.lb);
    expect(s).toMatchObject({ kind: 'returned', spend: { confirmed: true } });
  });

  it('a spend to anything else is flagged, never counted as a purchase', async () => {
    const w = world();
    await w.record(w.fundingHex, 332_200);
    const s0 = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, undefined);
    expect(s0.kind).toBe('waiting');
    // With no sponsor bytecode given, a reclaim is not recognised as "returned" and must not read as "spent".
    const [utxo] = await w.provider.getUtxos(w.contract.address);
    const { builder } = buildReclaimCov(w.contract, w.provider, utxo!, w.sponsor.lb, EXPIRY);
    await w.record(builder.build(), 0);
    const s = await stampState(w.reader, w.contract.lockingBytecode, w.merchant.lb, undefined);
    expect(s.kind).toBe('moved-elsewhere');
    expect(binToHex(w.merchant.lb)).not.toBe(binToHex(w.sponsor.lb));
  });
});
