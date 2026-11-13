// UI texts: an expired stamp, a lost race and a refused spend must read as expected outcomes, not bugs.
import { describe, expect, it } from 'vitest';
import { EXPIRED_TEXT, explainNodeError, stampPhase } from '../src/core/view';
import type { StampState } from '../src/core/status';

const EXPIRY = 1_794_600_000n;
const seen = (confirmed: boolean) => ({ txid: 'ab'.repeat(32), confirmed, height: confirmed ? 332_000 : 0 });
const waiting: StampState = { kind: 'waiting', funding: seen(true), satoshis: 110_000n };

describe('stamp page phase', () => {
  it('loading until the first answer', () => {
    expect(stampPhase(null, null, EXPIRY)).toEqual({ phase: 'loading' });
  });

  it('active while the network clock is before expiry (even if the wall clock is past it)', () => {
    expect(stampPhase(waiting, EXPIRY - 1n, EXPIRY)).toEqual({ phase: 'active' });
    expect(stampPhase(waiting, null, EXPIRY)).toEqual({ phase: 'active' });
  });

  it('an expired, unspent stamp says it goes back to the sponsor and that both outcomes race', () => {
    const p = stampPhase(waiting, EXPIRY, EXPIRY);
    expect(p.phase).toBe('expired-open');
    expect(p.phase === 'expired-open' && p.text).toBe(EXPIRED_TEXT);
    expect(EXPIRED_TEXT).toMatch(/expired/);
    expect(EXPIRED_TEXT).toMatch(/back to the sponsor/);
    expect(EXPIRED_TEXT).toMatch(/still be spent at the shop/);
    expect(EXPIRED_TEXT).toMatch(/first/);
  });

  it('spent / returned carry the 0-conf vs confirmed flag', () => {
    expect(stampPhase({ kind: 'spent', funding: seen(true), spend: seen(false), paidSatoshis: 1n }, null, EXPIRY)).toEqual({ phase: 'spent', confirmed: false });
    expect(stampPhase({ kind: 'returned', funding: seen(true), spend: seen(true), paidSatoshis: 1n }, null, EXPIRY)).toEqual({ phase: 'returned', confirmed: true });
  });
});

describe('node errors in plain words', () => {
  it('the verbatim chipnet refusal of a spend elsewhere reads as the contract refusing', () => {
    // Exact text received from chipnet.bch.ninja on 13.11.2026 (spike D1).
    const verbatim =
      'the transaction was rejected by network rules.\n\nmandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)';
    expect(explainNodeError(verbatim).cls).toBe('contract-refused');
  });

  it('losing the race after expiry reads as "someone was first", not as a bug', () => {
    for (const e of [
      // Verbatim from chipnet.bch.ninja, 13.11.2026 17:13Z: shop spend sent after the reclaim (probe-node-errors).
      'Transaction conflicts with an unconfirmed transaction in the mempool: the transaction was rejected by network rules.\n\ntxn-mempool-conflict (code 18)\n',
      // After the winner is in a block the node reports the input as gone (BCHN reject reason).
      'the transaction was rejected by network rules.\n\nbad-txns-inputs-missingorspent',
      'Missing inputs',
    ]) {
      const x = explainNodeError(e);
      expect(x.cls).toBe('already-gone');
      expect(x.plain).toMatch(/Someone was first/);
    }
  });

  it('a return before the network clock passes expiry reads as "not yet"', () => {
    // Verbatim from chipnet.bch.ninja, 13.11.2026 17:13Z: reclaim of a stamp expiring in 1 hour.
    const verbatim =
      'Transaction is not yet final (nLockTime not satisfied): the transaction was rejected by network rules.\n\nbad-txns-nonfinal, non-final transaction (code 64)\n';
    expect(explainNodeError(verbatim).cls).toBe('not-yet');
  });

  it('the contract refusal is not mistaken for a race or a clock problem', () => {
    const verbatim =
      'the transaction was rejected by network rules.\n\nmandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation) (code 16)';
    expect(explainNodeError(verbatim).cls).not.toBe('already-gone');
    expect(explainNodeError(verbatim).cls).not.toBe('not-yet');
  });

  it('no connection reads as nothing sent', () => {
    expect(explainNodeError('could not reach any Fulcrum server: timeout').plain).toMatch(/Nothing was sent/);
  });
});
