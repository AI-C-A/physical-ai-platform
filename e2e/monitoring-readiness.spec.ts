import type { Locator, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  expectAccessiblePageStructure,
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';
import { expect, test, type Page } from './playwright-test';

const viewports = [
  { width: 1280, height: 720 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
] as const;

async function captureMonitoring(
  page: Page,
  testInfo: TestInfo,
  state: string,
): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('관제 화면 크기가 설정되지 않았습니다.');
  const directory = resolve('test-results/product-audit');
  await mkdir(directory, { recursive: true });
  const name = `monitoring-${state}-${String(viewport.width)}x${String(viewport.height)}`;
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectControlsBesidePanel(
  controls: Locator,
  panel: Locator,
): Promise<void> {
  await expect(controls).toBeVisible();
  await expect(panel).toBeVisible();
  await expect.poll(async () => {
    const controlBox = await controls.boundingBox();
    const panelBox = await panel.boundingBox();
    if (controlBox === null || panelBox === null) return Number.POSITIVE_INFINITY;
    const width = Math.max(0,
      Math.min(controlBox.x + controlBox.width, panelBox.x + panelBox.width)
      - Math.max(controlBox.x, panelBox.x));
    const height = Math.max(0,
      Math.min(controlBox.y + controlBox.height, panelBox.y + panelBox.height)
      - Math.max(controlBox.y, panelBox.y));
    return width * height;
  }, { message: '지도 제어와 선택한 로봇 상세가 겹치면 안 됩니다.' }).toBeLessThanOrEqual(1);

  for (const name of ['사이트 중심', '전체 위치', '위치 따라가기']) {
    const button = controls.getByRole('button', { name, exact: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    await button.click({ trial: true });
  }
}

for (const viewport of viewports) {
  test(`관제 선택과 지도 제어를 ${String(viewport.width)}×${String(viewport.height)}에서 사용할 수 있다`, async ({ page }, testInfo) => {
    const issues = observeBrowserIssues(page);
    await page.setViewportSize(viewport);
    await page.goto('/control/monitoring');
    await expectApplicationReady(page);

    const map = page.getByRole('region', { name: '로봇 위치 지도', exact: true });
    const marker = page.getByRole('button', { name: '정찰 로봇 01 위치 선택', exact: true, includeHidden: true });
    const panel = page.getByRole('region', { name: '정찰 로봇 01 로봇 패널', exact: true, includeHidden: true });
    const list = page.getByRole('region', { name: '로봇 선택', exact: true, includeHidden: true });
    const toggle = page.locator('button[aria-controls="monitoring-robot-list"]');
    const controls = page.getByRole('group', { name: '지도 보기 제어', exact: true });
    const mobile = viewport.width < 768;

    try {
      await test.step('지도 핀을 키보드로 선택하고 선택 상태와 포커스를 유지한다', async () => {
        await expect(map).toBeVisible();
        await expect.poll(() => map.getByRole('button', { name: /위치 선택$/u }).count()).toBeGreaterThan(1);
        await expect(marker).toBeVisible();
        await expect(marker).toHaveAttribute('aria-pressed', 'false');
        expect((await marker.boundingBox())?.width).toBeGreaterThanOrEqual(44);
        expect((await marker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await marker.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(marker).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(marker).toHaveAttribute('aria-pressed', 'true');
        await expect(panel).toBeVisible();
        await expect.poll(() => panel.locator('model-viewer').evaluate(
          (element) => Reflect.get(element, 'loaded') === true,
        )).toBe(true);
        if (mobile) {
          await expect(panel.getByRole('progressbar', { name: '배터리 잔량', exact: true }))
            .toBeInViewport({ ratio: 1 });
        }
        await expect(panel.getByRole('link', { name: '영상 관제', exact: true })).toHaveAttribute('href', /\/control\/monitoring\/robot-001(?:\?|$)/u);
        await expect(controls.getByRole('button', { name: '위치 따라가기', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(marker).toBeFocused();
        await captureMonitoring(page, testInfo, 'selected');
      });

      await test.step('상세 패널이 지도 제어를 가리지 않고 위치 추적을 전환한다', async () => {
        await expectControlsBesidePanel(controls, panel);
        const follow = controls.getByRole('button', { name: '위치 따라가기', exact: true });
        await follow.click();
        await expect(follow).toHaveAttribute('aria-pressed', 'false');
        await follow.click();
        await expect(follow).toHaveAttribute('aria-pressed', 'true');
      });

      await test.step('검색에서 제외된 로봇도 상세와 지도 선택을 유지한다', async () => {
        if (mobile) {
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(panel).toBeHidden();
          await expect(map).toBeHidden();
          await expect(list).toBeVisible();
          await captureMonitoring(page, testInfo, 'list-expanded');
        }
        const search = list.getByRole('searchbox', { name: '로봇 검색', exact: true });
        await search.fill('수송 로봇 02');
        await expect(list.getByRole('button', { name: /수송 로봇 02/u })).toBeVisible();
        await expect(list.getByRole('button', { name: /정찰 로봇 01/u })).toHaveCount(0);
        await expect(marker).toHaveAttribute('aria-pressed', 'true');
        if (mobile) {
          await toggle.focus();
          await page.keyboard.press('Enter');
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(list).toBeHidden();
          await expect(map).toBeVisible();
        }
        await expect(panel).toBeVisible();
        await expectControlsBesidePanel(controls, panel);
        await captureMonitoring(page, testInfo, 'search-preserved');

        if (mobile) {
          await toggle.click();
          await expect(search).toHaveValue('수송 로봇 02');
          await list.getByRole('button', { name: /수송 로봇 02/u }).click();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(toggle).toBeFocused();
          await expect(list).toBeHidden();
          await expect(page.getByRole('region', { name: '수송 로봇 02 로봇 패널', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: '수송 로봇 02 위치 선택', exact: true })).toHaveAttribute('aria-pressed', 'true');
          await expect(marker).toHaveAttribute('aria-pressed', 'false');
          await captureMonitoring(page, testInfo, 'list-selected');
        } else {
          await list.getByRole('button', { name: '로봇 검색어 모두 지우기', exact: true }).click();
          await expect(search).toHaveValue('');
          await expect(search).toBeFocused();
          await expect(list.getByRole('button', { name: /정찰 로봇 01/u })).toHaveAttribute('aria-pressed', 'true');
        }
      });

      await expectAccessiblePageStructure(page);
      issues.assertNone();
    } finally {
      await captureMonitoring(page, testInfo, 'final');
    }
  });
}
