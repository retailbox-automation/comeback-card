// Creating stamps: one transaction from the sponsor's wallet that funds every stamp contract.
// The wallet signs its own P2PKH inputs over WizardConnect; we never see its keys.
import { TransactionBuilder, placeholderP2PKHUnlocker, type NetworkProvider, type SpendableUtxo, type WcTransactionObject } from 'cashscript';
import { DUST_SATS, FEE_SATS_PER_BYTE } from './stamp';

/** A wallet coin, with the HD path WizardConnect needs to sign it. */
export interface WalletCoin {
  utxo: SpendableUtxo;
  path: 'receive' | 'change';
  index: number;
  address: string;
}

// Note: CashScript 0.14 getTransactionSize() already counts each placeholder P2PKH input at its signed size
// (PLACEHOLDER_P2PKH_UNLOCKING_SIZE). Adding the signature bytes again overpays by ~100 sats per input.
/** Margin over the estimated size so the fee never falls below 1 sat/byte. */
export const FEE_MARGIN_SATS = 10n;
/**
 * How much more than the outputs the picked coins must hold: the fee of a funding transaction is a few hundred
 * sats (≈230 for one input). 1,500 covers up to about eight inputs. The UI warns with the same number, so a
 * wallet the form accepts is never refused after the click (17.11: the form said 1,000, coin picking wanted 5,000).
 */
export const COIN_MARGIN_SATS = 1_500n;

export interface FundingPlan {
  wc: WcTransactionObject;
  inputPaths: [number, 'receive' | 'change', number][];
  fee: bigint;
  change: bigint;
  totalFromWallet: bigint;
}

export class NotEnoughCoins extends Error {
  constructor(
    readonly have: bigint,
    readonly need: bigint,
  ) {
    super(`not enough coins: have ${have} sats, need about ${need} sats`);
  }
}

/** Largest coins first, until the stamps plus a generous fee are covered. */
export function pickCoins(coins: WalletCoin[], need: bigint): WalletCoin[] {
  const sorted = [...coins].filter((c) => !c.utxo.token).sort((a, b) => (b.utxo.satoshis > a.utxo.satoshis ? 1 : -1));
  const picked: WalletCoin[] = [];
  let sum = 0n;
  for (const c of sorted) {
    if (sum >= need) break;
    picked.push(c);
    sum += c.utxo.satoshis;
  }
  if (sum < need) throw new NotEnoughCoins(sum, need);
  return picked;
}

export function planFunding(
  provider: NetworkProvider,
  coins: WalletCoin[],
  stampAddresses: string[],
  satsPerStamp: bigint,
  changeAddress: string,
  userPrompt: string,
): FundingPlan {
  if (stampAddresses.length === 0) throw new Error('no stamps to create');
  const outTotal = satsPerStamp * BigInt(stampAddresses.length);
  const picked = pickCoins(coins, outTotal + COIN_MARGIN_SATS);
  const sum = picked.reduce((s, c) => s + c.utxo.satoshis, 0n);

  const make = (change: bigint) => {
    const b = new TransactionBuilder({ provider });
    for (const c of picked) b.addInput(c.utxo, placeholderP2PKHUnlocker(c.address));
    for (const a of stampAddresses) b.addOutput({ to: a, amount: satsPerStamp });
    if (change >= DUST_SATS) b.addOutput({ to: changeAddress, amount: change });
    return b;
  };
  // Size with a change output; placeholder inputs are already counted at their signed size.
  // Always measure WITH a change output (its value does not change the size). Measuring with
  // `sum - outTotal - 2_000` dropped the change output whenever the margin was small, and the real
  // transaction then paid 0.89 sat/byte (found by the coin-margin test, 17.11).
  const size = BigInt(make(DUST_SATS).getTransactionSize());
  let fee = size * FEE_SATS_PER_BYTE + FEE_MARGIN_SATS;
  let change = sum - outTotal - fee;
  // Never fold a negative change into the fee: that would build a transaction paying less than 1 sat/byte.
  if (change < 0n) throw new NotEnoughCoins(sum, outTotal + fee);
  if (change < DUST_SATS) {
    // Too small to keep: it goes to the fee instead of creating a dust output.
    fee += change;
    change = 0n;
  }
  const wc = make(change).generateWcTransactionObject({ broadcast: false, userPrompt });
  const inputPaths = picked.map((c, i) => [i, c.path, c.index] as [number, 'receive' | 'change', number]);
  return { wc, inputPaths, fee, change, totalFromWallet: outTotal + fee };
}
