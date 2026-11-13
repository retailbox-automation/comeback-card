import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // cashscript/vitest registers its matchers on the global `expect`.
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
