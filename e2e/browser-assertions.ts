import { expect, type Page } from '@playwright/test';

interface BrowserIssue {
  readonly detail: string;
  readonly kind:
    | 'console-error'
    | 'console-warning'
    | 'http-error'
    | 'page-error'
    | 'request-failed';
}

export interface BrowserIssueObserver {
  assertNone(): void;
  reset(): void;
}

/** 브라우저 경고와 실행 오류를 경로별로 격리해 회귀 원인을 보존한다. */
export function observeBrowserIssues(page: Page): BrowserIssueObserver {
  const issues: BrowserIssue[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    issues.push({
      detail: message.text(),
      kind:
        message.type() === 'error' ? 'console-error' : 'console-warning',
    });
  });
  page.on('pageerror', (error) => {
    issues.push({ detail: error.stack ?? error.message, kind: 'page-error' });
  });
  page.on('requestfailed', (request) => {
    issues.push({
      detail: `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? '원인 미상'}`,
      kind: 'request-failed',
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    issues.push({
      detail: `${String(response.status())} ${response.request().method()} ${response.url()}`,
      kind: 'http-error',
    });
  });

  return {
    assertNone: () => {
      expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
    },
    reset: () => {
      issues.length = 0;
    },
  };
}

export async function expectApplicationReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toHaveText(/^\s*$/u);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByText('Unexpected Application Error!')).toHaveCount(
    0,
  );
}

/** 공식 화면의 기본 landmark, 이름과 viewport overflow를 실제 렌더 결과에서 확인한다. */
export async function expectAccessiblePageStructure(page: Page): Promise<void> {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  const unnamedControls = await page.locator([
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="link"]',
    '[role="menuitem"]',
  ].join(',')).evaluateAll((elements) => elements.flatMap((element) => {
    const htmlElement = element as HTMLElement;
    const style = window.getComputedStyle(htmlElement);
    if (
      htmlElement.hidden
      || style.display === 'none'
      || style.visibility === 'hidden'
      || htmlElement.getClientRects().length === 0
    ) {
      return [];
    }

    const labelledBy = htmlElement.getAttribute('aria-labelledby')
      ?.split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim() ?? '';
    const labels = 'labels' in htmlElement
      ? Array.from((htmlElement as HTMLInputElement).labels ?? [])
        .map((label) => label.textContent?.trim() ?? '')
        .join(' ')
        .trim()
      : '';
    const wrappingLabel = htmlElement.closest('label')?.textContent?.trim() ?? '';
    const imageAlt = Array.from(htmlElement.querySelectorAll('img'))
      .map((image) => image.alt.trim())
      .join(' ')
      .trim();
    const name = [
      htmlElement.getAttribute('aria-label')?.trim() ?? '',
      labelledBy,
      labels,
      wrappingLabel,
      htmlElement.textContent?.trim() ?? '',
      imageAlt,
      htmlElement.getAttribute('title')?.trim() ?? '',
    ].find((candidate) => candidate.length > 0);

    return name === undefined
      ? [`${htmlElement.tagName.toLowerCase()}${htmlElement.id === '' ? '' : `#${htmlElement.id}`}`]
      : [];
  }));
  expect(unnamedControls, '접근 가능한 이름이 없는 조작 요소').toEqual([]);

  const unnamedLandmarks = await page.locator('nav, table').evaluateAll(
    (elements) => elements.flatMap((element) => {
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/u)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim() ?? '';
      return (
        element.getAttribute('aria-label')?.trim()
        || labelledBy
      )
        ? []
        : [element.tagName.toLowerCase()];
    }),
  );
  expect(unnamedLandmarks, '이름이 없는 navigation 또는 data table').toEqual([]);

  const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
    const counts = new Map<string, number>();
    elements.forEach((element) => {
      if (element.id === '') return;
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    });
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id, count]) => `${id} (${String(count)}개)`);
  });
  expect(duplicateIds, '중복된 DOM id').toEqual([]);

  const brokenAriaReferences = await page
    .locator('[aria-labelledby], [aria-describedby]')
    .evaluateAll((elements) => elements.flatMap((element) =>
      ['aria-labelledby', 'aria-describedby'].flatMap((attribute) =>
        (element.getAttribute(attribute) ?? '')
          .split(/\s+/u)
          .filter((id) => id.length > 0 && document.getElementById(id) === null)
          .map((id) => `${element.tagName.toLowerCase()}[${attribute}="${id}"]`),
      ),
    ));
  expect(brokenAriaReferences, '존재하지 않는 요소를 가리키는 ARIA 참조').toEqual([]);

  const brokenLabelTargets = await page.locator('label[for]').evaluateAll(
    (labels) => labels.flatMap((label) => {
      const targetId = label.getAttribute('for') ?? '';
      return targetId !== '' && document.getElementById(targetId) === null
        ? [`label[for="${targetId}"]`]
        : [];
    }),
  );
  expect(brokenLabelTargets, '존재하지 않는 form control을 가리키는 label').toEqual([]);

  const overflowPx = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflowPx, 'viewport 바깥의 의도하지 않은 가로 overflow').toBeLessThanOrEqual(1);
}
