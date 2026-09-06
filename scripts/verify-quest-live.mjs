import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const origin = process.argv[2] ?? 'http://127.0.0.1:5187';
const output = new URL('../artifacts/quest-live/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const headset = await browser.newContext({ viewport: { width: 540, height: 960 } });
  // Only the hardware API is emulated. Both clients use the real relay HTTP endpoints.
  await headset.addInitScript(() => {
    const names = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
      ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) => ['metacarpal', 'phalanx-proximal',
        'phalanx-intermediate', 'phalanx-distal', 'tip'].map((part) => `${finger}-finger-${part}`))];
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: () => Promise.resolve(true),
      requestSession: () => {
        let active = true;
        const listeners = new Set();
        return Promise.resolve({
          inputSources: ['left', 'right'].map((side) => ({ handedness: side,
            hand: new Map(names.map((name, index) => [name, { index, side }])) })),
          requestReferenceSpace: () => Promise.resolve({}),
          updateRenderState: () => undefined,
          requestAnimationFrame: (callback) => setTimeout(() => {
            if (active) callback(performance.now(), { getJointPose: ({ index, side }) => {
              const direction = side === 'left' ? -1 : 1;
              const finger = Math.max(0, Math.floor((index - 5) / 5));
              const segment = index < 5 ? index : (index - 5) % 5 + 1;
              return {
                transform: {
                  position: { x: direction * (0.18 + (index === 0 ? 0 : index < 5 ? -segment * 0.012 : (finger - 1.5) * 0.022)),
                    y: 1.2 + segment * 0.022, z: -0.45 + Math.sin(performance.now() / 1_000) * 0.015 },
                  orientation: { x: 0, y: 0, z: 0, w: 1 },
                }, radius: 0.006,
              };
            } });
          }, 16),
          cancelAnimationFrame: (handle) => clearTimeout(handle),
          addEventListener: (_type, listener) => listeners.add(listener),
          removeEventListener: (_type, listener) => listeners.delete(listener),
          end: () => { active = false; listeners.forEach((listener) => listener()); return Promise.resolve(); },
        });
      },
    } });
    globalThis.XRWebGLLayer = class { constructor() { this.framebuffer = null; } };
    globalThis.WebGLRenderingContext.prototype.makeXRCompatible = () => Promise.resolve();
  });
  const pc = await desktop.newPage();
  const quest = await headset.newPage();
  for (const page of [pc, quest]) page.on('pageerror', (error) => errors.push(error.message));
  await pc.goto(`${origin}/collect/quest?view=pc`);
  await expect(pc.getByRole('heading', { name: 'Quest 손 추적 · PC 보기' })).toBeVisible();
  await pc.getByRole('button', { name: 'Quest 연결 코드 만들기', exact: true }).click();
  const code = await pc.getByLabel('Quest 연결 코드', { exact: true }).innerText();
  assert.match(code, /^\d{6}$/u);
  await quest.goto(`${origin}/collect/quest?code=${code}`);
  await quest.getByRole('button', { name: '세션 연결', exact: true }).click();
  await expect(quest.getByRole('button', { name: 'MR 모드 시작' })).toBeEnabled();
  await quest.getByRole('button', { name: 'MR 모드 시작' }).click();
  await expect(pc.getByText('손 데이터 수신 중', { exact: true })).toBeVisible();
  await expect(pc.getByText('왼손 관절 25/25', { exact: true })).toBeVisible();
  await expect(pc.getByText('오른손 관절 25/25', { exact: true })).toBeVisible();
  await expect(pc.getByLabel('Quest 양손 3D 관절 캔버스')).toBeVisible();
  await pc.screenshot({ path: fileURLToPath(new URL('desktop.png', output)), fullPage: true });
  await quest.screenshot({ path: fileURLToPath(new URL('quest.png', output)), fullPage: true });
  await pc.setViewportSize({ width: 390, height: 844 });
  assert.equal(await pc.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
  await pc.screenshot({ path: fileURLToPath(new URL('mobile.png', output)), fullPage: true });
  await pc.setViewportSize({ width: 1280, height: 900 });
  await headset.setOffline(true);
  await expect(pc.getByText('수신 지연', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(pc.getByText('왼손 관절 0/25', { exact: true })).toBeVisible();
  await headset.setOffline(false);
  await expect(pc.getByText('손 데이터 수신 중', { exact: true })).toBeVisible({ timeout: 15_000 });
  await quest.getByRole('button', { name: 'MR 모드 종료' }).click();
  await expect(pc.getByText('Quest 추적 종료', { exact: true })).toBeVisible();
  await expect(pc.getByText('왼손 관절 0/25', { exact: true })).toBeVisible();
  await quest.getByRole('button', { name: 'MR 모드 시작' }).click();
  await expect(pc.getByText('손 데이터 수신 중', { exact: true })).toBeVisible();
  await quest.getByRole('button', { name: '다른 코드로 연결' }).click();
  await expect(quest.getByRole('textbox', { name: '6자리 페어링 코드' })).toBeVisible();
  await pc.getByRole('button', { name: '새 연결 코드 만들기' }).click();
  await expect(pc.getByLabel('Quest 연결 코드', { exact: true })).not.toHaveText(code);
  await pc.getByRole('button', { name: '연결 종료', exact: true }).click();
  await expect(pc.getByRole('button', { name: 'Quest 연결 코드 만들기', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: isolated PC/Quest clients, real HTTP relay, 25 joints per hand, 3D canvas, mobile layout, disconnect/reconnect, MR restart, code replacement, session cleanup. WebXR hardware was emulated.');
} finally {
  await browser.close();
}
