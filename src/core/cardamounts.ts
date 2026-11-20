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

/** The amount to keep selected: the current one if still allowed, otherwise the smallest allowed one. */
export function keepAllowed(current: number, options: AmountOption[]): number {
  if (options.some((o) => o.usd === current && o.allowed)) return current;
  return options.find((o) => o.allowed)?.usd ?? current;
}
