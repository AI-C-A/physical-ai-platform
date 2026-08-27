import { defineConfig } from '@playwright/test';

import browserConfig from './playwright.config';

export default defineConfig(browserConfig, {
  outputDir: 'test-results/soak',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/soak' }],
  ],
  projects: [
    {
      name: 'chrome-1440',
      testMatch: ['**/telemetry-video-soak.spec.ts'],
      use: {
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
