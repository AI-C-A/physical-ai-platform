import type { Locator, Page } from '@playwright/test';

import { expect, test } from './playwright-test';

import { expectApplicationReady } from './browser-assertions';
import { fillCollectionSetup } from './collection-setup';

for (const width of [1440, 390]) {
  test(`사이드바 메뉴는 본문만 전환하고 재선택·모바일 닫기·히스토리를 유지한다 (${String(width)}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/mlops/collection?siteId=site-lab');
    await expectApplicationReady(page);
    await page.evaluate(() => {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = ((update) => {
        const transition = original(update);
        void transition.ready.then(() => {
          const animations = document.getAnimations().filter((animation) => (
            animation instanceof CSSAnimation && animation.animationName.startsWith('sidebar-page-')
          ));
          if (animations.length === 0) return;
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = 140;
          }
          document.documentElement.dataset.sidebarMotionCount = String(Number(document.documentElement.dataset.sidebarMotionCount ?? 0) + 1);
        }, () => undefined);
        return transition;
      }) as typeof document.startViewTransition;
    });
    const selectMenu = async (name: string) => {
      if (width < 1024) {
        await page.getByRole('button', { name: '업무 메뉴 열기', exact: true }).click();
        await page.getByRole('dialog').getByRole('link', { name, exact: true }).click();
      } else {
        await page.getByRole('link', { name, exact: true }).click();
      }
    };
    const finishTransition = async () => {
      await page.evaluate(async () => {
        const transition = document.activeViewTransition;
        for (const animation of document.getAnimations()) {
          if (animation instanceof CSSAnimation && animation.animationName.startsWith('sidebar-page-')) animation.finish();
        }
        await transition?.finished;
      });
      await expect(page.locator('[data-sidebar-page-transition]')).toHaveCount(0);
    };
    const fixedSurface = width >= 1024 ? page.locator('.platform-shell-sidebar') : page.locator('header').first();
    const originalBounds = await fixedSurface.boundingBox();

    if (width < 1024) {
      await page.getByRole('button', { name: '업무 메뉴 열기', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await sheet.evaluate((element) => {
        element.addEventListener('animationstart', (event) => {
          if ((event as AnimationEvent).animationName !== 'design-motion-sheet-out') return;
          element.getAnimations().forEach((animation) => { animation.pause(); animation.currentTime = 70; });
        });
      });
      await sheet.getByRole('link', { name: '데이터 카탈로그', exact: true }).click();
      await expect(sheet).toHaveAttribute('data-state', 'closed');
      await expect.poll(() => sheet.evaluate((element) => element.getAnimations().some((animation) => animation.playState === 'paused'))).toBe(true);
      await expect(page).toHaveURL('/mlops/collection?siteId=site-lab');
      await sheet.evaluate((element) => element.getAnimations().forEach((animation) => animation.finish()));
    } else {
      const link = page.getByRole('link', { name: '데이터 카탈로그', exact: true });
      await link.focus();
      await link.press('Enter');
    }
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '1');
    await expect(page).toHaveURL('/mlops/catalog?siteId=site-lab');
    expect(await fixedSurface.boundingBox()).toEqual(originalBounds);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const styles = await page.evaluate(() => {
      const root = document.documentElement;
      const oldPage = getComputedStyle(root, '::view-transition-old(sidebar-page)');
      const newPage = getComputedStyle(root, '::view-transition-new(sidebar-page)');
      return {
        oldDuration: oldPage.animationDuration,
        newDuration: newPage.animationDuration,
        newDelay: newPage.animationDelay,
        oldOpacity: oldPage.opacity,
        rootAnimation: getComputedStyle(root, '::view-transition-new(root)').animationName,
        pageTransform: newPage.transform,
      };
    });
    expect(styles).toEqual({ oldDuration: '0.09s', newDuration: '0.15s', newDelay: '0.09s', oldOpacity: '0', rootAnimation: 'none', pageTransform: 'none' });
    await testInfo.attach(`sidebar-page-${String(width)}`, { body: await page.screenshot(), contentType: 'image/png' });
    await finishTransition();
    await expect(page.getByRole('main')).toBeFocused();

    await selectMenu('데이터 카탈로그');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-sidebar-page-transition]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '1');
    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '2');
    await finishTransition();
    await page.goForward();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '3');
    await finishTransition();

    if (width >= 1024) {
      await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
      await expect(page.locator('.platform-shell-sidebar')).toHaveCSS('width', '56px');
    }
    await selectMenu('데이터셋');
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '4');
    await finishTransition();
    if (width >= 1024) {
      await expect(page.getByRole('link', { name: '데이터셋', exact: true })).toHaveAttribute('aria-current', 'page');
    }

    let completedTransitions = 4;
    if (width >= 1024) {
      await selectMenu('수집');
      await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '5');
      await selectMenu('데이터 카탈로그');
      await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', '6');
      await finishTransition();
      await expect(page).toHaveURL('/mlops/catalog?siteId=site-lab');
      completedTransitions = 6;
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await selectMenu('설정');
    await expect(page).toHaveURL('/mlops/settings?siteId=site-lab');
    await expect(page.locator('html')).toHaveAttribute('data-sidebar-motion-count', String(completedTransitions + 1));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::view-transition-new(sidebar-page)').animationDuration)).toBe('0.001s');
    await finishTransition();
    await page.evaluate(() => { Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined }); });
    await selectMenu('수집');
    await expect(page).toHaveURL('/mlops/collection?siteId=site-lab');
    await expect(page.locator('[data-sidebar-page-transition]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [1440, 390]) {
  test(`수집 페이지는 진입·복귀·히스토리에 방향 있는 전환을 적용한다 (${String(width)}px)`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/mlops/collection/new');
    await expectApplicationReady(page);
    await fillCollectionSetup(page);
    await page.getByRole('textbox', { name: '세션 이름' }).fill('페이지 전환 확인');
    await page.getByRole('button', { name: '세션 생성', exact: true }).click();
    const pairing = page.getByRole('status', { name: 'Quest pairing code' });
    await expect(pairing).toHaveText(/^\d{6}$/u);
    const collector = await page.context().newPage();
    try {
      await collector.goto('/collect/quest');
      await expectApplicationReady(collector);
      await collector.getByRole('textbox', { name: '6자리 페어링 코드' }).fill((await pairing.innerText()).trim());
      await collector.getByRole('button', { name: '세션 연결', exact: true }).click();
      await collector.getByRole('button', { name: 'MR 모드 시작', exact: true }).click();

      await page.evaluate(() => {
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = ((update) => {
          const transition = original(update);
          void transition.ready.then(() => {
            const root = document.documentElement;
            const direction = root.dataset.collectionPageTransition;
            if (direction === undefined) return;
            const animations = document.getAnimations().filter((animation) => (
              animation instanceof CSSAnimation && animation.animationName.startsWith('collection-page-')
            ));
            for (const animation of animations) {
              animation.pause();
              animation.currentTime = Number(animation.effect?.getTiming().duration) * 0.45;
            }
            root.dataset.collectionMotionSample = direction;
          }, () => undefined);
          return transition;
        }) as typeof document.startViewTransition;
      });

      const checkTransition = async (direction: 'open' | 'close') => {
        await expect(page.locator('html')).toHaveAttribute('data-collection-motion-sample', direction);
        const sample = await page.evaluate(() => {
          const root = document.documentElement;
          const oldPage = getComputedStyle(root, '::view-transition-old(root)');
          const newPage = getComputedStyle(root, '::view-transition-new(root)');
          const content = document.querySelector('.platform-shell-content');
          return {
            oldName: oldPage.animationName,
            newName: newPage.animationName,
            duration: newPage.animationDuration,
            padding: content === null ? null : getComputedStyle(content).paddingLeft,
            layoutTransition: content === null ? null : getComputedStyle(content).transitionDuration,
          };
        });
        expect(sample.oldName).toBe(direction === 'open' ? 'collection-page-recede' : 'collection-page-leave');
        expect(sample.newName).toBe(direction === 'open' ? 'collection-page-enter' : 'collection-page-return');
        expect(sample.duration).toBe(direction === 'open' ? '0.36s' : '0.28s');
        if (direction === 'close') {
          expect(sample.padding).toBe(width >= 1024 ? '240px' : '0px');
          expect(sample.layoutTransition).toBe('0s');
        }
        await testInfo.attach(`collection-${direction}-${String(width)}`, {
          body: await page.screenshot(), contentType: 'image/png',
        });
        await page.evaluate(async () => {
          const transition = document.activeViewTransition;
          document.getAnimations().forEach((animation) => {
            if (animation instanceof CSSAnimation && animation.animationName.startsWith('collection-page-')) animation.finish();
          });
          await transition?.finished;
          delete document.documentElement.dataset.collectionMotionSample;
        });
        await expect(page.locator('html')).not.toHaveAttribute('data-collection-page-transition');
      };

      await page.getByRole('button', { name: '수집 콘솔 열기', exact: true }).click();
      await checkTransition('open');
      await expect(page.getByRole('heading', { name: '페이지 전환 확인', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '수집 콘솔 닫기', exact: true }).click();
      await page.getByRole('button', { name: '나중에 계속', exact: true }).click();
      await checkTransition('close');
      await expect(page.getByRole('heading', { name: '데이터 수집', exact: true })).toBeVisible();
      await page.getByRole('link', { name: '페이지 전환 확인', exact: true }).click();
      await checkTransition('open');
      await page.goBack();
      await checkTransition('close');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.getByRole('link', { name: '페이지 전환 확인', exact: true }).click();
      await expect(page.getByRole('heading', { name: '페이지 전환 확인', exact: true })).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-collection-page-transition');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--design-motion-page-enter').trim())).toBe('1ms');
      await page.goBack();
      await expect(page.getByRole('heading', { name: '데이터 수집', exact: true })).toBeVisible();

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined }); });
      await page.getByRole('link', { name: '페이지 전환 확인', exact: true }).click();
      await expect(page.getByRole('heading', { name: '페이지 전환 확인', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '수집 콘솔 닫기', exact: true }).click();
      await page.getByRole('button', { name: '나중에 계속', exact: true }).click();
      await expect(page.getByRole('heading', { name: '데이터 수집', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await collector.close();
    }
  });
}

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

test('공통 press는 레이아웃을 유지하고 놓기·모션 감소에서 복원된다', async ({ page }) => {
  await page.goto('/control/events');
  await expectApplicationReady(page);
  const button = page.getByRole('button', { name: /상세 보기/u }).first();
  const layoutWidth = await button.evaluate((element) => (element as HTMLElement).offsetWidth);
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).scale)).toBe('0.96');
  expect(await button.evaluate((element) => (element as HTMLElement).offsetWidth)).toBe(layoutWidth);
  expect(await getTransitionDuration(button)).toBe('0.18s');
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).scale)).toBe('none');
  expect(await getTransitionDuration(button)).toBe('0.28s');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.hover();
  await page.mouse.down();
  expect(await button.evaluate((element) => getComputedStyle(element).scale)).toBe('none');
  expect(await getTransitionProperty(button)).toBe('none');
  await page.mouse.move(1, 1);
  await page.mouse.up();
});

test('메뉴와 Select는 배치 기준으로 열리고 퇴장 후 포커스를 복원한다', async ({ page }) => {
  await page.goto('/control/events');
  await expectApplicationReady(page);
  const triggers = [
    page.getByRole('button', { name: /미니앱 전환/u }),
    page.getByRole('combobox', { name: '유형', exact: true }),
  ];
  const popups = [page.locator('.design-motion-menu'), page.locator('.design-motion-select')];

  for (const [index, trigger] of triggers.entries()) {
    const popup = popups[index]!;
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup).toBeVisible();
    expect(await getAnimationDuration(popup)).toBe('0.28s');
    expect(await popup.evaluate((element) => getComputedStyle(element).animationName)).toBe('design-motion-popover-in');
    const side = await popup.getAttribute('data-side');
    expect(['top', 'bottom', 'left', 'right']).toContain(side);
    const origin = await popup.evaluate((element) => {
      const styles = getComputedStyle(element);
      const variable = element.classList.contains('design-motion-select')
        ? '--radix-select-content-transform-origin'
        : '--radix-dropdown-menu-content-transform-origin';
      return styles.getPropertyValue(variable).trim();
    });
    expect(origin).not.toBe('');
    await popup.evaluate((element) => {
      element.addEventListener('animationstart', (event) => {
        if ((event as AnimationEvent).animationName !== 'design-motion-popover-out') return;
        for (const animation of element.getAnimations()) animation.pause();
      });
    });
    await page.keyboard.press('Escape');
    await expect(popup).toHaveAttribute('data-state', 'closed');
    await expect.poll(() => popup.evaluate((element) => element.getAnimations().some((animation) => animation.playState === 'paused'))).toBe(true);
    expect(await popup.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
    await popup.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.finish();
    });
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [index, trigger] of triggers.entries()) {
    const popup = popups[index]!;
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup).toBeVisible();
    expect(await getAnimationDuration(popup)).toBe('0.001s');
    expect(await popup.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

async function pauseDialogExit(dialog: Locator) {
  await dialog.evaluate((element) => {
    element.addEventListener('animationstart', (event) => {
      if (event.target !== element || (event as AnimationEvent).animationName !== 'design-motion-dialog-out') return;
      for (const animation of element.getAnimations()) {
        animation.pause();
        animation.currentTime = 70;
      }
    });
  });
}

async function expectDialogExiting(dialog: Locator) {
  await expect(dialog).toHaveAttribute('data-state', 'closed');
  await expect.poll(() => dialog.evaluate((element) => element.getAnimations().some((animation) => animation.playState === 'paused'))).toBe(true);
  const opacity = await dialog.evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
}

async function finishDialogExit(dialog: Locator) {
  await dialog.evaluate((element) => element.getAnimations().forEach((animation) => animation.finish()));
  await expect(dialog).toHaveCount(0);
}

test('사이드바는 펼침·접힘·모바일에서 press를 공유한다', async ({ page }) => {
  await page.goto('/control/events');
  await expectApplicationReady(page);
  const pressAndRelease = async (link: Locator, scale: string) => {
    await link.hover();
    await page.mouse.down();
    await expect.poll(() => link.evaluate((element) => getComputedStyle(element).scale)).toBe(scale);
    await page.mouse.move(760, 890);
    await page.mouse.up();
    await expect.poll(() => link.evaluate((element) => getComputedStyle(element).scale)).toBe('none');
  };
  await pressAndRelease(page.getByRole('link', { name: '이벤트 로그', exact: true }), '0.98');
  await pressAndRelease(page.getByRole('link', { name: '설정', exact: true }), '0.98');
  await page.getByRole('button', { name: '사이드바 접기' }).click();
  await pressAndRelease(page.getByRole('link', { name: '이벤트 로그', exact: true }), '0.98');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: '업무 메뉴 열기' }).click();
  const mobileLink = page.getByRole('dialog').getByRole('link', { name: '이벤트 로그', exact: true });
  await pressAndRelease(mobileLink, '0.98');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mobileLink.hover();
  await page.mouse.down();
  expect(await mobileLink.evaluate((element) => getComputedStyle(element).scale)).toBe('none');
  await page.mouse.move(760, 890);
  await page.mouse.up();
});

test('이벤트 상세는 퇴장 중 내용을 유지하고 완료 후에 제거한다', async ({ page }) => {
  const { dialog, trigger } = await openEventDialog(page);
  const title = await dialog.getByRole('heading').textContent();
  await pauseDialogExit(dialog);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expectDialogExiting(dialog);
  expect(await dialog.getByRole('heading').textContent()).toBe(title);
  await finishDialogExit(dialog);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('수집·Quest 다이얼로그는 퇴장 완료 후에 라우트를 이동한다', async ({ page }) => {
  await page.goto('/mlops/collection/new?q=motion');
  await expectApplicationReady(page);
  const dialog = page.locator('.design-motion-dialog').filter({ has: page.getByRole('heading', { name: '새 데이터 수집', exact: true }) });
  await pauseDialogExit(dialog);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expectDialogExiting(dialog);
  await expect(page).toHaveURL(/\/collection\/new\?q=motion/u);
  await finishDialogExit(dialog);
  await expect(page).toHaveURL(/\/collection\?q=motion/u);
  const trigger = page.getByRole('link', { name: '새 수집', exact: true });
  await expect(trigger).toBeFocused();

  await trigger.click();
  await fillCollectionSetup(page);
  await pauseDialogExit(dialog);
  await page.getByRole('button', { name: '세션 생성', exact: true }).click();
  await expectDialogExiting(dialog);
  await expect(page).toHaveURL(/\/collection\/new\?q=motion/u);
  await finishDialogExit(dialog);
  await expect(page).toHaveURL(/\/collection\/[^/]+\/setup\?q=motion/u);
  await expect(page.getByRole('dialog', { name: 'Quest 연결' })).toBeVisible();
  const questDialog = page.locator('.design-motion-dialog').filter({ has: page.getByRole('heading', { name: 'Quest 연결', exact: true }) });
  await pauseDialogExit(questDialog);
  await page.keyboard.press('Escape');
  await expectDialogExiting(questDialog);
  await expect(page).toHaveURL(/\/setup\?q=motion/u);
  await finishDialogExit(questDialog);
  await expect(page).toHaveURL(/\/collection\?q=motion/u);
  await expect(trigger).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/collection\?q=motion/u);
});

test('overlay·toast·tabs는 데스크톱 모션 시간과 최종 위치를 유지한다', async ({
  page,
}) => {
  const { dialog, trigger } = await openEventDialog(page);
  await expect.poll(() => getAnimationDuration(dialog)).toBe('0.28s');
  await expect.poll(() => getAnimationDuration(
    page.locator('.design-motion-overlay'),
  )).toBe('0.28s');
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
