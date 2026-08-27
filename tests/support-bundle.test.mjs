import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  SupportBundleFailure,
  createSupportReport,
  encodeSupportReport,
  writeSupportReport,
} from '../packages/support-bundle/index.mjs'

const ZERO_HASH = '0'.repeat(64)
const COMMIT_SHA = 'c3187dd752a69e4ddd55ef50975a89d88ea62de7'

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJSON(value) {
  return Buffer.from(JSON.stringify(sorted(value)), 'utf8')
}

async function privateFixture(t, { tamperJournal = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-private-support-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const deckPath = join(root, 'PRIVATE-DECK-TITLE.pitchdeck')
  await mkdir(join(deckPath, 'attachments'), { recursive: true })
  await mkdir(join(deckPath, 'recovery'), { recursive: true })

  const secrets = {
    title: 'PRIVATE-DECK-TITLE',
    story: 'SECRET-STORY-COPY',
    asset: '/Users/private-user/Film/SECRET-ASSET.mov',
    username: 'private-user',
    token: 'TOKEN-do-not-collect-123',
    environment: 'SECRET_ENVIRONMENT_VALUE',
    noticePurpose: 'NOTICE-PRIVATE-PURPOSE',
  }
  const checkpoint = Buffer.from(JSON.stringify({
    format: 'pitchdog.deck-checkpoint',
    schemaVersion: 1,
    revision: 0,
    deck: {
      deckId: 'private-deck-id',
      title: secrets.title,
      story: secrets.story,
      sourceAsset: secrets.asset,
      token: secrets.token,
    },
  }))
  const record = {
    command: {
      type: 'content.update',
      payload: {
        text: secrets.story,
        assetPath: secrets.asset,
        username: secrets.username,
        token: secrets.token,
      },
    },
    revision: 1,
    previousHash: ZERO_HASH,
  }
  record.recordHash = sha256(canonicalJSON(record))
  if (tamperJournal) record.command.payload.text = 'TAMPERED-SECRET-STORY'
  const journal = Buffer.from(`${JSON.stringify(record)}\n`)
  const manifest = {
    format: 'pitchdog.deck-package',
    schemaVersion: 1,
    deckId: 'private-deck-id',
    title: secrets.title,
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:01Z',
    checkpointRevision: 0,
    checkpointHash: sha256(checkpoint),
    journalHeadHash: record.recordHash,
    canvasPreset: 'pitchdog.16x9',
  }
  await Promise.all([
    writeFile(join(deckPath, 'checkpoint.json'), checkpoint),
    writeFile(join(deckPath, 'journal.ndjson'), journal),
    writeFile(join(deckPath, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(join(deckPath, 'attachments', 'private-name.txt'), secrets.asset),
  ])

  const thirdPartyPath = join(root, 'THIRD_PARTY.md')
  await writeFile(thirdPartyPath, [
    '# Third-party software',
    '',
    '| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |',
    '|---|---|---|---|---|---|---|',
    `| Electron | 44.0.0 | https://example.invalid | MIT | Linux | Runtime | ${secrets.noticePurpose} |`,
    '',
  ].join('\n'))
  return { root, deckPath, thirdPartyPath, secrets }
}

function request(fixture) {
  return {
    deckPath: fixture.deckPath,
    thirdPartyPath: fixture.thirdPartyPath,
    commitSha: COMMIT_SHA,
    appVersion: '0.0.0',
    platform: 'linux',
    architecture: 'x64',
  }
}

test('creates deterministic useful evidence without collecting private Deck or machine data', async (t) => {
  const fixture = await privateFixture(t)
  const previousEnvironment = process.env.DECK_WORKBENCH_PRIVATE_TEST
  process.env.DECK_WORKBENCH_PRIVATE_TEST = fixture.secrets.environment
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.DECK_WORKBENCH_PRIVATE_TEST
    else process.env.DECK_WORKBENCH_PRIVATE_TEST = previousEnvironment
  })

  const first = await createSupportReport(request(fixture))
  const second = await createSupportReport(request(fixture))
  assert.deepEqual(second, first)
  assert.deepEqual(first.build, { commitSha: COMMIT_SHA, appVersion: '0.0.0' })
  assert.deepEqual(first.runtime, { platform: 'linux', architecture: 'x64' })
  assert.deepEqual(first.document, {
    manifest: {
      status: 'valid',
      format: 'pitchdog.deck-package',
      schemaVersion: 1,
      checkpointRevision: 0,
    },
    checkpoint: { checksumStatus: 'matches' },
    journal: {
      status: 'valid',
      recordCount: 1,
      lastRevision: 1,
      checkpointRevision: 0,
      pendingReplayRecords: 1,
      headStatus: 'matches',
    },
  })
  assert.deepEqual(first.dependencies.entries.map(({ component, version, licence }) => ({ component, version, licence })), [
    { component: 'Electron', version: '44.0.0', licence: 'MIT' },
  ])
  assert.match(first.dependencies.noticeSha256, /^[a-f0-9]{64}$/)
  assert.match(first.dependencies.entries[0].rowSha256, /^[a-f0-9]{64}$/)
  assert.equal(first.privacy.networkRequests, false)
  assert.equal(first.privacy.telemetry, false)

  const encoded = encodeSupportReport(first).toString('utf8')
  for (const secret of [...Object.values(fixture.secrets), fixture.root, process.env.DECK_WORKBENCH_PRIVATE_TEST]) {
    assert.equal(encoded.includes(secret), false, `support report leaked: ${secret}`)
  }
  assert.equal(encoded.includes('"assetPath"'), false)
  assert.equal(encoded.includes('"deckId"'), false)
  assert.equal(encoded.includes('"title"'), false)
})

test('reports journal corruption using a bounded reason without echoing corrupted content', async (t) => {
  const fixture = await privateFixture(t, { tamperJournal: true })
  const report = await createSupportReport(request(fixture))
  assert.deepEqual(report.document.journal, { status: 'invalid', reason: 'hash-mismatch' })
  const encoded = encodeSupportReport(report).toString('utf8')
  assert.equal(encoded.includes('TAMPERED-SECRET-STORY'), false)
  assert.equal(encoded.includes(fixture.secrets.story), false)
  assert.equal(encoded.includes(fixture.deckPath), false)
})

test('writes outside the package without changing package evidence and refuses an in-package report', async (t) => {
  const fixture = await privateFixture(t)
  const manifestBefore = await readFile(join(fixture.deckPath, 'manifest.json'))
  const journalBefore = await readFile(join(fixture.deckPath, 'journal.ndjson'))
  const checkpointBefore = await readFile(join(fixture.deckPath, 'checkpoint.json'))

  await assert.rejects(
    writeSupportReport({
      ...request(fixture),
      outputPath: join(fixture.deckPath, 'support-report.json'),
    }),
    (error) => error instanceof SupportBundleFailure && error.name === 'InvalidOutput',
  )

  const disguisedPackagePath = join(fixture.root, 'disguised-output-directory')
  await symlink(fixture.deckPath, disguisedPackagePath)
  await assert.rejects(
    writeSupportReport({
      ...request(fixture),
      outputPath: join(disguisedPackagePath, 'support-report.json'),
    }),
    (error) => error instanceof SupportBundleFailure && error.name === 'InvalidOutput',
  )

  const outputPath = join(fixture.root, 'support-report.json')
  const receipt = await writeSupportReport({ ...request(fixture), outputPath })
  const output = await readFile(outputPath)
  assert.equal(receipt.bytesWritten, output.length)
  assert.equal(receipt.sha256, sha256(output))
  await assert.rejects(
    writeSupportReport({ ...request(fixture), outputPath }),
    (error) => error instanceof SupportBundleFailure && error.name === 'SupportWriteFailure',
  )
  assert.deepEqual(await readFile(outputPath), output, 'existing support evidence must not be overwritten')
  assert.deepEqual(await readFile(join(fixture.deckPath, 'manifest.json')), manifestBefore)
  assert.deepEqual(await readFile(join(fixture.deckPath, 'journal.ndjson')), journalBefore)
  assert.deepEqual(await readFile(join(fixture.deckPath, 'checkpoint.json')), checkpointBefore)
})

test('rejects unbounded build metadata before reading the private package', async (t) => {
  const fixture = await privateFixture(t)
  await assert.rejects(
    createSupportReport({ ...request(fixture), commitSha: fixture.secrets.token }),
    (error) => error instanceof SupportBundleFailure && error.name === 'InvalidBuildIdentity',
  )
  await assert.rejects(
    createSupportReport({ ...request(fixture), platform: fixture.secrets.username }),
    (error) => error instanceof SupportBundleFailure && error.name === 'InvalidBuildIdentity',
  )
})
