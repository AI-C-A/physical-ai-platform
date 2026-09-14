import { expect, test } from '@playwright/test';

import { expectApplicationReady, observeBrowserIssues } from './browser-assertions';
import { fillCollectionSetup, openCollectionDetails } from './collection-setup';

const SIMULATION_HOST = 'orca.tail58a6fa.ts.net';

/**
 * 시뮬레이션 화면은 외부 호스트(ts.net)의 WebXR 페이지를 iframe으로 싣고, 그 iframe이
 * 부모로 postMessage 스냅샷을 보낸다. e2e를 네트워크와 무관하게 유지하려고, iframe HTML을
 * 실제 시뮬레이션 대신 "브리지 스냅샷을 보내는" stub으로 채운다. iframe origin은 요청 URL의
 * origin(ts.net)이라, 콘솔의 origin 검증을 그대로 통과한다.
 */
const STUB_IFRAME = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#0b1016;color:#9fe8c4;font-family:system-ui">
<main style="display:grid;place-items:center;height:100vh">시뮬레이션 스텁 (관전)</main>
<script>
  var seq = 0;
  function snap() {
    seq += 1;
    parent.postMessage({
      source: 'aaf-monitor', t: 'snapshot', mode: 'vr', recording: true,
      stats: { frames: 100 + seq * 5, events: seq, tracked: 38, episodes: 0, duration: seq },
      peers: [{ name: 'OP-11', mode: 'vr' }],
      head: [0, 1.6, -2], heldCount: 1,
      hands: [{ id: 'right', kind: 'hand', p: [0.3, 1.1, -1.8], grab: true, joints: null }],
      task: { id: 't01_radio', title: '전술 무전기 준비', index: 1, par: 40, tier: 0, time: seq,
        hint: '안테나를 세워 정렬해 끼우십시오',
        steps: [{ label: '배터리를 무전기에 삽입', state: 'done' }, { label: '안테나 체결', state: 'active' }] },
      events: [{ seq: 1, name: 'grasp', data: { tag: 'radio_antenna' } },
               { seq: 2, name: 'snap', data: { tag: 'radio_antenna', zone: 'radio_antenna_port' } }]
    }, '*');
  }
  snap();
  setInterval(snap, 200);
</script>
</body></html>`;

test('수집 콘솔에서 시뮬레이션 수집으로 이동해 브리지 스냅샷을 실시간으로 보여준다', async ({ page }) => {
  const issues = observeBrowserIssues(page);
  await page.route(`https://${SIMULATION_HOST}/**`, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: STUB_IFRAME }));

  await page.goto('/mlops/collection/new');
  await expectApplicationReady(page);
  await page.getByRole('textbox', { name: '세션 이름' }).fill('E2E 시뮬레이션 수집');
  await fillCollectionSetup(page);
  await page.getByRole('button', { name: '세션 생성' }).click();
  await expect(page.getByRole('heading', { name: 'E2E 시뮬레이션 수집' })).toBeVisible();
  const collectionId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  await openCollectionDetails(page, '장치');
  await page.getByRole('region', { name: '시뮬레이션 수집' }).getByRole('link', { name: '시뮬레이션 수집' }).click();

  await expect(page).toHaveURL(`/mlops/collection/${collectionId}/simulation`);
  await expect(page.locator('main')).toHaveAttribute('data-page-shell', 'full-bleed');

  const stage = page.getByTitle('시뮬레이션 화면');
  await expect(stage).toHaveAttribute('src', new RegExp(`https://${SIMULATION_HOST}/\\?room=[^&]+&name=MONITOR&spectate=1`));

  // 브리지 스냅샷이 데이터 패널을 채운다.
  const panel = page.getByRole('region', { name: '실시간 수집 데이터' });
  await expect(panel.getByText('참가자 1명 · OP-11 (VR)')).toBeVisible();
  await expect(panel.getByText('MISSION 01 · 전술 무전기 준비')).toBeVisible();
  await expect(panel.getByRole('log')).toContainText('radio_antenna → radio_antenna_port 결합');

  // 연결 안내에 방 코드와 접속 주소가 보인다.
  const connect = page.getByRole('region', { name: 'VR 접속 안내' });
  await expect(connect.getByLabel('방 코드', { exact: true })).toHaveText(/^[A-Z0-9]{4,}$/u);
  await expect(connect.getByLabel('헤드셋 접속 주소', { exact: true })).toContainText(`https://${SIMULATION_HOST}/?room=`);

  // 타일을 크게 보고 되돌린다.
  await page.getByRole('button', { name: '시뮬레이션 · 판교 정비창 크게 보기' }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('group', { name: '화면 전환' }).getByRole('button', { name: '실시간 수집 데이터' }).click();
  await expect(panel).toBeVisible();

  await page.getByRole('link', { name: '수집 콘솔로 돌아가기' }).click();
  await expect(page).toHaveURL(`/mlops/collection/${collectionId}`);
  await expect(page.getByRole('button', { name: '수집 콘솔 닫기' })).toBeVisible();
  issues.assertNone();
});
