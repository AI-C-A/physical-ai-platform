import { expect, test } from './playwright-test';
import { fillCollectionSetup, openCollectionDetails } from './collection-setup';

import {
  expectAccessiblePageStructure,
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

const officialRoutes = [
  { path: '/collect/quest', heading: 'Quest 연결' },
  { path: '/control/monitoring', heading: '모니터링' },
  {
    path: '/control/monitoring/multi?mode=multi&robotId=robot-001&robotId=robot-002',
    heading: '다중 관제',
  },
  { path: '/control/interventions', heading: '개입 요청' },
  { path: '/control/robots', heading: '로봇 관리' },
  { path: '/control/monitoring/robot-001', heading: '사족보행 로봇' },
  { path: '/control/sites', heading: '사이트 관리' },
  { path: '/control/coordinates', heading: '경로·좌표 관리' },
  { path: '/control/events', heading: '이벤트 로그' },
  { path: '/control/reports', heading: '리포트' },
  { path: '/control/settings', heading: '설정' },
  { path: '/mlops/collection', heading: '데이터 수집' },
  { path: '/mlops/collection/new', heading: '새 데이터 수집' },
  { path: '/mlops/capture/humanoid', heading: '새 데이터 수집' },
  { path: '/mlops/capture/mobility', heading: '데이터 수집' },
  { path: '/mlops/sessions/capture-h-001', heading: 'Desktop sorting batch' },
  { path: '/mlops/episodes/episode-fw-001', heading: 'Pick and place · 01' },
  { path: '/mlops/drives/drive-001', heading: '주행 · route-a' },
  { path: '/mlops/interventions/intervention-001', heading: '개입 기록 · intervention-001' },
  { path: '/mlops/catalog', heading: '데이터 카탈로그' },
  { path: '/mlops/catalog/capture-h-001', heading: 'Desktop sorting batch' },
  { path: '/mlops/catalog?type=episode', heading: '데이터 카탈로그' },
  { path: '/mlops/catalog?type=drive', heading: '데이터 카탈로그' },
  { path: '/mlops/catalog?type=intervention', heading: '데이터 카탈로그' },
  { path: '/mlops/review', heading: '데이터 검수' },
  { path: '/mlops/review?view=quality', heading: '품질 관리' },
  { path: '/mlops/annotations/annotation-001', heading: 'Sorting task outcome review' },
  { path: '/mlops/quality/quality-001', heading: 'Episode synchronization QC' },
  { path: '/mlops/datasets', heading: 'Dataset 버전' },
  { path: '/mlops/datasets/new', heading: '데이터셋 만들기' },
  { path: '/mlops/datasets/dataset-h-v3', heading: 'Sorting Generalist v3' },
  { path: '/mlops/training', heading: '학습 실행' },
  { path: '/mlops/evaluations', heading: '평가 실행' },
  { path: '/mlops/training/new', heading: '학습 실행 생성' },
  { path: '/mlops/training/training-001', heading: 'π0 sorting finetune' },
  { path: '/mlops/evaluations/new', heading: '평가 실행 생성' },
  { path: '/mlops/evaluations/evaluation-001', heading: 'Sorting regression suite' },
  { path: '/mlops/models', heading: '모델 레지스트리' },
  { path: '/mlops/models/model-pi0-v3', heading: 'TIGER π0 Sorting v3' },
  { path: '/mlops/operations', heading: '배포' },
  { path: '/mlops/operations?view=inference', heading: '추론 세션' },
  { path: '/mlops/deployments/new', heading: '배포 생성' },
  { path: '/mlops/deployments/deployment-001', heading: 'Sorting canary' },
  { path: '/mlops/inference/inference-001', heading: 'Sort the fruit into matching trays' },
  { path: '/mlops/settings', heading: '설정' },
  { path: '/bigdata/overview', heading: 'Physical AI 플라이휠' },
  { path: '/bigdata/explorer', heading: '데이터 탐색' },
  { path: '/bigdata/failures', heading: '실패 및 데이터 공백' },
  { path: '/bigdata/lineage', heading: '전체 계보' },
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
    message: '데이터셋 버전을 찾을 수 없습니다.',
  },
] as const;

const unknownRoutes = ['/missing', '/not-found'] as const;

const integratedMlopsViews = [
  {
    path: '/mlops/review',
    tab: '품질 검사',
    expectedPath: '/mlops/review?view=quality',
    heading: '품질 관리',
  },
  {
    path: '/mlops/operations',
    tab: '추론 세션',
    expectedPath: '/mlops/operations?view=inference',
    heading: '추론 세션',
  },
] as const;

const legacyMlopsLists = [
  ['/mlops/capture', '/mlops/collection'],
  ['/mlops/sessions', '/mlops/collection'],
  ['/mlops/capture/humanoid', '/mlops/collection/new'],
  ['/mlops/capture/mobility', '/mlops/collection'],
  ['/mlops/episodes', '/mlops/catalog?type=episode'],
  ['/mlops/drives', '/mlops/catalog?type=drive'],
  ['/mlops/interventions', '/mlops/catalog?type=intervention'],
  ['/mlops/annotations', '/mlops/review'],
  ['/mlops/quality', '/mlops/review?view=quality'],
  ['/mlops/deployments', '/mlops/operations'],
  ['/mlops/inference', '/mlops/operations?view=inference'],
] as const;

test('모든 공식 경로가 오류 없이 업무 화면을 렌더링한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);

  for (const route of officialRoutes) {
    await test.step(route.path, async () => {
      issues.reset();
      await page.goto(route.path);
      await expectApplicationReady(page);
      await expect(
        page.getByRole('heading', { level: new URL(page.url()).pathname === '/mlops/collection/new' ? 2 : 1, name: route.heading }),
      ).toBeVisible();
      await expectAccessiblePageStructure(page);
      issues.assertNone();
    });
  }
});

test('통합 MLOps 화면은 한 화면 안에서 하위 업무를 전환한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);

  for (const view of integratedMlopsViews) {
    await test.step(view.path, async () => {
      issues.reset();
      await page.goto(view.path);
      await expectApplicationReady(page);
      await page.getByRole('tab', { name: view.tab }).click();
      await expect(page).toHaveURL(view.expectedPath);
      await expect(
        page.getByRole('heading', { level: 1, name: view.heading }),
      ).toBeVisible();
      issues.assertNone();
    });
  }
});

test('기존 MLOps 목록 주소는 새 통합 화면으로 정리된다', async ({ page }) => {
  for (const [legacyPath, canonicalPath] of legacyMlopsLists) {
    await page.goto(legacyPath);
    await expectApplicationReady(page);
    await expect.poll(() => {
      const url = new URL(page.url());
      return url.pathname + url.search;
    }).toBe(canonicalPath);
  }
});

test('Human Demonstration 세션에서 Episode를 반복 기록하고 같은 ID의 카탈로그로 전환한다', async ({ page }, testInfo) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/mlops/collection');
  await expectApplicationReady(page);
  await page.getByRole('link', { name: '새 수집' }).click();
  await expect(page.getByRole('dialog', { name: '새 데이터 수집' })).toBeVisible();
  await expect(page.getByRole('button', { name: '취소' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-page-shell', 'standard');
  await page.getByRole('textbox', { name: '세션 이름' }).fill('E2E humanoid funnel');
  await fillCollectionSetup(page);
  await page.getByRole('button', { name: '세션 생성' }).click();
  await expect(page.getByRole('heading', { name: 'E2E humanoid funnel' })).toBeVisible();
  await openCollectionDetails(page, '장치');
  await page.getByRole('button', { name: 'Quest 연결', exact: true }).click();
  const pairing = page.getByRole('status', { name: 'Quest 연결 코드' });
  await expect(pairing).toHaveText(/^\d{6}$/u);
  await expect(page.getByRole('dialog', { name: 'Quest 연결' })).toBeVisible();
  await expect(page.getByText('브라우저에서 아래 주소를 열고 연결 코드를 입력하세요.', { exact: false })).toBeVisible();
  const collector = await page.context().newPage();
  const collectorIssues = observeBrowserIssues(collector);
  try {
    await collector.goto('/collect/quest');
    await expectApplicationReady(collector);
    await collector.getByRole('textbox', { name: '6자리 연결 코드' }).fill((await pairing.innerText()).trim());
    await collector.getByRole('button', { name: '연결' }).click();
    await collector.getByRole('button', { name: '손 추적 시작' }).click();
    await expect(page.getByRole('dialog', { name: 'Quest 연결' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'E2E humanoid funnel' })).toBeVisible();
    const collectionId = new URL(page.url()).pathname.split('/').at(-1);
    expect(collectionId).toMatch(/^capture-hd-/u);
    const controls = page.getByRole('region', { name: '수집 작업 컨트롤' });
    await expect(controls).toHaveAttribute('data-collection-state', 'episode-ready');
    await controls.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    const camera = page.getByRole('region', { name: '실시간 수집 모니터', exact: true });
    await expect(camera.locator('figure')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '전신 휴머노이드 3D' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Quest 손 포즈 3D' }).locator('canvas')).toBeVisible();
    await expect(camera).not.toContainText(/FPS|Hz/u);
    const captureViewport = page.locator('[data-capture-viewport]');
    await expect(captureViewport).toHaveCSS('overflow-y', (testInfo.project.use.viewport?.width ?? 0) >= 896 ? 'hidden' : 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    if ((testInfo.project.use.viewport?.width ?? 0) >= 896) {
      expect(await captureViewport.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
      await expect(controls.getByRole('button', { name: 'Episode 녹화 정지' })).toBeInViewport();
    }
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'review');
    await expect(page.getByRole('group', { name: 'Episode 재생 컨트롤' })).toBeVisible();
    await expect(controls.getByRole('button', { name: '다시 녹화' })).toBeVisible();

    await page.reload();
    await expectApplicationReady(page);
    await expect(page).toHaveURL('/mlops/collection/' + collectionId);
    await expect(controls).toHaveAttribute('data-collection-state', 'review');
    await controls.getByRole('button', { name: '녹화본 저장' }).click();
    await expect(page.locator('[data-episode-summary]')).toContainText('저장 완료 1개');
    await controls.getByRole('button', { name: '다음 Episode 녹화 시작' }).click();
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await controls.getByRole('button', { name: '다시 녹화' }).click();
    await page.getByRole('button', { name: '삭제하고 다시 녹화' }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await controls.getByRole('button', { name: '녹화본 저장' }).click();
    await expect(page.locator('[data-episode-summary]')).toContainText('저장 완료 2개');
    await page.getByRole('button', { name: '수집 콘솔 닫기' }).click();
    await expect(page.getByRole('dialog')).toContainText('저장한 Episode 2개');
    await page.getByRole('button', { name: '저장하고 마치기', exact: true }).click();
    await expect(page).toHaveURL('/mlops/catalog/' + collectionId);
    await expect(page.getByRole('heading', { name: 'E2E humanoid funnel' })).toBeVisible();
    const episodes = page.getByRole('table', { name: '카탈로그 에피소드 선택' });
    await expect(episodes.locator('tbody tr')).toHaveCount(2);
    await expect(episodes.getByRole('checkbox', { name: 'Episode 01 선택' })).toBeVisible();
    await expect(episodes.getByRole('checkbox', { name: 'Episode 02 선택' })).toBeVisible();
    await episodes.getByRole('checkbox', { name: 'Episode 02 선택' }).check();
    await expect(page.getByRole('button', { name: '선택한 에피소드 1개로 데이터셋 구성' })).toBeEnabled();
    collectorIssues.assertNone();
    issues.assertNone();
  } finally {
    await collector.close();
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
