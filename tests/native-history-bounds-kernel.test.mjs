import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const context = vm.createContext({ console })
vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), context)
const k = context.DeckKernel, json = context.DeckKernelJSON, plain = x => JSON.parse(JSON.stringify(x))
const seed = { deckId: 'deck', sectionId: 'part', slideId: 'one', blockId: 'head', title: 'Bounds', initialHeadline: 'Keep this copy.' }
const session = () => k.open(k.createInitialCheckpoint(seed))
let counter = 0
const command = (s, type, payload, commandId = `c${++counter}`) => ({ commandId, expectedRevision: s.checkpoint.revision, type, payload, source: { kind: 'ui' }, issuedAt: '2026-10-17T12:00:00Z' })
const send = (s, type, payload, id) => { const p = k.prepare(s, command(s, type, payload, id)); assert.equal(p.ok, true, p.error?.message); if (!p.duplicate) assert.notEqual(k.commit(s, p).ok, false); return p }
const slides = s => plain(k.query(s, 'native.document').deck.sections.flatMap(x => x.slides))
const asset = id => ({ id, label: `${id}.jpg`, mediaKind: 'image', availability: 'available' })
const adapter = () => {
  const parse = text => JSON.parse(text)
  assert.equal(parse(json.open(JSON.stringify(k.createInitialCheckpoint(seed)))).ok, true)
  let revision = 0
  return {
    prepare(type, payload, id = `a${++counter}`) {
      return parse(json.prepare(JSON.stringify({ commandId: id, expectedRevision: revision, type, payload, source: { kind: 'ui' }, issuedAt: '2026-10-17T12:00:00Z' })))
    },
    commit(prepared) { const result = parse(json.commit(JSON.stringify(prepared))); if (result.ok !== false) revision = prepared.nextRevision; return result },
    document: () => parse(json.query('native.document', '{}')),
  }
}

test('the native bridge returns only the journal record and keeps the prepared deck in the kernel', () => {
  const host = adapter()
  const prepared = host.prepare('native.slide.add', { slideId: 'two', sectionId: 'part', afterSlideId: 'one', title: 'Two' })
  assert.equal(prepared.ok, true)
  for (const heavy of ['nextDeck', 'nextUndoStack', 'nextRedoStack', 'nextProcessedCommands']) assert.equal(prepared[heavy], undefined)
  assert.equal(prepared.nextRevision, 1)
  assert.equal(prepared.journalOperation.operation, 'command')
  assert.equal(prepared.requiresStarterSchema, true, 'a starter slide needs the schema 3 reader guard')
  assert.equal(host.commit(prepared).status, 'committed')
  assert.equal(host.document().deck.sections[0].slides.length, 2)
  // A token cannot be committed twice or after another prepare.
  assert.equal(host.commit(prepared).ok, false)
  const first = host.prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'first' } })
  const second = host.prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'second' } })
  assert.equal(host.commit(first).ok, false)
  assert.equal(host.commit(second).status, 'committed')
  assert.equal(host.document().deck.sections[0].slides[0].native.notes, 'second')
  const plainNote = host.prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'plain' } })
  assert.equal(plainNote.requiresStarterSchema, true, 'history containing starter fields still needs the reader guard')
})

test('a legacy deck note does not ask for the starter reader guard', () => {
  const host = adapter()
  const prepared = host.prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'A plain note' } })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.requiresStarterSchema, false)
})

test('undo history and duplicate-command memory stay bounded and replay deterministically', () => {
  const s = session()
  const ids = []
  for (let i = 0; i < 620; i++) { const id = `note-${i}`; ids.push(id); send(s, 'native.slide.patch', { slideId: 'one', patch: { notes: `n${i}` } }, id) }
  assert.equal(s.checkpoint.undoStack.length, 500)
  assert.equal(s.checkpoint.undoStack.at(-1).id, 'note-619')
  assert.equal(s.checkpoint.undoStack[0].id, 'note-120')
  // The latest command is still recognised as a duplicate after reopen.
  const reopened = k.open(plain(k.serializeSession(s)))
  assert.equal(reopened.ok, undefined)
  assert.equal(k.prepare(reopened, command(reopened, 'native.slide.patch', { slideId: 'one', patch: { notes: 'again' } }, 'note-619')).duplicate, true)
  for (let i = 0; i < 500; i++) { const p = k.prepareUndo(reopened); assert.equal(p.ok, true); k.commit(reopened, p) }
  assert.equal(k.prepareUndo(reopened).ok, false, 'trimmed entries are not undoable')
  assert.equal(slides(reopened)[0].native.notes, 'n119')
})

test('processed-command memory keeps the most recent acknowledgements by revision', () => {
  const s = session()
  const limit = 5000
  for (let i = 0; i < limit + 25; i++) send(s, 'native.slide.patch', { slideId: 'one', patch: { notes: `n${i}` } }, `id-${String(i).padStart(5, '0')}`)
  const kept = Object.keys(s.checkpoint.processedCommands)
  assert.equal(kept.length, limit)
  assert.ok(!kept.includes('id-00000'))
  assert.ok(kept.includes(`id-${String(limit + 24).padStart(5, '0')}`))
  // Key order is irrelevant: a checkpoint with sorted keys trims identically.
  const sorted = plain(k.serializeSession(s))
  sorted.processedCommands = Object.fromEntries(Object.entries(sorted.processedCommands).sort(([a], [b]) => (a < b ? 1 : -1)))
  const reopened = k.open(sorted)
  send(reopened, 'native.slide.patch', { slideId: 'one', patch: { notes: 'last' } }, 'final')
  const after = Object.keys(reopened.checkpoint.processedCommands)
  assert.ok(after.includes('final') && !after.includes('id-00025') && after.includes('id-00026'))
})

test('the bridge payload does not grow with history', () => {
  const host = adapter()
  const sizes = []
  for (let i = 0; i < 300; i++) {
    const prepared = host.prepare('native.slide.patch', { slideId: 'one', patch: { notes: `note ${i}` } })
    sizes.push(JSON.stringify(prepared).length)
    host.commit(prepared)
  }
  assert.ok(sizes.at(-1) - sizes[0] < 64, `prepared payload grew from ${sizes[0]} to ${sizes.at(-1)} bytes`)
})

test('starter palette gradients in either hex case are accepted and stored lowercase', () => {
  const s = session()
  send(s, 'native.slide.add', { slideId: 'two', sectionId: 'part', afterSlideId: 'one', title: 'Styled' })
  const gradient = colour => ({ type: 'linear', start: { x: 0, y: 0.5 }, end: { x: 0.72, y: 0.5 }, opacity: 0.6, colors: { start: colour, end: colour } })
  send(s, 'native.slide.patch', { slideId: 'two', patch: { layout: { gradient: gradient('#24171D') } } })
  assert.deepEqual(slides(s)[1].native.layout.gradient.colors, { start: '#24171d', end: '#24171d' })
  send(s, 'native.layout.apply', { slideIds: ['one'], layout: { gradient: gradient('#FFF8EE') } })
  assert.deepEqual(slides(s)[0].native.layout.gradient.colors, { start: '#fff8ee', end: '#fff8ee' })
  send(s, 'native.slide.patch', { slideId: 'two', patch: { layout: { gradient: null } } })
  send(s, 'native.nudge', { slideId: 'two', target: 'gradient', frame: { x: 0, y: 0, width: 2576, height: 1080 }, dx: 20, dy: 0, gradient: gradient('#ABCDEF') })
  assert.equal(slides(s)[1].native.layout.gradient.colors.start, '#abcdef')
  assert.equal(k.prepare(s, command(s, 'native.slide.patch', { slideId: 'two', patch: { layout: { gradient: gradient('pink') } } })).ok, false)
})

test('undo restores displaced assignments in their original order', () => {
  const s = session()
  send(s, 'native.slide.add', { slideId: 'board', sectionId: 'part', afterSlideId: 'one', title: 'Board', kind: 'moodboard', assets: ['a', 'b', 'c', 'd', 'e'].map(id => ({ asset: asset(id) })) })
  const before = slides(s)[1]
  send(s, 'native.curate.set', { slideId: 'board', asset: asset('b'), action: 'reject', role: 'primary', assignmentId: 'x' })
  send(s, 'native.slide.patch', { slideId: 'board', patch: { layout: { imageCount: 2, frames: null } } })
  for (let i = 0; i < 2; i++) { const p = k.prepareUndo(s); assert.equal(p.ok, true); k.commit(s, p) }
  assert.deepEqual(slides(s)[1], before)
})

test('copy edits can carry a digest instead of the complete previous copy', () => {
  const s = session()
  const old = slides(s)[0].contentBlocks
  const digest = context.nativeCopyDigest(old)
  // Pinned so the Swift implementation can be checked against the same value.
  assert.equal(context.nativeCopyDigest([{ id: 'b1', semanticKey: 'body.1', role: 'body', value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ünïcode — 👩🏽‍💻' }] }, { type: 'paragraph', content: [] }] }, state: 'present' }]), 'v1:43:b1022c75:5f03a63c')
  const changed = plain(old); changed[0].value = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited' }] }] }
  const stale = k.prepare(s, command(s, 'native.copy.replace', { slides: [{ slideId: 'one', blocks: changed, expectedCopyDigest: 'v1:0:00000000:00000000' }] }))
  assert.equal(stale.ok, false)
  assert.match(stale.error.message, /changed while the editor was open/)
  send(s, 'native.copy.replace', { slides: [{ slideId: 'one', blocks: changed, expectedCopyDigest: digest }] })
  assert.equal(slides(s)[0].contentBlocks[0].value.content[0].content[0].text, 'Edited')
})
