import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

const SLIDE_ID = 'slide-style-00000000-0000-4000-8000-000000000001'
const OPTION_ID = 'option-style-00000000-0000-4000-8000-000000000001'

function importedCheckpoint(style = 'full-bleed-overlay') {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-style-00000000-0000-4000-8000-000000000001',
    writingImport: {
      format: 'workbench-markdown/1',
      title: 'Element styles',
      canvas: 'cinemascope-2576x1080',
      parts: [{
        id: 'part-style-00000000-0000-4000-8000-000000000001',
        title: 'Main',
        purpose: 'Test Assembly controls',
        slides: [{
          id: SLIDE_ID,
          title: 'Opening',
          purpose: 'Set the scene',
          style,
          contentPattern: 'simple-copy',
          planBlockId: 'block-plan-style-00000000-0000-4000-8000-000000000001',
          copies: {
            headline: {
              state: 'present',
              value: 'Move me',
              blockId: 'block-headline-style-00000000-0000-4000-8000-000000000001',
            },
            subheadline: { state: 'unreviewed', value: '' },
            body: { state: 'unreviewed', value: '' },
          },
        }],
      }],
    },
  })
}

function command(revision, type, payload, suffix = '') {
  return {
    commandId: `${type}-${revision}${suffix}`,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Assembly element style test' },
    issuedAt: '2026-09-02T14:00:00Z',
  }
}

function commit(session, envelope) {
  const prepared = kernel.prepare(session, envelope)
  assert.equal(prepared.ok, true, prepared.error?.message)
  assert.equal(prepared.journalOperation.command.type, envelope.type)
  kernel.commit(session, prepared)
  return prepared
}

function projection(session) {
  return kernel.query(session, 'slide.activeProjection', { slideId: SLIDE_ID })
}

function createAssemblySession() {
  const session = kernel.open(importedCheckpoint())
  commit(session, command(0, 'designOption.createFromPlan', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
  }))
  return session
}

test('new Decks and undecided writing imports persist Full Bleed while explicit styles remain explicit', () => {
  const initial = kernel.createInitialCheckpoint({
    deckId: 'deck-default-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-default-00000000-0000-4000-8000-000000000001',
    slideId: 'slide-default-00000000-0000-4000-8000-000000000001',
    blockId: 'block-default-00000000-0000-4000-8000-000000000001',
    title: 'Default',
    initialHeadline: 'Default Full Bleed',
  })
  assert.equal(initial.deck.sections[0].slides[0].intent, 'full-bleed')

  const imported = importedCheckpoint('undecided')
  assert.equal(imported.deck.sections[0].slides[0].intent, 'full-bleed')
  assert.equal(importedCheckpoint('triptych').deck.sections[0].slides[0].intent, 'triptych')
})

test('text size, image fit, and two-colour gradients are narrow, durable, replayable, and exactly undoable', () => {
  const created = createAssemblySession()
  const createdProjection = projection(created)
  const text = createdProjection.composition.elements.find((element) => element.kind === 'text')
  const image = createdProjection.composition.elements.find((element) => element.kind === 'image')
  const gradient = createdProjection.composition.elements.find((element) => element.gradient)
  assert.equal(text.textSize, 'medium')
  assert.equal(image.imageFit, 'fill')
  assert.deepEqual(JSON.parse(JSON.stringify(gradient.gradient.colors)), {
    start: '#000000',
    end: '#000000',
  })

  const legacyCheckpoint = kernel.serializeSession(created)
  const legacyElements = legacyCheckpoint.deck.sections[0].slides[0].designOptions[0].composition.elements
  delete legacyElements.find((element) => element.id === text.id).textSize
  delete legacyElements.find((element) => element.id === image.id).imageFit
  delete legacyElements.find((element) => element.id === gradient.id).gradient.colors
  let session = kernel.open(legacyCheckpoint)

  commit(session, command(1, 'element.textSize.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: text.id,
    textSize: 'large',
  }))
  commit(session, command(2, 'element.imageFit.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: image.id,
    imageFit: 'fit',
  }))
  const authoredGradient = {
    type: 'linear',
    start: { x: 0.05, y: 0.15 },
    end: { x: 0.9, y: 0.8 },
    opacity: 0.64,
    colors: { start: '#14213d', end: '#fca311' },
  }
  commit(session, command(3, 'element.gradient.update', {
    slideId: SLIDE_ID,
    designOptionId: OPTION_ID,
    elementId: gradient.id,
    gradient: authoredGradient,
  }))

  session = kernel.open(kernel.serializeSession(session))
  let active = projection(session)
  assert.equal(active.composition.elements.find((element) => element.id === text.id).textSize, 'large')
  assert.equal(active.composition.elements.find((element) => element.id === image.id).imageFit, 'fit')
  assert.deepEqual(
    JSON.parse(JSON.stringify(active.composition.elements.find((element) => element.id === gradient.id).gradient)),
    authoredGradient,
  )

  kernel.commit(session, kernel.prepareUndo(session))
  active = projection(session)
  assert.equal(Object.hasOwn(active.composition.elements.find((element) => element.id === gradient.id).gradient, 'colors'), false)
  kernel.commit(session, kernel.prepareUndo(session))
  active = projection(session)
  assert.equal(Object.hasOwn(active.composition.elements.find((element) => element.id === image.id), 'imageFit'), false)
  kernel.commit(session, kernel.prepareUndo(session))
  active = projection(session)
  assert.equal(Object.hasOwn(active.composition.elements.find((element) => element.id === text.id), 'textSize'), false)

  kernel.commit(session, kernel.prepareRedo(session))
  kernel.commit(session, kernel.prepareRedo(session))
  kernel.commit(session, kernel.prepareRedo(session))
  active = projection(session)
  assert.equal(active.composition.elements.find((element) => element.id === text.id).textSize, 'large')
  assert.equal(active.composition.elements.find((element) => element.id === image.id).imageFit, 'fit')
  assert.deepEqual(
    JSON.parse(JSON.stringify(active.composition.elements.find((element) => element.id === gradient.id).gradient)),
    authoredGradient,
  )
})

test('style commands reject wrong kinds, unknown enums, and noncanonical gradient colours atomically', () => {
  const session = createAssemblySession()
  const active = projection(session)
  const text = active.composition.elements.find((element) => element.kind === 'text')
  const image = active.composition.elements.find((element) => element.kind === 'image')
  const gradient = active.composition.elements.find((element) => element.gradient)
  const before = JSON.stringify(kernel.serializeSession(session))

  const cases = [
    [
      command(1, 'element.textSize.update', {
        slideId: SLIDE_ID,
        designOptionId: OPTION_ID,
        elementId: text.id,
        textSize: 'huge',
      }, '-bad-size'),
      'textSize must be small, medium, or large',
    ],
    [
      command(1, 'element.textSize.update', {
        slideId: SLIDE_ID,
        designOptionId: OPTION_ID,
        elementId: image.id,
        textSize: 'small',
      }, '-image-size'),
      'Only a Text Element can carry textSize',
    ],
    [
      command(1, 'element.imageFit.update', {
        slideId: SLIDE_ID,
        designOptionId: OPTION_ID,
        elementId: text.id,
        imageFit: 'fit',
      }, '-text-fit'),
      'Only an Image Element can carry imageFit',
    ],
    [
      command(1, 'element.imageFit.update', {
        slideId: SLIDE_ID,
        designOptionId: OPTION_ID,
        elementId: image.id,
        imageFit: 'stretch',
      }, '-bad-fit'),
      'imageFit must be fit or fill',
    ],
    [
      command(1, 'element.gradient.update', {
        slideId: SLIDE_ID,
        designOptionId: OPTION_ID,
        elementId: gradient.id,
        gradient: {
          ...gradient.gradient,
          colors: { start: '#ABCDEF', end: '#000000' },
        },
      }, '-bad-colour'),
      'gradient.colors.start must be a canonical lowercase #rrggbb colour',
    ],
  ]

  for (const [envelope, message] of cases) {
    const rejected = kernel.prepare(session, envelope)
    assert.equal(rejected.error.name, 'InvalidCommand')
    assert.equal(rejected.error.message, message)
    assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
  }
})
