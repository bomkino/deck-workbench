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

test('blank slide keeps three intentionally blank roles through reopen, undo and moving', () => {
  const s = session(), original = slides(s)[0]
  send(s, 'native.slide.add', { slideId: 'blank', sectionId: 'part', afterSlideId: 'one', title: 'Blank', kind: 'blank', assets: [] })
  const blank = slides(s)[1]
  assert.equal(blank.intent, 'text-only')
  assert.equal(blank.native.layout.preset, 'text-only')
  assert.equal(blank.native.layout.fitCopy, false)
  assert.equal(blank.native.included, true)
  assert.deepEqual(blank.contentBlocks.map(b => [b.role, b.state, b.value]), ['headline', 'subheadline', 'body'].map(role =>
    [role, 'intentionally-blank', { type: 'doc', content: [{ type: 'paragraph', content: [] }] }]))
  assert.deepEqual(slides(s)[0], original)
  const reopened = k.open(plain(k.serializeSession(s)))
  assert.deepEqual(slides(reopened), [original, blank])
  history(reopened); assert.deepEqual(slides(reopened), [original])
  history(reopened, true); assert.deepEqual(slides(reopened), [original, blank])
  send(reopened, 'slide.move', { slideId: 'blank', targetSectionId: 'part', afterSlideId: null })
  assert.deepEqual(slides(reopened), [blank, original])
  history(reopened); assert.deepEqual(slides(reopened), [original, blank])
})

test('solid layout keeps chosen images and independent shortlist through artwork mode and undo', () => {
  const s = session()
  send(s, 'native.slide.patch', { slideId: 'one', patch: { layout: { preset: 'three-images', crops: { primary: { x: .1, y: .2, width: .6, height: .7 } } } } })
  for (let i = 0; i < 3; i++) {
    const id = `chosen-${i}`, asset = { id, label: `${id}.png`, mediaKind: 'image', availability: 'available' }
    send(s, 'native.curate.set', { slideId: 'one', asset, action: 'use', role: i ? `primary:${i + 1}` : 'primary', assignmentId: `assignment-${id}` })
    send(s, 'native.curate.set', { slideId: 'one', asset, action: 'remove-shortlist' })
  }
  send(s, 'native.curate.set', { slideId: 'one', asset: { id: 'spare', label: 'Spare.png', mediaKind: 'image', availability: 'available' }, action: 'shortlist' })
  const original = slides(s)[0], assets = plain(k.query(s, 'native.document').deck.assetReferences)
  const choose = (target, preset) => send(target, 'native.slide.patch', { slideId: 'one', patch: { layout: { preset } } })
  choose(s, 'text-only')
  const solid = slides(s)[0]
  assert.deepEqual(solid.mediaAssignments, original.mediaAssignments)
  assert.deepEqual(solid.native.shortlist, ['spare'])
  assert.deepEqual(solid.contentBlocks, original.contentBlocks)
  assert.deepEqual(solid.native.layout.crops, original.native.layout.crops)
  assert.deepEqual(plain(k.query(s, 'native.document').deck.assetReferences), assets)
  const reopened = k.open(plain(k.serializeSession(s)))
  assert.deepEqual(slides(reopened)[0], solid)
  choose(reopened, 'left')
  assert.equal(slides(reopened)[0].native.layout.preset, 'left')
  assert.deepEqual(slides(reopened)[0].mediaAssignments, original.mediaAssignments)
  assert.deepEqual(slides(reopened)[0].native.shortlist, ['spare'])
  history(reopened); assert.deepEqual(slides(reopened)[0], solid)
  history(reopened); assert.deepEqual(slides(reopened)[0], original)
})
