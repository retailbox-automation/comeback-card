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
  slidesUrl: '', // Widget Factory slides (Google Slides, view link)
  repoUrl: '', // public GitHub repo
  emberTokenAddress: '', // CashTokens address for EMBER2026 community votes (Mikhail's wallet)
};

/** Demo shop that sells stickers. Its key is in the vault; the site only knows the address. */
export const DEMO_SHOP = {
  name: 'Maple Street Coffee (demo)',
  address: {
    chipnet: 'bchtest:qq7k45t0cjt8ncpxyrqpcmcsapey22am4v46sxwlxj',
    mainnet: '', // set after the mainnet go-ahead
  } satisfies Record<ChainNet, string>,
} as const;
