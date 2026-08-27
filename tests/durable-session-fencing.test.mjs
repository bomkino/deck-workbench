import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import {
  DurableDeckSession,
  WorkbenchFailure,
  validateJournal,
} from '../packages/document-store/index.mjs'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

function seed(prefix = 'fence') {
  return {
    deckId: `${prefix}-deck`,
    sectionId: `${prefix}-section`,
    slideId: `${prefix}-slide`,
    blockId: `${prefix}-headline`,
    title: 'Fence proof',
    initialHeadline: 'Before',
  }
}

function command(target, text, commandId = 'fence-command') {
  return {
    commandId,
    expectedRevision: 0,
    type: 'content.update',
    payload: {
      slideId: target.slideId,
      blockId: target.blockId,
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'ui', label: 'Durability fence proof' },
    issuedAt: '2026-08-27T00:00:00Z',
  }
}

async function fixture(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), `deck-workbench-${prefix}-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, packagePath: join(root, 'Fence.pitchdeck') }
}

test('a durable append followed by live commit failure fences mutation until reopen', async (t) => {
  const paths = await fixture(t, 'commit-fence')
  const target = seed('commit-fence')
  const faultingKernel = Object.create(kernel)
  Object.defineProperty(faultingKernel, 'commit', {
    value: () => ({
      ok: false,
      error: { name: 'KernelUnavailable', message: 'injected live commit failure' },
    }),
  })
  const session = await DurableDeckSession.create({
    packagePath: paths.packagePath,
    kernel: faultingKernel,
    seed: target,
  })

  await assert.rejects(
    session.execute(command(target, 'Durable but not live')),
    (error) => error.name === 'KernelUnavailable' && /close and reopen/.test(error.message),
  )
  assert.equal(session.query('slide.activeProjection').headline.plainText, 'Before')
  const journalBefore = await readFile(join(paths.packagePath, 'journal.ndjson'))
  assert.equal(validateJournal(journalBefore).lastRevision, 1)
  await assert.rejects(
    session.execute(command(target, 'Must not fork', 'second-command')),
    (error) => error.name === 'KernelUnavailable' && /requires reopen/.test(error.message),
  )
  assert.deepEqual(await readFile(join(paths.packagePath, 'journal.ndjson')), journalBefore)
  await session.close()

  const reopened = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(reopened.revision, 1)
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'Durable but not live')
  await reopened.close()
})

test('an interrupted durable append can close without stranding the writer lock', async (t) => {
  const paths = await fixture(t, 'append-fence')
  const target = seed('append-fence')
  const session = await DurableDeckSession.create({
    packagePath: paths.packagePath,
    kernel,
    seed: target,
  })
  session.store.appendDurably = async () => {
    session.store.requiresReopen = true
    throw new WorkbenchFailure('CheckpointWriteFailure', 'injected interrupted append')
  }
  await assert.rejects(
    session.execute(command(target, 'Not durable')),
    (error) => error.name === 'CheckpointWriteFailure',
  )
  await session.close()

  const reopened = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(reopened.revision, 0)
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'Before')
  await reopened.close()
})
