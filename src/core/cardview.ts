// Plain-language pieces of the card screen that depend on network time. Pure, tested.

/** "2 h", "35 min", "3 days": how long ago the card ended, by network time (median time past). */
export function endedAgo(networkTime: bigint, expiry: bigint): string | null {
  if (networkTime < expiry) return null;
  const s = Number(networkTime - expiry);
  if (s < 60 * 60) return `${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 48 * 60 * 60) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} days`;
}

/** The comeback strip's text after the end date. */
export function endedText(networkTime: bigint, expiry: bigint, hasCoins: boolean): string {
  const ago = endedAgo(networkTime, expiry) ?? '0 min';
  return hasCoins
    ? `This card ended ${ago} ago (network time). What’s left can only go back to the giver, and anyone can send it now.`
    : `This card ended ${ago} ago (network time).`;
}
