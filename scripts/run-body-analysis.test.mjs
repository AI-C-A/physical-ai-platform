import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getBodyAnalysisCommand } from './run-body-analysis.mjs';

test('selects WSL without putting shell source or paths on the command line', () => {
  const launch = getBodyAnalysisCommand({ platform: 'win32', env: { PERCEPTION_WSL_DISTRO: ' Ubuntu-22.04 ' } });
  assert.equal(launch.command, 'wsl.exe');
  assert.deepEqual(launch.args, ['--distribution', 'Ubuntu-22.04', '--exec', '/bin/sh', '-s']);
});

test('preserves spaces, apostrophes and shell characters through actual shell execution', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'body-launch-'));
  try {
    const model = path.join(root, "model's $(literal)");
    mkdirSync(model);
    const python = path.join(model, 'python');
    writeFileSync(python, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n', { mode: 0o755 });
    const launch = getBodyAnalysisCommand({ platform: 'linux', repositoryDirectory: '/repo with spaces', env: { FOUR_D_HUMANS_DIR: model, PERCEPTION_PYTHON: python } });
    const result = spawnSync(launch.command, launch.args, { input: launch.input, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(model));
    assert.ok(result.stdout.includes('/repo with spaces/perception/server.py'));
    assert.ok(result.stdout.includes('full-body'));
  } finally { rmSync(root, { recursive: true }); }
});

test('keeps a missing model path visible in the error', { skip: process.platform === 'win32' }, () => {
  const model = "/nonexistent/model's $(literal)";
  const launch = getBodyAnalysisCommand({ platform: 'linux', env: { FOUR_D_HUMANS_DIR: model } });
  const result = spawnSync(launch.command, launch.args, { input: launch.input, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`폴더를 찾을 수 없습니다: ${model}`));
});
