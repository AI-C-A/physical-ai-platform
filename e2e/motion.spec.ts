import type { Locator, Page } from '@playwright/test';

import { expect, test } from './playwright-test';

import { expectApplicationReady } from './browser-assertions';

async function getAnimationDuration(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).animationDuration);
}

async function getTransitionDuration(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).transitionDuration);
}

async function getTransitionProperty(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).transitionProperty);
}

async function getRouteMorphStyles(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const group = getComputedStyle(
      root,
      '::view-transition-group(route-morph-surface)',
    );
    const imagePair = getComputedStyle(
      root,
      '::view-transition-image-pair(route-morph-surface)',
    );
    const oldImage = getComputedStyle(
      root,
      '::view-transition-old(route-morph-surface)',
    );
    const newImage = getComputedStyle(
      root,
      '::view-transition-new(route-morph-surface)',
    );

    return {
      duration: group.animationDuration,
      imagePairOverflow: imagePair.overflow,
      newObjectFit: newImage.objectFit,
      oldObjectFit: oldImage.objectFit,
      timing: group.animationTimingFunction,
    };
  });
}

async function installRouteMorphCleanupTracker(page: Page) {
  await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      __routeMorphCleanup?: {
        cleanedAfterFinished: boolean;
        finished: boolean;
      };
    };
    const originalStartViewTransition = document.startViewTransition.bind(document);
    trackedWindow.__routeMorphCleanup = {
      cleanedAfterFinished: false,
      finished: false,
    };
    document.startViewTransition = ((update) => {
      const transition = originalStartViewTransition(update);
      void transition.finished.then(() => {
        if (trackedWindow.__routeMorphCleanup !== undefined) {
          trackedWindow.__routeMorphCleanup.finished = true;
        }
      });
      return transition;
    }) as typeof document.startViewTransition;
    const observer = new MutationObserver(() => {
      const cleanup = trackedWindow.__routeMorphCleanup;
      if (
        cleanup !== undefined
        && !document.documentElement.hasAttribute('data-route-morph-direction')
      ) {
        cleanup.cleanedAfterFinished = cleanup.finished;
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: ['data-route-morph-direction'],
    });
  });
}

async function openRobotMonitoringMorph(
  page: Page,
  trackCleanup = false,
) {
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);
  await page.getByRole('button', { name: /정찰 로봇 01/u }).first().click();
  const trigger = page.getByRole('link', { name: '영상 관제' });
  await expect(trigger).toBeVisible();
  const radius = await trigger.evaluate((element) => (
    getComputedStyle(element).borderRadius
  ));
  if (trackCleanup) await installRouteMorphCleanupTracker(page);
  await trigger.click();
  await expect(page).toHaveURL(/\/control\/monitoring\/robot-001/u);
  return radius;
}

async function openMultiRobotMonitoringMorph(page: Page) {
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);
  await page.getByRole('button', { name: '다중 선택' }).click();
  const selection = page.getByRole('list', { name: '다중 관제 로봇 선택' });
  await selection.getByRole('checkbox', { name: /정찰 로봇 01/u }).click();
  await selection.getByRole('checkbox', { name: /수송 로봇 02/u }).click();
  const trigger = page.getByRole('button', { name: '다중 관제 시작' });
  await expect(trigger).toBeEnabled();
  const radius = await trigger.evaluate((element) => (
    getComputedStyle(element).borderRadius
  ));
  await trigger.click();
  await expect(page).toHaveURL(
    /\/control\/monitoring\/multi\?.*mode=multi.*robotId=robot-001.*robotId=robot-002/u,
  );
  return radius;
}

async function openEventDialog(page: Page) {
  await page.goto('/control/events');
  await expectApplicationReady(page);
  const trigger = page.getByRole('button', { name: /상세 보기/u }).first();
  await trigger.click();
  const dialog = page.locator('.design-motion-dialog');
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function openActionToast(page: Page) {
  await page.goto(
    '/control/monitoring/robot-001?interventionId=intervention-001',
  );
  await expectApplicationReady(page);
  const actionButton = page.getByRole('button', { name: '원격제어 시작' });
  await expect(actionButton).toBeEnabled();
  await actionButton.click();
  const toast = page.locator('[data-toast-state]', {
    hasText: '원격제어를 시작했습니다.',
  });
  await expect(toast).toBeVisible();
  return toast;
}

async function openExplorerTabs(page: Page) {
  await page.goto('/mlops/review');
  await expectApplicationReady(page);
  const indicator = page.locator('[data-tabs-indicator]');
  await expect(indicator).toBeVisible();
  return indicator;
}

test('overlay·toast·tabs는 데스크톱 모션 시간과 최종 위치를 유지한다', async ({
  page,
}) => {
  const { dialog, trigger } = await openEventDialog(page);
  await expect.poll(() => getAnimationDuration(dialog)).toBe('0.18s');
  await expect.poll(() => getAnimationDuration(
    page.locator('.design-motion-overlay'),
  )).toBe('0.18s');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  const indicator = await openExplorerTabs(page);
  await expect.poll(() => getTransitionDuration(indicator)).toBe('0s');
  const qualityTab = page.getByRole('tab', { name: '품질 검사' });
  await qualityTab.click();
  await expect.poll(() => getTransitionDuration(indicator)).toBe('0.22s');
  await expect.poll(async () => {
    const [indicatorBox, tabBox] = await Promise.all([
      indicator.boundingBox(),
      qualityTab.boundingBox(),
    ]);
    if (indicatorBox === null || tabBox === null) return false;
    return Math.abs(indicatorBox.x - tabBox.x) <= 1
      && Math.abs(indicatorBox.width - tabBox.width) <= 1;
  }).toBe(true);

  const toast = await openActionToast(page);
  await expect.poll(() => getAnimationDuration(toast)).toBe('0.18s');
  await toast.getByRole('button', { name: '알림 닫기' }).click();
  await expect(toast).toHaveAttribute('data-toast-state', 'exiting');
  await expect.poll(() => getAnimationDuration(toast)).toBe('0.12s');
  await expect(toast).toHaveCount(0);
});

test('영상 관제 링크는 선택한 버튼에서 실제 라우트 화면으로 확장한다', async ({
  page,
}) => {
  expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(true);
  const radius = await openRobotMonitoringMorph(page, true);

  await expect(page.getByRole('heading', { name: '정찰 로봇 01' })).toBeVisible();
  const target = page.locator('[data-route-morph-active]');
  await expect(target).toHaveCount(1);
  await expect(target).toHaveAttribute(
    'data-route-morph-id',
    'control-monitoring:robot-001',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-route-morph-direction',
    'open',
  );
  expect(await page.evaluate(() => document.activeViewTransition !== null))
    .toBe(true);
  expect(await page.locator('html').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--route-morph-radius').trim()
  ))).toBe(radius);

  const styles = await getRouteMorphStyles(page);
  expect(styles.duration).toBe('0.55s');
  expect(styles.timing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  expect(styles.imagePairOverflow).toBe('hidden');
  expect(styles.oldObjectFit).toBe('fill');
  expect(styles.newObjectFit).toBe('cover');

  await expect(page.locator('html')).not.toHaveAttribute(
    'data-route-morph-direction',
    { timeout: 1_000 },
  );
  expect(await page.evaluate(() => (
    (window as typeof window & {
      __routeMorphCleanup?: { readonly cleanedAfterFinished: boolean };
    }).__routeMorphCleanup?.cleanedAfterFinished
  ))).toBe(true);
  expect(await page.evaluate(() => document.activeViewTransition)).toBeNull();
});

test('다중 관제 버튼은 선택한 버튼에서 다중 관제 화면으로 확장한다', async ({
  page,
}) => {
  const radius = await openMultiRobotMonitoringMorph(page);
  const target = page.locator('[data-route-morph-active]');

  await expect(target).toHaveCount(1);
  await expect(target).toHaveAttribute(
    'data-route-morph-id',
    'control-monitoring:multi',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-route-morph-direction',
    'open',
  );
  expect(await page.locator('html').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--route-morph-radius').trim()
  ))).toBe(radius);
  await expect(page.getByRole('heading', { name: '다중 관제' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-route-morph-direction',
    { timeout: 1_000 },
  );
});

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('로봇 미리보기는 모션 설정에 따라 자동 재생을 시작하고 멈춘다', async ({ page }) => {
    await page.goto('/control/monitoring');
    await expectApplicationReady(page);
    await page.getByRole('region', { name: '로봇 선택', exact: true })
      .getByRole('button', { name: /정찰 로봇 01/u }).click();
    const model = page.getByRole('group', { name: '로봇 3D 모델' }).locator('model-viewer');
    await expect(model).toHaveJSProperty('loaded', true);
    await expect(model).toHaveJSProperty('paused', true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(model).toHaveJSProperty('paused', false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(model).toHaveJSProperty('paused', true);
  });

  test('overlay·toast는 1ms로 줄이고 tabs 전환을 제거한다', async ({ page }) => {
    const { dialog } = await openEventDialog(page);
    await expect.poll(() => getAnimationDuration(dialog)).toBe('0.001s');
    await expect.poll(() => getAnimationDuration(
      page.locator('.design-motion-overlay'),
    )).toBe('0.001s');

    const indicator = await openExplorerTabs(page);
    await page.getByRole('tab', { name: '품질 검사' }).click();
    await expect.poll(() => getTransitionDuration(indicator)).toBe('0.001s');
    await expect.poll(() => getTransitionProperty(indicator)).toBe('none');

    const toast = await openActionToast(page);
    await expect.poll(() => getAnimationDuration(toast)).toBe('0.001s');
    await toast.getByRole('button', { name: '알림 닫기' }).click();
    await expect(toast).toHaveCount(0);

    await openRobotMonitoringMorph(page);
    const routeMorphStyles = await getRouteMorphStyles(page);
    expect(routeMorphStyles.duration).toBe('0.001s');
  });
});
