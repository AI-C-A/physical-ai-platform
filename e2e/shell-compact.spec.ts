import { expect, test } from './playwright-test';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

test('모바일 Sheet는 Escape 후 trigger로 포커스를 돌려준다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);

  const trigger = page.getByRole('button', { name: '업무 메뉴 열기' });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'ROBOT Army TIGER+ 메뉴' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'ROBOT Army TIGER+ 메뉴' }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  issues.assertNone();
});
