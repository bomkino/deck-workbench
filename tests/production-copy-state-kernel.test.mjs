import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const context = vm.createContext({ console })
vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), context)
const kernel = context.DeckKernel
const plain = value => JSON.parse(JSON.stringify(value))
const text = value => ({ type: 'doc', content: [{ type: 'paragraph', content: value ? [{ type: 'text', text: value }] : [] }] })

test('legacy visible copy keys and blank state survive replace, undo and reopen', () => {
  const checkpoint = plain(kernel.createInitialCheckpoint({ deckId: 'deck', sectionId: 'part', slideId: 'slide', blockId: 'head', title: 'Legacy copy', initialHeadline: 'Exact words.' }))
  const original = checkpoint.deck.sections[0].slides[0].contentBlocks[0]
  original.semanticKey = 'workbench.copy.headline'
  const session = kernel.open(checkpoint)
  const replacement = { ...original, value: text(''), state: 'intentionally-blank' }
  function replace(blocks, expectedBlocks) {
    return kernel.prepare(session, { commandId: crypto.randomUUID(), expectedRevision: session.checkpoint.revision,
      type: 'native.copy.replace', payload: { slides: [{ slideId: 'slide', blocks, expectedBlocks }] },
      source: { kind: 'ui' }, issuedAt: '2026-09-14T17:00:00Z' })
  }
  let prepared = replace([replacement], [original])
  assert.equal(prepared.ok, true, prepared.error?.message)
  assert.notEqual(kernel.commit(session, prepared).ok, false)
  const current = () => plain(kernel.query(session, 'native.document').deck.sections[0].slides[0].contentBlocks)
  assert.deepEqual(current(), [replacement])
  const reviewed = { ...replacement, state: 'unreviewed' }
  prepared = replace([reviewed], [replacement])
  assert.equal(prepared.ok, true, prepared.error?.message)
  assert.notEqual(kernel.commit(session, prepared).ok, false)
  assert.equal(current()[0].state, 'unreviewed')
  const undo = kernel.prepareUndo(session)
  assert.equal(undo.ok, true, undo.error?.message)
  assert.notEqual(kernel.commit(session, undo).ok, false)
  assert.equal(current()[0].state, 'intentionally-blank')
  const reopened = kernel.open(plain(kernel.serializeSession(session)))
  assert.deepEqual(plain(kernel.query(reopened, 'native.document').deck.sections[0].slides[0].contentBlocks), [replacement])
  const stale = replace([reviewed], [reviewed])
  assert.equal(stale.ok, false)
  assert.match(stale.error.message, /changed while the editor was open/)
  const invalid = replace([{ ...replacement, state: 'invented' }], [replacement])
  assert.equal(invalid.ok, false)
})
