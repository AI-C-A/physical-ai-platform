import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readLatestModifiedMs(path: string): Promise<number> {
  const metadata = await stat(path);
  if (!metadata.isDirectory()) return metadata.mtimeMs;
  const entries = await readdir(path, { withFileTypes: true });
  const modifiedTimes = await Promise.all(
    entries.map((entry) => readLatestModifiedMs(join(path, entry.name))),
  );
  return Math.max(metadata.mtimeMs, ...modifiedTimes);
}

/**
 * 업무 흐름 테스트가 의존하는 in-memory 데이터를 Real build로 실행하지 않도록 막는다.
 * 검증한 원문은 이미 실행 중인 preview와 현재 dist를 비교할 때도 사용한다.
 */
export async function readMockRuntimeConfigArtifact(
  runtimeConfigPath: string,
): Promise<string> {
  let configText: string;
  let config: unknown;
  try {
    configText = await readFile(runtimeConfigPath, 'utf8');
    config = JSON.parse(configText) as unknown;
  } catch {
    throw new Error(
      '브라우저 테스트용 Runtime Config를 읽지 못했습니다. npm run build:mock 후 다시 실행하세요.',
    );
  }

  const adapters = isRecord(config) && isRecord(config.adapters)
    ? config.adapters
    : null;
  if (
    adapters?.mode !== 'bundle'
    || adapters.implementation !== 'in-memory'
  ) {
    throw new Error(
      '브라우저 테스트에는 Mock build가 필요합니다. npm run build:mock 후 다시 실행하세요.',
    );
  }
  return configText;
}

export async function assertFreshBuildArtifact(
  distIndexPath: string,
  inputPaths: readonly string[],
): Promise<string> {
  let distHtml: string;
  let distModifiedMs: number;
  try {
    [distHtml, distModifiedMs] = await Promise.all([
      readFile(distIndexPath, 'utf8'),
      stat(distIndexPath).then((metadata) => metadata.mtimeMs),
    ]);
  } catch {
    throw new Error(
      'dist가 없습니다. npm run build 후 브라우저 검증을 실행하세요.',
    );
  }

  const latestInputModifiedMs = Math.max(
    ...(await Promise.all(inputPaths.map(readLatestModifiedMs))),
  );
  if (latestInputModifiedMs > distModifiedMs) {
    throw new Error(
      'dist가 현재 source보다 오래됐습니다. npm run build 후 다시 실행하세요.',
    );
  }
  return distHtml;
}
