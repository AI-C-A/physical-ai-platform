import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createQuestRelayHandler } from '../gateway/quest-relay.mjs';

const directory = resolve('artifacts', `quest-collection-test-${Date.now()}`);
await mkdir(directory, { recursive: true });
const handler = createQuestRelayHandler({ collectionDirectory: directory });
// 느린 저장 응답이 실시간 미리보기를 막지 않는지 검증한다.
const batchDelayMs = Number(process.env.QUEST_VERIFY_BATCH_DELAY_MS ?? 120);
const relay = createServer(async (request, response) => {
  if (request.url?.endsWith('/batches')) await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
  await handler(request, response);
});
handler.attachStream(relay);
await new Promise((done) => relay.listen(0, '127.0.0.1', done));
const vite = await createViteServer({ mode: process.env.QUEST_VERIFY_MODE ?? 'patrol', configLoader: 'runner', server: {
  host: '127.0.0.1', port: 5199, strictPort: true,
  proxy: { '/api/quest': { target: `http://127.0.0.1:${relay.address().port}`, ws: true } },
} });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const pcContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const questContext = await browser.newContext();
  const direct = process.env.QUEST_VERIFY_DIRECT !== '0';
  if (!direct) for (const context of [pcContext, questContext]) await context.addInitScript(() => { globalThis.RTCPeerConnection = undefined; });
  await questContext.addInitScript(() => {
    const names = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
      ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((part) => `${finger}-finger-${part}`))];
    Object.defineProperty(navigator, 'xr', { value: {
      isSessionSupported: () => Promise.resolve(true),
      requestSession: () => {
        let active = true;
        const listeners = new Set();
        return Promise.resolve({
          inputSources: ['left', 'right'].map((side) => ({ handedness: side, hand: new Map(names.map((name, index) => [name, { side, index }])) })),
          requestReferenceSpace: () => Promise.resolve({}), updateRenderState: () => undefined,
          requestAnimationFrame: (callback) => setTimeout(() => {
            if (active) callback(performance.now(), { getViewerPose: () => ({ transform: { position: { x: 0, y: 1.4, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }), getJointPose: ({ side, index }) => ({ transform: {
              position: { x: (side === 'left' ? -0.18 : 0.18) + Math.floor(index / 5) * 0.015, y: 1.2 + index % 5 * 0.02, z: -0.3 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            }, radius: 0.008 }) });
          }, 16),
          cancelAnimationFrame: (handle) => clearTimeout(handle),
          addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener),
          end: () => { active = false; listeners.forEach((listener) => listener()); return Promise.resolve(); },
        });
      },
    }, configurable: true });
    globalThis.XRWebGLLayer = class { constructor() { this.framebuffer = null; } };
    globalThis.WebGLRenderingContext.prototype.makeXRCompatible = () => Promise.resolve();
  });
  const pc = await pcContext.newPage();
  const quest = await questContext.newPage();
  await pc.route('**/api/perception/*/infer', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '이 검증에서는 영상 분석 서비스를 사용하지 않습니다.' }) }));
  const errors = [];
  let headsetTimeOrigin = null;
  for (const page of [pc, quest]) page.on('pageerror', (error) => errors.push(error.message));
  await pc.goto('http://127.0.0.1:5199/mlops/collection');
  await expect(pc.getByRole('link', { name: '새 수집', exact: true })).toBeVisible();
  await pc.getByRole('link', { name: '새 수집', exact: true }).click();
  const dialog = pc.getByRole('dialog', { name: '새 데이터 수집' });
  await dialog.getByRole('textbox', { name: '세션 이름' }).fill('실제 연결 경로 검증');
  await dialog.getByRole('textbox', { name: '작업 지시' }).fill('양손으로 물체를 집어 올립니다.');
  await expect(dialog.getByRole('textbox', { name: /장치 ID|카메라 ID/u })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: '외골격 장치 ID' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '세션 생성' }).click();
  if (await pc.getByRole('tab', { name: '장치', exact: true }).getAttribute('aria-selected') !== 'true') await pc.getByRole('tab', { name: '장치', exact: true }).click();
  await pc.getByRole('button', { name: 'Quest 연결', exact: true }).click();
  const code = await pc.getByLabel('Quest 연결 코드').innerText();
  assert.match(code, /^\d{6}$/u);
  await pc.screenshot({ path: resolve(directory, 'pairing.png'), fullPage: true });
  await quest.goto(`http://127.0.0.1:5199/collect/quest?code=${code}`);
  headsetTimeOrigin = await quest.evaluate(() => performance.timeOrigin);
  await quest.getByRole('button', { name: '연결', exact: true }).click();
  await quest.getByRole('button', { name: '손 추적 시작' }).click();
  await expect(pc.getByRole('dialog', { name: 'Quest 연결' })).toHaveCount(0);
  await expect(pc.getByRole('region', { name: 'Quest 손 추적 장치' })).toBeVisible();
  await expect(pc.getByLabel('Quest 양손 3D 손 모델 캔버스')).toBeVisible();
  await expect(pc.getByRole('button', { name: 'Episode 녹화 시작', exact: true })).toBeEnabled({ timeout: 15_000 });
  await pc.screenshot({ path: resolve(directory, 'collection-ready.png'), fullPage: true });
  const collectionId = new URL(pc.url()).pathname.split('/').at(-1);
  for (const [label, button] of [['헤드캠 1', '헤드캠 연결'], ['전신 카메라 1', '전신 카메라 연결']]) {
    await pc.getByRole('button', { name: '카메라 연결', exact: true }).click();
    const settings = pc.getByRole('dialog', { name: '카메라 연결', exact: true });
    await settings.getByRole('button', { name: button, exact: true }).click();
    const cameraCode = await settings.getByLabel(`${label} 연결 코드`).innerText({ timeout: 10_000 }).catch(async (error) => { console.error(await pc.locator('body').innerText()); await pc.screenshot({ path: resolve(directory, 'camera-failure.png'), fullPage: true }); throw error; });
    const sender = await browser.newPage();
    sender.on('pageerror', (error) => errors.push(error.message));
    await sender.goto(`http://127.0.0.1:5199/collect/camera?code=${cameraCode}`);
    await sender.getByRole('button', { name: '연결', exact: true }).click();
    await sender.getByRole('button', { name: '영상 전송 시작', exact: true }).click();
    await expect(pc.getByRole('region', { name: `${label} 설정`, exact: true }).getByText('영상 수신 중', { exact: true })).toBeVisible({ timeout: 35_000 });
  }
  await pc.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
  await expect(quest.getByLabel('Collector 운영 상태')).toContainText('녹화 중', { timeout: 15_000 });
  await expect.poll(async () => {
    const response = await pc.request.get(`http://127.0.0.1:5199/api/quest/collections/${collectionId}`);
    return (await response.json()).episodes[0]?.frameCount ?? 0;
  }).toBeGreaterThan(5);
  await expect(pc.locator('[data-hand-pose-viewer]')).toHaveAttribute('data-hand-transport', direct ? 'webrtc' : 'websocket', { timeout: 15_000 });
  await pc.evaluate(() => {
    const samples = [];
    Reflect.set(globalThis, '__questRenderSamples', samples);
    const element = globalThis.document.querySelector('[data-hand-pose-viewer]');
    new globalThis.MutationObserver(() => {
      const source = Number(element.getAttribute('data-hand-frame-timestamp'));
      if (samples.at(-1)?.source === source) return;
      if (samples.length >= 1_000) samples.shift();
      samples.push({ source, at: performance.timeOrigin + performance.now() });
    }).observe(element, { attributes: true, attributeFilter: ['data-hand-frame-timestamp'] });
  });
  const measurementStart = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  const samples = await pc.evaluate(() => Reflect.get(globalThis, '__questRenderSamples'));
  const durationMs = performance.now() - measurementStart;
  const ages = samples.map((sample) => sample.at - headsetTimeOrigin - sample.source).sort((a, b) => a - b);
  const metrics = { transport: direct ? 'webrtc' : 'websocket', measurement: 'XR 생성부터 PC DOM 반영까지', batchDelayMs, durationMs, receivedFrames: samples.length,
    receivedFps: samples.length / durationMs * 1_000,
    frameAgeP50Ms: ages[Math.floor(ages.length * 0.5)], frameAgeP95Ms: ages[Math.floor(ages.length * 0.95)],
    environment: '동일 Mac의 Chrome 두 컨텍스트, WebXR 하드웨어 모사, 로컬 Vite + 실제 gateway' };
  await writeFile(resolve(directory, 'latency.json'), JSON.stringify(metrics, null, 2));
  await pc.screenshot({ path: resolve(directory, 'collection-recording.png'), fullPage: true });
  assert.ok(metrics.receivedFps > 25, `실시간 프레임 수신 부족: ${JSON.stringify(metrics)}`);
  await pc.getByRole('button', { name: 'Episode 녹화 정지' }).click();
  await expect(pc.getByRole('button', { name: '녹화본 저장', exact: true })).toBeEnabled({ timeout: 15_000 });
  const reviewViews = pc.getByRole('region', { name: '녹화 검토', exact: true });
  await expect(reviewViews.getByRole('heading', { name: '손·머리 위치 원본' })).toBeVisible();
  for (const label of ['헤드캠 1', '전신 카메라 1']) {
    const recordedVideo = reviewViews.getByLabel(`${label} 녹화 영상`, { exact: true });
    await expect.poll(() => recordedVideo.evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(2);
    await recordedVideo.evaluate((video) => video.play());
    await expect.poll(() => recordedVideo.evaluate((video) => video.currentTime)).toBeGreaterThan(0);
  }
  await pc.screenshot({ path: resolve(directory, 'recording-review-all-views.png'), fullPage: true });
  await pc.getByRole('button', { name: '녹화본 저장', exact: true }).click();
  await expect(pc.getByText('저장 완료 1개', { exact: true })).toBeVisible();
  const files = await readdir(directory);
  const metadata = JSON.parse(await readFile(resolve(directory, `${collectionId}.json`), 'utf8'));
  const rawFile = files.find((name) => name.endsWith('.ndjson'));
  assert.ok(rawFile);
  const frames = (await readFile(resolve(directory, rawFile), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(frames.length > 5);
  assert.equal(frames[0].hands.left.joints.length, 25);
  frames.forEach((frame, index) => assert.equal(frame.sequence, index, '녹화 원본 sequence 유실'));
  console.log(`실시간 수신 측정: ${JSON.stringify(metrics)}`);
  assert.equal(metadata.episodes[0].outcome, 'success');
  await pc.reload();
  await expect(pc.getByText('저장 완료 1개', { exact: true })).toBeVisible();
  for (const label of ['헤드캠 1', '전신 카메라 1']) {
    await expect(pc.getByRole('region', { name: `${label} 설정`, exact: true }).getByText('영상 수신 중', { exact: true })).toBeVisible({ timeout: 35_000 });
  }
  await pc.getByRole('button', { name: '다음 Episode 녹화 시작', exact: true }).click();
  await expect.poll(async () => (await (await pc.request.get(`http://127.0.0.1:5199/api/quest/collections/${collectionId}`)).json()).episodes[1]?.frameCount ?? 0).toBeGreaterThan(5);
  await pc.getByRole('button', { name: 'Episode 녹화 정지' }).click();
  await expect(pc.getByRole('button', { name: '녹화본 저장', exact: true })).toBeEnabled({ timeout: 15_000 });
  await pc.getByRole('button', { name: '녹화본 저장', exact: true }).click();
  await expect(pc.getByText('저장 완료 2개', { exact: true })).toBeVisible();
  const saved = JSON.parse(await readFile(resolve(directory, `${collectionId}.json`), 'utf8'));
  assert.ok(saved.episodes.every((episode) => episode.outcome === 'success' && episode.videos.length === 2 && episode.videos.every((video) => video.bytesWritten > 0)));
  const sessionUrl = pc.url();
  await pc.getByRole('tab', { name: /^에피소드/u }).click();
  const library = pc.getByRole('region', { name: '저장 에피소드', exact: true });
  await expect(library.getByRole('button', { name: 'Episode 02 재생', exact: true })).toBeVisible();
  await expect.poll(() => library.getByLabel('Episode 02 썸네일').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(2);
  const streamsBefore = await pc.locator('video').evaluateAll((videos) => videos.flatMap((video) => video.srcObject ? [video.srcObject.id] : []).sort());
  await library.getByRole('button', { name: 'Episode 02 재생', exact: true }).click();
  const recordings = pc.getByRole('region', { name: '에피소드 재생', exact: true });
  const sessionVideo = recordings.getByLabel('헤드캠 1 녹화 영상', { exact: true });
  await expect.poll(() => sessionVideo.evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(2);
  await sessionVideo.evaluate((video) => video.play());
  await expect.poll(() => sessionVideo.evaluate((video) => video.currentTime)).toBeGreaterThan(0);
  await library.getByRole('button', { name: 'Episode 01 재생', exact: true }).click();
  await expect(recordings.getByRole('link', { name: '손·머리 원본 다운로드' })).toHaveAttribute('href', new RegExp(metadata.episodes[0].id));
  await expect(library.getByRole('button', { name: 'Episode 01 재생', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const thumbnail = library.getByLabel('Episode 01 썸네일');
  await expect.poll(async () => (await thumbnail.boundingBox())?.width ?? 0).toBeGreaterThan(110);
  await pc.screenshot({ path: resolve(directory, 'session-episode-playback.png'), fullPage: true });
  await recordings.getByRole('button', { name: '실시간 수집 보기', exact: true }).click();
  await expect(recordings).toHaveCount(0);
  assert.deepEqual(await pc.locator('video').evaluateAll((videos) => videos.flatMap((video) => video.srcObject ? [video.srcObject.id] : []).sort()), streamsBefore);
  assert.equal(pc.url(), sessionUrl);
  await expect(pc.getByRole('button', { name: '다음 Episode 녹화 시작', exact: true })).toBeEnabled();
  assert.equal(metadata.episodes[0].videos.length, 2);
  assert.ok(metadata.episodes[0].videos.every((video) => video.status === 'completed' && video.bytesWritten > 0));
  await pc.goto('http://127.0.0.1:5199/mlops/episodes');
  await expect(pc.getByRole('heading', { name: '수집 에피소드', exact: true })).toBeVisible();
  await pc.getByRole('link', { name: 'Episode 01', exact: true }).click();
  await expect(pc.getByRole('link', { name: '손·머리 원본 다운로드' })).toBeVisible();
  for (const video of metadata.episodes[0].videos) {
    const player = pc.getByLabel(`${video.label} 녹화 영상`, { exact: true });
    await expect.poll(() => player.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
    await player.evaluate((element) => element.play());
    await expect.poll(() => player.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
    const response = await pc.request.get(`http://127.0.0.1:5199/api/quest/collections/${collectionId}/media?episodeId=${metadata.episodes[0].id}&videoId=${video.id}`, { headers: { Range: 'bytes=0-15' } });
    assert.equal(response.status(), 206);
    assert.equal((await response.body()).length, 16);
  }
  await pc.screenshot({ path: resolve(directory, 'episode-playback.png'), fullPage: true });
  await pc.reload();
  await expect(pc.getByRole('heading', { name: 'Episode 01', exact: true })).toBeVisible();
  await pc.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => pc.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await pc.screenshot({ path: resolve(directory, 'episode-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: collection menu → new session → same-session console → pairing → recording → stop ACK → saved raw file → PC reload. ${frames.length} real HTTP frames from emulated WebXR. Evidence: ${directory}`);
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((done) => { relay.close(done); relay.closeAllConnections(); });
}
