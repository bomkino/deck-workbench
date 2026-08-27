import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

const SLIDE_ID = 'slide-00000000-0000-4000-8000-000000000001'
const BLOCK_ID = 'block-00000000-0000-4000-8000-000000000001'
const OPTION_ID = 'option-00000000-0000-4000-8000-000000000001'
const COMPOSITION_ID = 'composition-00000000-0000-4000-8000-000000000001'
const ELEMENT_ID = 'element-00000000-0000-4000-8000-000000000001'

function visualCheckpoint() {
  const checkpoint = kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: SLIDE_ID,
    blockId: BLOCK_ID,
    title: 'Visual Core',
    initialHeadline: 'Story remains canonical',
  })
  const slide = checkpoint.deck.sections[0].slides[0]
  slide.activeDesignOptionId = OPTION_ID
  slide.designOptions = [{
    id: OPTION_ID,
    name: 'Cover',
    composition: {
      id: COMPOSITION_ID,
      elements: [{
        id: ELEMENT_ID,
        kind: 'text',
        contentBlockId: BLOCK_ID,
        frame: { x: 160, y: 160, width: 1200, height: 320 },
      }],
    },
  }]
  return checkpoint
}

function frameCommand(revision, frame, overrides = {}) {
  return {
    commandId: `frame-${revision}`,
    expectedRevision: revision,
    type: 'element.frame.update',
    payload: {
      slideId: SLIDE_ID,
      designOptionId: OPTION_ID,
      elementId: ELEMENT_ID,
      frame,
      ...overrides,
    },
    source: { kind: 'ui', label: 'Align Element' },
    issuedAt: '2026-08-27T08:00:00Z',
  }
}

function projection(session) {
  return kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
}

test('element.frame.update prepares privately and projects stable visual identities in Deck units', () => {
  const session = kernel.open(visualCheckpoint())
  const before = JSON.stringify(kernel.serializeSession(session))
  const fullBleedFrame = { x: -32, y: 0, width: 2640, height: 1080 }
  const prepared = kernel.prepare(session, frameCommand(0, fullBleedFrame))

  assert.equal(prepared.ok, true, prepared.error?.message)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
  assert.deepEqual(JSON.parse(JSON.stringify(projection(session).composition.elements[0].frame)), {
    x: 160,
    y: 160,
    width: 1200,
    height: 320,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.projectionHints)), ['slide.activeProjection', 'history'])
  assert.equal(prepared.journalOperation.command.type, 'element.frame.update')

  const acknowledgement = kernel.commit(session, prepared)
  const active = projection(session)
  assert.equal(acknowledgement.revision, 1)
  assert.equal(active.designOption.id, OPTION_ID)
  assert.equal(active.composition.id, COMPOSITION_ID)
  assert.equal(active.composition.elements[0].id, ELEMENT_ID)
  assert.equal(active.composition.elements[0].contentBlockId, BLOCK_ID)
  assert.deepEqual(JSON.parse(JSON.stringify(active.composition.elements[0].frame)), fullBleedFrame)
  assert.equal(active.headline.plainText, 'Story remains canonical')

  const replayed = kernel.open(visualCheckpoint())
  const replayResult = kernel.replayRecord(replayed, {
    revision: 1,
    ...JSON.parse(JSON.stringify(prepared.journalOperation)),
  })
  assert.equal(replayResult.revision, 1)
  assert.deepEqual(
    JSON.parse(JSON.stringify(projection(replayed).composition.elements[0].frame)),
    fullBleedFrame,
  )
})

test('visual frame history survives checkpoint reopen and restores exact identity on undo and redo', () => {
  const session = kernel.open(visualCheckpoint())
  const alignedFrame = { x: 688, y: 160, width: 1200, height: 320 }
  const prepared = kernel.prepare(session, frameCommand(0, alignedFrame))
  kernel.commit(session, prepared)

  const reopened = kernel.open(kernel.serializeSession(session))
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  let active = projection(reopened)
  assert.equal(active.revision, 2)
  assert.equal(active.composition.elements[0].id, ELEMENT_ID)
  assert.deepEqual(JSON.parse(JSON.stringify(active.composition.elements[0].frame)), {
    x: 160,
    y: 160,
    width: 1200,
    height: 320,
  })

  kernel.commit(reopened, kernel.prepareRedo(reopened))
  active = projection(reopened)
  assert.equal(active.revision, 3)
  assert.equal(active.designOption.id, OPTION_ID)
  assert.equal(active.composition.id, COMPOSITION_ID)
  assert.equal(active.composition.elements[0].id, ELEMENT_ID)
  assert.deepEqual(JSON.parse(JSON.stringify(active.composition.elements[0].frame)), alignedFrame)
})

test('invalid geometry and missing visual targets reject atomically', () => {
  const session = kernel.open(visualCheckpoint())
  const before = JSON.stringify(kernel.serializeSession(session))

  const zeroWidth = kernel.prepare(session, frameCommand(0, {
    x: 0,
    y: 0,
    width: 0,
    height: 100,
  }))
  assert.equal(zeroWidth.error.name, 'InvalidCommand')
  assert.equal(zeroWidth.error.message, 'frame width and height must be greater than zero')

  const nonFinite = kernel.prepare(session, frameCommand(0, {
    x: Number.POSITIVE_INFINITY,
    y: 0,
    width: 100,
    height: 100,
  }))
  assert.equal(nonFinite.error.name, 'InvalidCommand')
  assert.equal(nonFinite.error.message, 'frame.x must be a finite number')

  const missingElement = kernel.prepare(session, frameCommand(0, {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  }, { elementId: 'element-missing' }))
  assert.equal(missingElement.error.name, 'InvalidCommand')
  assert.equal(missingElement.error.message, 'Element does not exist in Design Option')

  const missingOptionProjection = kernel.query(session, 'slide.activeProjection', {
    slideId: SLIDE_ID,
    designOptionId: 'option-missing',
  })
  assert.equal(missingOptionProjection.error.name, 'InvalidCommand')
  assert.equal(missingOptionProjection.error.message, 'Design Option does not exist')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
  assert.deepEqual(JSON.parse(JSON.stringify(kernel.query(session, 'history.summary', {}))), {
    revision: 0,
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
  })
})
