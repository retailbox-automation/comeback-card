// Build-time configuration. Public values only: no keys live in the site.
import type { ChainNet } from './core/chain';
import type { Variant } from './core/stamp';

/** Network the site runs on. Chipnet until the mainnet go-ahead. */
export const NET: ChainNet = import.meta.env.VITE_NET === 'mainnet' ? 'mainnet' : 'chipnet';

/**
 * Stamp contract type. 'cov' (reclaim is a covenant to the sponsor, no signature) is the default,
 * chosen on 13.11.2026 after the chipnet spike. 'sig' (sponsor signs the reclaim)
 * stays available behind this flag and in the tests.
 */
export const STAMP_VARIANT: Variant = import.meta.env.VITE_STAMP_VARIANT === 'sig' ? 'sig' : 'cov';

/**
 * Banner links required by BLAZE rules (top of the home page). Empty until they exist:
 * the banner then says so instead of showing a dead link. All three must be set before submission.
 */
export const BANNER = {
  slidesUrl: 'https://docs.google.com/presentation/d/1cGlz5YIWo-ABdPrbIQ7x_Ytr_aPhKZwDRIWRwK6J3o4/edit?usp=sharing', // Widget Factory slides
  repoUrl: 'https://github.com/retailbox-automation/comeback-card',
  // CashTokens address for EMBER2026 community votes: Mikhail's Selene wallet, the same address
  // he posted in the BCH BLAZE Telegram chat on 14.11.2026 (roll call msg 2972, intro msg 2996).
  emberTokenAddress: 'bitcoincash:zqacsrldsxhhjv7fyhayldluhrnu58uqfy83p0z3g3',
};

/**
 * Comeback Card: the demo shop's public shop link (its signing key's public key and signature over the demo
 * shop address). The signing keys live only in the vault (BCHCC_<NET>_DEMO_SHOP_SIGNING_KEY, made 17.11.2026).
 */
export const CARD_DEMO_SHOP_LINK: Record<ChainNet, string> = {
  chipnet:
    'wgEaTWFwbGUgU3RyZWV0IENvZmZlZSAoZGVtbykCNE6fi7R2ZWxAV-7bEx74-pk0KR8o_jNVO3comRt5TjkZdqkUPWrRb8SWeeAmIMAcbxDockUru6uIrHDcxm9CErnDJ8L2Am4UH8dzQWIzcM12Ih2S60TNabcNa-h68pBbg1SqN8865l4lFkNOA90QbOAwB0KUCVg8HM8',
  mainnet:
    'wgAaTWFwbGUgU3RyZWV0IENvZmZlZSAoZGVtbykDheIltIiQx_0j_-dk5AqyybCG52YTxGwARb_C5tCZZY0ZdqkUiAE7sZ3nSse0MoRAIHVsty1S8QuIrCF5bFP7wDFFtmcOPnH137fcOUnt-OECLUKA_EKdO4EWiHHHOb5Sk77jt00Y-goJVVS9ni0FgXwfQ_lyC_mAtEE',
};

/** Demo shop that sells stickers. Its key is in the vault; the site only knows the address. */
export const DEMO_SHOP = {
  name: 'Maple Street Coffee (demo)',
  address: {
    chipnet: 'bchtest:qq7k45t0cjt8ncpxyrqpcmcsapey22am4v46sxwlxj',
    // Key generated 13.11.2026 ~17:59Z, held only in the vault; no coins on it until the demo is funded.
    mainnet: 'bitcoincash:qzyqzwa3nhn543a5x2zyqgr4djmj65h3pv3je90tf0',
  } satisfies Record<ChainNet, string>,
} as const;
