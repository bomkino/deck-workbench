import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  WorkbenchFailure,
  canonicalJSON,
  sha256,
  validateJournal,
} from '../packages/document-store/index.mjs'
import { createSupportReport } from '../packages/support-bundle/index.mjs'

const ZERO_HASH = '0'.repeat(64)

function record() {
  const value = { operation: 'command', revision: 1, previousHash: ZERO_HASH }
  return { ...value, recordHash: sha256(canonicalJSON(value)) }
}

function line(value = record()) {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}

test('journal validation rejects a newline as an empty physical record', () => {
  assert.throws(
    () => validateJournal(Buffer.from('\n')),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'JournalCorruption'
      && /blank record/.test(error.message),
  )
})

test('journal validation rejects blank records inside an otherwise valid hash chain', () => {
  assert.throws(
    () => validateJournal(Buffer.concat([line(), Buffer.from('\n')])),
    (error) => error.name === 'JournalCorruption' && /blank record/.test(error.message),
  )
})

test('journal validation still accepts one strict newline-terminated record', () => {
  const expected = record()
  const validated = validateJournal(line(expected))
  assert.equal(validated.records.length, 1)
  assert.equal(validated.lastRevision, 1)
  assert.equal(validated.headHash, expected.recordHash)
})

test('support evidence reports a blank record instead of silently skipping it', async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'deck-workbench-blank-support-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const deckPath = join(fixtureRoot, 'Private.pitchdeck')
  await mkdir(join(deckPath, 'attachments'), { recursive: true })
  await mkdir(join(deckPath, 'recovery'), { recursive: true })

  const checkpoint = Buffer.from('{}')
  const journalRecord = record()
  await writeFile(join(deckPath, 'checkpoint.json'), checkpoint)
  await writeFile(
    join(deckPath, 'journal.ndjson'),
    Buffer.concat([line(journalRecord), Buffer.from('\n')]),
  )
  await writeFile(join(deckPath, 'manifest.json'), JSON.stringify({
    format: 'pitchdog.deck-package',
    schemaVersion: 1,
    deckId: 'private',
    title: 'private',
    createdAt: '2026-08-28T00:00:00Z',
    updatedAt: '2026-08-28T00:00:01Z',
    checkpointRevision: 0,
    checkpointHash: createHash('sha256').update(checkpoint).digest('hex'),
    journalHeadHash: journalRecord.recordHash,
    canvasPreset: 'pitchdog.16x9',
  }))

  const thirdPartyPath = join(fixtureRoot, 'THIRD_PARTY.md')
  await writeFile(thirdPartyPath, [
    '| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |',
    '|---|---|---|---|---|---|---|',
    '| Electron | 44.0.0 | local | MIT | Linux | Runtime | None |',
  ].join('\n'))

  const report = await createSupportReport({
    deckPath,
    thirdPartyPath,
    commitSha: '0'.repeat(40),
    appVersion: '0.0.1',
    platform: 'linux',
    architecture: 'x64',
  })
  assert.deepEqual(report.document.journal, { status: 'invalid', reason: 'blank-record' })
})

test('macOS journal parsing preserves physical empty lines for rejection', async () => {
  const source = await readFile(resolve('apps/macos/Sources/PitchDeckDocumentStore.swift'), 'utf8')
  assert.match(source, /omittingEmptySubsequences: false/)
  assert.match(source, /Journal contains a blank record/)
  assert.doesNotMatch(source, /text\.split\(separator: "\\n", omittingEmptySubsequences: true\)/)
})
