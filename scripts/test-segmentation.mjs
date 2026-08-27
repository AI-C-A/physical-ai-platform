import { spawn } from 'node:child_process';

import { resolveSegmentationPython } from './run-segmentation.mjs';

const interpreter = await resolveSegmentationPython();
const child = spawn(
  interpreter,
  ['-X', 'utf8', '-m', 'unittest', 'discover', '-s', 'segmentation', '-p', 'test_*.py'],
  { stdio: 'inherit' },
);

child.on('error', (error) => {
  console.error(`세그멘테이션 테스트를 시작하지 못했습니다: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
