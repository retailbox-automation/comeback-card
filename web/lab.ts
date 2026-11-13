// Chipnet spike lab: can a real wallet, over WizardConnect,
//  A) sign the funding of stamp contracts (wallet P2PKH inputs -> contract outputs), and
//  B) sign a contract input (reclaim with the sponsor key = a key of the wallet)?
// Plus C) covenant reclaim without a signature, D) the spend-elsewhere rejection and the honest spend.
// Chipnet only. Lab state (incl. chipnet stamp keys) lives in this browser's localStorage.
import {
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  placeholderSignature,
  type SpendableUtxo,
} from 'cashscript';
import { binToHex, generatePrivateKey, hexToBin, publicKeyToP2pkhCashAddress } from '@bitauth/libauth';
import { WizardWallet, type PathName, type WalletState } from '../src/core/wallet';
import { broadcastRaw, explorerTx, provider } from '../src/core/chain';
import {
  DEFAULT_MAX_FEE,
  buildReclaimCov,
  buildSpend,
  buildSpendElsewhere,
  lockingBytecodeOf,
  networkOfAddress,
  publicKeyOf,
  stampContract,
  type StampTerms,
} from '../src/core/stamp';

const NET = 'chipnet' as const;
const STAMP_SATS = 110_000n;
const LS = 'bchfp-lab-v1';

type LabStamp = {
  id: 'S1' | 'S2' | 'S3';
  variant: 'sig' | 'cov';
  stampPrivHex: string;
  expiry: string;
  merchantLBHex: string;
  sponsorPkHex?: string;
  sponsorLBHex?: string;
  address: string;
  lockingBytecodeHex: string;
  txid?: string;
  vout?: number;
};
type Lab = { merchantPrivHex: string; stamps: LabStamp[] };

const $ = (id: string) => document.getElementById(id)!;
const logEl = $('log');
function log(line: string) {
  const ts = new Date().toISOString().slice(11, 19) + 'Z';
  logEl.textContent = `${ts} ${line}\n` + logEl.textContent;
}
const bigintReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

function loadLab(): Lab {
  const raw = localStorage.getItem(LS);
  if (raw) return JSON.parse(raw) as Lab;
  const lab: Lab = { merchantPrivHex: binToHex(generatePrivateKey()), stamps: [] };
  localStorage.setItem(LS, JSON.stringify(lab));
  return lab;
}
function saveLab(lab: Lab) {
  localStorage.setItem(LS, JSON.stringify(lab));
}
const lab = loadLab();
const prov = provider(NET);

/** Lab merchant = P2PKH of a lab-only chipnet key. */
function merchantLB(): Uint8Array {
  const { address } = publicKeyToP2pkhCashAddress({ publicKey: publicKeyOf(hexToBin(lab.merchantPrivHex)), prefix: 'bchtest' });
  return lockingBytecodeOf(address);
}

const wallet = new WizardWallet('First Purchase (lab)', undefined, (s: WalletState) => {
  $('state').textContent = JSON.stringify(s.kind === 'pairing' ? { ...s, uri: '…', qrUri: '…' } : s);
  if (s.kind === 'pairing') ($('uri') as HTMLTextAreaElement).value = s.uri;
  if (s.kind === 'connected') showWallet();
  log(`wallet state: ${s.kind}${'message' in s && s.message ? ' — ' + s.message : ''}`);
});

function showWallet() {
  log(`wallet shared paths: ${wallet.describePaths()}`);
  try {
    const a = wallet.address('receive', 0);
    $('wallet').textContent = `network by xpub: ${wallet.network()} · receive/0 ${a} · prefix says ${networkOfAddress(a)}`;
  } catch (e) {
    $('wallet').textContent = `wallet info error: ${(e as Error).message}`;
  }
}

type Coin = { utxo: SpendableUtxo; path: PathName; index: number; address: string };
async function scan(): Promise<Coin[]> {
  const coins: Coin[] = [];
  for (const path of ['receive', 'change'] as const) {
    for (let index = 0; index < 10; index++) {
      const address = wallet.address(path, index);
      const utxos = await prov.getUtxos(address);
      for (const utxo of utxos) if (!utxo.token) coins.push({ utxo, path, index, address });
    }
  }
  const total = coins.reduce((s, c) => s + c.utxo.satoshis, 0n);
  log(`scan: ${coins.length} coins, ${total} sats: ${coins.map((c) => `${c.path}/${c.index}:${c.utxo.satoshis}`).join(', ')}`);
  return coins;
}

function requireChipnet() {
  const net = wallet.network();
  const prefixNet = networkOfAddress(wallet.address('receive', 0));
  if (net !== 'chipnet' || prefixNet !== 'chipnet') {
    throw new Error(`wallet is on ${net} (prefix ${prefixNet}); this lab runs on chipnet only`);
  }
}

function stampTerms(s: LabStamp): StampTerms {
  return {
    variant: s.variant,
    stampPk: publicKeyOf(hexToBin(s.stampPrivHex)),
    merchantLockingBytecode: hexToBin(s.merchantLBHex),
    sponsorPk: s.sponsorPkHex ? hexToBin(s.sponsorPkHex) : undefined,
    sponsorLockingBytecode: s.sponsorLBHex ? hexToBin(s.sponsorLBHex) : undefined,
    expiry: BigInt(s.expiry),
    maxFee: DEFAULT_MAX_FEE,
  };
}
function stampUtxo(s: LabStamp): SpendableUtxo {
  if (!s.txid || s.vout === undefined) throw new Error(`${s.id} not funded yet`);
  return { txid: s.txid, vout: s.vout, satoshis: STAMP_SATS, lockingBytecode: s.lockingBytecodeHex };
}
function stamp(id: LabStamp['id']): LabStamp {
  const s = lab.stamps.find((x) => x.id === id);
  if (!s) throw new Error(`${id} missing — run probe A first`);
  return s;
}

async function probeA() {
  requireChipnet();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const past = now - 3n * 3600n;
  const future = now + 7n * 86400n;
  const sponsorPk = wallet.pubkey('receive', 0);
  const sponsorLB = lockingBytecodeOf(wallet.address('receive', 0));
  const mLB = merchantLB();
  const specs: Array<Pick<LabStamp, 'id' | 'variant'> & { expiry: bigint }> = [
    { id: 'S1', variant: 'sig', expiry: past },
    { id: 'S2', variant: 'cov', expiry: past },
    { id: 'S3', variant: 'cov', expiry: future },
  ];
  const stamps: LabStamp[] = specs.map((sp) => {
    const priv = generatePrivateKey();
    const draft: LabStamp = {
      id: sp.id,
      variant: sp.variant,
      stampPrivHex: binToHex(priv),
      expiry: sp.expiry.toString(),
      merchantLBHex: binToHex(mLB),
      sponsorPkHex: sp.variant === 'sig' ? binToHex(sponsorPk) : undefined,
      sponsorLBHex: sp.variant === 'cov' ? binToHex(sponsorLB) : undefined,
      address: '',
      lockingBytecodeHex: '',
    };
    const c = stampContract(stampTerms(draft), prov);
    draft.address = c.address;
    draft.lockingBytecodeHex = c.lockingBytecode;
    return draft;
  });

  const coins = (await scan()).sort((a, b) => Number(b.utxo.satoshis - a.utxo.satoshis));
  const need = STAMP_SATS * BigInt(stamps.length) + 5_000n;
  const picked: Coin[] = [];
  let sum = 0n;
  for (const c of coins) {
    if (sum >= need) break;
    picked.push(c);
    sum += c.utxo.satoshis;
  }
  if (sum < need) throw new Error(`not enough chipnet coins: have ${sum}, need ${need}`);
  const changeAddress = wallet.address('change', 0);

  const make = (change: bigint) => {
    const b = new TransactionBuilder({ provider: prov });
    for (const c of picked) b.addInput(c.utxo, placeholderP2PKHUnlocker(c.address));
    for (const s of stamps) b.addOutput({ to: s.address, amount: STAMP_SATS });
    if (change > 550n) b.addOutput({ to: changeAddress, amount: change });
    return b;
  };
  const outTotal = STAMP_SATS * BigInt(stamps.length);
  const probe = make(sum - outTotal - 2_000n);
  // getTransactionSize() already counts placeholder inputs at their signed size (CashScript 0.14).
  const size = BigInt(probe.getTransactionSize());
  const fee = size + 20n;
  const builder = make(sum - outTotal - fee);
  const wc = builder.generateWcTransactionObject({ broadcast: false, userPrompt: 'Create 3 First Purchase stamps (chipnet lab)' });
  const inputPaths = picked.map((c, i) => [i, c.path, c.index] as [number, PathName, number]);
  log(`A: asking wallet to sign: ${picked.length} inputs, outputs ${stamps.map((s) => s.id + '→' + s.address).join(' ')}, fee ${fee}`);
  const t0 = Date.now();
  const res = await wallet.sign(wc, inputPaths);
  if (!res.ok) {
    log(`A: RESULT=REFUSED wallet error after ${Date.now() - t0}ms: ${res.error}`);
    return;
  }
  log(`A: wallet signed after ${Date.now() - t0}ms (${res.signedHex.length / 2} bytes)`);
  const b = await broadcastRaw(NET, res.signedHex);
  if (!b.ok) {
    log(`A: RESULT=NODE-REJECTED: ${b.nodeError}`);
    return;
  }
  stamps.forEach((s, i) => {
    s.txid = b.txid;
    s.vout = i;
  });
  lab.stamps = stamps;
  saveLab(lab);
  log(`A: RESULT=PASS funding txid ${b.txid} ${explorerTx(NET, b.txid)}`);
}

async function probeB() {
  requireChipnet();
  const s = stamp('S1');
  const c = stampContract(stampTerms(s), prov);
  const to = wallet.address('receive', 0);
  const make = (amount: bigint) =>
    new TransactionBuilder({ provider: prov })
      .setLocktime(Number(s.expiry))
      .addInput(stampUtxo(s), c.unlock.reclaim!(placeholderSignature()))
      .addOutput({ to, amount });
  const size = BigInt(make(STAMP_SATS - 1_000n).getTransactionSize());
  const fee = size + 20n;
  const wc = make(STAMP_SATS - fee).generateWcTransactionObject({ broadcast: false, userPrompt: 'Reclaim expired stamp S1 (chipnet lab)' });
  log(`B: asking wallet to sign contract input 0 with receive/0 (sponsor key), fee ${fee}`);
  const t0 = Date.now();
  const res = await wallet.sign(wc, [[0, 'receive', 0]]);
  if (!res.ok) {
    log(`B: RESULT=REFUSED wallet error after ${Date.now() - t0}ms: ${res.error}`);
    return;
  }
  log(`B: wallet signed after ${Date.now() - t0}ms`);
  const b = await broadcastRaw(NET, res.signedHex);
  log(b.ok ? `B: RESULT=PASS reclaim txid ${b.txid} ${explorerTx(NET, b.txid)}` : `B: RESULT=NODE-REJECTED: ${b.nodeError}`);
}

async function probeC() {
  const s = stamp('S2');
  const c = stampContract(stampTerms(s), prov);
  const { builder, fee } = buildReclaimCov(c, prov, stampUtxo(s), hexToBin(s.sponsorLBHex!), BigInt(s.expiry));
  const b = await broadcastRaw(NET, builder.build());
  log(b.ok ? `C: RESULT=PASS covenant reclaim txid ${b.txid} fee ${fee} ${explorerTx(NET, b.txid)}` : `C: RESULT=NODE-REJECTED: ${b.nodeError}`);
}

async function probeD1() {
  requireChipnet();
  const s = stamp('S3');
  const c = stampContract(stampTerms(s), prov);
  const mine = lockingBytecodeOf(wallet.address('receive', 1));
  const { builder } = buildSpendElsewhere(c, prov, stampUtxo(s), hexToBin(s.stampPrivHex), mine);
  const b = await broadcastRaw(NET, builder.build());
  log(b.ok ? `D1: RESULT=UNEXPECTED-ACCEPT txid ${b.txid}` : `D1: RESULT=PASS node refused, verbatim: ${b.nodeError}`);
}

async function probeD2() {
  const s = stamp('S3');
  const c = stampContract(stampTerms(s), prov);
  const { builder, fee } = buildSpend(c, prov, stampUtxo(s), hexToBin(s.stampPrivHex), hexToBin(s.merchantLBHex));
  const b = await broadcastRaw(NET, builder.build());
  log(b.ok ? `D2: RESULT=PASS merchant paid txid ${b.txid} fee ${fee} ${explorerTx(NET, b.txid)}` : `D2: RESULT=NODE-REJECTED: ${b.nodeError}`);
}

function guard(name: string, fn: () => Promise<unknown>) {
  return () => {
    fn().catch((e) => log(`${name}: ERROR ${e instanceof Error ? e.message : JSON.stringify(e, bigintReplacer)}`));
  };
}

$('connect').onclick = () => wallet.start();
$('disconnect').onclick = () => wallet.stop();
$('scan').onclick = guard('scan', scan);
$('probeA').onclick = guard('A', probeA);
$('probeB').onclick = guard('B', probeB);
$('probeC').onclick = guard('C', probeC);
$('probeD1').onclick = guard('D1', probeD1);
$('probeD2').onclick = guard('D2', probeD2);
log(`lab ready · stamps in storage: ${lab.stamps.map((s) => `${s.id}:${s.txid ? 'funded' : 'new'}`).join(' ') || 'none'}`);
