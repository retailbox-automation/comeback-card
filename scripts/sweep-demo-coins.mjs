// One-time helper: move the demo wallets' plain coins (sponsor HD seed, demo shop WIF) to one address, one
// transaction per source. Secrets arrive as JSON on stdin and are never printed. Dry run unless CONFIRM=1.
// Run: <json {sponsorSeed, merchantWif}> | TO=<cashaddr> [CONFIRM=1] node scripts/sweep-demo-coins.mjs
import {
  decodePrivateKeyWif, deriveHdPath, deriveHdPrivateNodeFromBip39Mnemonic, publicKeyToP2pkhCashAddress, secp256k1,
} from '@bitauth/libauth';
import { ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder } from 'cashscript';

const TO = process.env.TO;
if (!TO || !TO.startsWith('bitcoincash:')) throw new Error('TO must be a mainnet cashaddr');
const input = JSON.parse(await new Promise((res) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => res(s)); }));
const prov = new ElectrumNetworkProvider('mainnet');
const addrOf = (priv) => publicKeyToP2pkhCashAddress({ publicKey: secp256k1.derivePublicKeyCompressed(priv), prefix: 'bitcoincash' }).address;

const sources = [];
{
  const root = deriveHdPrivateNodeFromBip39Mnemonic(input.sponsorSeed);
  if (typeof root === 'string') throw new Error(root);
  const keys = [];
  for (const chain of [0, 1]) for (let i = 0; i < 5; i++) {
    const n = deriveHdPath(root, `m/44'/145'/0'/${chain}/${i}`);
    if (typeof n === 'string') throw new Error(n);
    keys.push(n.privateKey);
  }
  sources.push({ name: 'sponsor', keys });
}
{
  const d = decodePrivateKeyWif(input.merchantWif);
  if (typeof d === 'string') throw new Error(d);
  sources.push({ name: 'demo shop', keys: [d.privateKey] });
}
input.sponsorSeed = ''; input.merchantWif = '';

for (const src of sources) {
  const coins = [];
  for (const priv of src.keys) for (const u of await prov.getUtxos(addrOf(priv))) if (!u.token) coins.push({ u, priv });
  const total = coins.reduce((s, c) => s + c.u.satoshis, 0n);
  if (!coins.length) { console.log(`${src.name}: no coins`); continue; }
  const build = (amount) => {
    const b = new TransactionBuilder({ provider: prov });
    for (const c of coins) b.addInput(c.u, new SignatureTemplate(c.priv).unlockP2PKH());
    b.addOutput({ to: TO, amount });
    return b.build();
  };
  const size = BigInt(build(546n).length / 2); // the amount only fills the output; size does not depend on it
  const fee = size + 10n; // 1 sat/byte and a little margin
  const amount = total - fee;
  if (amount < 546n) throw new Error(`${src.name}: too little to move (${total} sats)`);
  const hex = build(amount);
  console.log(`${src.name}: coins=${coins.length} total=${total} fee=${fee} send=${amount} bytes=${hex.length / 2}`);
  if (process.env.CONFIRM === '1') {
    const txid = await prov.sendRawTransaction(hex);
    console.log(`${src.name}: BROADCAST ${txid}`);
  }
}
process.exit(0);
