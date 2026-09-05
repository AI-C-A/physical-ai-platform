import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { checkRepository, formatFindings, inspectRepositoryFile } from './check-repository-safety.mjs'

test('blocks local configuration, private keys and repository backups before reading contents', () => {
  for (const path of ['docs/internal/plan.md', 'docs\\internal\\plan.md', '.env', 'gateway/.env.production', '.codex/state.json', 'backup.bundle', 'client.p12', 'client.pfx', 'client.key', 'id_ed25519']) {
    assert.equal(inspectRepositoryFile(path).length, 1, path)
  }
  assert.deepEqual(inspectRepositoryFile('.env.example'), [])
  assert.deepEqual(inspectRepositoryFile('src/vite-env.d.ts'), [])
})

test('finds credential material and reports locations without including the matched values', () => {
  const secret = ['AK', 'IA', 'Q7W9E2R4T6Y8U1I3'].join('')
  const contents = ['# Setup', `accessKeyId: "${secret}"`, ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('')].join('\n')
  const findings = inspectRepositoryFile('README.md', contents)
  assert.deepEqual(findings, [
    { path: 'README.md', line: 3, rule: 'private-key' },
    { path: 'README.md', line: 2, rule: 'aws-access-key' },
  ])
  const report = formatFindings(findings)
  assert.equal(report.includes(secret), false)
  assert.equal(report.includes('BEGIN'), false)
  assert.equal(report, 'README.md:3 [private-key]\nREADME.md:2 [aws-access-key]')
})

test('detects quoted and dotenv credentials without rejecting variable access or example values', () => {
  const value = ['q7W9e2R4', 't6Y8u1I3', 'o5P0a2S4'].join('')
  assert.deepEqual(inspectRepositoryFile('gateway/config.mjs', `const apiSecret = '${value}'`), [
    { path: 'gateway/config.mjs', line: 1, rule: 'credential-literal' },
  ])
  assert.deepEqual(inspectRepositoryFile('.env.example', `PATROL_API_SECRET=${value}`), [
    { path: '.env.example', line: 1, rule: 'credential-literal' },
  ])
  assert.deepEqual(inspectRepositoryFile('gateway/config.mjs', "const apiSecret = process.env.PATROL_API_SECRET\nconst accessToken = 'test-token-for-local-fixture'"), [])
  assert.deepEqual(inspectRepositoryFile('.env.example', 'PATROL_API_SECRET=\nPATROL_API_KEY=replace-with-approved-key'), [])
  assert.deepEqual(inspectRepositoryFile('.env.example', 'VITE_MAPBOX_ACCESS_TOKEN=pk.replace-with-a-public-mapbox-token'), [])
})

test('rejects signed and credentialed URLs but accepts ordinary public references', () => {
  const signature = ['a1b2c3d4', 'e5f6a7b8'].join('')
  const credentialedUrl = ['https://', 'username', ':', 'password', '@service.example/path'].join('')
  const findings = inspectRepositoryFile('README.md', `https://storage.example/file?X-Amz-Signature=${signature}\n${credentialedUrl}`)
  assert.deepEqual(findings.map(({ rule, line }) => ({ rule, line })), [
    { rule: 'signed-url', line: 1 },
    { rule: 'url-credentials', line: 2 },
  ])
  assert.deepEqual(inspectRepositoryFile('README.md', 'https://developer.mozilla.org/en-US/\nhttp://localhost:5173\n127.0.0.1:8787'), [])
})

test('finds unavailable document references and local infrastructure details in documentation', () => {
  const address = ['192', '168', '1', '2'].join('.')
  const personalPath = ['C:', 'Users', 'operator', 'project'].join('\\')
  const findings = inspectRepositoryFile('README.md', `[contract](docs/internal/contract.md)\n${address}\n${personalPath}`)
  assert.deepEqual(findings.map(({ rule, line }) => ({ rule, line })), [
    { rule: 'unavailable-document-reference', line: 1 },
    { rule: 'private-network-address', line: 2 },
    { rule: 'personal-machine-path', line: 3 },
  ])
  assert.deepEqual(inspectRepositoryFile('docs/guide.md', '[contract](internal/contract.md)'), [
    { path: 'docs/guide.md', line: 1, rule: 'unavailable-document-reference' },
  ])
})

function withRepository(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'repository-safety-'))
  try {
    execFileSync('git', ['init', '--quiet'], { cwd })
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd })
    run(cwd)
  } finally {
    assert.equal(dirname(resolve(cwd)), resolve(tmpdir()))
    assert.equal(basename(cwd).startsWith('repository-safety-'), true)
    rmSync(cwd, { recursive: true, force: true })
  }
}

test('checks tracked and new files while leaving ignored local credentials unread', () => {
  withRepository((cwd) => {
    writeFileSync(join(cwd, '.gitignore'), '.env.local\n/docs/internal/\n')
    writeFileSync(join(cwd, '.env.local'), 'must stay local')
    writeFileSync(join(cwd, 'README.md'), '# Project\n')
    mkdirSync(join(cwd, 'docs', 'internal'), { recursive: true })
    writeFileSync(join(cwd, 'docs', 'internal', 'plan.md'), 'must stay local')
    execFileSync('git', ['add', 'README.md', '.gitignore'], { cwd })
    writeFileSync(join(cwd, 'new.bundle'), 'backup')

    assert.deepEqual(checkRepository({ cwd }), {
      checkedFiles: 3,
      findings: [{ path: 'new.bundle', line: 1, rule: 'credential-or-backup-file' }],
    })
    execFileSync('git', ['add', '--force', 'docs/internal/plan.md'], { cwd })
    assert.equal(checkRepository({ cwd }).findings.some(({ rule }) => rule === 'restricted-directory'), true)
  })
})

test('staged checks inspect the index even when working files have been cleaned', () => {
  withRepository((cwd) => {
    const secret = ['ghp_', 'Q7W9e2R4t6Y8u1I3o5P0a2S4d6F8g1H3'].join('')
    writeFileSync(join(cwd, 'README.md'), `token: ${secret}\n`)
    execFileSync('git', ['add', 'README.md'], { cwd })
    writeFileSync(join(cwd, 'README.md'), '# Project\n')

    assert.deepEqual(checkRepository({ cwd }).findings, [])
    assert.deepEqual(checkRepository({ cwd, staged: true }).findings, [
      { path: 'README.md', line: 1, rule: 'github-token' },
    ])
    assert.equal(formatFindings(checkRepository({ cwd, staged: true }).findings).includes(secret), false)
  })
})
