import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'

// Checkpoints and journals written by kernel 6261cb2 (before the v1.0 history
// fixes) through the JSON bridge the Mac host uses. The Mac app replays the
// journal through the current kernel on open, so these must keep working.
const fixture = (name) => JSON.parse(gunzipSync(fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url))))
const kernel = () => {
  const context = vm.createContext({ console })
  vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), context)
  return context.DeckKernelJSON
}
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sorted(v[key])])) : v
const swiftJSON = (v) => JSON.stringify(sorted(v))
const digest = (v) => createHash('sha256').update(swiftJSON(v)).digest('hex')
const call = (text) => { const value = JSON.parse(text); assert.notEqual(value.ok, false, value.error && `${value.error.name}: ${value.error.message}`); return value }
// Replacement copy now keeps only {id, semanticKey, role, value, state} and
// plain doc/paragraph/text rich text. The fixture's undo chain is recorded in
// that form; the text itself is identical.
const documentedCopy = (deck) => {
  const copy = JSON.parse(JSON.stringify(deck))
  for (const section of copy.sections) for (const slide of section.slides) {
    slide.contentBlocks = slide.contentBlocks.map((b) => ({ id: b.id, semanticKey: b.semanticKey, role: b.role, value: { type: 'doc', content: b.value.content.map((p) => ({ type: 'paragraph', content: p.content.map((n) => ({ type: 'text', text: n.text })) })) }, ...(b.state !== undefined ? { state: b.state } : {}) }))
  }
  return copy
}
const withoutCopy = (deck) => { const copy = JSON.parse(JSON.stringify(deck)); for (const section of copy.sections) for (const slide of section.slides) delete slide.contentBlocks; return copy }

test('a pre-fix checkpoint and journal open and replay to the same deck and history', () => {
  const saved = fixture('kernel-6261cb2-journal.json.gz')
  const json = kernel()
  call(json.open(swiftJSON(saved.checkpoint)))
  for (const record of saved.records) call(json.replay(swiftJSON(record)))
  const document = call(json.query('native.document', '{}'))
  assert.equal(document.revision, saved.expected.revision)
  assert.deepEqual(documentedCopy(document.deck), documentedCopy(saved.expected.document.deck))
  // Only the two replacements that carried extra fields and marks differ.
  assert.deepEqual(withoutCopy(document.deck), withoutCopy(saved.expected.document.deck))
  const changed = document.deck.sections.flatMap((s) => s.slides).flatMap((slide) => slide.contentBlocks
    .filter((block, i) => JSON.stringify(sorted(block)) !== JSON.stringify(sorted(saved.expected.document.deck.sections.flatMap((s) => s.slides).find((x) => x.id === slide.id).contentBlocks[i])))
    .map((block) => block.id))
  assert.deepEqual(changed.sort(), ['s1:h', 's4:h'])
  const checkpoint = call(json.serialize())
  assert.deepEqual(checkpoint.undoStack.map((e) => e.id), saved.expected.undoIds)
  assert.deepEqual(checkpoint.undoStack.map((e) => e.label), saved.expected.undoLabels)
  assert.deepEqual(checkpoint.redoStack.map((e) => e.id), saved.expected.redoIds)
  assert.deepEqual(Object.keys(checkpoint.processedCommands).sort(), saved.expected.processedCommandIds)
  // Undo walks the same states the pre-fix kernel did...
  for (const [step, expected] of saved.expected.undoChainDocumentedCopyDigests.entries()) {
    call(json.commit(JSON.stringify(call(json.prepareUndo()))))
    assert.equal(digest(documentedCopy(call(json.query('native.document', '{}')).deck)), expected, `undo step ${step + 1}`)
  }
  // ...and then past the entry that kernel could not undo, back to the start.
  assert.match(saved.expected.undoStoppedBecause, /reserved identity/)
  call(json.commit(JSON.stringify(call(json.prepareUndo()))))
  const start = kernel()
  call(start.open(swiftJSON(saved.checkpoint)))
  assert.deepEqual(call(json.query('native.document', '{}')).deck, call(start.query('native.document', '{}')).deck)
  assert.equal(JSON.parse(json.prepareUndo()).ok, false)
})

test('the pre-fix checkpoint saved after that journal reopens with its content', () => {
  const saved = fixture('kernel-6261cb2-journal.json.gz')
  assert.match(saved.expected.preFixReopenOfFinalCheckpoint, /reserved identity/, 'the pre-fix kernel could not reopen it')
  const json = kernel()
  call(json.open(swiftJSON(saved.finalCheckpoint)))
  assert.deepEqual(call(json.query('native.document', '{}')).deck, saved.expected.document.deck)
  // The unusable first entry is dropped; every later step remains.
  assert.deepEqual(call(json.serialize()).undoStack.map((e) => e.id), saved.expected.undoIds.filter((id) => id !== 'cmd-001'))
  for (const expected of saved.expected.undoChainDocumentedCopyDigests) {
    call(json.commit(JSON.stringify(call(json.prepareUndo()))))
    assert.equal(digest(documentedCopy(call(json.query('native.document', '{}')).deck)), expected)
  }
  assert.equal(JSON.parse(json.prepareUndo()).ok, false)
})

test('a pre-fix checkpoint holding an oversized copy-replacement entry opens; later steps still undo', () => {
  const saved = fixture('kernel-6261cb2-oversized-history.json.gz')
  assert.match(saved.preFixReopen, /1 to 1024 items/, 'the pre-fix kernel could not reopen it')
  const json = kernel()
  call(json.open(swiftJSON(saved.checkpoint)))
  assert.equal(digest(call(json.query('native.document', '{}')).deck), saved.expectedDocumentDigest, 'deck content opens unchanged')
  assert.deepEqual(call(json.serialize()).undoStack.map((e) => e.id), ['cmd-003'])
  call(json.commit(JSON.stringify(call(json.prepareUndo()))))
  const s1 = call(json.query('native.document', '{}')).deck.sections[0].slides.find((x) => x.id === 's1')
  assert.equal(s1.native.notes, '')
  assert.equal(s1.contentBlocks.find((b) => b.role === 'headline').value.content[0].content[0].text, 'New s1:h', 'the replaced copy stays')
  assert.equal(JSON.parse(json.prepareUndo()).ok, false)
  // New edits on the reopened deck are recorded and saved normally.
  const prepared = call(json.prepare(swiftJSON({ commandId: 'after-open', expectedRevision: 4, type: 'native.slide.patch', payload: { slideId: 's0', patch: { notes: 'Edited after reopen' } }, source: { kind: 'ui' }, issuedAt: '2026-10-17T12:00:00Z' })))
  call(json.commit(JSON.stringify(prepared)))
  const again = kernel()
  call(again.open(json.serialize()))
})
