// Links between pages. The shop counter reads its shop from the URL fragment
// (shop.html#a=<address>&n=<name>&tx=<txid>, see web/shop.tsx), so every page builds it the same way here.

/** Link to the counter of the shop the stamps pay. */
export function counterHref(address: string, name: string, txid?: string): string {
  const p = new URLSearchParams({ a: address, n: name });
  if (txid) p.set('tx', txid);
  return `./shop.html#${p.toString()}`;
}
