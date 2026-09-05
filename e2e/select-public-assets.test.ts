// @vitest-environment node

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { selectPublicAssets } from '../scripts/select-public-assets';

const fixturePrefix = 'army-public-assets-';
const directories: string[] = [];
const productionFiles = [
  'assets/army-tiger-logo.png',
  'assets/go2_walk.glb',
  'assets/unitree-g1.glb',
  'assets/unitree-g1.LICENSE.txt',
  'assets/unitree-g1.NOTICE.txt',
  'assets/openarm-bimanual.glb',
  'assets/openarm-bimanual-five-finger.glb',
  'assets/openarm-bimanual.LICENSE.txt',
  'assets/openarm-bimanual.NOTICE.txt',
  'assets/sites/pangyo-v1.glb',
  'assets/app-current.js',
];
const simulationFiles = [
  'assets/low-altitude-first-person-pov.mp4',
  'assets/flywheel/humanoid-camera-head-rgb.png',
  'assets/flywheel/humanoid-camera-head-mask.svg',
  'assets/flywheel/new-simulation-image.png',
  'assets/interventions/ambiguous-grasp-target.png',
  'assets/interventions/military-logistics-route-blocked.png',
  'assets/interventions/new-simulation-image.png',
];

async function runHook(
  hook: Plugin['configResolved'] | Plugin['closeBundle'] | Plugin['configureServer'],
  args: readonly unknown[] = [],
): Promise<void> {
  if (hook === undefined || hook === null) throw new Error('플러그인 hook을 찾지 못했습니다.');
  const handler = typeof hook === 'function' ? hook : hook.handler;
  const result: unknown = Reflect.apply(handler, {}, args);
  await result;
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), fixturePrefix));
  directories.push(root);
  const outDir = join('release', 'physical');
  const output = join(root, outDir);
  const publicDir = join(root, 'public');
  await mkdir(publicDir, { recursive: true });
  const files = [...productionFiles, ...simulationFiles];
  await Promise.all(files.map(async (file) => {
    const target = join(output, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `fixture:${file}`);
  }));
  await writeFile(join(output, 'runtime-config.json'), '{"environment":"simulation"}');
  await writeFile(join(output, 'runtime-config.patrol.json'), '{"environment":"physical"}');
  return { root, output, config: { root, publicDir, build: { outDir }, command: 'build' } };
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith(fixturePrefix)) {
      throw new Error('테스트 임시 폴더 경로를 확인하지 못했습니다.');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('실행 환경별 공개 빌드 자산', () => {
  it('Real 빌드의 실제 outDir에서 데모만 제외하고 모델·지도·라이선스를 보존한다', async () => {
    const fixture = await createFixture();
    const plugin = selectPublicAssets('patrol');
    await runHook(plugin.configResolved, [fixture.config]);
    await runHook(plugin.closeBundle);

    expect(await readFile(join(fixture.output, 'runtime-config.json'), 'utf8')).toBe('{"environment":"physical"}');
    await expect(access(join(fixture.output, 'runtime-config.patrol.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    for (const file of simulationFiles) {
      await expect(access(join(fixture.output, file))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    for (const file of productionFiles) {
      expect(await readFile(join(fixture.output, file), 'utf8')).toBe(`fixture:${file}`);
    }
  });

  it('Mock 빌드에는 모든 데모 자산과 Mock 설정을 남긴다', async () => {
    const fixture = await createFixture();
    const plugin = selectPublicAssets('mock');
    await runHook(plugin.configResolved, [fixture.config]);
    await runHook(plugin.closeBundle);

    expect(await readFile(join(fixture.output, 'runtime-config.json'), 'utf8')).toBe('{"environment":"simulation"}');
    for (const file of simulationFiles) await expect(access(join(fixture.output, file))).resolves.toBeUndefined();
    await expect(access(join(fixture.output, 'runtime-config.patrol.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('개발 서버를 닫을 때 기존 빌드 산출물을 변경하지 않는다', async () => {
    const fixture = await createFixture();
    const plugin = selectPublicAssets('patrol');
    await runHook(plugin.configResolved, [{ ...fixture.config, command: 'serve' }]);
    await runHook(plugin.closeBundle);

    expect(await readFile(join(fixture.output, 'runtime-config.json'), 'utf8')).toBe('{"environment":"simulation"}');
    for (const file of simulationFiles) await expect(access(join(fixture.output, file))).resolves.toBeUndefined();
  });

  it('Real 설정이 누락되면 Mock 설정을 남긴 채 빌드 성공으로 처리하지 않는다', async () => {
    const fixture = await createFixture();
    await rm(join(fixture.output, 'runtime-config.patrol.json'));
    const plugin = selectPublicAssets('patrol');
    await runHook(plugin.configResolved, [fixture.config]);
    await expect(runHook(plugin.closeBundle)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(fixture.output, 'runtime-config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['.', 'public'])('소스 폴더를 출력 위치 %s로 쓰면 삭제 전에 거부한다', async (outDir) => {
    const fixture = await createFixture();
    const plugin = selectPublicAssets('patrol');
    await expect(runHook(plugin.configResolved, [{ ...fixture.config, build: { outDir } }])).rejects.toThrow('빌드 출력 폴더');
  });

  it('Real 개발 설정을 읽지 못하면 Mock 설정으로 넘어가지 않고 오류 응답을 반환한다', async () => {
    const fixture = await createFixture();
    type Response = { statusCode: number; setHeader: (name: string, value: string) => void; end: (content: string | Buffer) => void };
    type Middleware = (request: unknown, response: Response) => void;
    let middleware: Middleware | null = null;
    const use = vi.fn((path: string, handler: Middleware) => {
      expect(path).toBe('/runtime-config.json');
      middleware = handler;
    });
    await runHook(selectPublicAssets('patrol').configureServer, [{ config: fixture.config, middlewares: { use } }]);
    const runMiddleware = middleware as Middleware | null;
    if (runMiddleware === null) throw new Error('Real 설정 middleware가 등록되지 않았습니다.');
    const response = { statusCode: 0, setHeader: vi.fn(), end: (content: string | Buffer) => { void content; return undefined; } };
    const body = await new Promise<string>((complete) => {
      response.end = (content) => { complete(content.toString()); return undefined; };
      runMiddleware({}, response);
    });
    expect(response.statusCode).toBe(503);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(body).toContain('실제 장치 연결 설정을 불러오지 못했습니다.');
    expect(body).not.toContain(fixture.root);
  });
});
