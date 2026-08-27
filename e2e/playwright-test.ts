import { expect, test as base, type Page } from '@playwright/test';

async function stubMapboxRequests(page: Page): Promise<void> {
  await page.route('https://api.mapbox.com/styles/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        layers: [],
        sources: {},
        version: 8,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('https://events.mapbox.com/**', async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route('https://api.mapbox.com/map-sessions/**', async (route) => {
    await route.fulfill({ status: 204 });
  });
}

/** 외부 Mapbox 스타일 상태와 무관하게 브라우저 회귀를 결정적으로 실행한다. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await stubMapboxRequests(page);
    await provide(page);
  },
});

export { expect };
export type { Page } from '@playwright/test';
