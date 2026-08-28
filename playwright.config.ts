import { defineConfig } from '@playwright/test';

const baseUse = {
  baseURL: 'http://127.0.0.1:4173',
  screenshot: 'only-on-failure' as const,
  trace: 'retain-on-failure' as const,
};
const commonTestMatch = [
  '**/routes.spec.ts',
  '**/startup.spec.ts',
  '**/workflows.spec.ts',
];

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/browser',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI === 'true' ? 1 : 0,
  // 동시 WebGL page가 model-viewer의 500ms render 확인을 굶겨 가짜 console warning을 만들지 않게 직렬화한다.
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/browser' }],
  ],
  use: baseUse,
  projects: [
    {
      name: 'chrome-1440',
      testMatch: [
        ...commonTestMatch,
        '**/shell-desktop.spec.ts',
      ],
      use: {
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chrome-768',
      testMatch: [
        ...commonTestMatch,
        '**/shell-compact.spec.ts',
      ],
      use: {
        channel: 'chrome',
        viewport: { width: 768, height: 900 },
      },
    },
    {
      name: 'chrome-1024',
      testMatch: [
        ...commonTestMatch,
        '**/shell-desktop.spec.ts',
      ],
      use: {
        channel: 'chrome',
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: 'edge-1440',
      testMatch: [
        ...commonTestMatch,
        '**/shell-desktop.spec.ts',
      ],
      use: {
        channel: 'msedge',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'edge-768',
      testMatch: [
        ...commonTestMatch,
        '**/shell-compact.spec.ts',
      ],
      use: {
        channel: 'msedge',
        viewport: { width: 768, height: 900 },
      },
    },
    {
      name: 'edge-1024',
      testMatch: [
        ...commonTestMatch,
        '**/shell-desktop.spec.ts',
      ],
      use: {
        channel: 'msedge',
        viewport: { width: 1024, height: 900 },
      },
    },
  ],
});
