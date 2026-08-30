import { expect, test } from './playwright-test';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

test('모바일 Sheet는 Escape 포커스와 하단 설정 이동을 지원한다', async ({
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

  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'ROBOT Army TIGER+ 메뉴',
  });
  const settingsLink = dialog.getByRole('link', { name: '설정' });
  await expect(settingsLink).toHaveAttribute(
    'href',
    '/control/settings?siteId=pangyo-outdoor-zone',
  );
  await settingsLink.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(
    /\/control\/settings\?siteId=pangyo-outdoor-zone$/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '설정' }),
  ).toBeVisible();
  issues.assertNone();
});
