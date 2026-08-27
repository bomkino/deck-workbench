import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, rm } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

const REPORT_FORMAT = 'pitchdog.deck-workbench-support'
const REPORT_SCHEMA_VERSION = 1
const PACKAGE_FORMAT = 'pitchdog.deck-package'
const PACKAGE_SCHEMA_VERSION = 1
const ZERO_HASH = '0'.repeat(64)
const HASH_PATTERN = /^[a-f0-9]{64}$/
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SAFE_NOTICE_FIELD = /^[\x20-\x7e]{1,160}$/
const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux'])
const SUPPORTED_ARCHITECTURES = new Set(['arm64', 'x64'])

export class SupportBundleFailure extends Error {
  constructor(name, message) {
    super(message)
    this.name = name
  }
}

function failure(name, message) {
  return new SupportBundleFailure(name, message)
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
}

export function encodeSupportReport(report) {
  return Buffer.from(`${JSON.stringify(sorted(report), null, 2)}\n`, 'utf8')
}

function canonicalJSON(value) {
  return Buffer.from(JSON.stringify(sorted(value)), 'utf8')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate)
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
}

async function requirePackageRoot(deckPath) {
  if (typeof deckPath !== 'string' || extname(deckPath) !== '.pitchdeck') {
    throw failure('InvalidPackage', 'An explicit .pitchdeck package is required')
  }
  try {
    const entry = await lstat(deckPath)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('unsafe package root')
    return await realpath(deckPath)
  } catch (error) {
    throw failure('InvalidPackage', 'The selected .pitchdeck package is unavailable or unsafe', error)
  }
}

async function readContainedFile(packageRoot, name) {
  const candidate = join(packageRoot, name)
  let handle
  try {
    const entry = await lstat(candidate)
    const resolved = await realpath(candidate)
    if (entry.isSymbolicLink() || !entry.isFile() || !isContained(packageRoot, resolved)) {
      throw new Error('unsafe package entry')
    }
    handle = await open(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    if (!(await handle.stat()).isFile()) throw new Error('not a regular file')
    return await handle.readFile()
  } catch (error) {
    throw failure('UnreadablePackage', `Required package entry is unavailable: ${name}`, error)
  } finally {
    await handle?.close().catch(() => {})
  }
}

function inspectManifest(bytes) {
  let manifest
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { report: { status: 'invalid', reason: 'malformed-json' } }
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { report: { status: 'invalid', reason: 'malformed-schema' } }
  }
  if (manifest.format !== PACKAGE_FORMAT || manifest.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    return {
      report: {
        status: 'unsupported',
        schemaVersion: Number.isSafeInteger(manifest.schemaVersion) ? manifest.schemaVersion : null,
      },
    }
  }
  if (
    typeof manifest.deckId !== 'string'
    || typeof manifest.title !== 'string'
    || typeof manifest.createdAt !== 'string'
    || typeof manifest.updatedAt !== 'string'
    || !Number.isSafeInteger(manifest.checkpointRevision)
    || manifest.checkpointRevision < 0
    || !HASH_PATTERN.test(manifest.checkpointHash)
    || !HASH_PATTERN.test(manifest.journalHeadHash)
    || typeof manifest.canvasPreset !== 'string'
  ) {
    return { report: { status: 'invalid', reason: 'malformed-schema' } }
  }
  return {
    value: manifest,
    report: {
      status: 'valid',
      format: PACKAGE_FORMAT,
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      checkpointRevision: manifest.checkpointRevision,
    },
  }
}

function inspectJournal(bytes, manifest) {
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) {
    return { status: 'invalid', reason: 'partial-record' }
  }
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { status: 'invalid', reason: 'invalid-utf8' }
  }

  let previousHash = ZERO_HASH
  let expectedRevision = 1
  const hashes = new Set([ZERO_HASH])
  for (const line of text.split('\n').filter(Boolean)) {
    let record
    try {
      record = JSON.parse(line)
    } catch {
      return { status: 'invalid', reason: 'malformed-record' }
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { status: 'invalid', reason: 'malformed-record' }
    }
    const recordHash = record.recordHash
    const unhashed = structuredClone(record)
    delete unhashed.recordHash
    if (!HASH_PATTERN.test(recordHash ?? '')) return { status: 'invalid', reason: 'missing-record-hash' }
    if (record.previousHash !== previousHash) return { status: 'invalid', reason: 'broken-chain' }
    if (record.revision !== expectedRevision) return { status: 'invalid', reason: 'broken-revision-sequence' }
    if (sha256(canonicalJSON(unhashed)) !== recordHash) return { status: 'invalid', reason: 'hash-mismatch' }
    hashes.add(recordHash)
    previousHash = recordHash
    expectedRevision += 1
  }

  const lastRevision = expectedRevision - 1
  const report = {
    status: 'valid',
    recordCount: lastRevision,
    lastRevision,
  }
  if (manifest) {
    report.checkpointRevision = manifest.checkpointRevision
    report.pendingReplayRecords = Math.max(0, lastRevision - manifest.checkpointRevision)
    if (manifest.checkpointRevision > lastRevision) {
      return { ...report, status: 'invalid', reason: 'checkpoint-ahead-of-journal', headStatus: 'unknown' }
    }
    report.headStatus = manifest.journalHeadHash === previousHash
      ? 'matches'
      : hashes.has(manifest.journalHeadHash) ? 'recoverable-tail' : 'not-in-chain'
    if (report.headStatus === 'not-in-chain') report.status = 'invalid'
  } else {
    report.headStatus = 'unknown'
  }
  return report
}

function parseThirdPartyNotice(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const entries = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || /^\|[- :|]+\|\s*$/.test(line)) continue
    const fields = line.slice(1, line.lastIndexOf('|')).split('|').map((field) => field.trim())
    if (fields.length !== 7 || fields[0] === 'Component') continue
    const [component, version, , licence] = fields
    if (![component, version, licence].every((field) => SAFE_NOTICE_FIELD.test(field))) {
      throw failure('InvalidNotice', 'Third-party notice contains an invalid dependency identity')
    }
    entries.push({
      component,
      version,
      licence,
      rowSha256: sha256(Buffer.from(line, 'utf8')),
    })
  }
  return entries.sort((left, right) =>
    left.component.localeCompare(right.component) || left.version.localeCompare(right.version))
}

async function readNotice(thirdPartyPath) {
  let handle
  try {
    const entry = await lstat(thirdPartyPath)
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('unsafe notice')
    handle = await open(thirdPartyPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    if (!(await handle.stat()).isFile()) throw new Error('not a regular file')
    return await handle.readFile()
  } catch (error) {
    throw failure('InvalidNotice', 'Third-party notice is unavailable or unsafe', error)
  } finally {
    await handle?.close().catch(() => {})
  }
}

function requireBuildMetadata({ commitSha, appVersion, platform, architecture }) {
  if (!COMMIT_PATTERN.test(commitSha ?? '')) throw failure('InvalidBuildIdentity', 'Commit identity must be a full Git SHA')
  if (!VERSION_PATTERN.test(appVersion ?? '')) throw failure('InvalidBuildIdentity', 'Application version must be semantic')
  if (!SUPPORTED_PLATFORMS.has(platform)) throw failure('InvalidBuildIdentity', 'Platform is unsupported')
  if (!SUPPORTED_ARCHITECTURES.has(architecture)) throw failure('InvalidBuildIdentity', 'Architecture is unsupported')
  return { commitSha: commitSha.toLowerCase(), appVersion, platform, architecture }
}

export async function createSupportReport({
  deckPath,
  thirdPartyPath,
  commitSha,
  appVersion,
  platform,
  architecture,
}) {
  const build = requireBuildMetadata({ commitSha, appVersion, platform, architecture })
  const packageRoot = await requirePackageRoot(deckPath)
  const [manifestBytes, checkpointBytes, journalBytes, noticeBytes] = await Promise.all([
    readContainedFile(packageRoot, 'manifest.json'),
    readContainedFile(packageRoot, 'checkpoint.json'),
    readContainedFile(packageRoot, 'journal.ndjson'),
    readNotice(thirdPartyPath),
  ])
  const manifest = inspectManifest(manifestBytes)
  const checkpointStatus = manifest.value
    ? sha256(checkpointBytes) === manifest.value.checkpointHash ? 'matches' : 'mismatch'
    : 'unknown'

  return {
    format: REPORT_FORMAT,
    schemaVersion: REPORT_SCHEMA_VERSION,
    build: {
      commitSha: build.commitSha,
      appVersion: build.appVersion,
    },
    runtime: {
      platform: build.platform,
      architecture: build.architecture,
    },
    document: {
      manifest: manifest.report,
      checkpoint: { checksumStatus: checkpointStatus },
      journal: inspectJournal(journalBytes, manifest.value),
    },
    dependencies: {
      noticeSha256: sha256(noticeBytes),
      entries: parseThirdPartyNotice(noticeBytes),
    },
    privacy: {
      localOnly: true,
      networkRequests: false,
      telemetry: false,
      storyContentIncluded: false,
      deckIdentityIncluded: false,
      assetInformationIncluded: false,
      filesystemPathsIncluded: false,
      environmentIncluded: false,
    },
  }
}

export async function writeSupportReport({ outputPath, ...request }) {
  if (typeof outputPath !== 'string' || basename(outputPath).length === 0) {
    throw failure('InvalidOutput', 'An explicit output file is required')
  }
  const packageRoot = await requirePackageRoot(request.deckPath)
  const destination = resolve(outputPath)
  if (isContained(packageRoot, destination)) {
    throw failure('InvalidOutput', 'Support reports must be written outside the .pitchdeck package')
  }

  let outputParent
  try {
    const parentEntry = await lstat(dirname(destination))
    if (parentEntry.isSymbolicLink() || !parentEntry.isDirectory()) throw new Error('unsafe output directory')
    outputParent = await realpath(dirname(destination))
  } catch (error) {
    throw failure('InvalidOutput', 'Support report output directory is unavailable or unsafe', error)
  }
  if (isContained(packageRoot, outputParent)) {
    throw failure('InvalidOutput', 'Support reports must be written outside the .pitchdeck package')
  }

  const bytes = encodeSupportReport(await createSupportReport(request))
  let handle
  let created = false
  try {
    handle = await open(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    )
    created = true
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    return { bytesWritten: bytes.length, sha256: sha256(bytes) }
  } catch (error) {
    await handle?.close().catch(() => {})
    if (created) await rm(destination, { force: true }).catch(() => {})
    if (error instanceof SupportBundleFailure) throw error
    throw failure('SupportWriteFailure', 'Support report could not be written', error)
  }
}

export const supportReportContract = Object.freeze({
  format: REPORT_FORMAT,
  schemaVersion: REPORT_SCHEMA_VERSION,
})
