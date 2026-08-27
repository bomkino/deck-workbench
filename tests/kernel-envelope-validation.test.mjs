import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

function checkpoint() {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: 'slide-00000000-0000-4000-8000-000000000001',
    blockId: 'block-00000000-0000-4000-8000-000000000001',
    title: 'Envelope Tracer',
    initialHeadline: 'Untitled Story',
  })
}

function validCommand(commandId = 'valid-command') {
  return {
    commandId,
    expectedRevision: 0,
    type: 'deck.rename',
    payload: { title: 'Bounded Deck' },
    source: { kind: 'cli', label: 'Envelope validation' },
    issuedAt: '2026-08-27T09:30:00Z',
  }
}

test('kernel rejects malformed command envelope fields before preparation and leaves history untouched', () => {
  const cases = [
    {
      mutate: (command) => { command.expectedRevision = -1 },
      message: 'expectedRevision must be a non-negative integer',
    },
    {
      mutate: (command) => { command.source.kind = 'renderer' },
      message: 'source.kind is unsupported',
    },
    {
      mutate: (command) => { command.source.label = 'l'.repeat(513) },
      message: 'source.label must be at most 512 characters',
    },
    {
      mutate: (command) => { command.issuedAt = 'next Tuesday' },
      message: 'issuedAt must be an ISO-8601 timestamp',
    },
    {
      mutate: (command) => { command.commandId = 'c'.repeat(257) },
      message: 'commandId must be at most 256 characters',
    },
    {
      mutate: (command) => { command.payload = [] },
      message: 'deck.rename requires an object payload',
    },
    {
      mutate: (command) => { command.payload.title = 'x'.repeat(262145) },
      message: 'Command contains a string longer than 262144 characters',
    },
    {
      mutate: (command) => {
        command.payload.padding = Array.from({ length: 5 }, () => 'x'.repeat(220000))
      },
      message: 'Command exceeds the 1 MiB limit',
    },
  ]

  for (const [index, item] of cases.entries()) {
    const session = kernel.open(checkpoint())
    const before = JSON.stringify(kernel.serializeSession(session))
    const command = validCommand(`malformed-${index}`)
    item.mutate(command)
    const result = kernel.prepare(session, command)
    assert.equal(result.error.name, 'InvalidCommand')
    assert.equal(result.error.message, item.message)
    assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
    assert.equal(kernel.query(session, 'history.summary', {}).undoDepth, 0)
  }
})

test('malformed retries cannot use a processed command ID to bypass envelope validation', () => {
  const session = kernel.open(checkpoint())
  const original = validCommand('processed-command')
  const prepared = kernel.prepare(session, original)
  assert.equal(prepared.ok, true)
  kernel.commit(session, prepared)
  const committed = JSON.stringify(kernel.serializeSession(session))

  const malformedRetry = validCommand('processed-command')
  malformedRetry.expectedRevision = 1
  malformedRetry.source.kind = 'renderer'
  const result = kernel.prepare(session, malformedRetry)

  assert.equal(result.error.name, 'InvalidCommand')
  assert.equal(result.error.message, 'source.kind is unsupported')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), committed)
  assert.equal(kernel.query(session, 'history.summary', {}).undoDepth, 1)
})
