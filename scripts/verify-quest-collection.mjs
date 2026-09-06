import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createQuestRelayHandler } from '../gateway/quest-relay.mjs';

const directory = resolve('artifacts', `quest-collection-test-${Date.now()}`);
await mkdir(directory, { recursive: true });
const relay = createServer(createQuestRelayHandler({ collectionDirectory: directory }));
await new Promise((done) => relay.listen(0, '127.0.0.1', done));
const vite = await createViteServer({ mode: 'patrol', configLoader: 'runner', server: {
  host: '127.0.0.1', port: 5199, strictPort: true,
  proxy: { '/api/quest': `http://127.0.0.1:${relay.address().port}` },
} });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const pcContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const questContext = await browser.newContext();
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
            if (active) callback(performance.now(), { getJointPose: ({ side, index }) => ({ transform: {
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
  const errors = [];
  for (const page of [pc, quest]) page.on('pageerror', (error) => errors.push(error.message));
  await pc.goto('http://127.0.0.1:5199/mlops/collection');
  await expect(pc.getByRole('link', { name: '새 수집', exact: true })).toBeVisible();
  await pc.getByRole('link', { name: '새 수집', exact: true }).click();
  const dialog = pc.getByRole('dialog', { name: '새 데이터 수집' });
  await dialog.getByRole('textbox', { name: '세션 이름' }).fill('실제 연결 경로 검증');
  await dialog.getByRole('textbox', { name: '작업 ID' }).fill('test-task');
  await dialog.getByRole('textbox', { name: '작업 지시' }).fill('양손으로 물체를 집어 올립니다.');
  await dialog.getByRole('textbox', { name: 'Quest 손 추적 장치 ID' }).fill('test-quest');
  await expect(dialog.getByRole('textbox', { name: '외골격 장치 ID' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '세션 생성' }).click();
  const code = await pc.getByLabel('Quest pairing code').innerText();
  assert.match(code, /^\d{6}$/u);
  await pc.screenshot({ path: resolve(directory, 'pairing.png'), fullPage: true });
  await quest.goto(`http://127.0.0.1:5199/collect/quest?code=${code}`);
  await quest.getByRole('button', { name: '세션 연결', exact: true }).click();
  await quest.getByRole('button', { name: 'MR 모드 시작' }).click();
  await pc.getByRole('button', { name: '수집 콘솔 열기' }).click();
  await expect(pc.getByLabel('Quest 양손 3D 관절 캔버스')).toBeVisible();
  await expect(pc.getByRole('button', { name: 'Episode 녹화 시작', exact: true })).toBeEnabled({ timeout: 15_000 });
  await pc.screenshot({ path: resolve(directory, 'collection-ready.png'), fullPage: true });
  const collectionId = new URL(pc.url()).pathname.split('/').at(-1);
  await pc.getByRole('button', { name: 'Episode 녹화 시작', exact: true }).click();
  await expect(quest.getByLabel('Collector 운영 상태')).toContainText('녹화 중', { timeout: 15_000 });
  await expect.poll(async () => {
    const response = await pc.request.get(`http://127.0.0.1:5199/api/quest/collections/${collectionId}`);
    return (await response.json()).episodes[0]?.frameCount ?? 0;
  }).toBeGreaterThan(5);
  await pc.getByRole('button', { name: 'Episode 녹화 정지' }).click();
  await expect(pc.getByRole('button', { name: '녹화본 저장', exact: true })).toBeEnabled({ timeout: 15_000 });
  await pc.getByRole('button', { name: '녹화본 저장', exact: true }).click();
  await expect(pc.getByText('저장 완료 1개', { exact: true })).toBeVisible();
  const files = await readdir(directory);
  const metadata = JSON.parse(await readFile(resolve(directory, `${collectionId}.json`), 'utf8'));
  const rawFile = files.find((name) => name.endsWith('.ndjson'));
  assert.ok(rawFile);
  const frames = (await readFile(resolve(directory, rawFile), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(frames.length > 5);
  assert.equal(frames[0].hands.left.joints.length, 25);
  assert.equal(metadata.episodes[0].outcome, 'success');
  await pc.reload();
  await expect(pc.getByText('저장 완료 1개', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(`PASS: collection menu → new session → pairing → same-session console → recording → stop ACK → saved raw file → PC reload. ${frames.length} real HTTP frames from emulated WebXR. Evidence: ${directory}`);
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((done) => { relay.close(done); relay.closeAllConnections(); });
}
