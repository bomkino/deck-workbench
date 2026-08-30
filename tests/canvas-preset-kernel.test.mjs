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

const presets = [
  ['cinemascope-2576x1080', 2576, 1080, 257.6, 108],
  ['widescreen-1920x1080', 1920, 1080, 192, 108],
  ['square-2160x2160', 2160, 2160, 216, 216],
  ['standard-1920x1440', 1920, 1440, 192, 144],
  ['a4-portrait', 2480, 3508, 210, 297],
  ['letter-portrait', 2550, 3300, 215.9, 279.4],
]

function checkpoint(canvasPresetId = undefined) {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: SLIDE_ID,
    blockId: HEADLINE_ID,
    title: 'Canvas tracer',
    initialHeadline: 'One Story, several honest frames',
    ...(canvasPresetId ? { canvasPresetId } : {}),
  })
}

function command(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Canvas test' },
    issuedAt: '2026-08-30T15:00:00Z',
  }
}

function commit(session, value) {
  const prepared = kernel.prepare(session, value)
  assert.equal(prepared.ok, true, prepared.error?.message)
  kernel.commit(session, prepared)
}

function applyCover(session, revision = 0) {
  commit(session, command(revision, 'designOption.applyPattern', {
    slideId: SLIDE_ID,
    designOptionId: 'option-00000000-0000-4000-8000-000000000001',
    patternId: 'cover',
    patternVersion: 1,
    contentBindings: { headline: HEADLINE_ID },
  }, `cover-${revision}`))
}

test('canvas catalog exposes the six authored presets and exact PDF page geometry', () => {
  const session = kernel.open(checkpoint())
  const catalog = kernel.query(session, 'canvas.preset.catalog', {})
  assert.deepEqual(
    JSON.parse(JSON.stringify(catalog.presets.map((preset) => [
      preset.id,
      preset.width,
      preset.height,
      preset.pageWidthMm,
      preset.pageHeightMm,
    ]))),
    presets,
  )
  for (const [id, width, height] of presets) {
    const created = checkpoint(id)
    assert.deepEqual(JSON.parse(JSON.stringify(created.deck.canvasPreset)), { id, width, height })
    assert.equal(kernel.open(created).checkpoint.deck.canvasPreset.id, id)
  }
})

test('canvas switching scales every authored Element, preserves Pattern provenance and undoes exactly', () => {
  const session = kernel.open(checkpoint())
  applyCover(session)
  const before = kernel.serializeSession(session)
  const beforeFrames = before.deck.sections[0].slides[0].designOptions[0].composition.elements.map((element) => element.frame)

  commit(session, command(1, 'canvas.preset.set', { canvasPresetId: 'square-2160x2160' }))
  let projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.canvas.id, 'square-2160x2160')
  assert.equal(projection.canvas.width / projection.canvas.height, 1)
  assert.equal(projection.designOption.pattern.canvasPresetId, 'cinemascope-2576x1080')
  assert.equal(projection.designOption.canvasReviewRequired, true)
  const fullBleed = projection.composition.elements.find((element) => element.kind === 'image')
  assert.deepEqual(JSON.parse(JSON.stringify(fullBleed.frame)), { x: 0, y: 0, width: 2160, height: 2160 })

  kernel.commit(session, kernel.prepareUndo(session))
  let restored = kernel.serializeSession(session)
  assert.equal(restored.deck.canvasPreset.id, 'cinemascope-2576x1080')
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.deck.sections[0].slides[0].designOptions[0].composition.elements.map((element) => element.frame))),
    JSON.parse(JSON.stringify(beforeFrames)),
  )

  kernel.commit(session, kernel.prepareRedo(session))
  projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.canvas.id, 'square-2160x2160')
  assert.equal(projection.designOption.canvasReviewRequired, true)
})

test('fresh Patterns use orientation-aware geometry and reject unsupported or spoofed presets', () => {
  const value = checkpoint('a4-portrait')
  value.deck.sections[0].slides[0].contentBlocks.push({
    id: BODY_ID,
    semanticKey: 'story.body',
    role: 'body',
    value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body copy.' }] }] },
  })
  const session = kernel.open(value)
  commit(session, command(0, 'designOption.applyPattern', {
    slideId: SLIDE_ID,
    designOptionId: 'option-00000000-0000-4000-8000-000000000002',
    patternId: 'editorial-body',
    patternVersion: 1,
    contentBindings: { headline: HEADLINE_ID, body: BODY_ID },
  }))
  const projection = kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
  assert.equal(projection.designOption.canvasReviewRequired, false)
  assert.equal(projection.designOption.pattern.canvasPresetId, 'a4-portrait')
  const image = projection.composition.elements.find((element) => element.kind === 'image')
  const headline = projection.composition.elements.find((element) => element.patternElementKey === 'headline')
  assert.equal(image.frame.width, projection.canvas.width)
  assert.ok(image.frame.height < projection.canvas.height / 2)
  assert.ok(headline.frame.y > image.frame.height)
  for (const element of projection.composition.elements) {
    assert.ok(element.frame.x >= 0 && element.frame.y >= 0)
    assert.ok(element.frame.x + element.frame.width <= projection.canvas.width)
    assert.ok(element.frame.y + element.frame.height <= projection.canvas.height)
  }

  const invalid = kernel.prepare(session, command(1, 'canvas.preset.set', { canvasPresetId: 'custom-999x999' }))
  assert.equal(invalid.error.name, 'InvalidCommand')
  const spoofed = checkpoint()
  spoofed.deck.canvasPreset.width = 1920
  assert.equal(kernel.open(spoofed).error.message, 'deck.canvasPreset geometry does not match its authored preset')
})
