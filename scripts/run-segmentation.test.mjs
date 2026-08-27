import assert from 'node:assert/strict';
import test from 'node:test';

import { getSegmentationPythonCandidates } from './run-segmentation.mjs';

test('Windows에서 프로젝트 가상환경과 시스템 Python을 순서대로 찾는다', () => {
  assert.deepEqual(
    getSegmentationPythonCandidates({
      platform: 'win32',
      repositoryDirectory: 'C:\\workspace\\frontend',
      selectedInterpreter: undefined,
    }),
    [
      'C:\\workspace\\frontend\\.venv\\Scripts\\python.exe',
      'python',
    ],
  );
});

test('명시한 인터프리터를 가장 먼저 사용한다', () => {
  const candidates = getSegmentationPythonCandidates({
    platform: 'linux',
    repositoryDirectory: '/workspace/frontend',
    selectedInterpreter: '/opt/rfdetr/bin/python',
  });

  assert.equal(candidates[0], '/opt/rfdetr/bin/python');
});
