import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import {
  DurableDeckSession,
  PitchDeckDocumentStore,
  WorkbenchFailure,
  canonicalJSON,
  documentStoreContract,
  sha256,
  validateJournal,
} from '../packages/document-store/index.mjs'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

function seed() {
  return {
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: 'slide-00000000-0000-4000-8000-000000000001',
    blockId: 'block-00000000-0000-4000-8000-000000000001',
    title: 'Linux Tracer Deck',
    initialHeadline: 'Untitled Story',
  }
}

function command(revision, text, commandId = `command-${revision}-${text}`) {
  return {
    commandId,
    expectedRevision: revision,
    type: 'content.update',
    payload: {
      slideId: seed().slideId,
      blockId: seed().blockId,
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'ui', label: 'Story headline' },
    issuedAt: '2026-08-27T03:00:00Z',
  }
}

function plainText(session) {
  return session.query('slide.activeProjection').headline.plainText
}

async function temporaryDeck(t) {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-store-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, requestedPath: join(root, 'Tracer'), packagePath: join(root, 'Tracer.pitchdeck') }
}

test('creates the schema-1 package atomically with the same manifest and entry contract as macOS', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({
    packagePath: paths.requestedPath,
    kernel,
    seed: seed(),
    now: new Date('2026-08-27T03:00:00Z'),
  })

  assert.equal(session.packagePath, paths.packagePath)
  assert.equal(session.revision, 0)
  assert.equal(plainText(session), 'Untitled Story')
  const manifestBytes = await readFile(join(paths.packagePath, 'manifest.json'))
  const checkpoint = await readFile(join(paths.packagePath, 'checkpoint.json'))
  const journal = await readFile(join(paths.packagePath, 'journal.ndjson'))
  const manifest = JSON.parse(manifestBytes)

  assert.deepEqual(Object.keys(manifest).sort(), [
    'canvasPreset', 'checkpointHash', 'checkpointRevision', 'createdAt', 'deckId',
    'format', 'journalHeadHash', 'schemaVersion', 'title', 'updatedAt',
  ])
  assert.equal(manifest.format, documentStoreContract.packageFormat)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.checkpointRevision, 0)
  assert.equal(manifest.checkpointHash, sha256(checkpoint))
  assert.equal(manifest.journalHeadHash, PitchDeckDocumentStore.zeroHash)
  assert.equal(manifest.createdAt, '2026-08-27T03:00:00Z')
  assert.equal(journal.length, 0)
  assert.equal(JSON.parse(checkpoint).format, documentStoreContract.checkpointFormat)
  await session.close({ save: false })
})

test('fsyncs the hash-chained record before committing live kernel state', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  const appendDurably = session.store.appendDurably.bind(session.store)
  let observedDurableRecord
  session.store.appendDurably = async (prepared) => {
    assert.equal(plainText(session), 'Untitled Story', 'prepare must not mutate live state')
    const record = await appendDurably(prepared, { now: new Date('2026-08-27T03:01:00Z') })
    assert.equal(plainText(session), 'Untitled Story', 'durable append must precede commit')
    observedDurableRecord = record
    return record
  }

  const result = await session.execute(command(0, 'Durable before visible', 'durability-command'))
  assert.equal(result.acknowledgement.revision, 1)
  assert.equal(plainText(session), 'Durable before visible')

  const journal = validateJournal(await readFile(join(paths.packagePath, 'journal.ndjson')))
  const manifest = JSON.parse(await readFile(join(paths.packagePath, 'manifest.json')))
  assert.equal(journal.records.length, 1)
  assert.equal(journal.records[0].command.commandId, 'durability-command')
  assert.equal(journal.records[0].previousHash, PitchDeckDocumentStore.zeroHash)
  assert.equal(journal.records[0].recordHash, observedDurableRecord.recordHash)
  assert.equal(journal.headHash, manifest.journalHeadHash)

  const unhashed = structuredClone(journal.records[0])
  delete unhashed.recordHash
  assert.equal(journal.records[0].recordHash, sha256(canonicalJSON(unhashed)))
  await session.close({ save: false })
})

test('rejects invalid and stale commands without touching state, journal, or history', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  await session.execute(command(0, 'First change', 'first-command'))
  const journalBefore = await readFile(join(paths.packagePath, 'journal.ndjson'))
  const historyBefore = session.query('history.summary')

  await assert.rejects(
    session.execute(command(0, 'Stale change', 'stale-command')),
    (error) => error instanceof WorkbenchFailure && error.name === 'StaleRevision',
  )
  const malformed = command(1, 'ignored', 'malformed-command')
  malformed.payload.value = { type: 'doc', content: [{ type: 'html', html: '<script />' }] }
  await assert.rejects(
    session.execute(malformed),
    (error) => error instanceof WorkbenchFailure && error.name === 'InvalidCommand',
  )

  assert.equal(plainText(session), 'First change')
  assert.deepEqual(session.query('history.summary'), historyBefore)
  assert.deepEqual(await readFile(join(paths.packagePath, 'journal.ndjson')), journalBefore)
  await session.close({ save: false })
})

test('replays durable command, undo, and redo records and persists history in a checkpoint', async (t) => {
  const paths = await temporaryDeck(t)
  let session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  await session.execute(command(0, 'Headline survives Linux reopen', 'history-command'))
  await session.undo()
  await session.redo()
  assert.equal(session.revision, 3)
  assert.equal(plainText(session), 'Headline survives Linux reopen')

  await session.close({ save: false })
  session = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(session.revision, 3)
  assert.equal(plainText(session), 'Headline survives Linux reopen')
  assert.deepEqual(session.query('history.summary'), {
    revision: 3,
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
  })

  await session.save()
  const checkpoint = JSON.parse(await readFile(join(paths.packagePath, 'checkpoint.json')))
  assert.equal(checkpoint.revision, 3)
  assert.equal(checkpoint.undoStack.length, 1)
  assert.equal(checkpoint.redoStack.length, 0)

  await session.close()
  session = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  await session.undo()
  assert.equal(session.revision, 4)
  assert.equal(plainText(session), 'Untitled Story')
})

test('repairs a stale manifest head only when it is an ancestor of a valid durable tail', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  await session.execute(command(0, 'Recovered tail', 'tail-command'))
  const manifestPath = join(paths.packagePath, 'manifest.json')
  const staleManifest = JSON.parse(await readFile(manifestPath))
  staleManifest.journalHeadHash = PitchDeckDocumentStore.zeroHash
  await writeFile(manifestPath, JSON.stringify(staleManifest, null, 2))
  await session.close({ save: false })

  const reopened = await DurableDeckSession.open({
    packagePath: paths.packagePath,
    kernel,
    now: new Date('2026-08-27T03:02:00Z'),
  })
  assert.equal(reopened.recovery.repairedJournalHead, true)
  assert.equal(plainText(reopened), 'Recovered tail')
  const repaired = JSON.parse(await readFile(manifestPath))
  const journal = validateJournal(await readFile(join(paths.packagePath, 'journal.ndjson')))
  assert.equal(repaired.journalHeadHash, journal.headHash)
  assert.equal(repaired.updatedAt, '2026-08-27T03:02:00Z')
  await reopened.close({ save: false })
})

test('rejects tampered and partial journals without mutating package evidence', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  await session.execute(command(0, 'Original durable text', 'tamper-command'))
  const manifestPath = join(paths.packagePath, 'manifest.json')
  const journalPath = join(paths.packagePath, 'journal.ndjson')
  const manifestBefore = await readFile(manifestPath)
  const [record] = (await readFile(journalPath, 'utf8')).trimEnd().split('\n').map(JSON.parse)
  record.command.payload.value.content[0].content[0].text = 'Tampered text'
  const tampered = Buffer.from(`${JSON.stringify(record)}\n`)
  await writeFile(journalPath, tampered)
  await session.close({ save: false })

  await assert.rejects(
    DurableDeckSession.open({ packagePath: paths.packagePath, kernel }),
    (error) => error instanceof WorkbenchFailure && error.name === 'JournalCorruption',
  )
  assert.deepEqual(await readFile(manifestPath), manifestBefore)
  assert.deepEqual(await readFile(journalPath), tampered)

  const partial = Buffer.from(JSON.stringify(record))
  await writeFile(journalPath, partial)
  await assert.rejects(
    PitchDeckDocumentStore.open(paths.packagePath),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'JournalCorruption'
      && /partial/.test(error.message),
  )
  assert.deepEqual(await readFile(journalPath), partial)
})

test('recovers the previous checkpoint when a replacement reached disk before its manifest', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  const checkpointPath = join(paths.packagePath, 'checkpoint.json')
  const priorCheckpoint = await readFile(checkpointPath)
  await writeFile(join(paths.packagePath, 'recovery', 'previous-checkpoint.json'), priorCheckpoint)
  await writeFile(checkpointPath, Buffer.from('{"interrupted":true}'))
  await session.close({ save: false })

  const reopened = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(reopened.recovery.recoveredPreviousCheckpoint, true)
  assert.equal(reopened.revision, 0)
  assert.equal(plainText(reopened), 'Untitled Story')
  await reopened.close({ save: false })
})

test('rejects symlinked required entries without reading or appending outside the package', async (t) => {
  const paths = await temporaryDeck(t)
  const session = await DurableDeckSession.create({ packagePath: paths.packagePath, kernel, seed: seed() })
  const journalPath = join(paths.packagePath, 'journal.ndjson')
  const outsidePath = join(paths.root, 'outside-journal.ndjson')
  const outsideBefore = Buffer.from('outside evidence must remain unchanged\n')
  await writeFile(outsidePath, outsideBefore)
  await rm(journalPath)
  await symlink(outsidePath, journalPath)

  await assert.rejects(
    session.execute(command(0, 'Must not escape', 'symlink-command')),
    (error) => error instanceof WorkbenchFailure && error.name === 'CheckpointWriteFailure',
  )
  assert.equal(session.revision, 0)
  assert.equal(plainText(session), 'Untitled Story')
  assert.deepEqual(await readFile(outsidePath), outsideBefore)
  await session.close({ save: false })

  await assert.rejects(
    PitchDeckDocumentStore.open(paths.packagePath),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'JournalCorruption'
      && /regular file/.test(error.message),
  )
  assert.deepEqual(await readFile(outsidePath), outsideBefore)
})
