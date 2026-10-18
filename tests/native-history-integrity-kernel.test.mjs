import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

// History that commits must reopen and undo; open does not replay history;
// copy, curation and no-op rules for newly submitted commands.
const context = vm.createContext({ console })
vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), context)
const k = context.DeckKernel, json = context.DeckKernelJSON
const plain = (value) => JSON.parse(JSON.stringify(value))
let counter = 0
const command = (s, type, payload, commandId = `c${++counter}`) => ({ commandId, expectedRevision: s.checkpoint.revision, type, payload, source: { kind: 'ui' }, issuedAt: '2026-10-17T12:00:00Z' })
const send = (s, type, payload, id) => {
  const prepared = k.prepare(s, command(s, type, payload, id))
  assert.equal(prepared.ok, true, prepared.error?.message)
  if (!prepared.duplicate) assert.notEqual(k.commit(s, prepared, true).ok, false)
  return prepared
}
const refuse = (s, type, payload, pattern) => {
  const prepared = k.prepare(s, command(s, type, payload))
  assert.equal(prepared.ok, false, `${type} was accepted`)
  assert.match(prepared.error.message, pattern)
}
const undo = (s) => { const p = k.prepareUndo(s); assert.equal(p.ok, true, p.error?.message); k.commit(s, p, true) }
const redo = (s) => { const p = k.prepareRedo(s); assert.equal(p.ok, true, p.error?.message); k.commit(s, p, true) }
const reopen = (s) => { const r = k.open(plain(k.serializeSession(s))); assert.notEqual(r.ok, false, r.error?.message); return r }
const doc = (s) => plain(k.query(s, 'native.document'))
const slide = (s, id) => doc(s).deck.sections.flatMap((x) => x.slides).find((x) => x.id === id)
const copy = (s, id) => slide(s, id).contentBlocks.filter((b) => b.role !== 'workbench-plan')
const rt = (text) => ({ type: 'doc', content: text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) })
const asset = (id) => ({ id, label: `${id}.jpg`, mediaKind: 'image', availability: 'available' })
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sorted(v[key])])) : v

function importDeck(count, blocks = 3) {
  return k.createInitialCheckpoint({ deckId: 'deck', writingImport: { format: 'workbench-markdown/1', title: 'History', canvas: 'widescreen-1920x1080', parts: [{ id: 'p1', title: 'Part', purpose: 'p', slides: Array.from({ length: count }, (_, i) => ({
    id: `s${i}`, title: `Slide ${i}`, purpose: 'p', style: 'full-bleed', contentPattern: 'simple-copy', planBlockId: `s${i}:plan`,
    copies: {
      headline: { state: 'present', value: `H${i}`, blockId: `s${i}:h` },
      subheadline: blocks > 1 ? { state: 'present', value: `S${i}`, blockId: `s${i}:s` } : { state: 'unreviewed', value: '' },
      body: blocks > 2 ? { state: 'present', value: `B${i}`, blockId: `s${i}:b` } : { state: 'unreviewed', value: '' },
    },
  })) }] } })
}
const open = (checkpoint) => { const s = k.open(plain(checkpoint)); assert.notEqual(s.ok, false, s.error?.message); return s }

function maxCompound(operation) {
  if (operation.type !== 'compound') return 0
  return Math.max(operation.payload.operations.length, ...operation.payload.operations.map(maxCompound))
}

test('replacing copy on 150+ slides is one entry that undoes, redoes and reopens', () => {
  const s = open(importDeck(160))
  const before = doc(s).deck
  const slides = before.sections[0].slides
  send(s, 'native.copy.replace', { slides: slides.map((x) => ({ slideId: x.id, blocks: x.contentBlocks.filter((b) => b.role !== 'workbench-plan').map((b) => ({ ...b, value: rt(`New ${b.id}`) })) })) })
  const entry = s.checkpoint.undoStack.at(-1)
  assert.equal(s.checkpoint.undoStack.length, 1)
  assert.ok(maxCompound(entry.forward) <= 1024 && maxCompound(entry.inverse) <= 1024)
  assert.equal(entry.forward.payload.operations.length, 160, 'one nested compound per slide')
  const after = doc(s).deck
  assert.equal(after.sections[0].slides[159].contentBlocks.find((b) => b.role === 'body').value.content[0].content[0].text, 'New s159:b')
  const reopened = reopen(s)
  assert.deepEqual(doc(reopened).deck, after)
  undo(reopened)
  assert.deepEqual(doc(reopened).deck, before, 'one undo restores every slide exactly')
  const again = reopen(reopened)
  redo(again)
  assert.deepEqual(doc(again).deck, after)
})

test('a slide with more than 1024 copy fields still records one usable entry', () => {
  const s = open(importDeck(1))
  const many = Array.from({ length: 1100 }, (_, i) => ({ id: `f${i}`, semanticKey: `body.${i}`, role: i ? 'body' : 'headline', value: rt(`F${i}`) }))
  const before = doc(s).deck
  send(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: many }] })
  const entry = s.checkpoint.undoStack.at(-1)
  assert.ok(maxCompound(entry.forward) <= 1024 && maxCompound(entry.inverse) <= 1024)
  assert.equal(copy(s, 's0').length, 1100)
  const reopened = reopen(s)
  undo(reopened)
  assert.deepEqual(doc(reopened).deck, before)
})

test('replacement copy keeps only documented fields, so a reserved value cannot break undo or reopen', () => {
  const s = open(importDeck(1))
  const before = doc(s).deck
  const [headline, ...rest] = copy(s, 's0')
  send(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: [{ ...headline, sourceId: 'constructor', junk: { a: 1 }, value: { type: 'doc', meta: 1, content: [{ type: 'paragraph', attrs: { x: 1 }, content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' and plain', extra: true }] }] } }, ...rest] }] })
  assert.deepEqual(copy(s, 's0')[0], { id: headline.id, semanticKey: headline.semanticKey, role: 'headline', value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold' }, { type: 'text', text: ' and plain' }] }] } })
  const reopened = reopen(s)
  undo(reopened)
  assert.deepEqual(doc(reopened).deck, before)
})

test('a live change whose history entry open or undo would reject is refused; its journal record still replays', () => {
  const checkpoint = k.createInitialCheckpoint({ deckId: 'd', sectionId: 'p', slideId: 'one', blockId: 'h', title: 'T', initialHeadline: 'H' })
  // An older slide field whose name ends in "Id" and holds a reserved value:
  // the deck itself is valid, but an entry carrying the slide is not.
  checkpoint.deck.sections[0].slides[0].sourceSlideId = 'constructor'
  const s = open(checkpoint)
  refuse(s, 'native.slide.rename', { slideId: 'one', title: 'Renamed' }, /cannot be recorded for Undo/)
  assert.equal(s.checkpoint.revision, 0)
  const replayed = open(checkpoint)
  const result = k.replayRecord(replayed, { operation: 'command', revision: 1, command: command(replayed, 'native.slide.rename', { slideId: 'one', title: 'Renamed' }, 'old-rename') })
  assert.notEqual(result.ok, false, result.error?.message)
  assert.equal(slide(replayed, 'one').internalTitle, 'Renamed')
  assert.equal(replayed.checkpoint.undoStack.length, 0, 'replayed without an undo step')
  reopen(replayed)
})

test('a change from outside the kernel cannot commit malformed history', () => {
  const s = open(importDeck(1))
  const prepared = plain(k.prepare(s, command(s, 'native.slide.patch', { slideId: 's0', patch: { notes: 'x' } })))
  prepared.nextUndoStack[0].forward = { type: 'compound', payload: { operations: [] } }
  assert.equal(k.commit(s, prepared).ok, false)
  assert.equal(s.checkpoint.revision, 0)
})

test('open checks entry shape only; an entry that no longer applies fails its own undo without changing state', () => {
  const s = open(importDeck(2))
  send(s, 'native.slide.patch', { slideId: 's0', patch: { notes: 'one' } })
  send(s, 'native.slide.patch', { slideId: 's1', patch: { notes: 'two' } })
  const saved = plain(k.serializeSession(s))
  // The deepest step now refers to a slide that is gone: earlier kernels
  // refused to open the whole deck; it opens and the newer step still undoes.
  saved.undoStack[0].inverse = { type: 'native.slide.set', payload: { slideId: 'missing', value: null } }
  const reopened = open(saved)
  undo(reopened)
  assert.equal(slide(reopened, 's1').native.notes, '')
  const before = JSON.stringify(k.serializeSession(reopened))
  const failed = k.prepareUndo(reopened)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.name, 'JournalCorruption')
  assert.match(failed.error.message, /Slide does not exist/)
  assert.equal(JSON.stringify(k.serializeSession(reopened)), before)
})

test('native candidate validation still checks every slide against the deck assets', () => {
  const checkpoint = importDeck(3)
  checkpoint.deck.assetReferences = [asset('a1')]
  for (const [i, x] of checkpoint.deck.sections[0].slides.entries()) x.native = { version: 1, copyLocked: true, notes: '', included: true, shortlist: i === 2 ? ['a1', 'gone'] : ['a1'], rejected: [], sourceFingerprints: {}, layout: { preset: 'left', columns: 1, bodySize: 32, fitCopy: true, frames: {}, crops: {}, imageFits: {} } }
  const opened = k.open(plain(checkpoint))
  assert.equal(opened.ok, false)
  assert.match(opened.error.message, /Native candidate Asset does not exist/)
  checkpoint.deck.sections[0].slides[2].native.shortlist = ['a1']
  checkpoint.deck.sections[0].slides[1].native.sourceFingerprints = { gone: 'f' }
  assert.match(k.open(plain(checkpoint)).error.message, /Pinned source Asset does not exist/)
})

test('history is bounded by serialized size, keeping the newest entries; replay keeps at least as many', () => {
  const budget = vm.runInContext('HISTORY_CHARACTER_BUDGET', context)
  const s = open(importDeck(1, 1))
  const checkpoint = plain(k.serializeSession(s))
  const records = []
  const size = (stack) => stack.reduce((n, entry) => n + JSON.stringify(entry).length, 0)
  // Each replacement records about 2 × 240k characters of copy.
  for (let i = 0; i < 80; i++) {
    const c = command(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: [{ id: 's0:h', semanticKey: 'workbench.copy.headline', role: 'headline', value: rt(String.fromCharCode(97 + (i % 26)).repeat(240000)) }] }] }, `big-${i}`)
    const p = k.prepare(s, c)
    assert.equal(p.ok, true, p.error?.message)
    k.commit(s, p, true)
    records.push({ operation: 'command', revision: p.nextRevision, command: c })
  }
  const stack = s.checkpoint.undoStack
  const measured = vm.runInContext('historyEntrySize', context)
  for (const entry of [stack.at(-1), stack[0]]) assert.equal(measured(entry), JSON.stringify(entry).length)
  assert.ok(stack.length < 80 && stack.length > 10, `kept ${stack.length}`)
  assert.ok(size(stack) <= budget)
  assert.equal(stack.at(-1).id, 'big-79')
  assert.equal(stack[0].id, `big-${80 - stack.length}`, 'the oldest are dropped first')
  // Every kept entry still undoes, in order.
  const reopened = reopen(s)
  for (let i = 0; i < stack.length; i++) undo(reopened)
  assert.equal(copy(reopened, 's0')[0].value.content[0].content[0].text[0], String.fromCharCode(97 + ((80 - stack.length - 1) % 26)))
  // Replay of the same journal never holds fewer entries than the live session.
  const replayed = open(checkpoint)
  for (const record of records) assert.notEqual(k.replayRecord(replayed, record).ok, false)
  assert.ok(replayed.checkpoint.undoStack.length >= stack.length)
  assert.deepEqual(replayed.checkpoint.deck, s.checkpoint.deck)
})

test('re-sending an identical value with sorted keys is unchanged and keeps redo', () => {
  const s = open(importDeck(1))
  send(s, 'native.slide.add', { slideId: 'n1', sectionId: 'p1', afterSlideId: 's0', title: 'New', kind: 'slide' })
  send(s, 'native.slide.patch', { slideId: 'n1', patch: { notes: 'x' } })
  undo(s)
  const stored = slide(s, 'n1').native.layout.starterType
  assert.deepEqual(Object.keys(stored), ['head', 'sub', 'body'])
  const revision = s.checkpoint.revision
  const result = send(s, 'native.slide.patch', { slideId: 'n1', patch: { layout: { starterType: sorted(stored) } } })
  assert.equal(result.duplicate, true)
  assert.equal(result.acknowledgement.status, 'unchanged')
  assert.equal(s.checkpoint.revision, revision)
  assert.equal(s.checkpoint.redoStack.length, 1)
  // A real change is still a change.
  assert.equal(send(s, 'native.slide.patch', { slideId: 'n1', patch: { layout: { starterType: { ...sorted(stored), body: { ...stored.body, step: 1 } } } } }).duplicate, undefined)
})

test('undo restores every removed assignment of a rejected image in its original order', () => {
  const checkpoint = importDeck(1)
  checkpoint.deck.assetReferences = [asset('X'), asset('Y')]
  const target = checkpoint.deck.sections[0].slides[0]
  target.intent = 'full-bleed'
  target.mediaAssignments = [{ id: 'm1', role: 'primary:2', assetReferenceId: 'X' }, { id: 'm2', role: 'primary:3', assetReferenceId: 'X' }, { id: 'm3', role: 'primary', assetReferenceId: 'Y' }]
  const s = open(checkpoint)
  const before = slide(s, 's0')
  send(s, 'native.curate.set', { slideId: 's0', asset: asset('X'), action: 'reject' })
  assert.deepEqual(slide(s, 's0').mediaAssignments.map((a) => a.id), ['m3'])
  undo(s)
  assert.deepEqual(slide(s, 's0'), before)
})

test('shortlist and rejection stay disjoint for new commands; decks that already overlap stay editable', () => {
  const checkpoint = importDeck(1)
  checkpoint.deck.assetReferences = [asset('X'), asset('Y')]
  const target = checkpoint.deck.sections[0].slides[0]
  target.mediaAssignments = [{ id: 'm1', role: 'primary', assetReferenceId: 'X' }]
  // Written by an earlier kernel: Y both shortlisted and rejected.
  target.native = { version: 1, copyLocked: true, notes: '', included: true, shortlist: ['Y'], rejected: ['X', 'Y'], sourceFingerprints: {}, layout: { preset: 'left', columns: 1, bodySize: 32, fitCopy: true, frames: {}, crops: {}, imageFits: {} } }
  const s = open(checkpoint)
  send(s, 'native.slide.patch', { slideId: 's0', patch: { notes: 'still editable' } })
  send(s, 'native.curate.set', { slideId: 's0', asset: asset('X'), action: 'unassign' })
  let native = slide(s, 's0').native
  assert.deepEqual([native.shortlist, native.rejected], [['Y', 'X'], ['Y']], 'unassign keeps the image as a candidate, not rejected')
  assert.equal(slide(s, 's0').mediaAssignments, undefined)
  send(s, 'native.curate.set', { slideId: 's0', asset: asset('Y'), action: 'shortlist' })
  native = slide(s, 's0').native
  assert.deepEqual([native.shortlist, native.rejected], [['Y', 'X'], []])
  // An image an older kernel left assigned but rejected stays rejected, not
  // shortlisted, when a layout change displaces it from its slot.
  const two = importDeck(1)
  two.deck.assetReferences = [asset('A'), asset('Z')]
  const pair = two.deck.sections[0].slides[0]
  pair.mediaAssignments = [{ id: 'ma', role: 'primary', assetReferenceId: 'A' }, { id: 'mz', role: 'primary:2', assetReferenceId: 'Z' }]
  pair.native = { version: 1, copyLocked: true, notes: '', included: true, shortlist: [], rejected: ['Z'], sourceFingerprints: {}, layout: { preset: 'two-images', columns: 1, bodySize: 32, fitCopy: true, frames: {}, crops: {}, imageFits: {} } }
  const t = open(two)
  send(t, 'native.slide.patch', { slideId: 's0', patch: { layout: { preset: 'left' } } })
  native = slide(t, 's0').native
  assert.deepEqual([native.shortlist, native.rejected], [[], ['Z']])
  assert.deepEqual(slide(t, 's0').mediaAssignments.map((a) => a.id), ['ma'])
})

test('removing a shortlist entry or a rejection of an unknown image records nothing; older journals still replay it', () => {
  const s = open(importDeck(1))
  const unknown = { id: 'u1', label: 'u1.jpg', mediaKind: 'image', availability: 'available' }
  for (const action of ['remove-shortlist', 'clear-reject']) {
    const result = send(s, 'native.curate.set', { slideId: 's0', asset: unknown, action })
    assert.equal(result.duplicate, true, action)
    assert.equal(s.checkpoint.deck.assetReferences, undefined, action)
    assert.equal(s.checkpoint.undoStack.length, 0, action)
  }
  const replayed = open(importDeck(1))
  const record = { operation: 'command', revision: 1, command: command(replayed, 'native.curate.set', { slideId: 's0', asset: unknown, action: 'remove-shortlist' }, 'old-remove') }
  assert.notEqual(k.replayRecord(replayed, record).ok, false)
  assert.equal(replayed.checkpoint.revision, 1)
  assert.deepEqual(plain(replayed.checkpoint.deck.assetReferences), [unknown])
})

test('new replacement copy needs a field, at most one headline and text for present fields; unchanged older fields are exempt', () => {
  const s = open(importDeck(1))
  const blocks = copy(s, 's0')
  refuse(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: [] }] }, /at least one copy field/)
  refuse(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: [...blocks, { id: 'h2', semanticKey: 'headline.2', role: 'headline', value: rt('Second') }] }] }, /only one headline/)
  refuse(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: blocks.map((b, i) => i ? b : { ...b, value: rt(''), state: 'present' }) }] }, /marked present needs copy/)
  assert.equal(s.checkpoint.revision, 0)
  // Allowed: whitespace-only present copy (retained, flagged by Production),
  // no headline (plain-text and Copy.md replacement), blank fields.
  send(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: blocks.map((b, i) => i ? b : { ...b, value: rt('  '), state: 'present' }) }] })
  send(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: blocks.filter((b) => b.role !== 'headline') }] })
  send(s, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: [...copy(s, 's0'), { id: 'cap', semanticKey: 'caption.1', role: 'caption', value: rt(''), state: 'intentionally-blank' }] }] })
  // A slide an older kernel left with two headlines and an empty present
  // field can still have its other copy edited.
  const legacy = importDeck(1)
  legacy.deck.sections[0].slides[0].contentBlocks.splice(1, 0, { id: 'h2', semanticKey: 'headline.2', role: 'headline', value: rt(''), state: 'present' })
  const old = open(legacy)
  const fields = copy(old, 's0')
  send(old, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: fields.map((b) => b.role === 'body' ? { ...b, value: rt('Edited body') } : b) }] })
  assert.equal(copy(old, 's0').find((b) => b.role === 'body').value.content[0].content[0].text, 'Edited body')
  // Journal records of what older kernels accepted still replay.
  const replayed = open(importDeck(1))
  const record = (revision, blocksValue, id) => ({ operation: 'command', revision, command: { ...command(replayed, 'native.copy.replace', { slides: [{ slideId: 's0', blocks: blocksValue }] }, id), expectedRevision: revision - 1 } })
  assert.notEqual(k.replayRecord(replayed, record(1, blocks.map((b, i) => i ? b : { ...b, value: rt(''), state: 'present' }), 'old-1')).ok, false)
  assert.notEqual(k.replayRecord(replayed, record(2, [...blocks.slice(1), { id: 'h2', semanticKey: 'headline.2', role: 'headline', value: rt('a') }, { id: 'h3', semanticKey: 'headline.3', role: 'headline', value: rt('b') }], 'old-2')).ok, false)
  assert.notEqual(k.replayRecord(replayed, record(3, [], 'old-3')).ok, false)
  assert.deepEqual(copy(replayed, 's0'), [])
})

test('grouped layout application is one undo step across differently styled slides', () => {
  const s = open(importDeck(3))
  const before = doc(s).deck
  const palette = (hex) => ({ colors: Object.fromEntries(['background', 'text', 'muted', 'accent1', 'accent2', 'accent3', 'accent4', 'mono'].map((role) => [role, { dark: hex, light: hex }])) })
  const type = { fontName: 'Inter', step: 3, alignment: 'left', colorRole: 'text' }
  send(s, 'native.layout.apply', { groups: [
    { slideIds: ['s1'], layout: { starterType: { head: type, sub: type, body: type }, palette: palette('#112233') } },
    { slideIds: ['s0', 's2'], layout: { palette: palette('#445566') } },
  ] })
  assert.equal(s.checkpoint.undoStack.length, 1)
  assert.equal(s.checkpoint.undoStack[0].label, 'Apply prototype arrangement')
  assert.equal(slide(s, 's1').native.layout.palette.colors.text.dark, '#112233')
  assert.deepEqual(slide(s, 's1').native.layout.starterType.head, type)
  for (const id of ['s0', 's2']) {
    assert.equal(slide(s, id).native.layout.palette.colors.text.dark, '#445566')
    assert.equal(slide(s, id).native.layout.starterType, undefined)
  }
  const reopened = reopen(s); undo(reopened)
  assert.deepEqual(doc(reopened).deck, before, 'one undo restores all three slides')
  // Repeating the same groups changes nothing.
  assert.equal(send(s, 'native.layout.apply', { groups: [{ slideIds: ['s1'], layout: { palette: palette('#112233') } }, { slideIds: ['s0', 's2'], layout: { palette: palette('#445566') } }] }).duplicate, true)
  // Malformed groups are refused.
  refuse(s, 'native.layout.apply', { groups: [] }, /1–1000 layout groups/)
  refuse(s, 'native.layout.apply', { groups: [{ slideIds: [], layout: {} }] }, /needs slides/)
  refuse(s, 'native.layout.apply', { groups: [{ slideIds: ['s0'], layout: { columns: 2 } }, { slideIds: ['s0'], layout: { columns: 3 } }] }, /unique slides/)
  refuse(s, 'native.layout.apply', { groups: [{ slideIds: ['s0'], layout: { columns: 2 } }], slideIds: ['s1'], layout: {} }, /either layout groups/)
  refuse(s, 'native.layout.apply', { groups: [{ slideIds: ['s0'] }] }, /layout must be an object/)
  refuse(s, 'native.layout.apply', { groups: [{ slideIds: ['s0'], layout: { columns: 7 } }] }, /Invalid text flow/)
})

test('held-key nudges coalesce into one undo step per slide and target', () => {
  const s = open(importDeck(1))
  send(s, 'native.slide.add', { slideId: 'n1', sectionId: 'p1', afterSlideId: 's0', title: 'Nudge', kind: 'slide' })
  const frame = { x: 100, y: 100, width: 800, height: 400 }
  const nudge = (dx, extra = {}) => send(s, 'native.nudge', { slideId: 'n1', target: 'text', frame, dx, dy: 0, ...extra })
  nudge(10)
  for (let i = 0; i < 5; i++) nudge(10, { coalesce: true })
  assert.equal(slide(s, 'n1').native.layout.textFrame.x, 160)
  assert.equal(s.checkpoint.undoStack.length, 2)
  assert.equal(s.checkpoint.revision, 7, 'each nudge is still a revision')
  // A coalescing nudge of another target starts its own step.
  send(s, 'native.nudge', { slideId: 'n1', target: 'primary', frame, dx: 5, dy: 0, coalesce: true })
  assert.equal(s.checkpoint.undoStack.length, 3)
  undo(s)
  undo(s)
  assert.equal(slide(s, 'n1').native.layout.textFrame, undefined, 'one undo returns to before the first nudge')
  // Without the flag every nudge stays its own step.
  nudge(10); nudge(10)
  assert.equal(s.checkpoint.undoStack.length, 3)
})

test('notes autosave coalesces per slide, never across another action or an undo', () => {
  const s = open(importDeck(2))
  const notes = (slideId, text, coalesce = true) => send(s, 'native.slide.patch', { slideId, patch: { notes: text }, ...(coalesce ? { coalesce: true } : {}) })
  notes('s0', 'D'); notes('s0', 'Dr'); notes('s0', 'Draft')
  assert.equal(s.checkpoint.undoStack.length, 1)
  undo(s)
  assert.equal(slide(s, 's0').native.notes, '')
  redo(s)
  notes('s1', 'Other slide')
  assert.equal(s.checkpoint.undoStack.length, 2)
  send(s, 'native.slide.patch', { slideId: 's1', patch: { notes: 'With layout', layout: { columns: 2 } }, coalesce: true })
  assert.equal(s.checkpoint.undoStack.length, 3, 'a patch that is not notes-only is its own step')
  // A (coalescing) → layout change → undo → B (coalescing): B must not merge into A.
  const t = open(importDeck(1))
  send(t, 'native.slide.patch', { slideId: 's0', patch: { notes: 'A' }, coalesce: true })
  send(t, 'native.slide.patch', { slideId: 's0', patch: { layout: { columns: 2 } } })
  undo(t)
  send(t, 'native.slide.patch', { slideId: 's0', patch: { notes: 'B' }, coalesce: true })
  assert.equal(t.checkpoint.undoStack.length, 2)
  undo(t)
  assert.equal(slide(t, 's0').native.notes, 'A')
  undo(t)
  assert.equal(slide(t, 's0').native.notes, '')
})

test('coalesced history replays identically from a checkpoint through the JSON bridge', () => {
  const start = importDeck(1)
  assert.equal(JSON.parse(json.open(JSON.stringify(sorted(start)))).ok, true)
  const records = []
  let revision = 0, n = 0
  const run = (prepared) => {
    assert.notEqual(prepared.ok, false, prepared.error?.message)
    records.push({ ...prepared.journalOperation, revision: prepared.nextRevision })
    assert.equal(JSON.parse(json.commit(JSON.stringify(prepared))).status, 'committed')
    revision = prepared.nextRevision
  }
  const issue = (type, payload) => run(JSON.parse(json.prepare(JSON.stringify(sorted({ commandId: `j${++n}`, expectedRevision: revision, type, payload, source: { kind: 'keyboard' }, issuedAt: '2026-10-17T12:00:00Z' })))))
  issue('native.slide.patch', { slideId: 's0', patch: { notes: 'a' }, coalesce: true })
  issue('native.slide.patch', { slideId: 's0', patch: { notes: 'ab' }, coalesce: true })
  issue('native.slide.add', { slideId: 'n1', sectionId: 'p1', afterSlideId: 's0', title: 'N', kind: 'slide' })
  issue('native.nudge', { slideId: 'n1', target: 'text', frame: { x: 0, y: 0, width: 100, height: 100 }, dx: 4, dy: 4 })
  issue('native.nudge', { slideId: 'n1', target: 'text', frame: { x: 0, y: 0, width: 100, height: 100 }, dx: 4, dy: 4, coalesce: true })
  run(JSON.parse(json.prepareUndo()))
  issue('native.nudge', { slideId: 'n1', target: 'text', frame: { x: 0, y: 0, width: 100, height: 100 }, dx: 1, dy: 0, coalesce: true })
  issue('native.nudge', { slideId: 'n1', target: 'text', frame: { x: 0, y: 0, width: 100, height: 100 }, dx: 1, dy: 0, coalesce: true })
  run(JSON.parse(json.prepareUndo()))
  const live = JSON.parse(json.serialize())
  assert.equal(JSON.parse(json.open(JSON.stringify(sorted(start)))).ok, true)
  for (const record of records) assert.notEqual(JSON.parse(json.replay(JSON.stringify(sorted(record)))).ok, false)
  assert.deepEqual(sorted(JSON.parse(json.serialize())), sorted(live))
  // j2 merged into j1, j5 into j4; j6 did not merge into j3 after the undo; j7 merged into j6.
  assert.deepEqual(live.undoStack.map((e) => e.id), ['j1', 'j3'])
  assert.deepEqual(live.redoStack.map((e) => e.id), ['j6'])
})

test('the starter-schema flag follows history entries as they move between stacks', () => {
  assert.equal(JSON.parse(json.open(JSON.stringify(k.createInitialCheckpoint({ deckId: 'd', sectionId: 'p', slideId: 'one', blockId: 'h', title: 'T', initialHeadline: 'H' })))).ok, true)
  let revision = 0
  const prepare = (type, payload) => JSON.parse(json.prepare(JSON.stringify({ commandId: `f${++counter}`, expectedRevision: revision, type, payload, source: { kind: 'ui' }, issuedAt: '2026-10-17T12:00:00Z' })))
  const commit = (p) => { assert.equal(JSON.parse(json.commit(JSON.stringify(p))).status, 'committed'); revision = p.nextRevision }
  let p = prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'plain' } })
  assert.equal(p.requiresStarterSchema, false); commit(p)
  p = prepare('native.slide.add', { slideId: 'two', sectionId: 'p', afterSlideId: 'one', title: 'Two' })
  assert.equal(p.requiresStarterSchema, true); commit(p)
  p = JSON.parse(json.prepareUndo())
  assert.equal(p.requiresStarterSchema, true, 'the starter slide is now on the redo stack'); commit(p)
  p = prepare('native.slide.patch', { slideId: 'one', patch: { notes: 'clears redo' } })
  assert.equal(p.requiresStarterSchema, false)
})
