import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from './playwright-test';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

interface ExportedRecord {
  readonly id: string;
}

interface ExportTableOptions {
  readonly directDownload?: boolean;
  readonly exportButtonName: string;
  readonly paginated?: boolean;
  readonly pathPrefix: string;
  readonly route: string;
  readonly tableName: string;
}

function readExportedRecords(value: unknown): readonly ExportedRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('JSON 내보내기 결과가 배열이 아닙니다.');
  }
  const records = value as readonly unknown[];
  return records.map((record) => {
    if (
      typeof record !== 'object'
      || record === null
      || !('id' in record)
      || typeof record.id !== 'string'
      || record.id.trim().length === 0
    ) {
      throw new Error('JSON 내보내기 레코드 ID가 올바르지 않습니다.');
    }
    return { id: record.id };
  });
}

async function collectVisibleRecordIds(
  page: Page,
  tableName: string,
  pathPrefix: string,
  paginated: boolean,
): Promise<readonly string[]> {
  const ids: string[] = [];
  let expectedPage = 1;

  while (true) {
    const table = page.getByRole('table', { name: tableName });
    await expect(table).toBeVisible();
    const pageIds = await table.locator('tbody tr td:first-child a').evaluateAll(
      (links, prefix) => links.map((link) => {
        const path = new URL((link as HTMLAnchorElement).href).pathname;
        if (!path.startsWith(`${prefix}/`)) {
          throw new Error(`예상하지 않은 상세 경로입니다: ${path}`);
        }
        return decodeURIComponent(path.slice(prefix.length + 1));
      }),
      pathPrefix,
    );
    expect(pageIds).not.toEqual([]);
    ids.push(...pageIds);

    if (!paginated) break;
    const pagination = page.getByRole('navigation', { name: '페이지 이동' });
    const nextButton = pagination.getByRole('button', { name: '다음' });
    if (await nextButton.isDisabled()) break;
    expectedPage += 1;
    await nextButton.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(
      String(expectedPage),
    );
    await expect(pagination.getByRole('status')).toContainText(
      `${String(expectedPage)} /`,
    );
  }

  expect(new Set(ids).size).toBe(ids.length);
  return ids;
}

async function expectJsonExportMatchesTable(
  page: Page,
  options: ExportTableOptions,
): Promise<void> {
  await page.goto(options.route);
  await expectApplicationReady(page);
  const visibleIds = await collectVisibleRecordIds(
    page,
    options.tableName,
    options.pathPrefix,
    options.paginated ?? true,
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: options.exportButtonName }).click();
  if (options.directDownload !== true) {
    await page.getByRole('menuitem', { name: 'JSON 내보내기' }).click();
  }
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('다운로드 파일 경로가 없습니다.');

  try {
    const records = readExportedRecords(
      JSON.parse(await readFile(downloadPath, 'utf8')) as unknown,
    );
    const exportedIds = records.map((record) => record.id);
    expect(new Set(exportedIds).size).toBe(exportedIds.length);
    expect(exportedIds).toEqual(visibleIds);
  } finally {
    await download.delete();
  }
}

test('Robot 목록에서 영상 관제로 이동한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/robots');
  await expectApplicationReady(page);

  await page.getByRole('link', { name: '정찰 로봇 01' }).click();
  await expect(page).toHaveURL(/\/control\/monitoring\/robot-001$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: '정찰 로봇 01' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '영상 관제 나가기' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '로봇 관리' })).toHaveCount(0);
  const frontCamera = page.getByLabel('전방 카메라 영상', { exact: true });
  await expect(frontCamera).toBeVisible();
  await expect(
    page.getByLabel('후방 카메라 영상', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => frontCamera.evaluate((element) => {
    if (!(element instanceof HTMLVideoElement)) return false;
    const stream = element.srcObject;
    return element.videoWidth > 0
      && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && stream instanceof MediaStream
      && stream.getVideoTracks().some((track) => track.readyState === 'live');
  })).toBe(true);
  issues.assertNone();
});

test('Monitoring은 위치 지도 위에 사이트 드롭다운과 로봇 선택 패널을 분리해 표시한다', async ({
  page,
}, testInfo) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);

  await expect(page.getByRole('combobox', { name: '사이트' })).toBeVisible();
  await expect(page.getByRole('region', { name: '로봇 선택' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '사이트 선택' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '로봇 선택' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로봇 정보 패널 닫기' }))
    .toHaveCount(0);
  await expect(page.getByRole('group', { name: '로봇 3D 모델' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: '로봇 위치 지도' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: '현재 위치 지도' }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '운영 요약' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '선택 Robot 운영 상태' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /정찰 로봇 01/u }).click();
  const selectedRobot = page.getByRole('region', {
    name: '정찰 로봇 01 로봇 패널',
  });
  const robotInfoOverview = page.getByRole('region', {
    name: '정찰 로봇 01 로봇 정보',
  });
  await expect(robotInfoOverview).toBeVisible();
  await expect(
    robotInfoOverview.getByRole('progressbar', { name: '배터리 잔량' }),
  ).toHaveAttribute('aria-valuetext', '92%');
  await expect(robotInfoOverview.getByText('37.39472° N')).toBeVisible();
  await expect(robotInfoOverview.getByText('127.11153° E')).toBeVisible();
  await expect(robotInfoOverview.getByText('null', { exact: true })).toHaveCount(0);
  const robotSelector = page.getByRole('region', { name: '로봇 선택' });
  const siteSelector = page.getByRole('combobox', { name: '사이트' });
  const map = page.getByRole('region', { name: '로봇 위치 지도' });
  const [mapBox, sitePanelBox, robotPanelBox, infoPanelBox] = await Promise.all([
    map.boundingBox(),
    siteSelector.boundingBox(),
    robotSelector.boundingBox(),
    selectedRobot.boundingBox(),
  ]);
  expect(mapBox).not.toBeNull();
  expect(sitePanelBox).not.toBeNull();
  expect(robotPanelBox).not.toBeNull();
  expect(infoPanelBox).not.toBeNull();
  expect(
    (sitePanelBox?.x ?? 0) - (mapBox?.x ?? 0),
    '사이트 드롭다운 왼쪽 여백',
  ).toBe(16);
  expect(
    (robotPanelBox?.x ?? 0) - (mapBox?.x ?? 0),
    '로봇 선택 패널 왼쪽 여백',
  ).toBe(16);
  expect(
    ((mapBox?.x ?? 0) + (mapBox?.width ?? 0))
      - ((infoPanelBox?.x ?? 0) + (infoPanelBox?.width ?? 0)),
    '로봇 정보 패널 오른쪽 여백',
  ).toBe(16);
  expect(
    (sitePanelBox?.y ?? 0) - (mapBox?.y ?? 0),
    '사이트 드롭다운 위쪽 여백',
  ).toBe(16);
  expect(
    ((mapBox?.y ?? 0) + (mapBox?.height ?? 0))
      - ((robotPanelBox?.y ?? 0) + (robotPanelBox?.height ?? 0)),
    '로봇 선택 패널 아래쪽 여백',
  ).toBe(16);
  expect(
    (robotPanelBox?.y ?? 0)
      - ((sitePanelBox?.y ?? 0) + (sitePanelBox?.height ?? 0)),
    '사이트 드롭다운과 로봇 선택 패널 사이 여백',
  ).toBe(16);
  expect(
    Math.abs((infoPanelBox?.height ?? 0) - ((mapBox?.height ?? 0) - 32)),
    '로봇 정보 패널 높이',
  ).toBeLessThanOrEqual(1);
  expect(await map.evaluate((element) => element.closest('section'))).toBeNull();

  const documentOverflowPx = await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    document.body.scrollHeight - window.innerHeight,
  ));
  expect(documentOverflowPx, 'Monitoring 문서 세로 스크롤').toBeLessThanOrEqual(1);

  await testInfo.attach('monitoring-location-layout', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await selectedRobot.getByRole('button', { name: '로봇 정보 패널 닫기' }).click();
  await expect(selectedRobot).toHaveCount(0);
  await expect(page.getByRole('group', { name: '로봇 3D 모델' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /정찰 로봇 01/u }))
    .toHaveAttribute('aria-pressed', 'false');

  await expect(robotSelector).toBeVisible();
  await expect(siteSelector).toBeVisible();
  await expect(map).toBeVisible();
  issues.assertNone();
});

test('Robot 화면 Query와 JSON 내보내기가 같은 레코드 집합을 사용한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/robots');
  await expectApplicationReady(page);

  await page.getByRole('textbox', { name: '로봇 검색' }).fill('정찰');
  await page.getByRole('combobox', { name: '정렬' }).click();
  await page.getByRole('option', { name: '이름 내림차순' }).click();

  await expect.poll(() => {
    const params = new URL(page.url()).searchParams;
    return {
      search: params.get('search'),
      sort: params.get('sort'),
    };
  }).toEqual({
    search: '정찰',
    sort: 'name-desc',
  });

  const robotTable = page.getByRole('table', { name: '로봇 목록' });
  const robotLinks = robotTable.getByRole('link');
  await expect(robotLinks).toHaveCount(3);
  const visibleIds = await robotLinks.evaluateAll((links) =>
    links.map((link) => {
      const pathSegments = new URL((link as HTMLAnchorElement).href).pathname
        .split('/');
      return decodeURIComponent(pathSegments.at(-1) ?? '');
    }),
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '로봇 내보내기' }).click();
  await page.getByRole('menuitem', { name: 'JSON 내보내기' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('다운로드 파일 경로가 없습니다.');

  try {
    const exported: unknown = JSON.parse(await readFile(downloadPath, 'utf8'));
    if (!Array.isArray(exported)) {
      throw new Error('로봇 JSON 내보내기 결과가 배열이 아닙니다.');
    }
    const exportedIds = exported.map((record: unknown) => {
      if (
        typeof record !== 'object'
        || record === null
        || !('id' in record)
        || typeof record.id !== 'string'
        || !('serialNumber' in record)
        || typeof record.serialNumber !== 'string'
      ) {
        throw new Error('로봇 JSON 레코드 Shape가 올바르지 않습니다.');
      }
      return record.id;
    });

    expect(exportedIds).toEqual(visibleIds);
  } finally {
    await download.delete();
  }

  issues.assertNone();
});

test('내보내기 Dropdown은 키보드로 열고 닫은 뒤 trigger 포커스를 복구한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/robots');
  await expectApplicationReady(page);

  const trigger = page.getByRole('button', { name: '로봇 내보내기' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'CSV 내보내기' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  issues.assertNone();
});

test('BigData 운영 Query와 JSON 내보내기가 같은 전체 레코드 집합을 사용한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto(
    '/bigdata/explorer?mode=operations&type=session&status=completed&robot=robot-001&range=30',
  );
  await expectApplicationReady(page);

  const operationTable = page.getByRole('table', { name: '운영 기록 목록' });
  const operationLinks = operationTable.getByRole('link');
  await expect(operationLinks).not.toHaveCount(0);
  const visibleIds = await operationLinks.evaluateAll((links) =>
    links.map((link) => {
      const segments = new URL((link as HTMLAnchorElement).href).pathname
        .split('/');
      return decodeURIComponent(segments.at(-1) ?? '');
    }),
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {
    name: '데이터 탐색 결과 내보내기',
  }).click();
  await page.getByRole('menuitem', { name: 'JSON 내보내기' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('다운로드 파일 경로가 없습니다.');

  try {
    const exported: unknown = JSON.parse(await readFile(downloadPath, 'utf8'));
    if (!Array.isArray(exported)) {
      throw new Error('BigData JSON 내보내기 결과가 배열이 아닙니다.');
    }
    const exportedIds = exported.map((record: unknown) => {
      if (
        typeof record !== 'object'
        || record === null
        || !('id' in record)
        || typeof record.id !== 'string'
        || !('robotId' in record)
        || record.robotId !== 'robot-001'
        || !('status' in record)
        || record.status !== 'completed'
      ) {
        throw new Error('BigData JSON 레코드 Shape 또는 필터 결과가 올바르지 않습니다.');
      }
      return record.id;
    });

    expect(exportedIds).toEqual(visibleIds);
  } finally {
    await download.delete();
  }

  issues.assertNone();
});

test('MLOps 목록과 JSON 내보내기가 페이지를 포함한 같은 레코드 집합을 사용한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);

  await expectJsonExportMatchesTable(page, {
    directDownload: true,
    exportButtonName: '수집 세션 JSON 내보내기',
    paginated: false,
    pathPrefix: '/mlops/sessions',
    route: '/mlops/sessions',
    tableName: '수집 세션 목록',
  });
  await expectJsonExportMatchesTable(page, {
    directDownload: true,
    exportButtonName: '에피소드 JSON 내보내기',
    paginated: false,
    pathPrefix: '/mlops/episodes',
    route: '/mlops/episodes',
    tableName: '에피소드 목록',
  });
  await expectJsonExportMatchesTable(page, {
    exportButtonName: '데이터셋 내보내기',
    pathPrefix: '/mlops/datasets',
    route: '/mlops/datasets?sort=name-asc',
    tableName: '데이터셋 목록',
  });

  issues.assertNone();
});

test('Event Dialog는 Escape 후 보기 버튼으로 포커스를 복구한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/events');
  await expectApplicationReady(page);

  const trigger = page.getByRole('button', { name: /상세 보기/u }).first();
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  issues.assertNone();
});

test('BigData 차트 Drilldown이 Explorer query를 보존한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/bigdata/overview?robot=robot-001&range=30');
  await expectApplicationReady(page);

  await page.getByRole('button', { name: /완료 상세/u }).click();
  await expect(page).toHaveURL(
    /\/bigdata\/explorer\?mode=operations&type=session&status=completed&robot=robot-001&range=30$/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '데이터 탐색' }),
  ).toBeVisible();
  issues.assertNone();
});

test('수집 계획의 DOM·시각 순서가 viewport별 키보드 읽기 순서와 일치한다', async ({
  page,
}, testInfo) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/mlops/capture/humanoid');
  await expectApplicationReady(page);

  const planInput = page.getByRole('textbox', { name: '세션 이름' });
  const cameraRegion = page.getByRole('region', { name: '동기화 멀티뷰' });
  await expect(planInput).toBeVisible();
  await expect(cameraRegion).toBeVisible();
  const cameraElement = await cameraRegion.elementHandle();
  if (cameraElement === null) {
    throw new Error('전방 카메라 영역의 DOM 요소를 찾지 못했습니다.');
  }
  const planPrecedesCamera = await planInput.evaluate(
    (plan, camera) => Boolean(
      plan.compareDocumentPosition(camera)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    cameraElement,
  );
  expect(planPrecedesCamera).toBe(true);

  const planBox = await planInput.boundingBox();
  const cameraBox = await cameraRegion.boundingBox();
  if (planBox === null || cameraBox === null) {
    throw new Error('수집 계획과 카메라의 화면 위치를 측정하지 못했습니다.');
  }
  if ((testInfo.project.use.viewport?.width ?? 0) >= 1280) {
    expect(planBox.x).toBeLessThan(cameraBox.x);
  } else {
    expect(planBox.y).toBeLessThan(cameraBox.y);
  }

  await testInfo.attach('capture-reading-order', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  issues.assertNone();
});

test('수집부터 성공·실패 Episode 생성까지 앱 범위 업무를 완료한다', async ({
  page,
}, testInfo) => {
  const issues = observeBrowserIssues(page);
  const captureName = `브라우저 수집 ${testInfo.project.name}`;

  await page.goto('/mlops/capture/humanoid');
  await expectApplicationReady(page);
  await page.getByRole('textbox', { name: '세션 이름' }).fill(captureName);
  await page.getByRole('button', { name: '세션 생성' }).click();
  await expect(page.getByRole('button', { name: 'Validate' })).toBeVisible();

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByRole('button', { name: 'Session 시작' })).toBeVisible();
  await page.getByRole('button', { name: 'Session 시작' }).click();

  const episodeNameInput = page.getByRole('textbox', { name: '다음 Episode 이름' });
  await episodeNameInput.fill('성공 Episode');
  await page.getByRole('button', { name: 'Episode 시작' }).click();
  await page.getByRole('button', { name: '성공 종료' }).click();

  await episodeNameInput.fill('실패 Episode');
  await page.getByRole('button', { name: 'Episode 시작' }).click();
  await page.getByRole('button', { name: '실패 종료' }).click();
  await page.getByRole('button', { name: 'Session 종료' }).click();

  await page.getByRole('link', { name: '전체 세션' }).click();
  await expect(page).toHaveURL(/\/mlops\/sessions$/u);
  await page.getByRole('link', { name: captureName }).click();
  await expect(page).toHaveURL(/\/mlops\/sessions\/capture-h-/u);
  await expect(page.getByRole('link', { name: /^Episode \d+ · episode-/u }))
    .toHaveCount(2);
  issues.assertNone();
});
