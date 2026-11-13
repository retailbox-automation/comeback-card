// Plain-language texts for what the network says. Pure functions, unit-tested, so the pages never
// show a bare node error as if it were a bug.
import type { StampState } from './status';

export type StampPhase =
  | { phase: 'loading' }
  | { phase: 'not-funded' }
  | { phase: 'active' }
  /** The network clock passed the expiry: still spendable at the shop, and returnable to the sponsor. */
  | { phase: 'expired-open'; text: string }
  | { phase: 'spent'; confirmed: boolean }
  | { phase: 'returned'; confirmed: boolean }
  | { phase: 'other' };

export const EXPIRED_TEXT =
  'This stamp has expired. It goes back to the sponsor once anyone returns it. Until then it can still be spent at the shop: ' +
  'both are allowed, and the network keeps whichever transaction it sees first.';

/** What a stamp page should show. `mtp` is the network's median time past (null while unknown). */
export function stampPhase(state: StampState | null, mtp: bigint | null, expiry: bigint): StampPhase {
  if (!state) return { phase: 'loading' };
  switch (state.kind) {
    case 'not-funded':
      return { phase: 'not-funded' };
    case 'spent':
      return { phase: 'spent', confirmed: state.spend.confirmed };
    case 'returned':
      return { phase: 'returned', confirmed: state.spend.confirmed };
    case 'moved-elsewhere':
      return { phase: 'other' };
    case 'waiting':
      return mtp !== null && mtp >= expiry ? { phase: 'expired-open', text: EXPIRED_TEXT } : { phase: 'active' };
  }
}

export type ErrorClass = 'contract-refused' | 'already-gone' | 'not-yet' | 'too-small' | 'unreachable' | 'other';

/** Classify a node / Fulcrum error and say it in plain words. The verbatim text is always shown too. */
export function explainNodeError(nodeError: string): { cls: ErrorClass; plain: string } {
  const e = nodeError.toLowerCase();
  if (e.includes('could not reach any fulcrum') || e.includes('timeout') || e.includes('network error') || e.includes('websocket')) {
    return { cls: 'unreachable', plain: 'The Bitcoin Cash network could not be reached. Nothing was sent. Try again in a moment.' };
  }
  if (
    e.includes('txn-mempool-conflict') ||
    e.includes('conflicts with') ||
    e.includes('missingorspent') ||
    e.includes('missing inputs') ||
    e.includes('missing-inputs') ||
    e.includes('already spent')
  ) {
    return {
      cls: 'already-gone',
      plain: 'Someone was first: this stamp was already spent or returned to the sponsor. Its status below shows which.',
    };
  }
  if (e.includes('non-final') || e.includes('nonfinal') || e.includes('not yet final')) {
    return { cls: 'not-yet', plain: 'Not yet: the network clock has not passed this stamp’s expiry. Try again later.' };
  }
  if (e.includes('dust')) {
    return { cls: 'too-small', plain: 'The amount is too small for the network to carry.' };
  }
  if (e.includes('mandatory-script-verify-flag-failed') || e.includes('script failed') || e.includes('script evaluated')) {
    return { cls: 'contract-refused', plain: 'The contract inside the coin refused this transaction. Every node checks that rule.' };
  }
  return { cls: 'other', plain: 'The network refused this transaction.' };
}
