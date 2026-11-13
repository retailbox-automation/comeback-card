import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const page = (name: string) => resolve(__dirname, `web/${name}.html`);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page('index'),
        stamp: page('stamp'),
        shop: page('shop'),
        campaign: page('campaign'),
        // lab.html (the wallet spike page) is served by the dev server only and never shipped.
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
