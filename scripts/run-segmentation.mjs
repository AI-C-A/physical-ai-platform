import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getSegmentationPythonCandidates({
  platform = process.platform,
  repositoryDirectory = repositoryRoot,
  selectedInterpreter = process.env.SEGMENTATION_PYTHON,
} = {}) {
  const executable = platform === 'win32' ? 'python.exe' : 'python';
  const systemInterpreter = platform === 'win32' ? 'python' : 'python3';
  const virtualEnvironmentDirectory = platform === 'win32' ? 'Scripts' : 'bin';
  return [
    selectedInterpreter?.trim() || null,
    path.join(
      repositoryDirectory,
      '.venv',
      virtualEnvironmentDirectory,
      executable,
    ),
    systemInterpreter,
  ].filter((candidate) => candidate !== null);
}

export async function resolveSegmentationPython(options = {}) {
  const candidates = getSegmentationPythonCandidates(options);
  for (const candidate of candidates) {
    if (candidate === 'python' || candidate === 'python3') return candidate;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 실행할 수 없는 후보 하나가 다음 후보 탐색을 막지 않아야 한다.
    }
  }
  throw new Error([
    'RF-DETR Python 인터프리터를 찾지 못했습니다.',
    'SEGMENTATION_PYTHON에 Python 실행 파일을 지정하거나 프로젝트 .venv를 만들어 주세요.',
    `확인한 경로: ${candidates.join(', ')}`,
  ].join('\n'));
}

async function main() {
  const interpreter = await resolveSegmentationPython();
  const serverScript = path.join(repositoryRoot, 'segmentation', 'server.py');
  const child = spawn(interpreter, ['-X', 'utf8', serverScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      SEGMENTATION_DEVICE: process.env.SEGMENTATION_DEVICE ?? 'cuda:0',
      SEGMENTATION_MODEL: process.env.SEGMENTATION_MODEL ?? 'nano',
    },
    stdio: 'inherit',
  });
  let stopping = false;
  const stopChild = () => {
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) child.kill();
  };
  process.once('SIGINT', stopChild);
  process.once('SIGTERM', stopChild);

  child.on('error', (error) => {
    console.error(`GPU 세그멘테이션 서버를 시작하지 못했습니다: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.removeListener('SIGINT', stopChild);
    process.removeListener('SIGTERM', stopChild);
    process.exitCode = stopping ? 0 : (code ?? 1);
  });
}

if (process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
