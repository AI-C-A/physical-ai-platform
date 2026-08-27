import { expect, test } from './playwright-test';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

test('데스크톱 Shell을 키보드로 전환하고 접힘 상태를 복구한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);

  const main = page.getByRole('main');
  await expect(main).not.toBeFocused();
  await expect(page).toHaveTitle('모니터링 | ROBOT Army TIGER+');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', {
    name: '본문으로 건너뛰기',
  });
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();
  await expect.poll(() => skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle}:${style.outlineWidth}`;
  })).toBe('solid:2px');
  await skipLink.press('Enter');
  await expect(main).toBeFocused();

  const miniAppTrigger = page.getByRole('button', {
    name: '미니앱 전환 · 관제',
  });
  await miniAppTrigger.focus();
  await miniAppTrigger.press('Enter');
  const mlopsItem = page.getByRole('menuitem', { name: 'MLOps' });
  await mlopsItem.focus();
  await mlopsItem.press('Enter');
  await expect(page).toHaveURL(/\/mlops\/capture$/u);
  await expect(main).toBeFocused();
  await expect(page).toHaveTitle('데이터 수집 | ROBOT Army TIGER+');

  await page.getByRole('button', { name: '사이드바 접기' }).click();
  await expect(
    page.getByRole('button', { name: '사이드바 펼치기' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem(
          'army-robot.platform-shell.collapsed.v1',
        ),
      ),
    )
    .toBe('true');

  const captureLink = page.getByRole('link', { name: '데이터 수집' });
  await expect(captureLink).toHaveAttribute('aria-current', 'page');
  await captureLink.hover();
  await expect(page.getByRole('tooltip', { name: '데이터 수집' })).toBeVisible();

  await page.reload();
  await expectApplicationReady(page);
  await expect(
    page.getByRole('button', { name: '사이드바 펼치기' }),
  ).toBeVisible();
  issues.assertNone();
});
