import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel
const jsonKernel = context.DeckKernelJSON

const SECTION_ID = 'section-hardening-0000-4000-8000-000000000001'
const SLIDE_ID = 'slide-hardening-000000-4000-8000-000000000001'
const BLOCK_ID = 'block-hardening-000000-4000-8000-000000000001'

function checkpoint() {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-hardening-0000000-4000-8000-000000000001',
    sectionId: SECTION_ID,
    slideId: SLIDE_ID,
    blockId: BLOCK_ID,
    title: 'Curate hardening',
    initialHeadline: 'A safe visual story.',
  })
}

function envelope(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Curate hardening test' },
    issuedAt: '2026-08-29T20:00:00Z',
  }
}

function richText(text) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

function asset(id, availability = 'unknown') {
  return { id, label: id, mediaKind: 'image', availability }
}

function commit(session, command) {
  const prepared = kernel.prepare(session, command)
  assert.equal(prepared.ok, true, prepared.error?.message)
  const acknowledgement = kernel.commit(session, prepared)
  assert.equal(acknowledgement.status, 'committed')
  return prepared
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function curateSlide(session) {
  return plain(kernel.query(session, 'curate.slide', { slideId: SLIDE_ID }))
}

function assertHints(prepared, expected) {
  assert.equal(prepared.ok, true, prepared.error?.message)
  for (const name of expected) assert.equal(prepared.projectionHints.includes(name), true, `missing ${name}`)
}

function planMetadata(overrides = {}) {
  return JSON.stringify({
    format: 'pitchdog.workbench-plan',
    version: 1,
    contentPattern: 'gallery-captions',
    mediaSlotCount: 2,
    supportingItems: [],
    ...overrides,
  })
}

test('checkpoint open rejects global Media Assignment corruption and Curate ambiguity without throwing', () => {
  const cases = [
    {
      name: 'duplicate Asset Reference identity',
      mutate(value) {
        value.deck.assetReferences = [asset('asset-a'), asset('asset-a')]
      },
    },
    {
      name: 'missing assigned Asset Reference',
      mutate(value) {
        value.deck.sections[0].slides[0].mediaAssignments = [
          { id: 'assignment-missing', role: 'primary', assetReferenceId: 'asset-missing' },
        ]
      },
    },
    {
      name: 'duplicate role on one Slide',
      mutate(value) {
        value.deck.assetReferences = [asset('asset-a'), asset('asset-b')]
        value.deck.sections[0].slides[0].mediaAssignments = [
          { id: 'assignment-a', role: 'primary', assetReferenceId: 'asset-a' },
          { id: 'assignment-b', role: 'primary', assetReferenceId: 'asset-b' },
        ]
      },
    },
    {
      name: 'duplicate Assignment identity across Slides',
      mutate(value) {
        value.deck.assetReferences = [asset('asset-a')]
        const first = value.deck.sections[0].slides[0]
        first.mediaAssignments = [{ id: 'assignment-shared', role: 'primary', assetReferenceId: 'asset-a' }]
        const second = structuredClone(first)
        second.id = 'slide-hardening-000000-4000-8000-000000000002'
        second.contentBlocks[0].id = 'block-hardening-000000-4000-8000-000000000002'
        value.deck.sections[0].slides.push(second)
      },
    },
    {
      name: 'same Asset in two derived Curate slots',
      mutate(value) {
        value.deck.assetReferences = [asset('asset-a')]
        const slide = value.deck.sections[0].slides[0]
        slide.intent = 'diptych'
        slide.mediaAssignments = [
          { id: 'assignment-a', role: 'primary', assetReferenceId: 'asset-a' },
          { id: 'assignment-b', role: 'primary:2', assetReferenceId: 'asset-a' },
        ]
      },
    },
    {
      name: 'active Design Option borrowed from another Slide',
      mutate(value) {
        const first = value.deck.sections[0].slides[0]
        first.designOptions = [{
          id: 'option-first-slide',
          name: 'First Slide option',
          composition: { id: 'composition-first-slide', elements: [] },
        }]
        const second = structuredClone(first)
        second.id = 'slide-hardening-000000-4000-8000-000000000002'
        second.contentBlocks[0].id = 'block-hardening-000000-4000-8000-000000000002'
        delete second.designOptions
        second.activeDesignOptionId = 'option-first-slide'
        value.deck.sections[0].slides.push(second)
      },
    },
    {
      name: 'active and unplaced Assignment identity collision',
      mutate(value) {
        value.deck.assetReferences = [asset('asset-a'), asset('asset-b')]
        value.deck.sections[0].slides[0].mediaAssignments = [
          { id: 'assignment-active', role: 'primary', assetReferenceId: 'asset-a' },
        ]
        value.deck.workbenchCurate = {
          format: 'pitchdog.workbench-curate',
          version: 1,
          projectJudgments: {},
          slides: {
            [SLIDE_ID]: {
              slotManifest: [{ key: 'primary:1', assignmentRole: 'primary', kind: 'primary', ordinal: 0 }],
              decisions: {
                'asset-b': {
                  state: 'unplaced',
                  assignmentId: 'assignment-active',
                  previousSlotKey: 'primary:2',
                  previousAssignmentRole: 'primary:2',
                  reason: 'slot-contract-change',
                },
              },
              findMoreMedia: { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' },
            },
          },
        }
      },
    },
  ]

  for (const item of cases) {
    const candidate = checkpoint()
    item.mutate(candidate)
    const before = JSON.stringify(candidate)
    let opened
    assert.doesNotThrow(() => { opened = kernel.open(candidate) }, item.name)
    assert.equal(opened.ok, false, item.name)
    assert.equal(opened.error.name, 'InvalidCommand', item.name)
    assert.equal(JSON.stringify(candidate), before, item.name)
  }
})

test('legacy asset.assign uses Curate replacement semantics with stable identity through history and replay', () => {
  const initial = checkpoint()
  const session = kernel.open(initial)
  const records = []
  const first = asset('asset-first')
  const second = asset('asset-second')
  records.push(commit(session, envelope(0, 'asset.reference.add', {
    assetReferenceId: first.id,
    label: first.label,
    mediaKind: first.mediaKind,
  }, 'add-first')))
  records.push(commit(session, envelope(1, 'asset.reference.add', {
    assetReferenceId: second.id,
    label: second.label,
    mediaKind: second.mediaKind,
  }, 'add-second')))
  records.push(commit(session, envelope(2, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: first.id,
    decision: { state: 'selected', slotKey: 'primary:1', mediaAssignmentId: 'assignment-primary' },
  }, 'select-first')))
  records.push(commit(session, envelope(3, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: second.id,
    decision: { state: 'shortlisted' },
  }, 'shortlist-second')))
  const replacement = commit(session, envelope(4, 'asset.assign', {
    slideId: SLIDE_ID,
    mediaAssignmentId: 'assignment-primary',
    role: 'primary',
    assetReferenceId: second.id,
  }, 'legacy-replace'))
  records.push(replacement)
  assertHints(replacement, ['curate.queue', 'curate.slide', 'curate.assetStates'])

  let projected = curateSlide(session)
  assert.equal(projected.slots[0].selected.assignmentId, 'assignment-primary')
  assert.equal(projected.slots[0].selected.assetReferenceId, second.id)
  assert.deepEqual(projected.decisions.find((item) => item.assetReferenceId === first.id), {
    assetReferenceId: first.id,
    state: 'shortlisted',
  })
  assert.equal(projected.decisions.some((item) => item.assetReferenceId === second.id && item.state !== 'selected'), false)

  const undo = kernel.prepareUndo(session)
  assertHints(undo, ['curate.queue', 'curate.slide', 'curate.assetStates'])
  kernel.commit(session, undo)
  records.push(undo)
  projected = curateSlide(session)
  assert.equal(projected.slots[0].selected.assetReferenceId, first.id)
  assert.deepEqual(projected.decisions.find((item) => item.assetReferenceId === second.id), {
    assetReferenceId: second.id,
    state: 'shortlisted',
  })

  const redo = kernel.prepareRedo(session)
  assertHints(redo, ['curate.queue', 'curate.slide', 'curate.assetStates'])
  kernel.commit(session, redo)
  records.push(redo)
  assert.equal(curateSlide(session).slots[0].selected.assetReferenceId, second.id)

  const replayed = kernel.open(initial)
  for (const [index, prepared] of records.entries()) {
    const result = kernel.replayRecord(replayed, {
      revision: index + 1,
      ...plain(prepared.journalOperation),
    })
    assert.equal(result.revision, index + 1, result.error?.message)
  }
  assert.deepEqual(plain(kernel.serializeSession(replayed)), plain(kernel.serializeSession(session)))
})

test('one Asset cannot be assigned to two current Curate slots and failure is an atomic no-op', () => {
  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'asset.reference.add', {
    assetReferenceId: 'asset-one', label: 'One', mediaKind: 'image',
  }))
  commit(session, envelope(1, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'diptych' }))
  commit(session, envelope(2, 'asset.assign', {
    slideId: SLIDE_ID,
    mediaAssignmentId: 'assignment-one',
    role: 'primary',
    assetReferenceId: 'asset-one',
  }))
  const before = JSON.stringify(kernel.serializeSession(session))
  const result = kernel.prepare(session, envelope(3, 'asset.assign', {
    slideId: SLIDE_ID,
    mediaAssignmentId: 'assignment-two',
    role: 'primary:2',
    assetReferenceId: 'asset-one',
  }))
  assert.equal(result.error.name, 'InvalidCommand')
  assert.match(result.error.message, /another Curate slot/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
})

test('reserved prototype identities and removed availability mutation are rejected without inherited-map reads', () => {
  for (const reserved of ['__proto__', 'constructor', 'toString']) {
    const session = kernel.open(checkpoint())
    const before = JSON.stringify(kernel.serializeSession(session))
    let result
    assert.doesNotThrow(() => {
      result = kernel.prepare(session, envelope(0, 'deck.rename', { title: 'Safe title' }, reserved))
    })
    assert.equal(result.error.name, 'InvalidCommand')
    assert.match(result.error.message, /reserved identity/)
    assert.equal(JSON.stringify(kernel.serializeSession(session)), before)

    const unsafeAsset = kernel.prepare(session, envelope(0, 'asset.reference.add', {
      assetReferenceId: reserved,
      label: 'Unsafe identity',
      mediaKind: 'image',
    }, `unsafe-asset-${reserved}`))
    assert.equal(unsafeAsset.error.name, 'InvalidCommand')
    const query = kernel.query(session, 'curate.assetStates', {
      slideId: SLIDE_ID,
      assetReferenceIds: [reserved],
    })
    assert.equal(query.error.name, 'InvalidCommand')
  }

  const unsafeCheckpoint = checkpoint()
  unsafeCheckpoint.processedCommands = JSON.parse('{"constructor":{"status":"committed"}}')
  assert.equal(kernel.open(unsafeCheckpoint).error.name, 'InvalidCommand')

  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'asset.reference.add', {
    assetReferenceId: 'asset-safe', label: 'Safe', mediaKind: 'image',
  }))
  const before = JSON.stringify(kernel.serializeSession(session))
  const availability = kernel.prepare(session, envelope(1, 'asset.availability.set', {
    assetReferenceId: 'asset-safe', availability: 'missing',
  }))
  assert.equal(availability.error.name, 'InvalidCommand')
  assert.match(availability.error.message, /Unsupported command type/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
})

test('catalog liveness is normalized out of new durable Curate Asset References', () => {
  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'curate.projectJudgment.set', {
    assetReferenceId: 'asset-live',
    assetReference: asset('asset-live', 'available'),
    judgment: { rating: 5, review: 'keep', projectPick: true },
  }))
  assert.equal(kernel.serializeSession(session).deck.assetReferences[0].availability, 'unknown')
})

test('multiple role-or-semantic Workbench Plan blocks reject on open and atomically on write', () => {
  const firstBlock = {
    id: 'block-plan-primary',
    semanticKey: 'plan.primary-metadata',
    role: 'workbench-plan',
    value: richText(planMetadata()),
  }
  const secondBlock = {
    id: 'block-plan-shadow',
    semanticKey: 'workbench.plan.v1',
    role: 'metadata-shadow',
    value: richText(planMetadata()),
  }
  const ambiguous = checkpoint()
  ambiguous.deck.sections[0].slides[0].contentBlocks.push(firstBlock, secondBlock)
  const beforeOpen = JSON.stringify(ambiguous)
  let opened
  assert.doesNotThrow(() => { opened = kernel.open(ambiguous) })
  assert.equal(opened.error.name, 'InvalidCommand')
  assert.match(opened.error.message, /at most one Workbench Plan/)
  assert.equal(JSON.stringify(ambiguous), beforeOpen)

  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'content.add', {
    slideId: SLIDE_ID,
    ...firstBlock,
    blockId: firstBlock.id,
  }, 'add-primary-plan'))
  const beforeWrite = JSON.stringify(kernel.serializeSession(session))
  const result = kernel.prepare(session, envelope(1, 'content.add', {
    slideId: SLIDE_ID,
    ...secondBlock,
    blockId: secondBlock.id,
  }, 'add-shadow-plan'))
  assert.equal(result.error.name, 'InvalidCommand')
  assert.match(result.error.message, /at most one Workbench Plan/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), beforeWrite)
})

test('undo and redo replay require the exact top History Entry identity', () => {
  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'deck.rename', { title: 'Changed' }, 'replay-rename'))

  let before = JSON.stringify(kernel.serializeSession(session))
  let result = kernel.replayRecord(session, {
    revision: 2,
    operation: 'undo',
    historyEntryId: 'forged-entry',
  })
  assert.equal(result.error.name, 'JournalCorruption')
  assert.match(result.error.message, /top Undo entry/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)

  result = kernel.replayRecord(session, {
    revision: 2,
    operation: 'undo',
    historyEntryId: 'replay-rename',
  })
  assert.equal(result.revision, 2)
  before = JSON.stringify(kernel.serializeSession(session))
  result = kernel.replayRecord(session, {
    revision: 3,
    operation: 'redo',
    historyEntryId: 'forged-entry',
  })
  assert.equal(result.error.name, 'JournalCorruption')
  assert.match(result.error.message, /top Redo entry/)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)

  result = kernel.replayRecord(session, {
    revision: 3,
    operation: 'redo',
    historyEntryId: 'replay-rename',
  })
  assert.equal(result.revision, 3)
  assert.equal(kernel.query(session, 'deck.summary', {}).title, 'Changed')
})

test('reserved Workbench Plan metadata rejects atomically before slot reconciliation or allocation', () => {
  const session = kernel.open(checkpoint())
  commit(session, envelope(0, 'asset.reference.add', {
    assetReferenceId: 'asset-a', label: 'A', mediaKind: 'image',
  }))
  commit(session, envelope(1, 'asset.reference.add', {
    assetReferenceId: 'asset-b', label: 'B', mediaKind: 'image',
  }))
  commit(session, envelope(2, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'gallery' }))
  const planBlockId = 'block-workbench-plan-hardening'
  const planAdd = commit(session, envelope(3, 'content.add', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
    semanticKey: 'workbench.plan.v1',
    role: 'workbench-plan',
    value: richText(planMetadata()),
    afterBlockId: BLOCK_ID,
  }))
  assertHints(planAdd, ['curate.queue', 'curate.slide', 'curate.assetStates'])
  commit(session, envelope(4, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: 'asset-a',
    decision: { state: 'selected', slotKey: 'primary:1', mediaAssignmentId: 'assignment-a' },
  }))
  commit(session, envelope(5, 'curate.slideDecision.set', {
    slideId: SLIDE_ID,
    assetReferenceId: 'asset-b',
    decision: { state: 'selected', slotKey: 'primary:2', mediaAssignmentId: 'assignment-b' },
  }))

  for (const [name, metadata] of [
    ['malformed JSON', '{'],
    ['huge mediaSlotCount', planMetadata({ mediaSlotCount: 1_000_000 })],
    ['duplicate Supporting Item IDs', planMetadata({
      contentPattern: 'repeater',
      supportingItems: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }],
    })],
  ]) {
    const before = JSON.stringify(kernel.serializeSession(session))
    const rejected = kernel.prepare(session, envelope(6, 'content.update', {
      slideId: SLIDE_ID,
      blockId: planBlockId,
      value: richText(metadata),
    }, `invalid-plan-${name}`))
    assert.equal(rejected.error.name, 'InvalidCommand', name)
    assert.equal(JSON.stringify(kernel.serializeSession(session)), before, name)
    const slots = curateSlide(session).slots
    assert.deepEqual(slots.map((slot) => slot.selected.assetReferenceId), ['asset-a', 'asset-b'], name)
  }

  const validUpdate = kernel.prepare(session, envelope(6, 'content.update', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
    value: richText(planMetadata({ mediaSlotCount: 3 })),
  }, 'valid-plan-update'))
  assertHints(validUpdate, ['curate.queue', 'curate.slide', 'curate.assetStates'])
  const validRemove = kernel.prepare(session, envelope(6, 'content.remove', {
    slideId: SLIDE_ID,
    blockId: planBlockId,
  }, 'valid-plan-remove'))
  assertHints(validRemove, ['curate.queue', 'curate.slide', 'curate.assetStates'])
})

test('Slide structural changes and all history changes conservatively invalidate Curate projections', () => {
  const session = kernel.open(checkpoint())
  const added = commit(session, envelope(0, 'slide.add', {
    sectionId: SECTION_ID,
    slideId: 'slide-hardening-000000-4000-8000-000000000002',
    blockId: 'block-hardening-000000-4000-8000-000000000002',
    intent: 'text-only',
    headline: richText('Second Slide'),
    afterSlideId: SLIDE_ID,
  }))
  assertHints(added, ['curate.queue', 'curate.slide', 'curate.assetStates'])
  assertHints(kernel.prepare(session, envelope(1, 'slide.intent.set', {
    slideId: SLIDE_ID,
    intent: 'diptych',
  }, 'intent-hints')), ['curate.queue', 'curate.slide', 'curate.assetStates'])
  assertHints(kernel.prepare(session, envelope(1, 'slide.remove', {
    slideId: 'slide-hardening-000000-4000-8000-000000000002',
  }, 'remove-hints')), ['curate.queue', 'curate.slide', 'curate.assetStates'])
  assertHints(kernel.prepareUndo(session), ['curate.queue', 'curate.slide', 'curate.assetStates'])
})

test('curate.queue reports durable unplaced counts without per-Slide projection fan-out', () => {
  const session = kernel.open(checkpoint())
  assert.equal(kernel.query(session, 'curate.queue', {}).slides[0].unplacedCount, 0)
  commit(session, envelope(0, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'triptych' }))
  for (const [index, assetReferenceId] of ['asset-a', 'asset-b', 'asset-c'].entries()) {
    commit(session, envelope(index + 1, 'asset.reference.add', {
      assetReferenceId,
      label: assetReferenceId,
      mediaKind: 'image',
    }, `queue-add-${assetReferenceId}`))
  }
  for (const [index, assetReferenceId] of ['asset-a', 'asset-b', 'asset-c'].entries()) {
    commit(session, envelope(index + 4, 'curate.slideDecision.set', {
      slideId: SLIDE_ID,
      assetReferenceId,
      decision: {
        state: 'selected',
        slotKey: `primary:${index + 1}`,
        mediaAssignmentId: `assignment-${index + 1}`,
      },
    }, `queue-select-${assetReferenceId}`))
  }
  commit(session, envelope(7, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'full-bleed' }))

  let row = kernel.query(session, 'curate.queue', {}).slides[0]
  assert.equal(row.requiredSlotCount, 1)
  assert.equal(row.filledSlotCount, 1)
  assert.equal(row.unplacedCount, 2)

  kernel.commit(session, kernel.prepareUndo(session))
  row = kernel.query(session, 'curate.queue', {}).slides[0]
  assert.equal(row.unplacedCount, 0)
  assert.equal(row.filledSlotCount, 3)
})

test('malformed persisted and live history returns KernelError instead of throwing or mutating', () => {
  const historyCases = [
    {
      name: 'null entry',
      entries: [null],
    },
    {
      name: 'unknown operation',
      entries: [{
        id: 'history-unknown', label: 'Unknown',
        forward: { type: 'not.real', payload: {} },
        inverse: { type: 'deck.rename', payload: { title: 'Before' } },
      }],
    },
    {
      name: 'empty compound',
      entries: [{
        id: 'history-empty', label: 'Empty',
        forward: { type: 'deck.rename', payload: { title: 'After' } },
        inverse: { type: 'compound', payload: { operations: [] } },
      }],
    },
    {
      name: 'duplicate history identity',
      entries: [
        {
          id: 'history-duplicate', label: 'One',
          forward: { type: 'deck.rename', payload: { title: 'One' } },
          inverse: { type: 'deck.rename', payload: { title: 'Before' } },
        },
        {
          id: 'history-duplicate', label: 'Two',
          forward: { type: 'deck.rename', payload: { title: 'Two' } },
          inverse: { type: 'deck.rename', payload: { title: 'One' } },
        },
      ],
    },
  ]
  for (const item of historyCases) {
    const candidate = checkpoint()
    candidate.undoStack = item.entries
    const before = JSON.stringify(candidate)
    let opened
    assert.doesNotThrow(() => { opened = kernel.open(candidate) }, item.name)
    assert.equal(opened.error.name, 'InvalidCommand', item.name)
    assert.equal(JSON.stringify(candidate), before, item.name)
  }

  const undoSession = kernel.open(checkpoint())
  commit(undoSession, envelope(0, 'deck.rename', { title: 'Changed' }, 'rename-for-undo'))
  undoSession.checkpoint.undoStack.at(-1).inverse = {
    type: 'asset.assignment.remove',
    payload: { slideId: SLIDE_ID, mediaAssignmentId: 'assignment-missing' },
  }
  let before = JSON.stringify(kernel.serializeSession(undoSession))
  let undo
  assert.doesNotThrow(() => { undo = kernel.prepareUndo(undoSession) })
  assert.equal(undo.error.name, 'JournalCorruption')
  assert.equal(JSON.stringify(kernel.serializeSession(undoSession)), before)

  const redoSession = kernel.open(checkpoint())
  commit(redoSession, envelope(0, 'deck.rename', { title: 'Changed' }, 'rename-for-redo'))
  kernel.commit(redoSession, kernel.prepareUndo(redoSession))
  redoSession.checkpoint.redoStack.at(-1).forward = {
    type: 'asset.assignment.remove',
    payload: { slideId: SLIDE_ID, mediaAssignmentId: 'assignment-missing' },
  }
  before = JSON.stringify(kernel.serializeSession(redoSession))
  let redo
  assert.doesNotThrow(() => { redo = kernel.prepareRedo(redoSession) })
  assert.equal(redo.error.name, 'JournalCorruption')
  assert.equal(JSON.stringify(kernel.serializeSession(redoSession)), before)
})

test('JSON adapter converts malformed query, command, prepared-change, and journal JSON into KernelError', () => {
  const opened = JSON.parse(jsonKernel.open(JSON.stringify(checkpoint())))
  assert.equal(opened.ok, true)
  const calls = [
    { invoke: () => jsonKernel.query('deck.summary', '{'), name: 'InvalidCommand' },
    { invoke: () => jsonKernel.prepare('{'), name: 'InvalidCommand' },
    { invoke: () => jsonKernel.commit('{'), name: 'InvalidCommand' },
    { invoke: () => jsonKernel.replay('{'), name: 'JournalCorruption' },
  ]
  for (const item of calls) {
    let encoded
    assert.doesNotThrow(() => { encoded = item.invoke() })
    const result = JSON.parse(encoded)
    assert.equal(result.ok, false)
    assert.equal(result.error.name, item.name)
  }
})
