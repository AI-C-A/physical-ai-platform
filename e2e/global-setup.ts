import type { FullConfig } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

import {
  assertFreshBuildArtifact,
  readMockRuntimeConfigArtifact,
} from './build-freshness';

const localPreviewUrl = 'http://127.0.0.1:4173';
const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const distIndexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const distRuntimeConfigPath = fileURLToPath(
  new URL('../dist/runtime-config.json', import.meta.url),
);

async function readServedText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function assertFreshBuild(): Promise<{
  readonly html: string;
  readonly runtimeConfig: string;
}> {
  const inputPaths = [
    join(rootDirectory, 'src'),
    join(rootDirectory, 'public'),
    join(rootDirectory, 'index.html'),
    join(rootDirectory, 'vite.config.ts'),
    join(rootDirectory, 'package.json'),
    join(rootDirectory, 'package-lock.json'),
    join(rootDirectory, 'tsconfig.json'),
    join(rootDirectory, 'tsconfig.app.json'),
    join(rootDirectory, 'tsconfig.node.json'),
    join(rootDirectory, 'tsconfig.e2e.json'),
  ];
  const [html, runtimeConfig] = await Promise.all([
    assertFreshBuildArtifact(distIndexPath, inputPaths),
    readMockRuntimeConfigArtifact(distRuntimeConfigPath),
  ]);
  return { html, runtimeConfig };
}

function readBaseUrl(config: FullConfig): string {
  const baseUrl = config.projects[0]?.use.baseURL;
  if (typeof baseUrl !== 'string') {
    throw new Error('Playwright baseURL이 설정되지 않았습니다.');
  }
  return baseUrl;
}

async function globalSetup(
  config: FullConfig,
): Promise<(() => Promise<void>) | undefined> {
  const baseUrl = readBaseUrl(config);
  const url = new URL(baseUrl);
  const dist = await assertFreshBuild();
  const [servedHtml, servedRuntimeConfig] = await Promise.all([
    readServedText(baseUrl),
    readServedText(new URL('/runtime-config.json', baseUrl).href),
  ]);

  if (servedHtml !== null) {
    if (process.env.CI === 'true') {
      throw new Error(`${baseUrl} 포트를 이미 다른 프로세스가 사용 중입니다.`);
    }
    if (servedHtml !== dist.html) {
      throw new Error(`${baseUrl}에서 현재 dist와 다른 앱이 응답했습니다.`);
    }
    if (servedRuntimeConfig !== dist.runtimeConfig) {
      throw new Error(
        `${baseUrl}에서 현재 Mock build와 다른 Runtime Config가 응답했습니다.`,
      );
    }
    return undefined;
  }

  if (baseUrl !== localPreviewUrl) {
    throw new Error(`지원하지 않는 Playwright baseURL입니다: ${baseUrl}`);
  }

  const server = await preview({
    configLoader: 'runner',
    preview: {
      host: url.hostname,
      port: Number(url.port),
      strictPort: true,
    },
  });

  return async () => {
    await server.close();
  };
}

export { globalSetup as default };
