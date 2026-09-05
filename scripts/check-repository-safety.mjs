import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const blockedPaths = [
  { pattern: /^docs\/internal\//i, rule: 'restricted-directory' },
  { pattern: /(?:^|\/)(?:\.codex|\.cursor|\.impeccable)\//i, rule: 'local-tool-data' },
  { pattern: /(?:^|\/)\.env(?:\..+)?$/i, rule: 'environment-file', exception: /(?:^|\/)\.env\.example$/i },
  { pattern: /\.(?:bundle|p12|pfx|key)$/i, rule: 'credential-or-backup-file' },
  { pattern: /(?:^|\/)(?:id_rsa|id_ed25519|id_ecdsa)$/i, rule: 'private-key-file' },
]

const secretPatterns = [
  { pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, rule: 'private-key' },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, rule: 'aws-access-key' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, rule: 'github-token' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, rule: 'slack-token' },
  { pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/g, rule: 'payment-secret' },
  { pattern: /\bsk\.eyJ[A-Za-z0-9_.-]{30,}\b/g, rule: 'mapbox-secret' },
  { pattern: /[?&](?:X-Amz-Signature|X-Goog-Signature)=[a-f0-9]{16,}/gi, rule: 'signed-url' },
  { pattern: /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/gi, rule: 'url-credentials' },
]

const credentialAssignment = /\b(?:[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)|apiKey|apiSecret|accessToken|refreshToken|clientSecret|secretAccessKey|password)\b["']?\s*[:=]\s*(["'])([A-Za-z0-9_+/.=-]{20,})\1/g
const environmentAssignment = /^[\t ]*[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[\t ]*=[\t ]*([A-Za-z0-9_+/.=-]{20,})[\t ]*$/gm
const exampleValue = /^(?:pk\.)?(?:test[-_]|mock[-_]|example[-_]|placeholder|replace[-_]|your[-_]|dummy[-_]|fake[-_]|<)/i

function lineNumber(contents, index) {
  return contents.slice(0, index).split('\n').length
}

export function inspectRepositoryFile(filePath, contents = '') {
  const path = filePath.replaceAll('\\', '/')
  const findings = []

  for (const { pattern, exception, rule } of blockedPaths) {
    if (pattern.test(path) && !exception?.test(path)) findings.push({ path, line: 1, rule })
  }

  if (contents.includes('\0')) return findings

  for (const { pattern, rule } of secretPatterns) {
    for (const match of contents.matchAll(pattern)) {
      findings.push({ path, line: lineNumber(contents, match.index), rule })
    }
  }

  for (const [pattern, valueIndex] of [[credentialAssignment, 2], [environmentAssignment, 1]]) {
    for (const match of contents.matchAll(pattern)) {
      if (!exampleValue.test(match[valueIndex])) {
        findings.push({ path, line: lineNumber(contents, match.index), rule: 'credential-literal' })
      }
    }
  }

  if (/\.md$/i.test(path)) {
    const documentPatterns = [
      { pattern: /(?:docs\/internal\/|(?:\.\.\/)*internal\/)[^\s)]+/g, rule: 'unavailable-document-reference' },
      { pattern: /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g, rule: 'private-network-address' },
      { pattern: /(?:[A-Z]:[\\/]Users[\\/]|\/Users\/|\/home\/)[^\s`"')]+/gi, rule: 'personal-machine-path' },
    ]

    for (const { pattern, rule } of documentPatterns) {
      for (const match of contents.matchAll(pattern)) findings.push({ path, line: lineNumber(contents, match.index), rule })
    }
  }

  return findings.filter((finding, index) => findings.findIndex((other) => other.path === finding.path && other.line === finding.line && other.rule === finding.rule) === index)
}

export function checkRepository({ cwd = process.cwd(), staged = false } = {}) {
  const args = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z']
  const files = [...new Set(execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\0').filter(Boolean))]
  const findings = []

  for (const file of files) {
    const pathFindings = inspectRepositoryFile(file)
    if (pathFindings.length > 0) {
      findings.push(...pathFindings)
      continue
    }

    let contents
    if (staged) {
      contents = execFileSync('git', ['show', `:${file}`], { cwd, maxBuffer: 64 * 1024 * 1024 })
    } else {
      const absolutePath = resolve(cwd, file)
      let stats
      try {
        stats = lstatSync(absolutePath)
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      if (!stats.isFile()) continue
      contents = readFileSync(absolutePath)
    }
    findings.push(...inspectRepositoryFile(file, contents.toString('utf8')))
  }

  return { findings, checkedFiles: files.length }
}

export function formatFindings(findings) {
  return findings.map(({ path, line, rule }) => `${path}:${line} [${rule}]`).join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unsupported = process.argv.slice(2).filter((argument) => argument !== '--staged')
  if (unsupported.length > 0) {
    process.stderr.write(`Usage: node scripts/${basename(fileURLToPath(import.meta.url))} [--staged]\n`)
    process.exitCode = 2
  } else {
    try {
      const { findings, checkedFiles } = checkRepository({ staged: process.argv.includes('--staged') })
      if (findings.length > 0) {
        process.stderr.write(`${formatFindings(findings)}\nRepository safety check failed. Matched values are not printed.\n`)
        process.exitCode = 1
      } else {
        process.stdout.write(`Repository safety check passed (${checkedFiles} files).\n`)
      }
    } catch {
      process.stderr.write('Repository safety check could not read the repository. Run it from the Git working tree.\n')
      process.exitCode = 2
    }
  }
}
