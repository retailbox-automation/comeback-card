// Mutation test for the stamp contracts.
// Copies the repo into a temporary folder, removes one `require` at a time from a contract,
// recompiles it there and runs the Mocknet suite. Every mutant must make the suite fail ("killed").
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
const suite = () => spawnSync(bin('vitest'), ['run', 'test/stamp.test.ts'], { cwd: work, encoding: 'utf8', env: { ...process.env, CI: '1' } });

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
];

let exitCode = 0;
try {
  compile('stamp');
  compile('stamp_cov');
  const control = suite();
  console.log(`control (no mutation): ${control.status === 0 ? 'PASS' : 'FAIL'}`);
  if (control.status !== 0) throw new Error('the unmodified suite must pass first');

  let killed = 0;
  for (const [name, label, cond, occurrence] of MUTANTS) {
    const source = readFileSync(path.join(repo, 'contracts', `${name}.cash`), 'utf8');
    const line = `        require(${cond});\n`;
    const parts = source.split(line);
    if (parts.length - 1 < occurrence) throw new Error(`mutant "${label}" does not apply: rule not found`);
    const mutated = parts.slice(0, occurrence).join(line) + parts.slice(occurrence).join(line);
    if (mutated === source) throw new Error(`mutant "${label}" left the source unchanged`);
    writeFileSync(path.join(work, 'contracts', `${name}.cash`), mutated);
    compile(name);
    const r = suite();
    const isKilled = r.status !== 0;
    if (isKilled) killed++;
    console.log(`${isKilled ? 'killed  ' : 'SURVIVED'} ${label}`);
    writeFileSync(path.join(work, 'contracts', `${name}.cash`), source);
    compile(name);
  }
  const after = suite();
  console.log(`after restore: ${after.status === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`mutants ${MUTANTS.length}, killed ${killed}`);
  if (killed !== MUTANTS.length || after.status !== 0) exitCode = 1;
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(exitCode);
