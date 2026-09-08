import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createQuestRelayHandler } from '../gateway/quest-relay.mjs';

const directory = resolve('artifacts', `browser-cameras-${Date.now()}`);
await mkdir(directory, { recursive: true });
const handler = createQuestRelayHandler({ collectionDirectory: directory });
const relay = createServer(handler);
handler.attachStream(relay);
await new Promise((done) => relay.listen(0, '127.0.0.1', done));
const vite = await createViteServer({ mode: 'patrol', configLoader: 'runner', server: {
  host: '127.0.0.1', port: 5201, strictPort: true,
  proxy: { '/api/quest': { target: `http://127.0.0.1:${relay.address().port}`, ws: true } },
} });
let browser;
const errors = [];
try {
  await vite.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const pc = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // 테스트용 PNG 응답으로 실제 GPU 없이 캡처→분석 카드 경로를 검증한다.
  await pc.route('**/api/perception/*/infer', async (route) => {
    const mode = route.request().url().includes('/full-body/') ? 'full-body' : 'head';
    assert.equal(route.request().headers()['content-type'], 'image/jpeg');
    assert.ok(route.request().postDataBuffer().length > 0);
    await route.fulfill({ contentType: 'image/png', headers: { 'x-perception-mode': mode, 'x-detection-count': '0' },
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  });
  pc.on('pageerror', (error) => errors.push(error.message));
  const origin = 'http://127.0.0.1:5201';
  const created = await pc.request.post(`${origin}/api/quest/collections`, { data: {
    name: '브라우저 카메라 검증', projectId: 'project-tiger', siteId: 'site-lab', taskId: 'camera-test', instruction: '카메라 3대 연결', questDeviceId: 'quest-camera-test',
  } });
  assert.equal(created.status(), 201);
  const collection = await created.json();
  await pc.goto(`${origin}/mlops/collection/${collection.id}/setup`);
  await expect(pc.getByRole('dialog', { name: 'Quest 연결', exact: true })).toBeVisible();
  await expect(pc.getByRole('button', { name: '카메라 연결', exact: true })).toHaveCount(0);
  await pc.goto(`${origin}/mlops/collection/${collection.id}`);
  const mainPreview = pc.locator('[data-preview-workspace]');
  await expect(mainPreview.getByRole('region', { name: '브라우저 카메라 연동', exact: true })).toBeVisible();
  await pc.getByRole('tab', { name: '수집 상태', exact: true }).click();
  await pc.getByRole('button', { name: '카메라 연결', exact: true }).click();
  const settings = pc.getByRole('dialog', { name: '카메라 연결', exact: true });
  const senders = [];
  for (const [name, role] of [['Head 정면', 'Head · 헤드캠'], ['Head 측면', 'Head · 헤드캠'], ['Full body 정면', 'Full body · 전신']]) {
    await settings.getByRole('combobox', { name: '카메라 용도' }).click();
    await pc.getByRole('option', { name: role, exact: true }).click();
    await settings.getByLabel('카메라 이름 · 선택').fill(name);
    await settings.getByRole('button', { name: '카메라 추가', exact: true }).click();
    const card = pc.locator(`section[aria-label="${name} 카메라"]`);
    const manager = settings.getByRole('region', { name: `${name} 설정`, exact: true });
    if (senders.length === 0) await pc.screenshot({ path: resolve(directory, 'pairing-card.png'), fullPage: true });
    const code = await manager.getByLabel(`${name} 연결 코드`).innerText();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/collect/camera?code=${code}`);
    await page.getByRole('button', { name: '세션 연결', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(role, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '카메라 시작', exact: true }).click();
    await expect(page.getByText('PC로 영상 전송 중', { exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(manager.getByText('영상 수신 중', { exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(mainPreview.locator(`section[aria-label="${name} 카메라"]`)).toBeVisible();
    await expect(pc.locator('aside').getByRole('region', { name: `${name} 카메라`, exact: true })).toHaveCount(0);
    await expect.poll(() => card.locator('video').evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(2);
    senders.push({ name, page, card, manager });
  }
  await settings.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(settings).toHaveCount(0);
  for (const sender of senders) {
    const { name } = sender;
    const analysis = mainPreview.getByRole('region', { name: `${name} · ${name.startsWith('Head') ? '세그멘테이션 + 핸드' : '4D Humans'}`, exact: true });
    await expect(analysis.getByText('분석 수신 중', { exact: true })).toBeVisible({ timeout: 15_000 });
    await analysis.getByRole('button', { name: `${name} 분석 정지` }).click();
    await expect(analysis.locator('img')).not.toHaveAttribute('src');
    await expect(sender.card.getByText('영상 수신 중', { exact: true })).toBeVisible();
    await analysis.getByRole('button', { name: `${name} 분석 시작` }).click();
    await expect(analysis.getByText('분석 수신 중', { exact: true })).toBeVisible();
  }
  for (const sender of senders) {
    await expect(sender.card.locator('button, input, output')).toHaveCount(0);
    await expect(sender.card.locator('video')).not.toHaveAttribute('controls');
    await expect(sender.page.getByRole('combobox')).toHaveCount(0);
  }
  for (const sender of senders) {
    const previousFrames = await sender.card.locator('video').evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames);
    await expect.poll(() => sender.card.locator('video').evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(previousFrames);
  }
  await expect(mainPreview.getByRole('button', { name: '카메라 설정' })).toHaveCount(0);
  for (const angle of [90, 180, 270, 0]) {
    await senders[0].page.getByRole('button', { name: '90° 회전', exact: true }).click();
    await expect(senders[0].card.locator('video')).toHaveAttribute('style', new RegExp(`rotate\\(${angle}deg\\)`));
    await expect(senders[0].page.locator('video')).toHaveAttribute('style', new RegExp(`rotate\\(${angle}deg\\)`));
    if (angle === 90) await pc.screenshot({ path: resolve(directory, 'rotation-90.png'), fullPage: true });
  }
  await pc.screenshot({ path: resolve(directory, 'three-cameras.png'), fullPage: true });
  await senders[0].page.screenshot({ path: resolve(directory, 'sender-mobile.png'), fullPage: true });
  // Switching inspector tabs must not tear down camera peers.
  await pc.getByRole('tab', { name: '세션 정보', exact: true }).click();
  await pc.getByRole('tab', { name: '수집 상태', exact: true }).click();
  for (const sender of senders) await expect(mainPreview.getByRole('region', { name: `${sender.name} 카메라`, exact: true })).toBeVisible();
  for (const sender of senders) await expect.poll(() => sender.card.locator('video').evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(2);
  // Reload the PC and renegotiate with already paired senders.
  await pc.reload();
  await expect(mainPreview.getByRole('region', { name: '브라우저 카메라 연동', exact: true })).toBeVisible();
  await pc.getByRole('tab', { name: '수집 상태', exact: true }).click();
  await pc.getByRole('button', { name: '카메라 연결', exact: true }).click();
  for (const sender of senders) await expect(sender.manager.getByText('영상 수신 중', { exact: true })).toBeVisible({ timeout: 35_000 });
  // Removing one camera must revoke its sender without stopping the others.
  await senders[0].manager.getByText('관리', { exact: true }).click();
  await senders[0].manager.getByRole('button', { name: '카메라 제거' }).click();
  await expect(senders[0].card).toHaveCount(0);
  await expect(senders[0].page.getByRole('alert')).toContainText('만료', { timeout: 10_000 });
  assert.equal(await senders[0].page.locator('video').evaluate((video) => video.srcObject === null), true);
  for (const sender of senders.slice(1)) await expect(sender.manager.getByText('영상 수신 중', { exact: true })).toBeVisible();
  // New code revokes old credentials and allows a fresh sender to attach.
  await senders[1].manager.getByText('관리', { exact: true }).click();
  await senders[1].manager.getByRole('button', { name: '새 코드 받기' }).click();
  const renewedCode = await senders[1].manager.getByLabel(`${senders[1].name} 연결 코드`).innerText();
  await expect(senders[1].page.getByRole('alert')).toContainText('권한', { timeout: 10_000 });
  await senders[1].page.getByText('카메라 설정', { exact: true }).click();
  await senders[1].page.getByRole('button', { name: '다른 코드로 연결' }).click();
  await senders[1].page.getByLabel('6자리 카메라 연결 코드').fill(renewedCode);
  await senders[1].page.getByRole('button', { name: '세션 연결', exact: true }).click();
  await senders[1].page.getByRole('button', { name: '카메라 시작', exact: true }).click();
  await expect(senders[1].manager.getByText('영상 수신 중', { exact: true })).toBeVisible({ timeout: 35_000 });
  await senders[2].page.getByRole('button', { name: '카메라 정지', exact: true }).click();
  assert.equal(await senders[2].page.locator('video').evaluate((video) => video.srcObject === null), true);
  await settings.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(settings).toHaveCount(0);
  for (const width of [768, 1024, 1440]) {
    await pc.setViewportSize({ width, height: 900 });
    await expect(pc.getByRole('region', { name: '브라우저 카메라 연동', exact: true })).toBeVisible();
    assert.equal(await pc.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    await pc.screenshot({ path: resolve(directory, `pc-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(directory, 'result.json'), JSON.stringify({ passed: true, cameras: 3, roles: ['head', 'head', 'full-body'], errors,
    checks: ['separate Quest and camera dialogs', 'sender rotation synced to PC', 'real HTTP pairing', 'real WebRTC video frames', 'preview without controls', 'settings preserve video', 'inspector tabs', 'PC reload', 'isolated removal', 'code renewal', 'sender track cleanup', '768/1024/1440 layouts'],
    hardware: 'Chromium fake video capture; real hardware latency not measured' }, null, 2));
  console.log(`Browser camera verification passed: ${directory}`);
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    await page.screenshot({ path: resolve(directory, `failure-${Date.now()}-${Math.random().toString(36).slice(2)}.png`), fullPage: true }).catch(() => undefined);
  }
  await writeFile(resolve(directory, 'errors.json'), JSON.stringify({ errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close(); await vite.close();
  await new Promise((done) => { relay.close(done); relay.closeAllConnections(); });
}
