import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

import { selectPublicAssets } from './scripts/select-public-assets';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), selectPublicAssets(mode)],
  server: {
    allowedHosts: (loadEnv(mode, process.cwd(), 'DEV_').DEV_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean),
    proxy: {
      '/api/quest': { target: 'http://127.0.0.1:8787', ws: true },
      '/api/integrations/patrol': 'http://127.0.0.1:8787',
      '/api/perception/full-body': {
        target: process.env.PERCEPTION_BODY_TARGET || 'http://127.0.0.1:8791',
        rewrite: (path) => path.replace(/^\/api\/perception\/full-body/u, ''),
      },
      '/api/perception/head': {
        target: process.env.PERCEPTION_HEAD_TARGET || 'http://127.0.0.1:8792',
        rewrite: (path) => path.replace(/^\/api\/perception\/head/u, ''),
      },
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
