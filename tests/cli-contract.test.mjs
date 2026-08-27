import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import vm from 'node:vm'

import { DurableDeckSession } from '../packages/document-store/index.mjs'

const execFileAsync = promisify(execFile)
const cliURL = new URL('../apps/cli/deck-workbench.mjs', import.meta.url)
const cliPath = fileURLToPath(cliURL)
const kernelSource = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')

function loadKernel() {
  const context = vm.createContext({ console })
  vm.runInContext(kernelSource, context, { filename: 'deck-kernel.js' })
  return context.DeckKernel
}

function seed() {
  return {
    deckId: 'deck-00000000-0000-4000-8000-000000000901',
    sectionId: 'section-00000000-0000-4000-8000-000000000901',
    slideId: 'slide-00000000-0000-4000-8000-000000000901',
    blockId: 'block-00000000-0000-4000-8000-000000000901',
    title: 'CLI Contract Deck',
    initialHeadline: 'Before CLI',
  }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packagePath = join(root, 'Contract.pitchdeck')
  const session = await DurableDeckSession.create({ packagePath, kernel: loadKernel(), seed: seed() })
  await session.close({ save: false })
  return { root, packagePath }
}

async function run(args, expectedCode = 0) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], { encoding: 'utf8' })
    assert.equal(expectedCode, 0, `expected CLI failure, received stdout: ${result.stdout}`)
    assert.equal(result.stderr, '')
    return JSON.parse(result.stdout)
  } catch (error) {
    assert.equal(error.code, expectedCode, error.stderr || error.message)
    assert.equal(error.stdout, '')
    return JSON.parse(error.stderr)
  }
}

async function durableBytes(packagePath) {
  return Promise.all(['manifest.json', 'checkpoint.json', 'journal.ndjson'].map((name) => readFile(join(packagePath, name))))
}

test('named query is read-only and returns structured JSON from an explicit Deck package', async (t) => {
  const { packagePath } = await fixture(t)
  const before = await durableBytes(packagePath)
  const output = await run([
    'query', '--document', packagePath, '--name', 'story.document',
  ])

  assert.equal(output.ok, true)
  assert.equal(output.operation, 'query')
  assert.equal(output.name, 'story.document')
  assert.equal(output.revision, 0)
  assert.equal(output.value.deckTitle, 'CLI Contract Deck')
  assert.equal(output.value.sections[0].slides[0].headline.plainText, 'Before CLI')
  const after = await durableBytes(packagePath)
  assert.deepEqual(after, before, 'a query must not checkpoint or otherwise write the package')
})

test('semantic command, undo, and redo persist through reopen on the shared durable seam', async (t) => {
  const { packagePath } = await fixture(t)
  const payload = JSON.stringify({
    slideId: seed().slideId,
    blockId: seed().blockId,
    value: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'After CLI' }] }],
    },
  })

  const changed = await run([
    'command', '--document', packagePath,
    '--name', 'content.update', '--expected-revision', '0',
    '--command-id', 'cli-content-update-1', '--payload', payload,
  ])
  assert.equal(changed.ok, true)
  assert.equal(changed.acknowledgement.revision, 1)
  assert.equal(changed.projection.headline.plainText, 'After CLI')

  let reopened = await DurableDeckSession.open({ packagePath, kernel: loadKernel() })
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'After CLI')
  assert.deepEqual(reopened.query('history.summary'), {
    revision: 1, canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0,
  })
  await reopened.close({ save: false })

  const undone = await run(['undo', '--document', packagePath])
  assert.equal(undone.acknowledgement.revision, 2)
  assert.equal(undone.projection.headline.plainText, 'Before CLI')
  reopened = await DurableDeckSession.open({ packagePath, kernel: loadKernel() })
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'Before CLI')
  assert.equal(reopened.query('history.summary').canRedo, true)
  await reopened.close({ save: false })

  const redone = await run(['redo', '--document', packagePath])
  assert.equal(redone.acknowledgement.revision, 3)
  assert.equal(redone.projection.headline.plainText, 'After CLI')
  reopened = await DurableDeckSession.open({ packagePath, kernel: loadKernel() })
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'After CLI')
  assert.deepEqual(reopened.query('history.summary'), {
    revision: 3, canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0,
  })
  await reopened.close({ save: false })
})

test('stale and invalid commands reject atomically with typed stderr and no durable write', async (t) => {
  const { packagePath } = await fixture(t)
  const validPayload = JSON.stringify({
    slideId: seed().slideId,
    blockId: seed().blockId,
    value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
  })
  await run([
    'command', '--document', packagePath, '--name', 'content.update',
    '--expected-revision', '0', '--command-id', 'first-command', '--payload', validPayload,
  ])

  let before = await durableBytes(packagePath)
  const stale = await run([
    'command', '--document', packagePath, '--name', 'content.update',
    '--expected-revision', '0', '--command-id', 'stale-command', '--payload', validPayload,
  ], 1)
  assert.deepEqual(stale, {
    ok: false,
    error: { name: 'StaleRevision', message: 'Expected revision 1; received 0' },
  })
  assert.deepEqual(await durableBytes(packagePath), before)

  before = await durableBytes(packagePath)
  const invalid = await run([
    'command', '--document', packagePath, '--name', 'content.update',
    '--expected-revision', '1', '--command-id', 'invalid-command',
    '--payload', JSON.stringify({ slideId: seed().slideId, blockId: seed().blockId, value: 'not-rich-text' }),
  ], 2)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.name, 'InvalidCommand')
  assert.match(invalid.error.message, /semantic rich-text JSON/)
  assert.deepEqual(await durableBytes(packagePath), before)

  const reopened = await DurableDeckSession.open({ packagePath, kernel: loadKernel() })
  assert.equal(reopened.revision, 1)
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'First')
  await reopened.close({ save: false })
})

test('CLI surface rejects unnamed capabilities and non-Deck paths before opening files', async (t) => {
  const { root, packagePath } = await fixture(t)
  const unknownQuery = await run([
    'query', '--document', packagePath, '--name', 'filesystem.read', '--params', '{}',
  ], 2)
  assert.equal(unknownQuery.error.name, 'InvalidCommand')
  assert.match(unknownQuery.error.message, /Unknown named query/)

  const nonDeck = await run([
    'query', '--document', join(root, 'secret.txt'), '--name', 'deck.summary',
  ], 2)
  assert.equal(nonDeck.error.name, 'InvalidCommand')
  assert.match(nonDeck.error.message, /\.pitchdeck/)

  const source = await readFile(cliPath, 'utf8')
  assert.doesNotMatch(source, /child_process|exec\(|spawn\(|eval\(|fetch\(|https?:\/\//)
  assert.doesNotMatch(source, /@file|daemon|listen\(|createServer/)
})
