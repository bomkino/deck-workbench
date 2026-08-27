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
const COVER_ID = 'option-00000000-0000-4000-8000-000000000001'
const STATEMENT_ID = 'option-00000000-0000-4000-8000-000000000002'
const ASSIGNMENT_ID = 'assignment-00000000-0000-4000-8000-000000000001'
const ASSET_ONE_ID = 'asset-00000000-0000-4000-8000-000000000001'
const ASSET_TWO_ID = 'asset-00000000-0000-4000-8000-000000000002'

function checkpoint() {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: SLIDE_ID,
    blockId: HEADLINE_ID,
    title: 'Asset Crop Tracer',
    initialHeadline: 'The image changes; the Story does not.',
  })
}

function command(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Asset and crop tracer' },
    issuedAt: '2026-08-27T09:00:00Z',
  }
}

function addAsset(revision, assetReferenceId, label) {
  return command(revision, 'asset.reference.add', {
    assetReferenceId,
    label,
    mediaKind: 'image',
  })
}

function applyPattern(revision, patternId, designOptionId) {
  return command(revision, 'designOption.applyPattern', {
    slideId: SLIDE_ID,
    designOptionId,
    patternId,
    patternVersion: 1,
    contentBindings: { headline: HEADLINE_ID },
  })
}

function assignAsset(revision, assetReferenceId, mediaAssignmentId = ASSIGNMENT_ID) {
  return command(revision, 'asset.assign', {
    slideId: SLIDE_ID,
    mediaAssignmentId,
    role: 'primary',
    assetReferenceId,
  })
}

function cropImage(revision, crop, designOptionId = COVER_ID, elementId = `${COVER_ID}:element:primary-image`) {
  return command(revision, 'element.crop.update', {
    slideId: SLIDE_ID,
    designOptionId,
    elementId,
    crop,
  })
}

function prepareAndCommit(session, envelope) {
  const prepared = kernel.prepare(session, envelope)
  assert.equal(prepared.ok, true, prepared.error?.message)
  const acknowledgement = kernel.commit(session, prepared)
  assert.equal(acknowledgement.status, 'committed')
  return prepared
}

function projection(session, designOptionId) {
  return kernel.query(session, 'slide.activeProjection', {
    slideId: SLIDE_ID,
    ...(designOptionId ? { designOptionId } : {}),
  })
}

test('Asset replacement preserves stable assignment identity and each Design Option crop', () => {
  const session = kernel.open(checkpoint())
  const records = []
  records.push(prepareAndCommit(session, addAsset(0, ASSET_ONE_ID, 'Hill at dusk')))
  records.push(prepareAndCommit(session, applyPattern(1, 'cover', COVER_ID)))

  const beforeAssignment = JSON.stringify(kernel.serializeSession(session))
  const assignmentPrepared = kernel.prepare(session, assignAsset(2, ASSET_ONE_ID))
  assert.equal(assignmentPrepared.ok, true, assignmentPrepared.error?.message)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), beforeAssignment)
  kernel.commit(session, assignmentPrepared)
  records.push(assignmentPrepared)

  const authoredCrop = { x: 0.125, y: 0.1, width: 0.625, height: 0.75 }
  const beforeCrop = JSON.stringify(kernel.serializeSession(session))
  const cropPrepared = kernel.prepare(session, cropImage(3, authoredCrop))
  assert.equal(cropPrepared.ok, true, cropPrepared.error?.message)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), beforeCrop)
  kernel.commit(session, cropPrepared)
  records.push(cropPrepared)

  records.push(prepareAndCommit(session, applyPattern(4, 'full-bleed-statement', STATEMENT_ID)))
  records.push(prepareAndCommit(session, addAsset(5, ASSET_TWO_ID, 'Hill after rain')))
  records.push(prepareAndCommit(session, assignAsset(6, ASSET_TWO_ID)))

  const cover = projection(session, COVER_ID)
  const statement = projection(session, STATEMENT_ID)
  assert.equal(cover.mediaAssignments.length, 1)
  assert.equal(cover.mediaAssignments[0].id, ASSIGNMENT_ID)
  assert.equal(cover.mediaAssignments[0].role, 'primary')
  assert.equal(cover.mediaAssignments[0].assetReference.id, ASSET_TWO_ID)
  assert.deepEqual(
    JSON.parse(JSON.stringify(cover.composition.elements.find((element) => element.kind === 'image').crop)),
    authoredCrop,
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(statement.composition.elements.find((element) => element.kind === 'image').crop)),
    { x: 0, y: 0, width: 1, height: 1 },
  )
  assert.equal(cover.headline.plainText, 'The image changes; the Story does not.')

  const stored = kernel.serializeSession(session)
  assert.deepEqual(JSON.parse(JSON.stringify(stored.deck.assetReferences)), [
    { id: ASSET_ONE_ID, label: 'Hill at dusk', mediaKind: 'image', availability: 'unknown' },
    { id: ASSET_TWO_ID, label: 'Hill after rain', mediaKind: 'image', availability: 'unknown' },
  ])
  assert.equal(JSON.stringify(stored.deck.assetReferences).includes('/'), false)
  assert.deepEqual(JSON.parse(JSON.stringify(kernel.query(session, 'asset.catalog', {}))), {
    assets: [
      { id: ASSET_ONE_ID, label: 'Hill at dusk', mediaKind: 'image', availability: 'unknown' },
      { id: ASSET_TWO_ID, label: 'Hill after rain', mediaKind: 'image', availability: 'unknown' },
    ],
  })

  const reopened = kernel.open(stored)
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  let reopenedCover = projection(reopened, COVER_ID)
  assert.equal(reopenedCover.mediaAssignments[0].id, ASSIGNMENT_ID)
  assert.equal(reopenedCover.mediaAssignments[0].assetReference.id, ASSET_ONE_ID)
  assert.deepEqual(
    JSON.parse(JSON.stringify(reopenedCover.composition.elements.find((element) => element.kind === 'image').crop)),
    authoredCrop,
  )
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  reopenedCover = projection(reopened, COVER_ID)
  assert.equal(reopenedCover.mediaAssignments[0].id, ASSIGNMENT_ID)
  assert.equal(reopenedCover.mediaAssignments[0].assetReference.id, ASSET_TWO_ID)
  assert.deepEqual(
    JSON.parse(JSON.stringify(reopenedCover.composition.elements.find((element) => element.kind === 'image').crop)),
    authoredCrop,
  )

  const replayed = kernel.open(checkpoint())
  for (const [index, prepared] of records.entries()) {
    const result = kernel.replayRecord(replayed, {
      revision: index + 1,
      ...JSON.parse(JSON.stringify(prepared.journalOperation)),
    })
    assert.equal(result.revision, index + 1)
  }
  const replayedCover = projection(replayed, COVER_ID)
  assert.equal(replayedCover.mediaAssignments[0].id, ASSIGNMENT_ID)
  assert.equal(replayedCover.mediaAssignments[0].assetReference.id, ASSET_TWO_ID)
  assert.deepEqual(
    JSON.parse(JSON.stringify(replayedCover.composition.elements.find((element) => element.kind === 'image').crop)),
    authoredCrop,
  )
})

test('invalid references, identity-changing replacement, and invalid crops reject atomically', () => {
  const session = kernel.open(checkpoint())
  prepareAndCommit(session, addAsset(0, ASSET_ONE_ID, 'Hill at dusk'))
  prepareAndCommit(session, applyPattern(1, 'cover', COVER_ID))
  const beforeAssignment = JSON.stringify(kernel.serializeSession(session))

  const unknownAsset = kernel.prepare(session, assignAsset(2, 'asset-missing'))
  assert.equal(unknownAsset.error.message, 'Asset Reference does not exist')
  const unassignedCrop = kernel.prepare(session, cropImage(2, { x: 0, y: 0, width: 0.5, height: 0.5 }))
  assert.equal(unassignedCrop.error.message, 'Image Element media role has no Asset assignment')
  const duplicateReference = kernel.prepare(session, addAsset(2, ASSET_ONE_ID, 'Duplicate'))
  assert.equal(duplicateReference.error.message, 'Asset Reference identity already exists')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), beforeAssignment)

  prepareAndCommit(session, assignAsset(2, ASSET_ONE_ID))
  const committed = JSON.stringify(kernel.serializeSession(session))
  const identityChange = kernel.prepare(
    session,
    assignAsset(3, ASSET_ONE_ID, 'assignment-different'),
  )
  assert.equal(identityChange.error.message, 'Media role replacement must preserve assignment identity')
  const outsideSource = kernel.prepare(
    session,
    cropImage(3, { x: 0.75, y: 0, width: 0.5, height: 1 }),
  )
  assert.equal(outsideSource.error.message, 'crop must be a positive normalized rectangle within the source image')
  const textCrop = kernel.prepare(
    session,
    cropImage(3, { x: 0, y: 0, width: 1, height: 1 }, COVER_ID, `${COVER_ID}:element:headline`),
  )
  assert.equal(textCrop.error.message, 'Only an Image Element can be cropped')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), committed)
  assert.equal(kernel.query(session, 'history.summary', {}).undoDepth, 3)
})
