import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

const SLIDE_ID = 'slide-plan-00000000-0000-4000-8000-000000000001'
const OPTION_ID = 'option-plan-00000000-0000-4000-8000-000000000001'
const COPY_IDS = {
  headline: 'block-headline-00000000-0000-4000-8000-000000000001',
  subheadline: 'block-subheadline-00000000-0000-4000-8000-000000000001',
  body: 'block-body-00000000-0000-4000-8000-000000000001',
}

function checkpoint(style, mediaSlotCount = 0, canvas = 'cinemascope-2576x1080') {
  const value = kernel.createInitialCheckpoint({
    deckId: `deck-${style}-00000000-0000-4000-8000-000000000001`,
    writingImport: {
      format: 'workbench-markdown/1',
      title: 'Assembly from Plan',
      canvas,
      parts: [{
        id: 'part-00000000-0000-4000-8000-000000000001',
        title: 'Main',
        purpose: 'Show the idea',
        slides: [{
          id: SLIDE_ID,
          title: 'Opening',
          purpose: 'Set the stakes',
          style,
          contentPattern: 'simple-copy',
          planBlockId: 'block-plan-00000000-0000-4000-8000-000000000001',
          copies: {
            headline: { state: 'present', value: 'The headline', blockId: COPY_IDS.headline },
            subheadline: { state: 'present', value: 'The subheadline', blockId: COPY_IDS.subheadline },
            body: { state: 'present', value: 'The body', blockId: COPY_IDS.body },
          },
        }],
      }],
    },
  })
  const planBlock = value.deck.sections[0].slides[0].contentBlocks.find((block) => block.role === 'workbench-plan')
  const metadata = JSON.parse(planBlock.value.content[0].content[0].text)
  metadata.mediaSlotCount = mediaSlotCount
  planBlock.value.content[0].content[0].text = JSON.stringify(metadata)
  return value
}

function command(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Assembly test' },
    issuedAt: '2026-09-02T12:00:00Z',
  }
}

function commit(session, value) {
  const prepared = kernel.prepare(session, value)
  assert.equal(prepared.ok, true, prepared.error?.message)
  const result = kernel.commit(session, prepared)
  assert.equal(result.status, 'committed')
  return prepared
}

function sortedKeyRoundTrip(value) {
  const sort = (candidate) => {
    if (Array.isArray(candidate)) return candidate.map(sort)
    if (!candidate || typeof candidate !== 'object') return candidate
    return Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, sort(candidate[key])]))
  }
  return JSON.parse(JSON.stringify(sort(value)))
}

function createFromPlan(session, revision = 0) {
  return commit(session, command(revision, 'designOption.createFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
  }))
}

function rebuildFromPlan(session, revision) {
  return commit(session, command(revision, 'designOption.rebuildFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
  }))
}

test('Plan Visual Styles create one complete deterministic Assembly with exact text and Curate role bindings', () => {
  const cases = [
    ['text-only', 0, []],
    ['full-bleed', 0, ['primary']],
    ['full-bleed-overlay', 0, ['primary']],
    ['image-text', 0, ['primary']],
    ['diptych', 0, ['primary', 'primary:2']],
    ['triptych', 0, ['primary', 'primary:2', 'primary:3']],
    ['gallery', 4, ['primary', 'primary:2', 'primary:3', 'primary:4']],
    ['custom', 5, ['primary', 'primary:2', 'primary:3', 'primary:4', 'primary:5']],
  ]

  for (const [style, mediaSlotCount, expectedRoles] of cases) {
    const session = kernel.open(checkpoint(style, mediaSlotCount))
    createFromPlan(session)
    const projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
    assert.equal(projection.designOption.id, OPTION_ID)
    assert.equal(projection.designOption.source, 'plan')
    assert.equal(projection.designOption.planReviewRequired, false)
    assert.deepEqual(JSON.parse(JSON.stringify(projection.designOption.planReviewReasons)), [])
    assert.equal(projection.designOption.pattern, null)
    assert.deepEqual(
      JSON.parse(JSON.stringify(projection.composition.elements.filter((element) => element.kind === 'image').map((element) => element.mediaRole))),
      expectedRoles,
    )
    for (const role of ['headline', 'subheadline', 'body']) {
      const element = projection.composition.elements.find((candidate) => candidate.patternElementKey === role)
      assert.equal(element.contentBlockId, COPY_IDS[role])
    }
    for (const element of projection.composition.elements) {
      assert.ok(element.frame.x >= 0 && element.frame.y >= 0)
      assert.ok(element.frame.x + element.frame.width <= projection.canvas.width)
      assert.ok(element.frame.y + element.frame.height <= projection.canvas.height)
    }
    const gradients = projection.composition.elements.filter((element) => element.gradient)
    assert.equal(gradients.length, style === 'full-bleed-overlay' ? 1 : 0)
  }
})

test('the full-bleed overlay gradient is bounded, durable, undoable and canvas-independent', () => {
  let session = kernel.open(checkpoint('full-bleed-overlay'))
  createFromPlan(session)
  let projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  const gradientElement = projection.composition.elements.find((element) => element.gradient)
  assert.deepEqual(JSON.parse(JSON.stringify(gradientElement.gradient)), {
    type: 'linear',
    start: { x: 0, y: 0.5 },
    end: { x: 0.72, y: 0.5 },
    opacity: 0.78,
    colors: { start: '#000000', end: '#000000' },
  })

  const updated = {
    type: 'linear',
    start: { x: 0.1, y: 0.2 },
    end: { x: 0.9, y: 0.8 },
    opacity: 0.55,
  }
  commit(session, command(1, 'element.gradient.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: gradientElement.id,
    gradient: updated,
  }))
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.deepEqual(JSON.parse(JSON.stringify(projection.composition.elements.find((element) => element.gradient).gradient)), updated)

  session = kernel.open(kernel.serializeSession(session))
  assert.equal(kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
    .composition.elements.find((element) => element.gradient).gradient.opacity, 0.55)

  commit(session, command(2, 'canvas.preset.set', { canvasPresetId: 'a4-portrait' }))
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  const afterCanvas = projection.composition.elements.find((element) => element.gradient)
  assert.equal(projection.designOption.planReviewRequired, true)
  assert.deepEqual(JSON.parse(JSON.stringify(projection.designOption.planReviewReasons)), ['canvas-changed'])
  assert.equal(projection.designOption.canvasReviewRequired, true)
  assert.deepEqual(JSON.parse(JSON.stringify(afterCanvas.gradient)), updated)
  assert.deepEqual(JSON.parse(JSON.stringify(afterCanvas.frame)), {
    x: 0,
    y: 0,
    width: 2480,
    height: 3508,
  })

  kernel.commit(session, kernel.prepareUndo(session))
  kernel.commit(session, kernel.prepareUndo(session))
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.canvas.id, 'cinemascope-2576x1080')
  assert.equal(projection.composition.elements.find((element) => element.gradient).gradient.opacity, 0.78)

  const invalid = kernel.prepare(session, command(5, 'element.gradient.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: gradientElement.id,
    gradient: { ...updated, opacity: 1.01 },
  }, 'invalid-gradient'))
  assert.equal(invalid.error.message, 'gradient.opacity must be between 0 and 1')
})

test('createFromPlan resolves legacy undecided to Full Bleed, refuses unknown styles, and never replaces an existing Design Option', () => {
  const legacyCheckpoint = checkpoint('full-bleed')
  legacyCheckpoint.deck.sections[0].slides[0].intent = 'undecided'
  const legacy = kernel.open(legacyCheckpoint)
  createFromPlan(legacy)
  const legacyProjection = kernel.query(legacy, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(legacyProjection.designOption.planAtCreation.visualStyle, 'full-bleed')
  assert.equal(legacyProjection.composition.elements.filter((element) => element.kind === 'image').length, 1)

  const unknownCheckpoint = checkpoint('full-bleed')
  unknownCheckpoint.deck.sections[0].slides[0].intent = 'unknown-style'
  const unknown = kernel.open(unknownCheckpoint)
  const rejected = kernel.prepare(unknown, command(0, 'designOption.createFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
  }))
  assert.equal(rejected.error.message, 'Visual Style must be decided before creating Assembly')
  assert.equal(kernel.query(unknown, 'slide.activeProjection', { slideId: SLIDE_ID }).composition, null)

  const session = kernel.open(checkpoint('image-text'))
  createFromPlan(session)
  const before = JSON.stringify(kernel.serializeSession(session))
  const duplicate = kernel.prepare(session, command(1, 'designOption.createFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: `${OPTION_ID}-replacement`,
  }))
  assert.equal(duplicate.error.message, 'Assembly already exists for this Slide')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)

  kernel.commit(session, kernel.prepareUndo(session))
  assert.equal(kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID }).composition, null)
})

test('createFromPlan reconciles stale Curate slots atomically and preserves every compatible assignment', () => {
  const value = checkpoint('triptych')
  const slide = value.deck.sections[0].slides[0]
  slide.intent = 'diptych'
  value.deck.assetReferences = [1, 2, 3].map((ordinal) => ({
    id: `asset-00000000-0000-4000-8000-00000000000${ordinal}`,
    label: `Asset ${ordinal}`,
    mediaKind: 'image',
    availability: 'available',
  }))
  slide.mediaAssignments = value.deck.assetReferences.map((asset, index) => ({
    id: `assignment-00000000-0000-4000-8000-00000000000${index + 1}`,
    role: index === 0 ? 'primary' : `primary:${index + 1}`,
    assetReferenceId: asset.id,
  }))
  value.deck.workbenchCurate = {
    format: 'pitchdog.workbench-curate',
    version: 1,
    projectJudgments: {},
    slides: {
      [SLIDE_ID]: {
        slotManifest: [1, 2, 3].map((ordinal, index) => ({
          key: `primary:${ordinal}`,
          assignmentRole: index === 0 ? 'primary' : `primary:${ordinal}`,
          kind: 'primary',
          ordinal: index,
        })),
        decisions: {},
        findMoreMedia: { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' },
      },
    },
  }
  const session = kernel.open(value)
  const before = JSON.parse(JSON.stringify(kernel.serializeSession(session).deck))

  createFromPlan(session)
  const stored = kernel.serializeSession(session).deck
  const storedSlide = stored.sections[0].slides[0]
  assert.deepEqual(JSON.parse(JSON.stringify(storedSlide.mediaAssignments.map((assignment) => assignment.id))), [
    'assignment-00000000-0000-4000-8000-000000000001',
    'assignment-00000000-0000-4000-8000-000000000002',
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(stored.workbenchCurate.slides[SLIDE_ID].slotManifest.map((slot) => slot.assignmentRole))), [
    'primary',
    'primary:2',
  ])
  assert.deepEqual(
    JSON.parse(JSON.stringify(kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
      .composition.elements.filter((element) => element.kind === 'image').map((element) => element.mediaRole))),
    ['primary', 'primary:2'],
  )
  assert.deepEqual(JSON.parse(JSON.stringify(stored.workbenchCurate.slides[SLIDE_ID].decisions[value.deck.assetReferences[2].id])), {
    state: 'unplaced',
    assignmentId: 'assignment-00000000-0000-4000-8000-000000000003',
    previousSlotKey: 'primary:3',
    previousAssignmentRole: 'primary:3',
    reason: 'slot-contract-change',
  })

  kernel.commit(session, kernel.prepareUndo(session))
  const restored = JSON.parse(JSON.stringify(kernel.serializeSession(session).deck))
  if (restored.sections[0].slides[0].designOptions?.length === 0) {
    delete restored.sections[0].slides[0].designOptions
  }
  assert.deepEqual(restored, before)
})

test('Plan changes flag an existing edited Assembly for review without rebuilding any element', () => {
  const session = kernel.open(checkpoint('image-text'))
  createFromPlan(session)
  let projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  const headline = projection.composition.elements.find((element) => element.patternElementKey === 'headline')
  const editedFrame = { ...headline.frame, x: headline.frame.x + 80, y: headline.frame.y + 40 }
  commit(session, command(1, 'element.frame.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: headline.id,
    frame: editedFrame,
  }))
  commit(session, command(2, 'slide.intent.set', { slideId: SLIDE_ID, intent: 'triptych' }))

  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.source, 'plan')
  assert.equal(projection.designOption.planAtCreation.visualStyle, 'image-text')
  assert.equal(projection.designOption.planReviewRequired, true)
  assert.deepEqual(JSON.parse(JSON.stringify(projection.designOption.planReviewReasons)), [
    'visual-style-changed',
    'curate-slots-changed',
  ])
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection.composition.elements.find((element) => element.id === headline.id).frame)),
    editedFrame,
  )
  assert.equal(projection.composition.elements.filter((element) => element.kind === 'image').length, 1)

  const replacement = kernel.prepare(session, command(3, 'designOption.createFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: `${OPTION_ID}-replacement`,
  }, 'attempt-rebuild'))
  assert.equal(replacement.error.message, 'Assembly already exists for this Slide')
  assert.deepEqual(
    JSON.parse(JSON.stringify(kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
      .composition.elements.find((element) => element.id === headline.id).frame)),
    editedFrame,
  )
})

test('macOS-style sorted checkpoint keys reopen without false Plan or Curate review warnings', () => {
  const value = checkpoint('triptych')
  value.deck.workbenchCurate = {
    format: 'pitchdog.workbench-curate',
    version: 1,
    projectJudgments: {},
    slides: {
      [SLIDE_ID]: {
        slotManifest: [1, 2, 3].map((ordinal, index) => ({
          key: `primary:${ordinal}`,
          assignmentRole: index === 0 ? 'primary' : `primary:${ordinal}`,
          kind: 'primary',
          ordinal: index,
        })),
        decisions: {},
        findMoreMedia: { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' },
      },
    },
  }
  const session = kernel.open(value)
  createFromPlan(session)

  const reopened = kernel.open(sortedKeyRoundTrip(kernel.serializeSession(session)))
  assert.equal(reopened.error, undefined)
  const projection = kernel.query(reopened, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.source, 'plan')
  assert.equal(projection.designOption.planReviewRequired, false)
  assert.deepEqual(JSON.parse(JSON.stringify(projection.designOption.planReviewReasons)), [])
  const curate = kernel.query(reopened, 'curate.slide', { slideId: SLIDE_ID })
  assert.equal(curate.needsReconciliation, false)
})

test('explicit image-text to triptych rebuild repairs one option and one Undo restores exact prior Assembly and Curate state', () => {
  const value = checkpoint('image-text')
  const slide = value.deck.sections[0].slides[0]
  const assetReference = {
    id: 'asset-rebuild-00000000-0000-4000-8000-000000000001',
    label: 'Primary image',
    mediaKind: 'image',
    availability: 'available',
  }
  value.deck.assetReferences = [assetReference]
  slide.mediaAssignments = [{
    id: 'assignment-rebuild-00000000-0000-4000-8000-000000000001',
    role: 'primary',
    assetReferenceId: assetReference.id,
  }]
  value.deck.workbenchCurate = {
    format: 'pitchdog.workbench-curate',
    version: 1,
    projectJudgments: {},
    slides: {
      [SLIDE_ID]: {
        slotManifest: [{ key: 'primary:1', assignmentRole: 'primary', kind: 'primary', ordinal: 0 }],
        decisions: {},
        findMoreMedia: { state: 'not-needed', brief: '', existingPrimaryStatus: 'usable' },
      },
    },
  }
  let session = kernel.open(value)
  createFromPlan(session)
  let projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  const image = projection.composition.elements.find((element) => element.kind === 'image')
  const headline = projection.composition.elements.find((element) => element.patternElementKey === 'headline')
  const editedCrop = { x: 0.1, y: 0.15, width: 0.7, height: 0.75 }
  const editedFrame = { ...headline.frame, x: headline.frame.x + 60, y: headline.frame.y + 30 }
  commit(session, command(1, 'element.crop.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: image.id,
    crop: editedCrop,
  }))
  commit(session, command(2, 'element.frame.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: headline.id,
    frame: editedFrame,
  }))

  const staleCheckpoint = kernel.serializeSession(session)
  staleCheckpoint.deck.sections[0].slides[0].intent = 'triptych'
  session = kernel.open(staleCheckpoint)
  const beforeRebuild = sortedKeyRoundTrip(kernel.serializeSession(session).deck)
  const beforeOption = sortedKeyRoundTrip(beforeRebuild.sections[0].slides[0].designOptions[0])
  assert.equal(kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID }).designOption.planReviewRequired, true)

  rebuildFromPlan(session, 3)
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.id, OPTION_ID)
  assert.equal(projection.designOption.source, 'plan')
  assert.equal(projection.designOption.planAtCreation.visualStyle, 'triptych')
  assert.equal(projection.designOption.planReviewRequired, false)
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection.composition.elements.filter((element) => element.kind === 'image').map((element) => element.mediaRole))),
    ['primary', 'primary:2', 'primary:3'],
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(kernel.serializeSession(session).deck.sections[0].slides[0].mediaAssignments)),
    beforeRebuild.sections[0].slides[0].mediaAssignments,
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(kernel.serializeSession(session).deck.workbenchCurate.slides[SLIDE_ID].slotManifest.map((slot) => slot.assignmentRole))),
    ['primary', 'primary:2', 'primary:3'],
  )

  session = kernel.open(sortedKeyRoundTrip(kernel.serializeSession(session)))
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.planReviewRequired, false)
  kernel.commit(session, kernel.prepareUndo(session))
  const restored = sortedKeyRoundTrip(kernel.serializeSession(session).deck)
  assert.deepEqual(restored, beforeRebuild)
  assert.deepEqual(restored.sections[0].slides[0].designOptions[0], beforeOption)
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.planAtCreation.visualStyle, 'image-text')
  assert.equal(projection.designOption.planReviewRequired, true)
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection.composition.elements.find((element) => element.id === image.id).crop)),
    editedCrop,
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection.composition.elements.find((element) => element.id === headline.id).frame)),
    editedFrame,
  )
})

test('rebuild Undo restores an edited gradient exactly', () => {
  let session = kernel.open(checkpoint('full-bleed-overlay'))
  createFromPlan(session)
  let projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  const gradientElement = projection.composition.elements.find((element) => element.gradient)
  const editedGradient = {
    type: 'linear',
    start: { x: 0.2, y: 0.1 },
    end: { x: 0.85, y: 0.9 },
    opacity: 0.43,
  }
  commit(session, command(1, 'element.gradient.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: gradientElement.id,
    gradient: editedGradient,
  }))
  const staleCheckpoint = kernel.serializeSession(session)
  const previousOption = sortedKeyRoundTrip(staleCheckpoint.deck.sections[0].slides[0].designOptions[0])
  staleCheckpoint.deck.sections[0].slides[0].intent = 'triptych'
  session = kernel.open(staleCheckpoint)

  rebuildFromPlan(session, 2)
  assert.equal(
    kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
      .composition.elements.some((element) => element.gradient),
    false,
  )
  kernel.commit(session, kernel.prepareUndo(session))
  const restoredOption = sortedKeyRoundTrip(
    kernel.serializeSession(session).deck.sections[0].slides[0].designOptions[0],
  )
  assert.deepEqual(restoredOption, previousOption)
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection.composition.elements.find((element) => element.gradient).gradient)),
    editedGradient,
  )
})
