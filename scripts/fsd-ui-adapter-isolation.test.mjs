import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { Linter } from 'eslint';

import { fsdBoundariesPlugin } from '../eslint-rules/fsd-boundaries.js';

const linter = new Linter();
const config = {
  files: ['**/*.{js,jsx,ts,tsx}'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { fsd: fsdBoundariesPlugin },
  rules: { 'fsd/ui-adapter-isolation': 'error' },
};

function verify(code, filename) {
  return linter.verify(code, config, {
    filename: path.resolve(filename),
  });
}

test('entity UI에서 구현 import와 구현 설명 문구를 거부한다', () => {
  const messages = verify(
    [
      "import { InMemoryRobotVideoAdapter } from '@/entities/robot-video';",
      "export function CameraCard() { return <p>Mock Adapter</p>; }",
    ].join('\n'),
    'src/entities/robot-video/ui/CameraCard.tsx',
  );

  assert.deepEqual(
    messages.map((message) => message.ruleId),
    ['fsd/ui-adapter-isolation', 'fsd/ui-adapter-isolation'],
  );
});

test('entity model과 UI test는 구현 식별자 검사를 적용하지 않는다', () => {
  const code = [
    "import { InMemoryRobotVideoAdapter } from '@/entities/robot-video';",
    "export function CameraCard() { return <p>Mock Adapter</p>; }",
  ].join('\n');

  assert.deepEqual(
    verify(code, 'src/entities/robot-video/model/camera.tsx'),
    [],
  );
  assert.deepEqual(
    verify(code, 'src/entities/robot-video/ui/CameraCard.test.tsx'),
    [],
  );
});
