// @vitest-environment node

import {
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertFreshBuildArtifact,
  readMockRuntimeConfigArtifact,
} from './build-freshness';

const temporaryDirectories: string[] = [];

async function createFixture(): Promise<{
  readonly distIndexPath: string;
  readonly distRuntimeConfigPath: string;
  readonly publicDirectory: string;
  readonly runtimeConfigPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'robot-army-build-freshness-'));
  temporaryDirectories.push(root);
  const distDirectory = join(root, 'dist');
  const publicDirectory = join(root, 'public');
  const distIndexPath = join(distDirectory, 'index.html');
  const distRuntimeConfigPath = join(distDirectory, 'runtime-config.json');
  const runtimeConfigPath = join(publicDirectory, 'runtime-config.json');
  await Promise.all([
    mkdir(distDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(distIndexPath, '<html>current</html>', 'utf8'),
    writeFile(
      distRuntimeConfigPath,
      JSON.stringify({
        adapters: { implementation: 'in-memory', mode: 'bundle' },
      }),
      'utf8',
    ),
    writeFile(runtimeConfigPath, '{}', 'utf8'),
  ]);
  return {
    distIndexPath,
    distRuntimeConfigPath,
    publicDirectory,
    runtimeConfigPath,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('브라우저 검증 build freshness', () => {
  it('public 입력이 dist보다 최신이면 이전 build 실행을 거부한다', async () => {
    const fixture = await createFixture();
    const older = new Date('2026-08-24T00:00:00.000Z');
    const newer = new Date('2026-08-24T00:01:00.000Z');
    await utimes(fixture.distIndexPath, older, older);
    await utimes(fixture.runtimeConfigPath, newer, newer);

    await expect(
      assertFreshBuildArtifact(fixture.distIndexPath, [
        fixture.publicDirectory,
      ]),
    ).rejects.toThrow('dist가 현재 source보다 오래됐습니다.');
  });

  it('dist가 모든 입력보다 최신이면 현재 HTML을 반환한다', async () => {
    const fixture = await createFixture();
    const older = new Date('2026-08-24T00:00:00.000Z');
    const newer = new Date('2026-08-24T00:01:00.000Z');
    await utimes(fixture.runtimeConfigPath, older, older);
    await utimes(fixture.publicDirectory, older, older);
    await utimes(fixture.distIndexPath, newer, newer);

    await expect(
      assertFreshBuildArtifact(fixture.distIndexPath, [
        fixture.publicDirectory,
      ]),
    ).resolves.toBe('<html>current</html>');
  });

  it('Mock Runtime Config 원문을 현재 browser test 입력으로 반환한다', async () => {
    const fixture = await createFixture();

    await expect(
      readMockRuntimeConfigArtifact(fixture.distRuntimeConfigPath),
    ).resolves.toContain('"implementation":"in-memory"');
  });

  it('Real build를 일반 browser test 입력으로 사용하지 않는다', async () => {
    const fixture = await createFixture();
    await writeFile(
      fixture.distRuntimeConfigPath,
      JSON.stringify({
        adapters: { implementation: 'external', mode: 'bundle' },
      }),
      'utf8',
    );

    await expect(
      readMockRuntimeConfigArtifact(fixture.distRuntimeConfigPath),
    ).rejects.toThrow('브라우저 테스트에는 Mock build가 필요합니다.');
  });

  it('형식이 잘못된 Runtime Config를 browser test 전에 거부한다', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.distRuntimeConfigPath, '{', 'utf8');

    await expect(
      readMockRuntimeConfigArtifact(fixture.distRuntimeConfigPath),
    ).rejects.toThrow('브라우저 테스트용 Runtime Config를 읽지 못했습니다.');
  });
});
