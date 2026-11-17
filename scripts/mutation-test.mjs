// Mutation test for the stamp and card contracts.
// Copies the repo into a temporary folder, removes one `require` at a time from a contract (or weakens
// one rule), recompiles it there and runs that contract's Mocknet suite. Every mutant must make the
// suite fail ("killed").
// The repository itself is never written to.
// Run: npm run test:mutation
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const work = mkdtempSync(path.join(tmpdir(), 'first-purchase-mutants-'));
for (const p of ['src', 'test', 'contracts', 'package.json', 'tsconfig.json', 'vitest.config.ts']) {
  cpSync(path.join(repo, p), path.join(work, p), { recursive: true });
}
symlinkSync(path.join(repo, 'node_modules'), path.join(work, 'node_modules'));

const bin = (name) => path.join(repo, 'node_modules/.bin', name);
const compile = (name) =>
  execFileSync(bin('cashc'), [path.join(work, 'contracts', `${name}.cash`), '-f', 'ts', '-o', path.join(work, 'src/contract', `${name}.artifact.ts`)], {
    stdio: 'pipe',
  });
/** The suite that must catch a mutant of each contract. */
const SUITE_OF = { stamp: 'test/stamp.test.ts', stamp_cov: 'test/stamp.test.ts', card: 'test/card.test.ts' };
const suite = (files = ['test/stamp.test.ts', 'test/card.test.ts']) =>
  spawnSync(bin('vitest'), ['run', ...files], { cwd: work, encoding: 'utf8', env: { ...process.env, CI: '1' } });

/** [contract, label, require condition, which occurrence (1-based)] */
const MUTANTS = [
  ['stamp_cov', 'spend: no merchant check', 'tx.outputs[0].lockingBytecode == merchantLockingBytecode, "output must pay the merchant"', 1],
  ['stamp_cov', 'spend: no single-input rule', 'tx.inputs.length == 1, "stamp must be spent alone"', 1],
  ['stamp_cov', 'spend: no single-output rule', 'tx.outputs.length == 1, "exactly one output: the merchant"', 1],
  ['stamp_cov', 'spend: no stamp signature', 'checkSig(stampSig, stampPk), "stamp key signature required"', 1],
  ['stamp_cov', 'spend: no fee cap', 'tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap"', 1],
  ['stamp_cov', 'reclaim: no expiry', 'tx.time >= expiry, "stamp has not expired yet"', 1],
  ['stamp_cov', 'reclaim: no sponsor check', 'tx.outputs[0].lockingBytecode == sponsorLockingBytecode, "output must pay the sponsor"', 1],
  ['stamp_cov', 'reclaim: no single-output rule', 'tx.outputs.length == 1, "exactly one output: the sponsor"', 1],
  ['stamp_cov', 'reclaim: no single-input rule', 'tx.inputs.length == 1, "stamp must be reclaimed alone"', 1],
  ['stamp_cov', 'reclaim: no fee cap', 'tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap"', 2],
  ['stamp', 'variant A spend: no merchant check', 'tx.outputs[0].lockingBytecode == merchantLockingBytecode, "output must pay the merchant"', 1],
  ['stamp', 'variant A reclaim: no sponsor signature', 'checkSig(sponsorSig, sponsorPk), "sponsor signature required"', 1],
  ['stamp', 'variant A reclaim: no expiry', 'tx.time >= expiry, "stamp has not expired yet"', 1],
  // Comeback Card: every require of card.cash.
  ['card', 'card spend: no card signature', 'checkSig(cardSig, cardPk), "card key signature required"', 1],
  ['card', 'card spend: no shop data signature', 'checkDataSig(shopSig, 0x43424331 + shopLockingBytecode, shopPk), "shop must have signed this address"', 1],
  ['card', 'card spend: no single-input rule', 'tx.inputs.length == 1, "card must be spent alone"', 1],
  ['card', 'card spend: no shop output check', 'tx.outputs[0].lockingBytecode == shopLockingBytecode, "output 0 must pay the shop"', 1],
  ['card', 'card spend: tokens allowed on the shop output', 'tx.outputs[0].tokenCategory == 0x, "no tokens on the shop output"', 1],
  ['card', 'card spend: rest may go anywhere', 'tx.outputs[1].lockingBytecode == tx.inputs[this.activeInputIndex].lockingBytecode, "output 1 must return to this card"', 1],
  ['card', 'card spend: tokens allowed on the card output', 'tx.outputs[1].tokenCategory == 0x, "no tokens on the card output"', 1],
  ['card', 'card spend: no minimum rest', 'tx.outputs[1].value >= minChange, "rest below the minimum: give it to the shop"', 1],
  ['card', 'card spend (two outputs): no fee cap', 'tx.outputs[0].value + tx.outputs[1].value >= tx.inputs[0].value - maxFee, "fee above the cap"', 1],
  ['card', 'card spend: any number of outputs', 'tx.outputs.length == 1, "one or two outputs only"', 1],
  ['card', 'card spend (one output): no fee cap', 'tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap"', 1],
  ['card', 'card return: no expiry', 'tx.time >= expiry, "card has not expired yet"', 1],
  ['card', 'card return: no single-input rule', 'tx.inputs.length == 1, "card must be returned alone"', 1],
  ['card', 'card return: no single-output rule', 'tx.outputs.length == 1, "exactly one output: the giver"', 1],
  ['card', 'card return: no giver check', 'tx.outputs[0].lockingBytecode == giverLockingBytecode, "output must pay the giver"', 1],
  ['card', 'card return: tokens allowed', 'tx.outputs[0].tokenCategory == 0x, "no tokens on the giver output"', 1],
  ['card', 'card return: no fee cap', 'tx.outputs[0].value >= tx.inputs[0].value - maxFee, "fee above the cap"', 2],
];

/** Mutants that weaken a rule instead of removing it: [contract, label, from, to, occurrence (1-based)]. */
const REPLACEMENTS = [
  ['card', 'card spend: shop signature without the CBC1 tag', '0x43424331 + shopLockingBytecode, shopPk', 'shopLockingBytecode, shopPk', 1],
  ['card', 'card spend: three or more outputs take the two-output branch', 'if (tx.outputs.length == 2)', 'if (tx.outputs.length >= 2)', 1],
  ['card', 'card spend (two outputs): fee cap doubled', 'tx.inputs[0].value - maxFee, "fee above the cap"', 'tx.inputs[0].value - maxFee - maxFee, "fee above the cap"', 1],
  ['card', 'card spend (one output): fee cap doubled', 'tx.inputs[0].value - maxFee, "fee above the cap"', 'tx.inputs[0].value - maxFee - maxFee, "fee above the cap"', 2],
  ['card', 'card return: fee cap doubled', 'tx.inputs[0].value - maxFee, "fee above the cap"', 'tx.inputs[0].value - maxFee - maxFee, "fee above the cap"', 3],
];

/** Remove the n-th `require(cond);` line, whatever its indent. */
function withoutRequire(source, cond, occurrence) {
  const lines = source.split('\n');
  const hits = lines.flatMap((l, i) => (l.trim() === `require(${cond});` ? [i] : []));
  if (hits.length < occurrence) return null;
  lines.splice(hits[occurrence - 1], 1);
  return lines.join('\n');
}

/** Replace the n-th occurrence of `from` with `to`. */
function replaced(source, from, to, occurrence) {
  const parts = source.split(from);
  if (parts.length - 1 < occurrence) return null;
  return parts.slice(0, occurrence).join(from) + to + parts.slice(occurrence).join(from);
}

let exitCode = 0;
try {
  compile('stamp');
  compile('stamp_cov');
  compile('card');
  const control = suite();
  console.log(`control (no mutation): ${control.status === 0 ? 'PASS' : 'FAIL'}`);
  if (control.status !== 0) throw new Error('the unmodified suite must pass first');

  const all = [
    ...MUTANTS.map(([name, label, cond, occ]) => ({ name, label, mutate: (s) => withoutRequire(s, cond, occ) })),
    ...REPLACEMENTS.map(([name, label, from, to, occ]) => ({ name, label, mutate: (s) => replaced(s, from, to, occ) })),
  ];
  let killed = 0;
  for (const { name, label, mutate } of all) {
    const source = readFileSync(path.join(repo, 'contracts', `${name}.cash`), 'utf8');
    const mutated = mutate(source);
    if (mutated === null) throw new Error(`mutant "${label}" does not apply: rule not found`);
    if (mutated === source) throw new Error(`mutant "${label}" left the source unchanged`);
    writeFileSync(path.join(work, 'contracts', `${name}.cash`), mutated);
    compile(name);
    const r = suite([SUITE_OF[name]]);
    const isKilled = r.status !== 0;
    if (isKilled) killed++;
    console.log(`${isKilled ? 'killed  ' : 'SURVIVED'} ${label}`);
    writeFileSync(path.join(work, 'contracts', `${name}.cash`), source);
    compile(name);
  }
  const after = suite();
  console.log(`after restore: ${after.status === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`mutants ${all.length}, killed ${killed}`);
  if (killed !== all.length || after.status !== 0) exitCode = 1;
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(exitCode);
