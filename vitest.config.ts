import { defineConfig } from 'vitest/config';

// Default run: offline tests (Mocknet, fakes). `LIVE=1 npx vitest run`: live chipnet checks only.
const live = process.env.LIVE === '1';

export default defineConfig({
  test: {
    // cashscript/vitest registers its matchers on the global `expect`.
    globals: true,
    include: live ? ['test/live/**/*.live.ts'] : ['test/**/*.test.ts'],
    testTimeout: live ? 60_000 : 5_000,
  },
});
