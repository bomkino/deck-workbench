import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
const context = vm.createContext({ console })
vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), context)
const k = context.DeckKernel, plain = x => JSON.parse(JSON.stringify(x))
const session = () => k.open(k.createInitialCheckpoint({ deckId: 'deck', sectionId: 'part', slideId: 'one', blockId: 'head', title: 'Starter', initialHeadline: 'Keep this copy.' }))
const prepare = (s, type, payload) => k.prepare(s, { commandId: crypto.randomUUID(), expectedRevision: s.checkpoint.revision, type, payload, source: { kind: 'ui' }, issuedAt: '2026-09-14T17:00:00Z' })
const send = (s, type, payload) => { const p = prepare(s, type, payload); assert.equal(p.ok, true, p.error?.message); assert.notEqual(k.commit(s, p).ok, false); return p }
const slides = s => plain(k.query(s, 'native.document').deck.sections.flatMap(x => x.slides))
const history = (s, redo = false) => { const p = redo ? k.prepareRedo(s) : k.prepareUndo(s); assert.equal(p.ok, true, p.error?.message); assert.notEqual(k.commit(s, p).ok, false) }

test('independent type and palette edits preserve crop, copy and per-slide appearance through undo/reopen', () => {
  const s = session()
  send(s, 'native.slide.add', { slideId: 'two', sectionId: 'part', afterSlideId: 'one', title: 'Second' })
  send(s, 'native.slide.patch', { slideId: 'one', patch: { layout: { crops: { primary: { x: .1, y: .2, width: .6, height: .7 } }, appearance: 'light' } } })
  const before = slides(s)
  const starterType = structuredClone(before[1].native.layout.starterType)
  starterType.head.fontName = 'UserChosenFont'; starterType.head.step = 6; starterType.body.alignment = 'justified'
  send(s, 'native.layout.apply', { slideIds: ['one', 'two'], layout: { starterType } })
  const after = slides(s)
  assert.deepEqual(after.map(x => x.contentBlocks), before.map(x => x.contentBlocks))
  assert.deepEqual(after[0].native.layout.crops, before[0].native.layout.crops)
  assert.equal(after[0].native.layout.appearance, 'light'); assert.equal(after[1].native.layout.appearance, 'dark')
  history(s); assert.deepEqual(slides(s), before); history(s, true)
  assert.deepEqual(slides(k.open(plain(k.serializeSession(s)))), after)
  const revision = s.checkpoint.revision
  for (const layout of [{ starterType: { ...starterType, body: { ...starterType.body, step: 10 } } }, { palette: { colors: {} } }, { appearance: 'global' }]) {
    assert.equal(prepare(s, 'native.slide.patch', { slideId: 'one', patch: { layout } }).ok, false)
  }
  assert.equal(s.checkpoint.revision, revision)
})

test('twelve-image moodboard inserts atomically, keeps source identity and returns displaced slots to shortlist', () => {
  const s = session()
  const assets = Array.from({ length: 12 }, (_, i) => ({ asset: { id: `image-${i}`, label: `${i}.png`, mediaKind: 'image', availability: 'available' }, fingerprint: `hash-${i}` }))
  const payload = { slideId: 'board', sectionId: 'part', afterSlideId: 'one', title: 'Moodboard', kind: 'moodboard', assets }
  const before = plain(k.serializeSession(s))
  assert.equal(prepare(s, 'native.slide.add', { ...payload, assets: [...assets, assets[0]] }).ok, false)
  assert.deepEqual(plain(k.serializeSession(s)), before)
  send(s, 'native.slide.add', payload)
  send(s, 'native.slide.patch', { slideId: 'board', patch: { layout: { preset: 'auto' } } })
  assert.equal(slides(s)[1].mediaAssignments.length, 12)
  history(s)
  const board = slides(s)[1]
  assert.equal(board.contentBlocks[0].value.content[0].content[0].text, 'Moodboard')
  assert.equal(board.native.layout.imageCount, 12); assert.equal(board.mediaAssignments.length, 12)
  assert.equal(k.query(s, 'native.document').deck.assetReferences.length, 12)
  history(s); assert.equal(slides(s).length, 1); history(s, true)
  assert.deepEqual(slides(s)[1], board)
  send(s, 'native.slide.patch', { slideId: 'board', patch: { layout: { imageCount: 6 } } })
  assert.equal(slides(s)[1].mediaAssignments.length, 6); assert.equal(slides(s)[1].native.shortlist.length, 12)
  history(s); assert.equal(slides(s)[1].mediaAssignments.length, 12)
  const reopened = slides(k.open(plain(k.serializeSession(s))))[1]
  // Assignment array order is not placement order; roles define the visible slots.
  const normalized = value => ({ ...value, mediaAssignments: [...value.mediaAssignments].sort((a, b) => a.role.localeCompare(b.role)) })
  assert.deepEqual(normalized(reopened), normalized(board))
})

test('contents can move through the deck without changing authored writing or identity', () => {
  const s = session(), original = slides(s)[0].contentBlocks
  send(s, 'native.slide.add', { slideId: 'toc', sectionId: 'part', afterSlideId: 'one', title: 'Contents', kind: 'contents' })
  assert.equal(slides(s)[1].native.layout.contents, true)
  assert.equal(slides(s)[1].native.layout.columns, 2)
  send(s, 'slide.move', { slideId: 'toc', targetSectionId: 'part', afterSlideId: null })
  assert.deepEqual(slides(s).map(x => x.id), ['toc', 'one'])
  assert.deepEqual(slides(s)[1].contentBlocks, original)
  history(s); assert.deepEqual(slides(s).map(x => x.id), ['one', 'toc'])
})
