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
  await expect(page).toHaveURL(
    /\/mlops\/collection\?siteId=pangyo-outdoor-zone$/u,
  );
  await expect(main).toBeFocused();
  await expect(page).toHaveTitle('수집 | ROBOT Army TIGER+');

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

  await expect(page.locator('.platform-shell-sidebar')).toHaveCSS('width', '56px');
  const captureLink = page.getByRole('link', { name: '수집', exact: true });
  await expect(captureLink).toHaveAttribute('aria-current', 'page');
  await captureLink.hover();
  const captureTooltip = page.getByRole('tooltip', { name: '수집' });
  await expect(captureTooltip).toBeVisible();

  const settingsLink = page.getByRole('link', { name: '설정' });
  await expect(settingsLink).toHaveAttribute(
    'href',
    '/mlops/settings?siteId=pangyo-outdoor-zone',
  );
  await page.keyboard.press('Escape');
  await expect(captureTooltip).toHaveCount(0);
  await settingsLink.hover();
  await expect(page.getByRole('tooltip', { name: '설정' })).toBeVisible();
  await settingsLink.click();
  await expect(page).toHaveURL(
    /\/mlops\/settings\?siteId=pangyo-outdoor-zone$/u,
  );
  await expect(page).toHaveTitle('설정 | ROBOT Army TIGER+');
  await expect(page.getByText('미설정', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '상태 확인' })).toBeDisabled();

  await page.reload();
  await expectApplicationReady(page);
  await expect(
    page.getByRole('button', { name: '사이드바 펼치기' }),
  ).toBeVisible();
  issues.assertNone();
});

test('MLOps 상세 화면은 통합된 상위 메뉴를 활성화한다', async ({ page }) => {
  const cases = [
    ['/mlops/sessions/capture-h-001', '데이터 카탈로그'],
    ['/mlops/episodes/episode-fw-001', '데이터 카탈로그'],
    ['/mlops/quality/quality-001', '데이터 검수'],
    ['/mlops/evaluations/evaluation-001', '평가'],
    ['/mlops/inference/inference-001', '운영'],
  ] as const;

  for (const [path, menuLabel] of cases) {
    await page.goto(path);
    await expectApplicationReady(page);
    await expect(
      page.getByRole('link', { name: menuLabel, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
});

for (const path of ['/control/monitoring', '/mlops/settings', '/bigdata/settings']) {
  test(`${path} 사이드바 전환의 모든 프레임에서 메뉴 좌표와 DOM을 유지한다`, async ({ page }) => {
    const issues = observeBrowserIssues(page);
    await page.goto(path);
    await expectApplicationReady(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const mode of ['collapse', 'expand', 'reverse'] as const) {
      const frames = await page.locator('aside').evaluate(async (sidebar, mode) => {
        const toggle = sidebar.querySelector<HTMLButtonElement>('.platform-shell-toggle');
        const main = document.querySelector('main');
        const links = Array.from(sidebar.querySelectorAll('a.ui-navigation-item'));
        const icons = links.map((link) => link.querySelector('svg'));
        if (!toggle || !main || icons.some((icon) => !icon)) throw new Error('Shell elements missing');
        const baseline = icons.map((icon) => icon!.getBoundingClientRect());
        const toggleTop = toggle.getBoundingClientRect().top;
        const frames: { width: number; mainLeft: number; iconDrift: number; toggleDrift: number; stableNodes: boolean }[] = [];
        const sample = () => {
          const bounds = sidebar.getBoundingClientRect();
          const button = toggle.getBoundingClientRect();
          frames.push({
            width: bounds.width,
            mainLeft: main.getBoundingClientRect().left,
            iconDrift: Math.max(...icons.map((icon, index) => {
              const rect = icon!.getBoundingClientRect();
              const initial = baseline[index]!;
              return Math.max(Math.abs(rect.x - initial.x), Math.abs(rect.y - initial.y));
            })),
            toggleDrift: Math.max(Math.abs(button.top - toggleTop), Math.abs(bounds.right - button.right - 8)),
            stableNodes: links.every((link, index) => link === sidebar.querySelectorAll('a.ui-navigation-item')[index]),
          });
        };
        sample();
        toggle.click();
        const start = performance.now();
        let reversed = false;
        await new Promise<void>((resolve) => {
          const tick = () => {
            sample();
            const elapsed = performance.now() - start;
            if (mode === 'reverse' && elapsed >= 80 && !reversed) {
              toggle.click();
              reversed = true;
            }
            if (elapsed < 500) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        return frames;
      }, mode);

      expect(frames.some((frame) => frame.width > 57 && frame.width < 239)).toBe(true);
      for (const frame of frames) {
        expect(frame.stableNodes).toBe(true);
        expect(frame.iconDrift).toBeLessThan(0.1);
        expect(frame.toggleDrift).toBeLessThan(0.1);
        expect(Math.abs(frame.width - frame.mainLeft)).toBeLessThan(0.1);
      }
      expect(frames.at(-1)?.width).toBe(mode === 'collapse' ? 56 : 240);
      if (mode !== 'reverse') {
        for (let index = 1; index < frames.length; index++) {
          const delta = frames[index]!.width - frames[index - 1]!.width;
          expect(mode === 'collapse' ? delta : -delta).toBeLessThanOrEqual(0.1);
        }
      }

      const canvas = page.locator('.mapboxgl-canvas');
      if (await canvas.count()) {
        expect(await canvas.evaluate((element) => Math.abs(
          element.getBoundingClientRect().width - element.closest('.mapboxgl-map')!.clientWidth,
        ))).toBeLessThanOrEqual(1);
      }
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
    await expect(page.getByRole('button', { name: /미니앱 전환/u })).toHaveCount(0);
    expect(await page.locator('aside').evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      duration: getComputedStyle(element).transitionDuration,
    }))).toEqual({ width: 56, duration: '0s' });
    issues.assertNone();
  });
}
