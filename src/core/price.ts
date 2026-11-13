// BCH/USD for display and for turning "$0.25" into sats at creation time.
// Contracts never see dollars: amounts are fixed in sats when the stamp is created.
const SATS_PER_BCH = 100_000_000;
let cache: { usd: number; at: number } | null = null;

/** USD per BCH, or null if the price service does not answer within 5 s. Cached for a minute. */
export async function usdPerBch(): Promise<number | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.usd;
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return cache?.usd ?? null;
    const j = (await r.json()) as { 'bitcoin-cash'?: { usd?: number } };
    const usd = j['bitcoin-cash']?.usd;
    if (typeof usd !== 'number' || !(usd > 0)) return cache?.usd ?? null;
    cache = { usd, at: Date.now() };
    return usd;
  } catch {
    return cache?.usd ?? null;
  }
}

export function usdToSats(usd: number, rate: number): bigint {
  return BigInt(Math.round((usd / rate) * SATS_PER_BCH));
}

export function formatUsd(sats: bigint, rate: number | null): string | null {
  if (rate === null) return null;
  const usd = (Number(sats) / SATS_PER_BCH) * rate;
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

export function formatSats(sats: bigint): string {
  return `${sats.toLocaleString('en-US')} sats`;
}
