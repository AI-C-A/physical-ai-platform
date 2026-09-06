import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { selectPublicAssets } from './scripts/select-public-assets';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), selectPublicAssets(mode)],
  server: {
    proxy: {
      '/api/quest': 'http://127.0.0.1:8787',
      '/api/integrations/patrol': 'http://127.0.0.1:8787',
      '/api/segmentation': {
        target: 'http://127.0.0.1:8790',
        rewrite: (path) => path.replace(/^\/api\/segmentation/u, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
  },
  test: {
    environment: 'jsdom',
    include: [
      'src/**/*.test.{ts,tsx}',
      'e2e/build-freshness.test.ts',
      'e2e/playwright-config.test.ts',
      'e2e/select-public-assets.test.ts',
      'e2e/soak-metrics.test.ts',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
