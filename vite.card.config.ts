// Comeback Card site: its own pages under web-card/, the shared code in src/, the same public files as
// First Purchase (fonts, café photos). Build: VITE_NET=mainnet npx vite build -c vite.card.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const page = (name: string) => resolve(__dirname, `web-card/${name}.html`);

export default defineConfig({
  root: 'web-card',
  publicDir: resolve(__dirname, 'web/public'),
  plugins: [react()],
  build: {
    outDir: '../dist-card',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page('index'),
        give: page('give'),
        card: page('card'),
        rules: page('rules'),
        'for-shops': page('for-shops'),
        counter: page('counter'),
        '404': page('404'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
});
