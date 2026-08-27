import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

const SLIDE_ID = 'slide-00000000-0000-4000-8000-000000000001'
const HEADLINE_ID = 'block-00000000-0000-4000-8000-000000000001'
const BODY_ID = 'block-00000000-0000-4000-8000-000000000002'
const SECOND_BODY_ID = 'block-00000000-0000-4000-8000-000000000003'
const COVER_ID = 'option-00000000-0000-4000-8000-000000000001'
const STATEMENT_ID = 'option-00000000-0000-4000-8000-000000000002'

function checkpoint({ withBody = false, withSecondBody = false } = {}) {
  const value = kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: SLIDE_ID,
    blockId: HEADLINE_ID,
    title: 'Pattern Tracer',
    initialHeadline: 'Story remains outside every option',
  })
  if (withBody) {
    value.deck.sections[0].slides[0].contentBlocks.push({
      id: BODY_ID,
      semanticKey: 'story.body',
      role: 'body',
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical body copy.' }] }],
      },
    })
  }
  if (withSecondBody) {
    value.deck.sections[0].slides[0].contentBlocks.push({
      id: SECOND_BODY_ID,
      semanticKey: 'story.body.alternate',
      role: 'body',
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second canonical body.' }] }],
      },
    })
  }
  return value
}

function applyPatternCommand(
  revision,
  patternId,
  designOptionId,
  commandId = `apply-${patternId}-${revision}`,
  bodyBlockId = BODY_ID,
) {
  return {
    commandId,
    expectedRevision: revision,
    type: 'designOption.applyPattern',
    payload: {
      slideId: SLIDE_ID,
      designOptionId,
      patternId,
      patternVersion: 1,
      contentBindings: patternId === 'editorial-body'
        ? { headline: HEADLINE_ID, body: bodyBlockId }
        : { headline: HEADLINE_ID },
    },
    source: { kind: 'ui', label: 'Apply authored Pattern' },
    issuedAt: '2026-08-27T08:30:00Z',
  }
}

function activateCommand(revision, designOptionId, commandId = `activate-${designOptionId}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type: 'designOption.activate',
    payload: { slideId: SLIDE_ID, designOptionId },
    source: { kind: 'ui', label: 'Activate Design Option' },
    issuedAt: '2026-08-27T08:31:00Z',
  }
}

function activeProjection(session) {
  return kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
}

function prepareAndCommit(session, command) {
  const prepared = kernel.prepare(session, command)
  assert.equal(prepared.ok, true, prepared.error?.message)
  const acknowledgement = kernel.commit(session, prepared)
  assert.equal(acknowledgement.status, 'committed')
  return prepared
}

test('kernel catalog exposes exactly the three W02 authored Pattern versions without mutation', () => {
  const session = kernel.open(checkpoint())
  const catalog = kernel.query(session, 'pattern.catalog', {})

  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), {
    patterns: [
      { id: 'cover', version: 1, name: 'Cover' },
      { id: 'full-bleed-statement', version: 1, name: 'Full-bleed Statement' },
      { id: 'editorial-body', version: 1, name: 'Editorial Body' },
    ],
  })
  assert.equal(kernel.query(session, 'deck.summary', {}).revision, 0)
})

test('each W02 Pattern creates a stable active Composition that references canonical Story', () => {
  const cases = [
    { patternId: 'cover', optionId: `${COVER_ID}-cover`, withBody: false, count: 2 },
    { patternId: 'full-bleed-statement', optionId: `${COVER_ID}-statement`, withBody: false, count: 2 },
    { patternId: 'editorial-body', optionId: `${COVER_ID}-editorial`, withBody: true, count: 3 },
  ]

  for (const item of cases) {
    const session = kernel.open(checkpoint({ withBody: item.withBody }))
    const before = JSON.stringify(kernel.serializeSession(session))
    const prepared = kernel.prepare(session, applyPatternCommand(0, item.patternId, item.optionId))
    assert.equal(prepared.ok, true, prepared.error?.message)
    assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
    assert.equal(activeProjection(session).composition, null)
    kernel.commit(session, prepared)

    const projection = activeProjection(session)
    assert.deepEqual(JSON.parse(JSON.stringify(projection.designOption.pattern)), {
      id: item.patternId,
      version: 1,
      name: item.patternId === 'cover'
        ? 'Cover'
        : item.patternId === 'full-bleed-statement'
          ? 'Full-bleed Statement'
          : 'Editorial Body',
    })
    assert.equal(projection.composition.id, `${item.optionId}:composition`)
    assert.equal(projection.composition.elements.length, item.count)
    for (const element of projection.composition.elements) {
      assert.equal(element.id, `${item.optionId}:element:${element.patternElementKey}`)
      assert.equal('value' in element, false)
    }
    const headline = projection.composition.elements.find((element) => element.patternElementKey === 'headline')
    assert.equal(headline.contentBlockId, HEADLINE_ID)
    assert.equal(projection.headline.plainText, 'Story remains outside every option')
    const image = projection.composition.elements.find((element) => element.kind === 'image')
    assert.equal(image.mediaRole, 'primary')
    if (item.patternId === 'editorial-body') {
      const body = projection.composition.elements.find((element) => element.patternElementKey === 'body')
      assert.equal(body.contentBlockId, BODY_ID)
    }

    const stored = kernel.serializeSession(session).deck.sections[0].slides[0].designOptions[0]
    assert.equal(stored.patternSnapshot.id, item.patternId)
    assert.equal(stored.patternSnapshot.version, 1)
  }

  const twoBodySession = kernel.open(checkpoint({ withBody: true, withSecondBody: true }))
  prepareAndCommit(
    twoBodySession,
    applyPatternCommand(0, 'editorial-body', `${COVER_ID}-two-body`, undefined, SECOND_BODY_ID),
  )
  const selectedBody = activeProjection(twoBodySession).composition.elements.find(
    (element) => element.patternElementKey === 'body',
  )
  assert.equal(selectedBody.contentBlockId, SECOND_BODY_ID)
})

test('Pattern creation and activation use one durable history seam across reopen, undo, redo and replay', () => {
  const session = kernel.open(checkpoint())
  const coverPrepared = prepareAndCommit(session, applyPatternCommand(0, 'cover', COVER_ID, 'apply-cover'))
  const statementPrepared = prepareAndCommit(
    session,
    applyPatternCommand(1, 'full-bleed-statement', STATEMENT_ID, 'apply-statement'),
  )
  const activatePrepared = prepareAndCommit(session, activateCommand(2, COVER_ID, 'activate-cover'))
  assert.equal(activeProjection(session).designOption.id, COVER_ID)

  const reopened = kernel.open(kernel.serializeSession(session))
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.equal(activeProjection(reopened).designOption.id, STATEMENT_ID)
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  let active = activeProjection(reopened)
  assert.equal(active.designOption.id, COVER_ID)
  assert.equal(active.composition.id, `${COVER_ID}:composition`)
  assert.equal(active.composition.elements[0].id, `${COVER_ID}:element:primary-image`)

  const replayed = kernel.open(checkpoint())
  for (const [revision, prepared] of [coverPrepared, statementPrepared, activatePrepared].entries()) {
    const result = kernel.replayRecord(replayed, {
      revision: revision + 1,
      ...JSON.parse(JSON.stringify(prepared.journalOperation)),
    })
    assert.equal(result.revision, revision + 1)
  }
  active = activeProjection(replayed)
  assert.equal(active.designOption.id, COVER_ID)
  assert.equal(active.headline.plainText, 'Story remains outside every option')
  assert.equal(kernel.query(replayed, 'history.summary', {}).undoDepth, 3)
})

test('unknown Pattern versions, missing required Story and invalid option targets reject atomically', () => {
  const unsupportedSession = kernel.open(checkpoint())
  const unsupportedBefore = JSON.stringify(kernel.serializeSession(unsupportedSession))
  const unsupported = applyPatternCommand(0, 'cover', COVER_ID)
  unsupported.payload.patternVersion = 2
  const unsupportedResult = kernel.prepare(unsupportedSession, unsupported)
  assert.equal(unsupportedResult.error.name, 'InvalidCommand')
  assert.equal(unsupportedResult.error.message, 'Authored Layout Pattern version does not exist')
  assert.equal(JSON.stringify(kernel.serializeSession(unsupportedSession)), unsupportedBefore)

  const missingBodySession = kernel.open(checkpoint())
  const missingBodyBefore = JSON.stringify(kernel.serializeSession(missingBodySession))
  const missingBody = kernel.prepare(
    missingBodySession,
    applyPatternCommand(0, 'editorial-body', COVER_ID),
  )
  assert.equal(missingBody.error.name, 'InvalidCommand')
  assert.equal(missingBody.error.message, 'Pattern Content Block does not exist: body')
  assert.equal(JSON.stringify(kernel.serializeSession(missingBodySession)), missingBodyBefore)

  const duplicateSession = kernel.open(checkpoint())
  prepareAndCommit(duplicateSession, applyPatternCommand(0, 'cover', COVER_ID))
  const committed = JSON.stringify(kernel.serializeSession(duplicateSession))
  const duplicate = kernel.prepare(
    duplicateSession,
    applyPatternCommand(1, 'full-bleed-statement', COVER_ID),
  )
  assert.equal(duplicate.error.message, 'Design Option identity already exists')
  const alreadyActive = kernel.prepare(duplicateSession, activateCommand(1, COVER_ID))
  assert.equal(alreadyActive.error.message, 'Design Option is already active')
  const missingTarget = kernel.prepare(duplicateSession, activateCommand(1, 'option-missing'))
  assert.equal(missingTarget.error.message, 'Design Option does not exist')
  assert.equal(JSON.stringify(kernel.serializeSession(duplicateSession)), committed)
  assert.equal(kernel.query(duplicateSession, 'history.summary', {}).undoDepth, 1)
})
