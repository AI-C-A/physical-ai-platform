import { expect, test } from './playwright-test';

import {
  expectAccessiblePageStructure,
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

const officialRoutes = [
  { path: '/control/monitoring', heading: '모니터링' },
  {
    path: '/control/monitoring/multi?mode=multi&robotId=robot-001&robotId=robot-002',
    heading: '다중 관제',
  },
  { path: '/control/interventions', heading: '개입 요청' },
  { path: '/control/robots', heading: '로봇 관리' },
  { path: '/control/monitoring/robot-001', heading: '정찰 로봇 01' },
  { path: '/control/sites', heading: '사이트 관리' },
  { path: '/control/coordinates', heading: '경로·좌표 관리' },
  { path: '/control/events', heading: '이벤트 로그' },
  { path: '/control/reports', heading: '리포트' },
  { path: '/control/settings', heading: '설정' },
  { path: '/mlops/capture', heading: '데이터 수집' },
  { path: '/mlops/sessions', heading: '수집 세션' },
  { path: '/mlops/sessions/session-001', heading: '수집 세션 01' },
  { path: '/mlops/episodes', heading: '에피소드' },
  { path: '/mlops/episodes/episode-001', heading: '수집 에피소드 01' },
  { path: '/mlops/datasets', heading: '데이터셋' },
  { path: '/mlops/datasets/new', heading: '새 데이터셋' },
  {
    path: '/mlops/datasets/dataset-001',
    heading: '학습 데이터셋 초안 01',
  },
  { path: '/mlops/settings', heading: '설정' },
  { path: '/bigdata/overview', heading: '개요' },
  { path: '/bigdata/explorer', heading: '데이터 탐색' },
  { path: '/bigdata/settings', heading: '설정' },
] as const;

const missingDetailRoutes = [
  {
    path: '/control/monitoring/robot-not-found',
    message: '관제할 로봇을 찾을 수 없습니다.',
    returnLink: '영상 관제 나가기',
  },
  {
    path: '/mlops/sessions/session-not-found',
    message: '요청한 수집 세션을 찾을 수 없습니다.',
    returnLink: '수집 세션으로',
  },
  {
    path: '/mlops/episodes/episode-not-found',
    message: '요청한 에피소드를 찾을 수 없습니다.',
    returnLink: '에피소드로',
  },
  {
    path: '/mlops/datasets/dataset-not-found',
    message: '요청한 데이터셋을 찾을 수 없습니다.',
    returnLink: '데이터셋으로',
  },
] as const;

const unknownRoutes = ['/missing', '/not-found'] as const;

test('모든 공식 경로가 오류 없이 업무 화면을 렌더링한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);

  for (const route of officialRoutes) {
    issues.reset();
    await page.goto(route.path);
    await expectApplicationReady(page);
    await expect(
      page.getByRole('heading', { level: 1, name: route.heading }),
    ).toBeVisible();
    await expectAccessiblePageStructure(page);
    issues.assertNone();
  }
});

test('루트는 모니터링으로 이동하고 알 수 없는 경로는 404를 유지한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);

  await page.goto('/');
  await expectApplicationReady(page);
  await expect(page).toHaveURL(
    /\/control\/monitoring\?siteId=pangyo-outdoor-zone$/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '모니터링' }),
  ).toBeVisible();
  issues.assertNone();

  for (const path of unknownRoutes) {
    issues.reset();
    await page.goto(path);
    await expectApplicationReady(page);
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '페이지를 찾을 수 없습니다',
      }),
    ).toBeVisible();
    issues.assertNone();
  }

  for (const route of missingDetailRoutes) {
    issues.reset();
    await page.goto(route.path);
    await expectApplicationReady(page);
    await expect(page.getByRole('status')).toHaveText(route.message);
    await expect(
      page.getByRole('link', { name: route.returnLink }),
    ).toBeVisible();
    issues.assertNone();
  }
});
