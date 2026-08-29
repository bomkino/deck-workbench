import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

const SLIDE_ID = 'slide-curate-00000000-0000-4000-8000-000000000001'
const BLOCK_ID = 'block-curate-00000000-0000-4000-8000-000000000001'

function checkpoint() {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-curate-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-curate-00000000-0000-4000-8000-000000000001',
    slideId: SLIDE_ID,
    blockId: BLOCK_ID,
    title: 'Production Curate',
    initialHeadline: 'The visual evidence matters.',
  })
}

function envelope(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Production Curate test' },
    issuedAt: '2026-08-29T18:00:00Z',
  }
}

function asset(id, label = id) {
  return { id, label, mediaKind: 'image', availability: 'available' }
}

function selected(revision, assetReference, slotKey, mediaAssignmentId) {
  return envelope(revision, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: assetReference.id,
    assetReference,
    decision: { state: 'selected', slotKey, ...(mediaAssignmentId ? { mediaAssignmentId } : {}) },
  })
}

function decide(revision, assetReference, state) {
  return envelope(revision, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: assetReference.id,
    assetReference,
    decision: { state },
  })
}

function commit(session, command) {
  const prepared = kernel.prepare(session, command)
  assert.equal(prepared.ok, true, prepared.error?.message)
  const acknowledgement = kernel.commit(session, prepared)
  assert.equal(acknowledgement.status, 'committed')
  return prepared
}

function curateSlide(session) {
  return JSON.parse(JSON.stringify(kernel.query(session, 'curate.slide', { slideId: SLIDE_ID })))
}

function richText(text) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

function planMetadata(items) {
  return JSON.stringify({
    format: 'pitchdog.workbench-plan',
    version: 1,
    internalTitle: 'Comparable worlds',
    purpose: 'Bind every comparison to its own image.',
    lifecycle: 'included',
    textPresence: 'visible',
    contentPattern: 'repeater',
    copyFieldStates: { headline: 'present', subheadline: 'intentionally-blank', body: 'intentionally-blank' },
    supportingItems: items,
    mediaSlotCount: items.length,
    textHint: 'left',
  })
}

test('project judgment and per-Slide rejection remain independent and round-trip through schema 1', () => {
  const session = kernel.open(checkpoint())
  const image = asset('asset-global-slide', 'Hill at dusk')
  commit(session, envelope(0, 'curate.projectJudgment.set', {
    assetReferenceId: image.id,
    assetReference: image,
    judgment: { rating: 4, review: 'keep', projectPick: true },
  }))
  commit(session, decide(1, image, 'rejected-for-slide'))

  const states = JSON.parse(JSON.stringify(kernel.query(session, 'curate.assetStates', {
    slideId: SLIDE_ID,
    assetReferenceIds: [image.id],
  })))
  assert.deepEqual(states.assets[0].projectJudgment, { rating: 4, review: 'keep', projectPick: true })
  assert.deepEqual(states.assets[0].slideDecision, { state: 'rejected-for-slide' })

  const stored = kernel.serializeSession(session)
  assert.equal(stored.deck.schemaVersion, 1)
  assert.equal(stored.deck.workbenchCurate.format, 'pitchdog.workbench-curate')
  const reopened = kernel.open(stored)
  assert.deepEqual(
    JSON.parse(JSON.stringify(kernel.query(reopened, 'curate.assetStates', {
      slideId: SLIDE_ID,
      assetReferenceIds: [image.id],
    }))).assets[0],
    states.assets[0],
  )
})

test('slot replacement preserves assignment identity, demotes the old Primary, and leaves Find More open', () => {
  const session = kernel.open(checkpoint())
  const first = asset('asset-first', 'First image')
  const second = asset('asset-second', 'Second image')
  const assignmentId = 'assignment-primary-stable'
  commit(session, envelope(0, 'curate.findMore.set', {
    slideId: SLIDE_ID,
    value: { state: 'needed', brief: 'Find a warmer, wider frame.', existingPrimaryStatus: 'temporary' },
  }))
  commit(session, selected(1, first, 'primary:1', assignmentId))
  const replacement = commit(session, selected(2, second, 'primary:1'))

  let projection = curateSlide(session)
  assert.equal(projection.slots[0].selected.assignmentId, assignmentId)
  assert.equal(projection.slots[0].selected.assetReferenceId, second.id)
  assert.deepEqual(
    projection.decisions.find((item) => item.assetReferenceId === first.id),
    { assetReferenceId: first.id, state: 'shortlisted' },
  )
  assert.deepEqual(projection.findMoreMedia, {
    state: 'needed',
    brief: 'Find a warmer, wider frame.',
    existingPrimaryStatus: 'temporary',
  })

  const reopened = kernel.open(kernel.serializeSession(session))
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  projection = curateSlide(reopened)
  assert.equal(projection.slots[0].selected.assetReferenceId, first.id)
  assert.equal(projection.decisions.some((item) => item.assetReferenceId === first.id && item.state !== 'selected'), false)
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  projection = curateSlide(reopened)
  assert.equal(projection.slots[0].selected.assetReferenceId, second.id)
  assert.equal(replacement.journalOperation.command.type, 'curate.slideDecision.set')
})

test('Visual Style changes retain compatible slots and move incompatible selections to the unplaced tray', () => {
  const initial = checkpoint()
  const session = kernel.open(initial)
  const records = []
  records.push(commit(session, envelope(0, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'triptych' })))
  const assets = [asset('asset-one'), asset('asset-two'), asset('asset-three')]
  records.push(commit(session, selected(1, assets[0], 'primary:1', 'assignment-one')))
  records.push(commit(session, selected(2, assets[1], 'primary:2', 'assignment-two')))
  records.push(commit(session, selected(3, assets[2], 'primary:3', 'assignment-three')))
  records.push(commit(session, envelope(4, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'full-bleed' })))

  let projection = curateSlide(session)
  assert.equal(projection.slots.length, 1)
  assert.equal(projection.slots[0].selected.assetReferenceId, assets[0].id)
  const unplaced = projection.decisions.filter((item) => item.state === 'unplaced')
  assert.deepEqual(unplaced.map((item) => item.assetReferenceId).sort(), [assets[2].id, assets[1].id])
  assert.deepEqual(unplaced.map((item) => item.previousSlotKey).sort(), ['primary:2', 'primary:3'])
  assert.equal(unplaced.every((item) => item.reason === 'visual-style-change'), true)

  kernel.commit(session, kernel.prepareUndo(session))
  projection = curateSlide(session)
  assert.equal(projection.slots.length, 3)
  assert.deepEqual(projection.slots.map((slot) => slot.selected.assetReferenceId), assets.map((item) => item.id))
  kernel.commit(session, kernel.prepareRedo(session))
  assert.equal(curateSlide(session).decisions.filter((item) => item.state === 'unplaced').length, 2)

  const replayed = kernel.open(initial)
  for (const [index, prepared] of records.entries()) {
    const result = kernel.replayRecord(replayed, {
      revision: index + 1,
      ...JSON.parse(JSON.stringify(prepared.journalOperation)),
    })
    assert.equal(result.revision, index + 1)
  }
  const replayedProjection = curateSlide(replayed)
  const liveProjection = curateSlide(kernel.open(kernel.serializeSession(session)))
  assert.deepEqual(replayedProjection.slots, liveProjection.slots)
  assert.deepEqual(replayedProjection.decisions, liveProjection.decisions)
  assert.deepEqual(replayedProjection.findMoreMedia, liveProjection.findMoreMedia)
})

test('Supporting Item reorder preserves named assignments and removal unplaces only the removed identity', () => {
  const session = kernel.open(checkpoint())
  const planBlockId = 'block-workbench-plan'
  const bear = { id: 'bear', title: 'The Bear' }
  const dogs = { id: 'dogs', title: 'Reservation Dogs' }
  const us = { id: 'us', title: 'This Is Us' }
  commit(session, envelope(0, 'content.add', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
    semanticKey: 'workbench.plan.v1',
    role: 'workbench-plan',
    value: richText(planMetadata([bear, dogs, us])),
    afterBlockId: BLOCK_ID,
  }))
  const assets = [asset('asset-bear'), asset('asset-dogs'), asset('asset-us')]
  commit(session, selected(1, assets[0], 'item:bear:media', 'assignment-bear'))
  commit(session, selected(2, assets[1], 'item:dogs:media', 'assignment-dogs'))
  commit(session, selected(3, assets[2], 'item:us:media', 'assignment-us'))
  commit(session, envelope(4, 'content.update', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
    value: richText(planMetadata([us, bear, dogs])),
  }))
  let projection = curateSlide(session)
  assert.deepEqual(projection.slots.map((slot) => slot.key), [
    'item:us:media',
    'item:bear:media',
    'item:dogs:media',
  ])
  assert.deepEqual(projection.slots.map((slot) => slot.selected.assetReferenceId), [
    assets[2].id,
    assets[0].id,
    assets[1].id,
  ])

  commit(session, envelope(5, 'content.update', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
    value: richText(planMetadata([us, bear])),
  }))
  projection = curateSlide(session)
  const removed = projection.decisions.find((item) => item.assetReferenceId === assets[1].id)
  assert.equal(removed.state, 'unplaced')
  assert.equal(removed.previousSlotKey, 'item:dogs:media')
  assert.equal(removed.reason, 'supporting-item-removed')
  assert.equal(projection.slots.every((slot) => slot.selected), true)

  kernel.commit(session, kernel.prepareUndo(session))
  projection = curateSlide(session)
  assert.equal(projection.slots.find((slot) => slot.key === 'item:dogs:media').selected.assetReferenceId, assets[1].id)
})

test('malformed Curate state and external unplaced decisions reject without mutation', () => {
  const corrupt = checkpoint()
  corrupt.deck.workbenchCurate = {
    format: 'pitchdog.workbench-curate',
    version: 1,
    projectJudgments: { ghost: { rating: 7, review: 'keep', projectPick: false } },
    slides: {},
  }
  const opened = kernel.open(corrupt)
  assert.equal(opened.error.name, 'InvalidCommand')
  assert.match(opened.error.message, /does not exist|rating/)

  const session = kernel.open(checkpoint())
  const before = JSON.stringify(kernel.serializeSession(session))
  const image = asset('asset-invalid')
  const result = kernel.prepare(session, envelope(0, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: image.id,
    assetReference: image,
    decision: {
      state: 'unplaced',
      assignmentId: 'forged',
      previousSlotKey: 'primary:1',
      previousAssignmentRole: 'primary',
      reason: 'visual-style-change',
    },
  }))
  assert.equal(result.error.name, 'InvalidCommand')
  assert.match(result.error.message, /unsupported/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
})
