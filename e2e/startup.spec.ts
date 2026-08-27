import { expect, test } from './playwright-test';

import {
  expectAccessiblePageStructure,
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

test('잘못된 Runtime Config는 시작을 중단하고 다시 불러오기로 복구한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  let runtimeConfigRequestCount = 0;
  await page.route('**/runtime-config.json', async (route) => {
    runtimeConfigRequestCount += 1;
    if (runtimeConfigRequestCount === 1) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          adapters: {
            implementation: 'unsupported',
            mode: 'bundle',
          },
          connections: {
            capture: { endpoint: null },
            telemetry: { endpoint: null, integrationProfileId: null },
            video: { endpoint: null },
          },
        },
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/control/monitoring');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '애플리케이션을 시작하지 못했습니다',
    }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'in-memory 또는 external이어야 합니다',
  );
  await expectAccessiblePageStructure(page);

  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expectApplicationReady(page);
  await expect(page).toHaveURL(/\/control\/monitoring$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: '모니터링' }),
  ).toBeVisible();
  await expectAccessiblePageStructure(page);
  expect(runtimeConfigRequestCount).toBe(2);
  issues.assertNone();
});
