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
  { path: '/mlops/capture/humanoid', heading: '휴머노이드 Episode 수집' },
  { path: '/mlops/capture/mobility', heading: '사족·모바일 연속 주행 수집' },
  { path: '/mlops/sessions', heading: '수집 세션' },
  { path: '/mlops/sessions/capture-h-001', heading: 'Desktop sorting batch' },
  { path: '/mlops/episodes', heading: '에피소드' },
  { path: '/mlops/episodes/episode-fw-001', heading: 'Pick and place · 01' },
  { path: '/mlops/drives', heading: '주행 세션' },
  { path: '/mlops/drives/drive-001', heading: 'Drive · route-a' },
  { path: '/mlops/interventions', heading: '개입 이벤트' },
  { path: '/mlops/interventions/intervention-001', heading: 'Intervention · intervention-001' },
  { path: '/mlops/catalog', heading: '데이터 카탈로그' },
  { path: '/mlops/annotations', heading: 'Annotation 작업' },
  { path: '/mlops/annotations/annotation-001', heading: 'Sorting task outcome review' },
  { path: '/mlops/quality', heading: '품질 관리' },
  { path: '/mlops/quality/quality-001', heading: 'Episode synchronization QC' },
  { path: '/mlops/datasets', heading: 'Dataset 버전' },
  { path: '/mlops/datasets/new', heading: '새 Dataset Version' },
  { path: '/mlops/datasets/dataset-h-v3', heading: 'Sorting Generalist v3' },
  { path: '/mlops/training', heading: '학습 실행' },
  { path: '/mlops/training/new', heading: '학습 실행 생성' },
  { path: '/mlops/training/training-001', heading: 'π0 sorting finetune' },
  { path: '/mlops/evaluations', heading: '평가 실행' },
  { path: '/mlops/evaluations/new', heading: '평가 실행 생성' },
  { path: '/mlops/evaluations/evaluation-001', heading: 'Sorting regression suite' },
  { path: '/mlops/models', heading: '모델 레지스트리' },
  { path: '/mlops/models/model-pi0-v3', heading: 'TIGER π0 Sorting v3' },
  { path: '/mlops/deployments', heading: '배포' },
  { path: '/mlops/deployments/new', heading: '배포 생성' },
  { path: '/mlops/deployments/deployment-001', heading: 'Sorting canary' },
  { path: '/mlops/inference', heading: '추론 세션' },
  { path: '/mlops/inference/inference-001', heading: 'Sort the fruit into matching trays' },
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
    message: '수집 세션을 찾을 수 없습니다.',
  },
  {
    path: '/mlops/episodes/episode-not-found',
    message: '에피소드를 찾을 수 없습니다.',
  },
  {
    path: '/mlops/datasets/dataset-not-found',
    message: 'Dataset 버전을 찾을 수 없습니다.',
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
    if ('returnLink' in route) {
      await expect(
        page.getByRole('link', { name: route.returnLink }),
      ).toBeVisible();
    }
    issues.assertNone();
  }
});
