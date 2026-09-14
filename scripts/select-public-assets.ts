import { readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { Plugin, ResolvedConfig } from 'vite';

const simulationAssetPaths = [
  'assets/low-altitude-first-person-pov.mp4',
  'assets/flywheel',
  'assets/interventions',
] as const;

function outputPath(directory: string, path: string): string {
  const target = resolve(directory, path);
  const remainder = relative(directory, target);
  if (remainder === '' || remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
    throw new Error('빌드 자산 경로가 출력 폴더를 벗어났습니다.');
  }
  return target;
}

async function finalizePublicAssets(mode: string, directory: string): Promise<void> {
  const runtimeConfig = outputPath(directory, 'runtime-config.json');
  const patrolRuntimeConfig = outputPath(directory, 'runtime-config.patrol.json');
  const collectionRuntimeConfig = outputPath(directory, 'runtime-config.collection.json');
  if (mode === 'collection') {
    await rm(runtimeConfig, { force: true });
    await rename(collectionRuntimeConfig, runtimeConfig);
  } else {
    await rm(collectionRuntimeConfig, { force: true });
  }
  if (mode !== 'patrol') {
    await rm(patrolRuntimeConfig, { force: true });
    return;
  }

  await Promise.all([
    rm(runtimeConfig, { force: true }),
    ...simulationAssetPaths.map((path) =>
      rm(outputPath(directory, path), { force: true, recursive: true })),
  ]);
  await rename(patrolRuntimeConfig, runtimeConfig);
}

export function selectPublicAssets(mode: string): Plugin {
  let config: ResolvedConfig | null = null;

  return {
    name: 'select-public-assets',
    configResolved: (resolved) => {
      const directory = resolve(resolved.root, resolved.build.outDir);
      if (resolved.command === 'build' && (directory === resolve(resolved.root)
        || (resolved.publicDir !== '' && directory === resolve(resolved.publicDir)))) {
        throw new Error('빌드 출력 폴더는 프로젝트와 public 폴더에서 분리해 주세요.');
      }
      config = resolved;
    },
    configureServer: (server) => {
      if (!['patrol', 'collection'].includes(mode)) return;
      server.middlewares.use('/runtime-config.json', (_request, response) => {
        const source = resolve(server.config.publicDir, mode === 'patrol' ? 'runtime-config.patrol.json' : 'runtime-config.collection.json');
        void readFile(source)
          .then((content) => {
            response.statusCode = 200;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(content);
          })
          .catch(() => {
            response.statusCode = 503;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: '실제 장치 연결 설정을 불러오지 못했습니다.' }));
          });
      });
    },
    closeBundle: async () => {
      if (config?.command !== 'build') return;
      await finalizePublicAssets(mode, resolve(config.root, config.build.outDir));
    },
  };
}
