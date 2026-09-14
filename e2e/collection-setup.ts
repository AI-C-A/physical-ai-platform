import { expect, type Page } from '@playwright/test';

export async function openCollectionDetails(page: Page, name: string | RegExp) {
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export async function fillCollectionSetup(page: Page) {
  await page.getByRole('textbox', { name: '작업 지시' }).fill('과일을 종류에 맞는 트레이에 분류하세요.');
}
