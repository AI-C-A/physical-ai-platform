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
  readonly exportButtonName: string;
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
): Promise<readonly string[]> {
  const table = page.getByRole('table', { name: tableName });
  await expect(table).toBeVisible();
  const ids = await table.locator('tbody tr td:first-child a').evaluateAll(
    (links, prefix) => links.map((link) => {
      const path = new URL((link as HTMLAnchorElement).href).pathname;
      if (!path.startsWith(`${prefix}/`)) {
        throw new Error(`예상하지 않은 상세 경로입니다: ${path}`);
      }
      return decodeURIComponent(path.slice(prefix.length + 1));
    }),
    pathPrefix,
  );
  expect(ids).not.toEqual([]);
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
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: options.exportButtonName }).click();
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

test('Monitoring에서 여러 Robot을 선택해 다중 관제로 이동하고 구성을 복원한다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/control/monitoring');
  await expectApplicationReady(page);

  const robotSelector = page.getByRole('region', { name: '로봇 선택' });
  const regularRow = robotSelector.getByRole('button', {
    name: /정찰 로봇 01/u,
  });
  const regularName = regularRow.getByText('정찰 로봇 01', { exact: true });
  const searchbox = page.getByRole('searchbox', { name: '로봇 검색' });
  const modeAction = page.getByRole('button', { name: '다중 선택' });
  const [regularRowBox, regularNameBox, regularSearchBox, regularModeActionBox] = await Promise.all([
    regularRow.boundingBox(),
    regularName.boundingBox(),
    searchbox.boundingBox(),
    modeAction.boundingBox(),
  ]);
  await modeAction.click();
  const cancelModeAction = page.getByRole('button', { name: '선택 취소' });
  const selection = page.getByRole('list', { name: '다중 관제 로봇 선택' });
  const start = page.getByRole('button', { name: '다중 관제 시작' });
  const multipleCheckbox = selection.getByRole('checkbox', {
    name: /정찰 로봇 01/u,
  });
  const multipleRow = multipleCheckbox.locator('xpath=..');
  const multipleName = multipleRow.getByText('정찰 로봇 01', { exact: true });
  const [multipleRowBox, multipleNameBox, multipleSearchBox, multipleModeActionBox] = await Promise.all([
    multipleRow.boundingBox(),
    multipleName.boundingBox(),
    searchbox.boundingBox(),
    cancelModeAction.boundingBox(),
  ]);
  expect(multipleModeActionBox).toEqual(regularModeActionBox);
  expect(regularModeActionBox?.width).toBeLessThanOrEqual(56);
  expect(regularModeActionBox?.height).toBe(40);
  expect(multipleSearchBox).toEqual(regularSearchBox);
  expect(multipleRowBox).toEqual(regularRowBox);
  expect(multipleNameBox?.x).toBe(regularNameBox?.x);
  expect(multipleNameBox?.y).toBe(regularNameBox?.y);
  expect(multipleNameBox?.height).toBe(regularNameBox?.height);
  expect((regularNameBox?.width ?? 0) - (multipleNameBox?.width ?? 0))
    .toBe(28);
  await multipleCheckbox.focus();
  await page.keyboard.press('Escape');
  await expect(modeAction).toBeVisible();
  await expect(modeAction).toBeFocused();
  await modeAction.click();
  await expect(start).toBeDisabled();
  await multipleCheckbox.click();
  await selection.getByRole('checkbox', { name: /수송 로봇 02/u }).click();
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page).toHaveURL(
    /\/control\/monitoring\/multi\?.*mode=multi.*robotId=robot-001.*robotId=robot-002/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '다중 관제' }),
  ).toBeVisible();
  await expect(page.getByLabel('정찰 로봇 01 카메라 패널')).toBeVisible();
  await expect(page.getByLabel('수송 로봇 02 카메라 패널')).toBeVisible();
  await expect(page.getByRole('link', { name: '로봇 관리' })).toHaveCount(0);

  await page.getByRole('link', { name: '다중 영상 관제 나가기' }).click();
  await expect(page).toHaveURL(
    /\/control\/monitoring\?.*mode=multi.*robotId=robot-001.*robotId=robot-002/u,
  );
  await expect(page.getByRole('list', {
    name: '다중 관제 로봇 선택',
  })).toBeVisible();
  await expect(selection.getByRole('checkbox', {
    name: /정찰 로봇 01/u,
  })).toBeChecked();
  await expect(selection.getByRole('checkbox', {
    name: /수송 로봇 02/u,
  })).toBeChecked();
  issues.assertNone();
});

test('다중 관제는 6대 패널을 데스크톱 한 화면에 배치하고 compact 화면에서는 내부 스크롤한다', async ({
  page,
}, testInfo) => {
  const issues = observeBrowserIssues(page);
  const selectedRobotIds = Array.from(
    { length: 6 },
    (_, index) => `robot-${String(index + 1).padStart(3, '0')}`,
  );
  const search = new URLSearchParams({ mode: 'multi' });
  selectedRobotIds.forEach((robotId) => search.append('robotId', robotId));

  await page.goto(`/control/monitoring/multi?${search.toString()}`);
  await expectApplicationReady(page);

  const cameraGrid = page.getByRole('region', {
    name: '다중 로봇 카메라',
  });
  const robotPanels = page.getByLabel(/카메라 패널$/u);
  const robotHeadings = page.locator(
    '[data-panel-surface="soft-group"] > header h2',
  );
  await expect(cameraGrid).toBeVisible();
  await expect(robotPanels).toHaveCount(6);
  await expect(robotHeadings).toHaveCount(6);
  await expect(page.getByText('관제 중', { exact: true })).toHaveCount(0);

  const monitoringHeader = page.locator('body header').first();
  await expect(monitoringHeader).toHaveCSS('height', '56px');
  await expect(monitoringHeader).toHaveCSS('border-bottom-width', '0px');

  const visualHierarchy = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      '[data-color-scheme="dark"]',
    );
    const panel = document.querySelector<HTMLElement>(
      '[data-panel-surface="soft-group"]',
    );
    const tile = document.querySelector<HTMLElement>('[data-camera-tile="true"]');
    const cameraGrid = document.querySelector<HTMLElement>(
      '[data-presentation="multi-monitoring"]',
    );
    const robotHeading = panel?.querySelector<HTMLElement>('h2') ?? null;
    const panelContent = panel?.querySelector<HTMLElement>(':scope > div') ?? null;
    if (
      canvas === null
      || panel === null
      || tile === null
      || cameraGrid === null
      || robotHeading === null
      || panelContent === null
    ) {
      throw new Error('다중 관제 시각 위계 요소를 찾을 수 없습니다.');
    }
    const canvasStyle = getComputedStyle(canvas);
    const panelStyle = getComputedStyle(panel);
    const tileStyle = getComputedStyle(tile);
    const headingStyle = getComputedStyle(robotHeading);
    const parseRgb = (color: string): readonly [number, number, number] => {
      const hexMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(
        color.trim(),
      );
      if (hexMatch !== null) {
        return [
          Number.parseInt(hexMatch[1] ?? '0', 16),
          Number.parseInt(hexMatch[2] ?? '0', 16),
          Number.parseInt(hexMatch[3] ?? '0', 16),
        ];
      }
      const channels = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? [];
      if (channels.length !== 3) throw new Error(`색상을 해석할 수 없습니다: ${color}`);
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
    };
    const luminance = (color: string): number => {
      const channels = parseRgb(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (channels[0] ?? 0) * 0.2126
        + (channels[1] ?? 0) * 0.7152
        + (channels[2] ?? 0) * 0.0722;
    };
    const contrast = (foreground: string, background: string): number => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const focusColor = canvasStyle.getPropertyValue('--focus');
    const statusColors = ['--positive', '--warning', '--negative'].map(
      (property) => canvasStyle.getPropertyValue(property),
    );
    return {
      canvasBackground: canvasStyle.backgroundColor,
      canvasForeground: canvasStyle.color,
      cameraGap: getComputedStyle(cameraGrid).gap,
      focusContrast: contrast(focusColor, canvasStyle.backgroundColor),
      headingColor: headingStyle.color,
      panelBorderWidth: panelStyle.borderWidth,
      panelContentPadding: getComputedStyle(panelContent).padding,
      panelRadius: panelStyle.borderRadius,
      panelShadow: panelStyle.boxShadow,
      panelTailwindShadow: panelStyle.getPropertyValue('--tw-shadow'),
      statusContrast: Math.min(...statusColors.map((color) =>
        contrast(color, canvasStyle.backgroundColor))),
      tileRadius: tileStyle.borderRadius,
      tileShadow: tileStyle.boxShadow,
    };
  });
  expect(visualHierarchy.canvasBackground).not.toBe('rgb(255, 255, 255)');
  expect(visualHierarchy.canvasForeground).not.toBe(
    visualHierarchy.canvasBackground,
  );
  expect(visualHierarchy.headingColor).not.toBe(
    visualHierarchy.canvasBackground,
  );
  expect(visualHierarchy.cameraGap).toBe('8px');
  expect(visualHierarchy.panelBorderWidth).toBe('0px');
  expect(visualHierarchy.panelContentPadding).toBe('8px');
  expect(visualHierarchy.panelRadius).toBe('8px');
  expect(visualHierarchy.panelTailwindShadow.trim()).toBe('0 0 #0000');
  expect(visualHierarchy.panelShadow).not.toContain('rgba(0, 0, 0, 0.2)');
  expect(visualHierarchy.focusContrast).toBeGreaterThanOrEqual(3);
  expect(visualHierarchy.statusContrast).toBeGreaterThanOrEqual(3);
  expect(visualHierarchy.tileRadius).toBe('8px');
  expect(visualHierarchy.tileShadow).toBe('none');

  const viewportWidth = testInfo.project.use.viewport?.width ?? 0;
  const overflow = await page.evaluate(() => ({
    documentHorizontal: Math.max(
      document.documentElement.scrollWidth - window.innerWidth,
      document.body.scrollWidth - window.innerWidth,
    ),
    documentVertical: Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      document.body.scrollHeight - window.innerHeight,
    ),
  }));
  expect(overflow.documentHorizontal, '다중 관제 문서 가로 스크롤')
    .toBeLessThanOrEqual(1);
  expect(overflow.documentVertical, '다중 관제 문서 세로 스크롤')
    .toBeLessThanOrEqual(1);

  const gridOverflow = await cameraGrid.evaluate((element) =>
    element.scrollHeight - element.clientHeight);
  if (viewportWidth >= 1024) {
    expect(gridOverflow, '데스크톱 다중 관제 내부 세로 스크롤')
      .toBeLessThanOrEqual(1);
    for (let index = 0; index < selectedRobotIds.length; index += 1) {
      await expect(robotPanels.nth(index)).toBeInViewport();
    }
  } else {
    expect(gridOverflow, 'compact 다중 관제 내부 세로 스크롤')
      .toBeGreaterThan(1);
  }

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
  await page.goto('/bigdata/explorer?type=capture');
  await expectApplicationReady(page);

  const operationTable = page.getByRole('table', { name: '플라이휠 레코드 목록' });
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
    name: '탐색 결과 JSON 내보내기',
  }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('다운로드 파일 경로가 없습니다.');

  try {
    const exported: unknown = JSON.parse(await readFile(downloadPath, 'utf8'));
    if (!Array.isArray(exported)) {
      throw new Error('BigData JSON 내보내기 결과가 배열이 아닙니다.');
    }
    const exportedIds = exported.map((record: unknown) => {
      if (typeof record !== 'object' || record === null || !('id' in record) || typeof record.id !== 'string' || !('type' in record) || record.type !== 'capture') {
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
    exportButtonName: '수집 세션 JSON 내보내기',
    pathPrefix: '/mlops/sessions',
    route: '/mlops/sessions',
    tableName: '수집 세션 목록',
  });
  await expectJsonExportMatchesTable(page, {
    exportButtonName: '에피소드 JSON 내보내기',
    pathPrefix: '/mlops/episodes',
    route: '/mlops/episodes',
    tableName: '에피소드 목록',
  });
  await expectJsonExportMatchesTable(page, {
    exportButtonName: 'Dataset JSON 내보내기',
    pathPrefix: '/mlops/datasets',
    route: '/mlops/datasets',
    tableName: 'Dataset 버전 목록',
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

test('Failure cluster가 필터를 보존해 재수집 화면으로 연결된다', async ({
  page,
}) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/bigdata/failures');
  await expectApplicationReady(page);

  await page.getByRole('button', { name: '필터로 재수집' }).first().click();
  await expect(page).toHaveURL(
    /\/mlops\/capture\/mobility\?gap=failure-obstacle$/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '사족·모바일 연속 주행 수집' }),
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

test('수집부터 에피소드와 초안 데이터셋까지 앱 범위 업무를 완료한다', async ({
  page,
}, testInfo) => {
  const issues = observeBrowserIssues(page);
  const captureName = `브라우저 수집 ${testInfo.project.name}`;
  const datasetName = `브라우저 데이터셋 ${testInfo.project.name}`;

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
  const episodeLinks = page.getByRole('link', { name: /^Episode \d+ · episode-/u });
  await expect(episodeLinks).toHaveCount(2);
  const firstEpisodeHref = await episodeLinks.first().getAttribute('href');
  const episodeId = firstEpisodeHref?.split('/').at(-1);
  if (episodeId === undefined || episodeId.length === 0) {
    throw new Error('생성된 Episode ID를 찾지 못했습니다.');
  }

  await page.goto(`/mlops/datasets/new?kind=humanoid-episode&episode=${encodeURIComponent(episodeId)}`);
  await expectApplicationReady(page);
  await expect(
    page.getByRole('heading', { level: 1, name: '새 Dataset Version' }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '이름' }).fill(datasetName);
  await page.getByRole('button', { name: '초안 생성' }).click();
  await expect(page).toHaveURL(/\/mlops\/datasets\/dataset-/u);
  await expect(
    page.getByRole('heading', { level: 1, name: `${datasetName} v1` }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Release' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Dataset Version을 Release했습니다.',
  );
  await expect(page.getByText('released', { exact: true })).toBeVisible();
  issues.assertNone();
});
