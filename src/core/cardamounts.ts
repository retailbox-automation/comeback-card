// Card amounts offered on the Give form, and whether each one is allowed at today's BCH price.
import { MIN_CARD_SATS } from './card';
import { usdToSats } from './price';

/** Dollar amounts on the Give form, smallest first. $0.01 lets a giver with a nearly empty wallet try it. */
export const CARD_AMOUNTS_USD = [0.01, 0.05, 0.25, 1] as const;

export interface AmountOption {
  usd: number;
  /** Gift size in sats at this price, or null while the price is unknown. */
  sats: bigint | null;
  /** False when the gift would fall below MIN_CARD_SATS at this price (a card that small can't pay its own way). */
  allowed: boolean;
}

/** Each amount with its size in sats; an amount below the card minimum is shown but can't be picked. */
export function amountOptions(rate: number | null | undefined, amounts: readonly number[] = CARD_AMOUNTS_USD): AmountOption[] {
  return amounts.map((usd) => {
    if (!rate) return { usd, sats: null, allowed: false };
    const sats = usdToSats(usd, rate);
    return { usd, sats, allowed: sats >= MIN_CARD_SATS };
  });
}

/** Round amounts the card page offers for a partial payment. $0.005 keeps "pay in parts" possible on a $0.01 card. */
export const PAY_PRESETS_USD = [0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20] as const;

/** The two largest round amounts well under the card's balance (at most 70% of it); the page adds "All" after them. */
export function payPresets(balanceUsd: number | null): number[] {
  if (!balanceUsd) return [];
  return PAY_PRESETS_USD.filter((u) => u <= balanceUsd * 0.7).slice(-2);
}

/** "$0.005", "$0.01", "$0.25", "$1", "$2.50". */
export function usdLabel(u: number): string {
  if (u < 0.01) return `$${u.toFixed(3)}`;
  if (u < 1) return `$${u.toFixed(2)}`;
  return `$${u % 1 ? u.toFixed(2) : u.toFixed(0)}`;
}

/** The amount to keep selected: the current one if still allowed, otherwise the smallest allowed one. */
export function keepAllowed(current: number, options: AmountOption[]): number {
  if (options.some((o) => o.usd === current && o.allowed)) return current;
  return options.find((o) => o.allowed)?.usd ?? current;
}
