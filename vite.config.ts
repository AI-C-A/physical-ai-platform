import { readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * 앱의 Config URL은 고정하고 개발 서버와 build 산출물만 실행 방식에 맞게 교체한다.
 * Real 산출물에는 Mock Config와 영상이 함께 들어가지 않아야 한다.
 */
function selectPublicAssets(mode: string): Plugin {
  const mockVideo = fileURLToPath(
    new URL('./dist/assets/low-altitude-first-person-pov.mp4', import.meta.url),
  );
  const runtimeConfig = fileURLToPath(
    new URL('./dist/runtime-config.json', import.meta.url),
  );
  const patrolRuntimeConfig = fileURLToPath(
    new URL('./dist/runtime-config.patrol.json', import.meta.url),
  );
  const patrolRuntimeConfigSource = fileURLToPath(
    new URL('./public/runtime-config.patrol.json', import.meta.url),
  );

  return {
    name: 'select-public-assets',
    configureServer: (server) => {
      if (mode !== 'patrol') return;
      server.middlewares.use('/runtime-config.json', (
        _request,
        response,
        next,
      ) => {
        void readFile(patrolRuntimeConfigSource)
          .then((config) => {
            response.statusCode = 200;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(config);
          })
          .catch(() => next());
      });
    },
    closeBundle: async () => {
      if (mode !== 'patrol') {
        await rm(patrolRuntimeConfig, { force: true });
        return;
      }
      await Promise.all([
        rm(runtimeConfig, { force: true }),
        rm(mockVideo, { force: true }),
      ]);
      await rename(patrolRuntimeConfig, runtimeConfig);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), selectPublicAssets(mode)],
  server: {
    proxy: {
      '/api/integrations/patrol': 'http://127.0.0.1:8787',
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
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
