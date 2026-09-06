import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from './playwright-test';
import { fillCollectionSetup, openCollectionDetails } from './collection-setup';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';

interface ExportedRecord {
  readonly id: string;
}

interface ExportTableOptions {
  readonly excludeConnectionData?: boolean;
  readonly exportButtonName: string;
  readonly pathPrefix: string;
  readonly recordLinkSelector?: string;
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
  recordLinkSelector = 'tbody tr td:first-child a',
): Promise<readonly string[]> {
  const table = page.getByRole('table', { name: tableName });
  await expect(table).toBeVisible();
  const ids = await table.locator(recordLinkSelector).evaluateAll(
    (links, prefix) => links.map((link) => {
      const path = new URL((link as HTMLAnchorElement).href).pathname;
      if (!path.startsWith(`${prefix}/`)) {
        throw new Error(`예상하지 않은 상세 경로입니다: ${path}`);
      }
      return decodeURIComponent(path.slice(prefix.length + 1).split('/')[0] ?? '');
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
    options.recordLinkSelector,
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: options.exportButtonName }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('다운로드 파일 경로가 없습니다.');

  try {
    const serialized = await readFile(downloadPath, 'utf8');
    if (options.excludeConnectionData) {
      expect(serialized).not.toMatch(/"(?:pairing|integrationProfileId|profile|collectorAcknowledgements|finalizationError)"/u);
    }
    const records = readExportedRecords(JSON.parse(serialized) as unknown);
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

test('서로 다른 탭에서 Human Demonstration과 Quest collector를 페어링하고 Episode를 기록한다', async ({ page }) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/mlops/collection/new');
  await expectApplicationReady(page);
  await expect(page.getByRole('heading', { name: '새 데이터 수집' })).toBeVisible();
  for (const name of ['작업 ID', '외골격 장치 ID', 'Quest 손 추적 장치 ID', 'RBP 헤드 카메라 ID', '외부 카메라 ID · 선택']) {
    await expect(page.getByRole('textbox', { name, exact: true })).toHaveValue('');
  }
  await expect(page.getByRole('region', { name: '장치 준비 상태' })).toHaveCount(0);
  await page.getByRole('textbox', { name: '세션 이름' }).fill('E2E Quest human demo');
  await fillCollectionSetup(page);
  await expect(page.getByRole('textbox', { name: '외부 카메라 ID · 선택' })).toHaveValue('external-camera-001');
  await page.getByRole('button', { name: '세션 생성' }).click();
  const pairing = page.getByRole('status', { name: 'Quest pairing code' });
  await expect(pairing).toHaveText(/^\d{6}$/u);
  await expect(page.getByText('를 열고 아래 코드를 입력하세요.', { exact: false })).toBeVisible();
  await expect(page.getByText('/collect/quest', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Collector 열기' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '장치 준비 상태', exact: true })).toHaveCount(0);
  const collector = await page.context().newPage();
  const collectorIssues = observeBrowserIssues(collector);
  try {
    await collector.goto('/collect/quest');
    await expectApplicationReady(collector);
    await expect(collector.getByRole('textbox', { name: '6자리 페어링 코드' })).toHaveValue('');
    await collector.getByRole('textbox', { name: '6자리 페어링 코드' }).fill((await pairing.innerText()).trim());
    await collector.getByRole('button', { name: '세션 연결' }).click();
    await expect(collector.getByRole('region', { name: '연결된 세션' })).toContainText('PC 수집 세션에 연결되었습니다.');
    await expect(page.getByRole('heading', { name: 'Quest 연결 완료' })).toBeVisible();
    await collector.getByRole('button', { name: 'MR 모드 시작' }).click();
    await expect(collector.getByRole('button', { name: 'MR 모드 종료' })).toBeVisible();
    for (const side of ['왼손', '오른손']) {
      await expect(collector.getByLabel(side + ' Hand Pose 상태', { exact: true })).toContainText('추적 정상');
    }
    await page.getByRole('button', { name: '수집 콘솔 열기' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Quest human demo' })).toBeVisible();
    const controls = page.getByRole('region', { name: '수집 작업 컨트롤' });
    const sessionInfo = page.getByRole('region', { name: '세션 정보', exact: true });
    await openCollectionDetails(page, '수집 상태');
    const bindings = page.getByRole('region', { name: 'Collector 명령 응답' });
    await controls.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await expect(collector.getByRole('region', { name: 'Collector 운영 상태' })).toContainText('녹화 중');
    await page.locator('summary').filter({ hasText: '녹화 명령 응답' }).click();
    await expect(bindings).toContainText('quest2-001 · 시작 · 확인 완료');
    await expect(page.getByRole('region', { name: 'Quest 손 포즈 3D' }).locator('canvas')).toBeVisible();
    await openCollectionDetails(page, '세션 정보');
    await expect(sessionInfo).toContainText('완전성');
    await openCollectionDetails(page, '수집 상태');
    await expect.poll(() => controls.getByLabel('녹화 경과 시간').innerText()).not.toBe('00:00');

    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'review');
    await expect(collector.getByRole('region', { name: 'Collector 운영 상태' })).toContainText('검토 대기');
    await page.locator('summary').filter({ hasText: '녹화 명령 응답' }).click();
    await expect(bindings).toContainText('quest2-001 · 정지 · 확인 완료');
    const recordedCamera = page.getByRole('region', { name: '기록된 Episode 카메라' });
    await expect(recordedCamera.locator('figure')).toHaveCount(2);
    const playback = page.getByRole('group', { name: 'Episode 재생 컨트롤' });
    await expect(playback).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Episode 재생 위치' })).toBeEnabled();
    await openCollectionDetails(page, '수집 상태');
    await page.getByRole('region', { name: 'Sensor stream 상태' }).locator('.collection-stream > summary').first().click();
    await expect(page.getByRole('region', { name: 'Sensor stream 상태' }).getByRole('img', { name: /최근 10초 수신 기록/u }).first()).toBeVisible();
    await expect(controls.getByRole('button', { name: '녹화본 저장' })).toBeInViewport();
    await openCollectionDetails(page, '세션 정보');
    await controls.getByRole('button', { name: '녹화본 저장' }).click();
    await expect(page.locator('[data-episode-summary]')).toContainText('저장 완료 1개');

    await collector.reload();
    await expect(collector.getByRole('textbox', { name: '6자리 페어링 코드' })).toBeVisible();
    await expect(collector.getByRole('region', { name: '연결된 세션' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Quest 손 포즈 3D' })).toContainText('연결 끊김');
    await openCollectionDetails(page, '수집 상태');
    await expect(page.getByRole('region', { name: 'Quest 손 추적 장치' }).getByRole('button', { name: 'Quest 연결', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Quest 연결', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Quest 연결' }).getByRole('status', { name: 'Quest pairing code' })).toHaveText(/^\d{6}$/u);
    collectorIssues.assertNone();
    issues.assertNone();
  } finally {
    await collector.close();
  }
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

  await page.getByRole('region', { name: '로봇 선택' }).getByRole('button', { name: /정찰 로봇 01/u }).click();
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
    '콘텐츠 높이에 맞춘 로봇 선택 패널은 지도 하단 여백을 침범하지 않는다',
  ).toBeGreaterThanOrEqual(16);
  expect(
    (robotPanelBox?.y ?? 0)
      - ((sitePanelBox?.y ?? 0) + (sitePanelBox?.height ?? 0)),
    '사이트 드롭다운과 로봇 선택 패널 사이 여백',
  ).toBe(12);
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
  await expect(robotSelector.getByRole('button', { name: /정찰 로봇 01/u }))
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

  await page.getByRole('searchbox', { name: '로봇 검색' }).fill('정찰');
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

  await page.goto('/mlops/collection/new');
  await expectApplicationReady(page);
  for (const suffix of ['alpha', 'beta']) {
    if (suffix === 'beta') await page.getByRole('link', { name: '새 수집' }).click();
    await fillCollectionSetup(page);
    await page.getByRole('textbox', { name: '세션 이름' }).fill('내보내기 ' + suffix);
    await page.getByRole('textbox', { name: '외골격 장치 ID', exact: true }).fill('exoskeleton-' + suffix);
    await page.getByRole('textbox', { name: 'Quest 손 추적 장치 ID', exact: true }).fill('quest-' + suffix);
    await page.getByRole('textbox', { name: 'RBP 헤드 카메라 ID', exact: true }).fill('head-camera-' + suffix);
    await page.getByRole('textbox', { name: '외부 카메라 ID · 선택', exact: true }).fill('external-camera-' + suffix);
    await page.getByRole('button', { name: '세션 생성' }).click();
    await expect(page.getByRole('status', { name: 'Quest pairing code' })).toHaveText(/^\d{6}$/u);
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  const collectionTable = page.getByRole('table', { name: '운영 중인 휴머노이드 수집 세션' });
  await expect(collectionTable.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '수집 검색' }).fill('내보내기 alpha');
  await expect(collectionTable.locator('tbody tr')).toHaveCount(1);
  const expectedIds = await collectVisibleRecordIds(page, '운영 중인 휴머노이드 수집 세션', '/mlops/collection');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '수집 목록 메뉴' }).click();
  await page.getByRole('menuitem', { name: '수집 세션 JSON 내보내기' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('수집 세션 내보내기 파일이 없습니다.');
  try {
    const serialized = await readFile(downloadPath, 'utf8');
    expect(serialized).not.toMatch(/"(?:pairing|integrationProfileId|profile|collectorAcknowledgements|errorMessage)"/u);
    const records = readExportedRecords(JSON.parse(serialized) as unknown);
    expect(records.map((record) => record.id)).toEqual(expectedIds);
  } finally {
    await download.delete();
  }
  await expectJsonExportMatchesTable(page, {
    exportButtonName: '카탈로그 JSON 내보내기',
    excludeConnectionData: true,
    pathPrefix: '/mlops/catalog',
    route: '/mlops/catalog',
    tableName: '휴머노이드 데이터 카탈로그',
  });
  await expectJsonExportMatchesTable(page, {
    exportButtonName: '에피소드 JSON 내보내기',
    excludeConnectionData: true,
    pathPrefix: '/mlops/episodes',
    recordLinkSelector: 'tbody a[href^="/mlops/episodes/"]',
    route: '/mlops/catalog/capture-h-001',
    tableName: '카탈로그 에피소드 선택',
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

  await page.getByRole('button', { name: '재수집 시작' }).first().click();
  await expect(page).toHaveURL(
    /\/mlops\/collection\?gap=failure-obstacle$/u,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '데이터 수집' }),
  ).toBeVisible();
  issues.assertNone();
});

test('수집 계획의 DOM·시각 순서가 viewport별 키보드 읽기 순서와 일치한다', async ({ page }, testInfo) => {
  const issues = observeBrowserIssues(page);
  await page.goto('/mlops/capture/humanoid');
  await expectApplicationReady(page);
  await expect(page).toHaveURL(/\/mlops\/collection\/new$/u);
  const fieldNames = ['세션 이름', '작업 ID', '작업 지시', '외골격 장치 ID', 'Quest 손 추적 장치 ID', 'RBP 헤드 카메라 ID', '외부 카메라 ID · 선택'];
  const firstInput = page.getByRole('textbox', { name: fieldNames[0], exact: true });
  await firstInput.focus();
  for (const name of fieldNames.slice(1)) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '세션 생성', exact: true })).toBeFocused();
  const plan = page.getByRole('textbox', { name: '작업 지시', exact: true });
  const devices = page.getByRole('group', { name: '수집 장치', exact: true });
  const planBox = await plan.boundingBox();
  const deviceBox = await devices.boundingBox();
  if (planBox === null || deviceBox === null) throw new Error('수집 작업과 장치 입력의 배치를 측정하지 못했습니다.');
  expect(planBox.y + planBox.height).toBeLessThanOrEqual(deviceBox.y);
  await expect(page.getByRole('dialog', { name: '새 데이터 수집' })).toBeVisible();
  await expect(page.getByRole('region', { name: '장치 준비 상태' })).toHaveCount(0);
  await testInfo.attach('capture-reading-order', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  issues.assertNone();
});

test('수집부터 에피소드와 초안 데이터셋까지 앱 범위 업무를 완료한다', async ({ page }, testInfo) => {
  const issues = observeBrowserIssues(page);
  const captureName = '브라우저 수집 ' + testInfo.project.name;
  const datasetName = '브라우저 데이터셋 ' + testInfo.project.name;
  await page.goto('/mlops/capture/humanoid');
  await expectApplicationReady(page);
  await page.getByRole('textbox', { name: '세션 이름' }).fill(captureName);
  await fillCollectionSetup(page);
  await page.getByRole('button', { name: '세션 생성' }).click();
  const pairing = page.getByRole('status', { name: 'Quest pairing code' });
  await expect(pairing).toHaveText(/^\d{6}$/u);
  const collector = await page.context().newPage();
  const collectorIssues = observeBrowserIssues(collector);
  try {
    await collector.goto('/collect/quest');
    await expectApplicationReady(collector);
    await collector.getByRole('textbox', { name: '6자리 페어링 코드' }).fill((await pairing.innerText()).trim());
    await collector.getByRole('button', { name: '세션 연결' }).click();
    await collector.getByRole('button', { name: 'MR 모드 시작' }).click();
    await page.getByRole('button', { name: '수집 콘솔 열기' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/mlops\/collection\/capture-hd-[^/]+$/u);
    const collectionId = new URL(page.url()).pathname.split('/').at(-1);
    expect(collectionId).toMatch(/^capture-hd-/u);
    const controls = page.getByRole('region', { name: '수집 작업 컨트롤' });
    await controls.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await controls.getByRole('button', { name: '녹화본 저장' }).click();
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
    await expect(page.getByRole('heading', { name: captureName })).toBeVisible();
    const episodes = page.getByRole('table', { name: '카탈로그 에피소드 선택' });
    await expect(episodes.locator('tbody tr')).toHaveCount(2);
    const episodeLinks = episodes.locator('tbody a[href^="/mlops/episodes/"]');
    await expect(episodeLinks).toHaveCount(2);
    const episodeHref = await episodeLinks.first().getAttribute('href');
    const episodeId = episodeHref?.split('/').at(-1);
    if (!episodeId) throw new Error('저장된 Episode 상세 주소가 없습니다.');
    await episodes.getByRole('checkbox', { name: 'Episode 01 선택' }).check();
    await page.getByRole('button', { name: '선택한 에피소드 1개로 데이터셋 구성' }).click();
    await expect(page).toHaveURL('/mlops/datasets/new?kind=humanoid-episode&episode=' + episodeId);
    await expect(page.getByRole('heading', { level: 1, name: '데이터셋 만들기' })).toBeVisible();
    await page.getByRole('textbox', { name: '이름', exact: true }).fill(datasetName);
    await page.getByRole('button', { name: '초안 생성' }).click();
    await expect(page).toHaveURL(/\/mlops\/datasets\/dataset-/u);
    await expect(page.getByRole('heading', { name: datasetName + ' v1' })).toBeVisible();
    await expect(page.getByText(episodeId, { exact: true })).toBeVisible();
    await expect(page.getByText('초안', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '릴리스', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('데이터셋을 릴리스했습니다.');
    await expect(page.getByText('릴리스됨', { exact: true })).toBeVisible();
    collectorIssues.assertNone();
    issues.assertNone();
  } finally {
    await collector.close();
  }
});

test('수집 정보는 다이얼로그 없이 펼치고 녹화 조작을 유지한다', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const issues = observeBrowserIssues(page);
  await page.goto('/mlops/collection/new');
  await expectApplicationReady(page);
  await fillCollectionSetup(page);
  await page.getByRole('textbox', { name: '세션 이름' }).fill(`인라인 수집 정보 ${testInfo.project.name}`);
  await page.getByRole('button', { name: '세션 생성' }).click();
  const pairing = page.getByRole('status', { name: 'Quest pairing code' });
  await expect(pairing).toHaveText(/^\d{6}$/u);
  const collector = await page.context().newPage();
  try {
    await collector.goto('/collect/quest');
    await expectApplicationReady(collector);
    await collector.getByRole('textbox', { name: '6자리 페어링 코드' }).fill((await pairing.innerText()).trim());
    await collector.getByRole('button', { name: '세션 연결' }).click();
    await collector.getByRole('button', { name: 'MR 모드 시작' }).click();
    await page.getByRole('button', { name: '수집 콘솔 열기' }).click();
    const controls = page.getByRole('region', { name: '수집 작업 컨트롤' });
    const inspector = page.getByRole('complementary', { name: '수집 상세' });
    const sessionInfo = page.getByRole('region', { name: '세션 정보' });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(sessionInfo.locator('.collection-session-fields dt').first()).toHaveCSS('color', 'rgb(195, 195, 198)');
    }
    await controls.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');

    const viewports = testInfo.project.name === 'chrome-1440'
      ? [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 900 }, { width: 640, height: 360 }]
      : [testInfo.project.use.viewport ?? { width: 1440, height: 900 }];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openCollectionDetails(page, '세션 정보');
      await expect(sessionInfo.getByText('원본 기록', { exact: true })).toHaveCount(1);
      await expect(sessionInfo.getByText('데이터 품질', { exact: true })).toHaveCount(1);
      await expect(sessionInfo).toContainText(/완전성/u);
      await expect(page.getByRole('button', { name: '상세 진단', exact: true })).toHaveCount(0);
      const connection = page.getByRole('tab', { name: '수집 상태', exact: true });
      const sessionTab = page.getByRole('tab', { name: '세션 정보', exact: true });
      await sessionTab.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(sessionTab).toBeFocused();
      await sessionTab.press('ArrowDown');
      await expect(connection).toBeFocused();
      await expect(connection).toHaveCSS('outline-style', 'solid');
      const connectionBox = await connection.boundingBox();
      expect(connectionBox?.height).toBeGreaterThanOrEqual(40);
      await connection.press('Enter');
      await page.locator('summary').filter({ hasText: '녹화 명령 응답' }).click();
      await expect(page.getByRole('region', { name: 'Collector 명령 응답' })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const connectionScreenshot = testInfo.outputPath(`inline-connection-${String(viewport.width)}.png`);
      await page.screenshot({ path: connectionScreenshot });
      await testInfo.attach(`inline-connection-${String(viewport.width)}`, { path: connectionScreenshot, contentType: 'image/png' });
      const sources = page.getByRole('region', { name: 'Sensor stream 상태' });
      const headSource = sources.locator('summary').filter({ hasText: 'Head RGB · RBP Camera' });
      await headSource.focus();
      await headSource.press('Enter');
      await expect(headSource.locator('..')).toHaveAttribute('open', '');
      await expect(headSource.locator('..').getByText('rbp-headcam-001', { exact: true })).toBeVisible();
      await headSource.press('Enter');
      await expect(headSource.locator('..')).not.toHaveAttribute('open');
      await expect(sources.getByText('Head RGB · RBP Camera', { exact: true })).toHaveCount(1);
      await expect(sources.getByRole('button', { name: /전체 소스 상세/u })).toHaveCount(0);
      for (const label of ['선택 소스', '파생 데이터']) {
        const disclosure = sources.locator('summary').filter({ hasText: label });
        await expect(disclosure).toBeVisible();
        await disclosure.click();
      }
      await expect(sources.getByText('External RGB · Full body', { exact: true })).toBeVisible();
      await expect(sources.getByText('Head Semantic', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(controls.getByRole('button', { name: 'Episode 녹화 정지', exact: true })).toBeInViewport();
      const overflow = await inspector.evaluate((element) => ({
        inspectorX: element.scrollWidth - element.clientWidth,
        documentX: document.documentElement.scrollWidth - window.innerWidth,
        documentY: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.inspectorX).toBeLessThanOrEqual(1);
      expect(overflow.documentX).toBeLessThanOrEqual(1);
      expect(overflow.documentY).toBeLessThanOrEqual(1);
      if (viewport.width >= 896) {
        await expect(page.getByRole('region', { name: '실시간 수집 카메라', exact: true })).toBeInViewport();
      }
      const sourcesScreenshot = testInfo.outputPath(`inline-sources-${String(viewport.width)}.png`);
      await page.screenshot({ path: sourcesScreenshot });
      await testInfo.attach(`inline-sources-${String(viewport.width)}`, { path: sourcesScreenshot, contentType: 'image/png' });
    }
    await controls.getByRole('button', { name: 'Episode 녹화 정지', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'review');
    await controls.getByRole('button', { name: '녹화본 저장', exact: true }).click();
    await expect(controls.getByRole('button', { name: '다음 Episode 녹화 시작', exact: true })).toBeVisible();
    issues.assertNone();
  } finally {
    await collector.close();
  }
});

test('수집 콘솔은 상세와 다섯 뷰를 유지하며 녹화·검토·재수집한다', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const issues = observeBrowserIssues(page);
  const assertNoWorkspaceScroll = async () => {
    const measureOverflow = () => page.evaluate(() => {
      const root = document.documentElement;
      const scrollAreas = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((element) => {
        const style = getComputedStyle(element);
        return element.clientHeight > 0 && /auto|scroll/u.test(style.overflowY)
          && element.scrollHeight > element.clientHeight + 1;
      });
      return {
        pageX: Math.max(0, root.scrollWidth - root.clientWidth - 1),
        pageY: Math.max(0, root.scrollHeight - root.clientHeight - 1),
        // 좁은 화면은 미리보기 영역 안에서 이동하고 녹화 조작부를 고정한다.
        panels: scrollAreas.filter((element) => !element.matches(window.innerWidth < 896
          ? '[data-capture-viewport], .collection-instruction'
          : '.collection-inspector-tabs [role="tabpanel"], .collection-instruction'))
          .map((element) => element.getAttribute('aria-label') ?? element.tagName),
        workspaceY: Array.from(document.querySelectorAll<HTMLElement>(window.innerWidth < 896 ? '[data-capture-setup]' : '[data-capture-viewport], [data-capture-setup]'))
          .map((element) => Math.max(0, element.scrollHeight - element.clientHeight - 1)),
      };
    });
    await expect.poll(measureOverflow).toMatchObject({ pageX: 0, pageY: 0, panels: [] });
    for (const height of (await measureOverflow()).workspaceY) expect(height).toBe(0);
  };
  if (testInfo.project.name === 'chrome-1440') await page.setViewportSize({ width: 1280, height: 720 });
  const sessionName = `수집 콘솔 검증 ${testInfo.project.name}`;
  await page.goto('/mlops/collection/new');
  await expectApplicationReady(page);
  await page.getByRole('textbox', { name: '세션 이름' }).fill(sessionName);
  await fillCollectionSetup(page);
  await assertNoWorkspaceScroll();
  await page.getByRole('button', { name: '세션 생성' }).click();
  const pairing = page.getByRole('status', { name: 'Quest pairing code' });
  await expect(pairing).toHaveText(/^\d{6}$/u);
  const collector = await page.context().newPage();
  try {
    await collector.goto('/collect/quest');
    await expectApplicationReady(collector);
    await collector.getByRole('textbox', { name: '6자리 페어링 코드' }).fill((await pairing.innerText()).trim());
    await collector.getByRole('button', { name: '세션 연결' }).click();
    await collector.getByRole('button', { name: 'MR 모드 시작' }).click();
    await assertNoWorkspaceScroll();
    await page.getByRole('button', { name: '수집 콘솔 열기' }).click();
    await expect(page.getByRole('heading', { name: sessionName })).toBeVisible();

    const controls = page.getByRole('region', { name: '수집 작업 컨트롤' });
    const summary = page.getByRole('tab', { name: '세션 정보' });
    const sessionTab = page.getByRole('tab', { name: '세션 정보' });
    const sessionInfo = page.getByRole('region', { name: '세션 정보' });
    const camera = page.getByRole('region', { name: '실시간 수집 카메라' });
    await expect(sessionInfo).toBeVisible();
    const inspector = page.getByRole('complementary', { name: '수집 상세' });
    const captureProductState = async (state: 'ready' | 'recording') => {
      const originalViewport = page.viewportSize();
      for (const viewport of [{ width: 1280, height: 720 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await expect(controls).toHaveAttribute('data-collection-state', state === 'ready' ? 'episode-ready' : 'recording');
        await camera.locator('figure').first().scrollIntoViewIfNeeded();
        await expect(controls).toBeInViewport();
        const name = `collection-${state}-${String(viewport.width)}x${String(viewport.height)}`;
        const path = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path });
        await testInfo.attach(name, { path, contentType: 'image/png' });
      }
      if (originalViewport !== null) await page.setViewportSize(originalViewport);
    };
    await expect(inspector.getByRole('button', { name: '수집 상세 닫기' })).toHaveCount(0);
    await expect(inspector.getByRole('heading', { name: '세션 정보', exact: true })).toHaveCount(0);
    await expect(sessionInfo.getByText('quest2-001', { exact: true })).toBeVisible();
    await expect(sessionInfo.getByText('rbp-headcam-001', { exact: true })).toBeVisible();
    await expect(sessionInfo.getByText('생성 시각', { exact: true })).toBeVisible();
    if (testInfo.project.name === 'chrome-1440') {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const name of ['세션 정보', '수집 상태']) {
          await openCollectionDetails(page, name);
          await inspector.scrollIntoViewIfNeeded();
          const path = testInfo.outputPath(`inspector-${name}-${String(viewport.width)}.png`);
          await page.screenshot({ path });
          await testInfo.attach(`inspector-${name}-${String(viewport.width)}`, { path, contentType: 'image/png' });
        }
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await openCollectionDetails(page, '세션 정보');
    }
    await expect(inspector.getByRole('region', { name: '작업 지시' })).toBeVisible();
    await expect(controls.locator('[data-episode-summary]')).toBeVisible();
    await expect(inspector.locator('[data-episode-summary]')).toHaveCount(0);
    await expect(page.locator('[data-collection-header]')).not.toContainText('수집 상세');
    await expect(page.getByRole('tablist', { name: '수집 상세 메뉴' })).toHaveAttribute('aria-orientation', 'vertical');
    await expect(page.locator('[data-preview-workspace] [data-episode-summary]')).toHaveCount(0);
    const bodyModel = page.getByRole('region', { name: '전신 휴머노이드 3D' }).locator('model-viewer');
    if ((page.viewportSize()?.width ?? 0) < 896) await bodyModel.scrollIntoViewIfNeeded();
    await expect(bodyModel).toHaveJSProperty('src', '/assets/unitree-g1.glb');
    await expect.poll(() => bodyModel.evaluate((element) => Reflect.get(element, 'loaded') === true)).toBe(true);
    await expect(bodyModel).not.toHaveAttribute('autoplay');
    const mediaPanels = page.locator('[data-media-panel]');
    await expect(mediaPanels).toHaveCount(3);
    for (const panel of await mediaPanels.all()) {
      await expect(panel).toHaveCSS('border-radius', '12px');
      await expect(panel).toHaveCSS('overflow', 'hidden');
      await expect(panel).toHaveCSS('border-top-width', '0px');
      await expect(panel).toHaveCSS('box-shadow', 'none');
      await expect(panel.locator('[data-media-panel-header]')).toHaveCSS('min-height', '40px');
    }
    for (const figure of await camera.locator('figure').all()) {
      await expect(figure).toHaveCSS('border-radius', '12px');
      await expect(figure).toHaveCSS('border-top-width', '0px');
      await expect(figure).toHaveCSS('outline-style', 'none');
      await expect(figure).toHaveCSS('box-shadow', 'none');
    }
    const assertMonitorVisible = async () => {
      for (const name of ['실시간 수집 카메라', 'Head RGB Depth와 세그멘테이션', '전신 휴머노이드 3D', 'Quest 손 포즈 3D']) {
        const region = page.getByRole('region', { name, exact: true });
        if ((page.viewportSize()?.width ?? 0) < 896) await region.scrollIntoViewIfNeeded();
        await expect(region).toBeInViewport();
      }
      await expect(camera.locator('figure')).toHaveCount(2);
      for (const figure of await camera.locator('figure').all()) {
        if ((page.viewportSize()?.width ?? 0) < 896) await figure.scrollIntoViewIfNeeded();
        await expect(figure).toBeInViewport();
      }
      await expect(controls).toBeInViewport();
    };
    await assertMonitorVisible();
    await captureProductState('ready');
    await testInfo.attach('collection-sidebar', {
      body: await page.screenshot(), contentType: 'image/png',
    });
    await summary.click();
    await expect(sessionInfo).toBeHidden();
    await expect(page.getByRole('region', { name: '수집 운영 요약' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: '세션 및 수집 제어' })).toHaveCount(0);
    await expect(camera).not.toContainText(/FPS|Hz/u);
    await expect(sessionTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sessionInfo).toBeVisible();
    await assertNoWorkspaceScroll();
    for (const name of ['수집 상태', '문제', '세션 정보']) {
      await openCollectionDetails(page, name === '문제' ? /^문제(?: · \d+)?$/u : name);
      await assertMonitorVisible();
      await assertNoWorkspaceScroll();
    }
    await summary.press('Enter');
    await expect(sessionInfo).toBeHidden();
    const handViewer = page.getByRole('region', { name: 'Quest 손 포즈 3D' });
    await expect(handViewer.getByText('손 추적', { exact: true })).toBeVisible();
    await expect(handViewer.locator('canvas')).toBeVisible();
    await expect(handViewer.locator('button, select, [role="combobox"], details, dl')).toHaveCount(0);
    await expect(handViewer).not.toContainText(/Quest World|Hand Local|시점 초기화|드래그|관절 정보|Position|Orientation|Radius/u);

    await controls.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await assertNoWorkspaceScroll();
    await expect(collector.getByRole('region', { name: 'Collector 운영 상태' })).toContainText('녹화 중');
    await expect(controls).not.toContainText(/저장 상태 확인 불가|정지 후 녹화본을 검토하고 저장할 수 있습니다/u);
    await expect(controls).toContainText(/\d{2}:\d{2}/u);
    await openCollectionDetails(page, '세션 정보');
    await expect(sessionInfo).toBeVisible();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await captureProductState('recording');
    await summary.click();
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'review');
    await expect(page.getByRole('group', { name: 'Episode 재생 컨트롤' })).toBeVisible();
    await assertNoWorkspaceScroll();
    await controls.getByRole('button', { name: '다시 녹화' }).click();
    await page.getByRole('button', { name: '삭제하고 다시 녹화' }).click();
    await expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await expect(collector.getByRole('region', { name: 'Collector 운영 상태' })).toContainText('녹화 중');
    await controls.getByRole('button', { name: 'Episode 녹화 정지' }).click();
    await controls.getByRole('button', { name: '녹화본 저장' }).click();
    await expect(controls.getByRole('button', { name: '다음 Episode 녹화 시작' })).toBeVisible();

    for (const viewport of [
      { width: 1280, height: 720 }, { width: 1366, height: 768 },
      { width: 1920, height: 1080 }, { width: 960, height: 540 },
      { width: 390, height: 844 }, { width: 320, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await assertNoWorkspaceScroll();
      const controlsBox = await controls.boundingBox();
      if (controlsBox === null) throw new Error('수집 화면 크기를 측정하지 못했습니다.');
      await expect(camera.locator('figure')).toHaveCount(2);
      for (const cameraCard of await camera.locator('figure').all()) {
        if (viewport.width < 896) await cameraCard.scrollIntoViewIfNeeded();
        const cameraBox = await cameraCard.locator('[data-camera-viewport]').boundingBox();
        const captionBox = await cameraCard.locator('figcaption').boundingBox();
        const cardBox = await cameraCard.boundingBox();
        if (cameraBox === null || captionBox === null || cardBox === null) throw new Error('카메라 크기를 측정하지 못했습니다.');
        expect(cameraBox.height).toBeGreaterThan(0);
        expect(Math.abs(cameraBox.width / cameraBox.height - 16 / 9)).toBeLessThan(0.02);
        expect(Math.abs(cameraBox.x - cardBox.x)).toBeLessThan(1);
        expect(Math.abs(cameraBox.width - cardBox.width)).toBeLessThan(1);
        expect(Math.abs(cameraBox.y - captionBox.y - captionBox.height)).toBeLessThan(1);
        expect(Math.abs(cameraBox.y + cameraBox.height - cardBox.y - cardBox.height)).toBeLessThan(1);
        await expect(cameraCard.locator('img, video').first()).toHaveCSS('object-fit', 'contain');
        expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(cameraBox.y + 1);
        expect(cameraBox.y + cameraBox.height).toBeLessThanOrEqual(viewport.height);
        await expect(cameraCard.locator('figcaption')).toBeInViewport();
      }
      const perceptionViewport = page.locator('[data-perception-viewport]');
      if (viewport.width < 896) await perceptionViewport.scrollIntoViewIfNeeded();
      const perceptionBox = await perceptionViewport.boundingBox();
      if (perceptionBox === null) throw new Error('인지 영상 크기를 측정하지 못했습니다.');
      expect(perceptionBox.height).toBeGreaterThan(0);
      expect(Math.abs(perceptionBox.width / perceptionBox.height - 16 / 9)).toBeLessThan(0.02);
      for (const image of await perceptionViewport.locator('img').all()) {
        await expect(image).toHaveCSS('object-fit', 'contain');
        const imageBox = await image.boundingBox();
        expect(imageBox).toEqual(perceptionBox);
      }
      expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(viewport.height);
      expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(viewport.width);
      await expect(controls.getByRole('button', { name: '다음 Episode 녹화 시작' })).toBeInViewport();
      await testInfo.attach(`collection-minimal-${String(viewport.width)}`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
    }
    await page.getByRole('button', { name: '수집 콘솔 닫기' }).click();
    await expect(page.getByRole('dialog')).toContainText('저장한 Episode 1개');
    await page.getByRole('button', { name: '계속 수집' }).click();
    issues.assertNone();
  } finally {
    await collector.close();
  }
});
