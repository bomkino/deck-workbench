import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

function checkpoint() {
  return kernel.createInitialCheckpoint({
    deckId: 'deck-00000000-0000-4000-8000-000000000001',
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    slideId: 'slide-00000000-0000-4000-8000-000000000001',
    blockId: 'block-00000000-0000-4000-8000-000000000001',
    title: 'Tracer Deck',
    initialHeadline: 'Untitled Story',
  })
}

function command(revision, text, commandId = `command-${revision}-${text}`) {
  return {
    commandId,
    expectedRevision: revision,
    type: 'content.update',
    payload: {
      slideId: 'slide-00000000-0000-4000-8000-000000000001',
      blockId: 'block-00000000-0000-4000-8000-000000000001',
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'ui' },
    issuedAt: '2026-08-26T21:20:00Z',
  }
}

function projection(session) {
  return kernel.query(session, 'slide.activeProjection', {})
}

function execute(session, value) {
  const prepared = kernel.prepare(session, value)
  assert.equal(prepared.ok, true, prepared.error?.message)
  return kernel.commit(session, prepared)
}

function structuralCommand(revision, type, payload, commandId = `${type}-${revision}`) {
  return {
    commandId,
    expectedRevision: revision,
    type,
    payload,
    source: { kind: 'ui', label: 'Story document' },
    issuedAt: '2026-08-26T22:20:00Z',
  }
}

test('content.update prepares privately, commits atomically, and preserves Slide identity', () => {
  const session = kernel.open(checkpoint())
  const original = JSON.stringify(kernel.serializeSession(session))
  const prepared = kernel.prepare(session, command(0, 'A hill that refuses to be scenery'))

  assert.equal(prepared.ok, true)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), original)
  assert.equal(projection(session).headline.plainText, 'Untitled Story')

  const result = kernel.commit(session, prepared)
  assert.equal(result.revision, 1)
  assert.equal(projection(session).headline.plainText, 'A hill that refuses to be scenery')
  assert.equal(projection(session).slide.id, 'slide-00000000-0000-4000-8000-000000000001')
})

test('invalid and stale commands reject without partial mutation or history entries', () => {
  const session = kernel.open(checkpoint())
  const before = JSON.stringify(kernel.serializeSession(session))
  const malformed = command(0, 'ignored')
  malformed.payload.value = { type: 'doc', content: [{ type: 'html', html: '<script />' }] }

  const invalid = kernel.prepare(session, malformed)
  const stale = kernel.prepare(session, command(7, 'ignored'))

  assert.equal(invalid.error.name, 'InvalidCommand')
  assert.equal(stale.error.name, 'StaleRevision')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
  assert.deepEqual(JSON.parse(JSON.stringify(kernel.query(session, 'history.summary', {}))), {
    revision: 0,
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
  })
})

test('undo and redo use same semantic history and survive checkpoint reopen', () => {
  const session = kernel.open(checkpoint())
  kernel.commit(session, kernel.prepare(session, command(0, 'Changed headline', 'command-1')))
  kernel.commit(session, kernel.prepareUndo(session))
  assert.equal(projection(session).headline.plainText, 'Untitled Story')
  kernel.commit(session, kernel.prepareRedo(session))
  assert.equal(projection(session).headline.plainText, 'Changed headline')

  const reopened = kernel.open(kernel.serializeSession(session))
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.equal(projection(reopened).headline.plainText, 'Untitled Story')
  assert.equal(projection(reopened).revision, 4)
})

test('same command ID is idempotent and query never advances revision', () => {
  const session = kernel.open(checkpoint())
  const once = command(0, 'Once only', 'idempotent-command')
  kernel.commit(session, kernel.prepare(session, once))
  const revision = kernel.query(session, 'deck.summary', {}).revision
  const retry = kernel.prepare(session, once)

  assert.equal(retry.duplicate, true)
  assert.equal(retry.acknowledgement.revision, 1)
  assert.equal(kernel.query(session, 'deck.summary', {}).revision, revision)
})

test('replay rejects non-contiguous or semantically impossible journal records', () => {
  const session = kernel.open(checkpoint())
  const gap = kernel.replayRecord(session, {
    revision: 2,
    operation: 'command',
    command: command(0, 'Gap'),
  })
  assert.equal(gap.error.name, 'JournalCorruption')
  assert.equal(projection(session).revision, 0)

  const impossibleUndo = kernel.replayRecord(session, { revision: 1, operation: 'undo' })
  assert.equal(impossibleUndo.error.name, 'JournalCorruption')
  assert.equal(projection(session).revision, 0)
})

test('unsupported checkpoint schema rejects explicitly', () => {
  const future = checkpoint()
  future.schemaVersion = 2
  const result = kernel.open(future)
  assert.equal(result.error.name, 'UnsupportedSchema')
})

test('Story structure edits use semantic history and stable IDs', () => {
  const session = kernel.open(checkpoint())
  const openingSectionId = 'section-00000000-0000-4000-8000-000000000001'
  const openingSlideId = 'slide-00000000-0000-4000-8000-000000000001'
  const secondSectionId = 'section-00000000-0000-4000-8000-000000000002'
  const secondSlideId = 'slide-00000000-0000-4000-8000-000000000002'
  const bodyBlockId = 'block-00000000-0000-4000-8000-000000000003'

  const before = JSON.stringify(kernel.serializeSession(session))
  const preparedSection = kernel.prepare(session, structuralCommand(0, 'section.add', {
    sectionId: secondSectionId,
    title: 'Act Two',
    afterSectionId: openingSectionId,
  }))
  assert.equal(preparedSection.ok, true)
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
  kernel.commit(session, preparedSection)

  execute(session, structuralCommand(1, 'slide.add', {
    sectionId: secondSectionId,
    slideId: secondSlideId,
    blockId: 'block-00000000-0000-4000-8000-000000000002',
    intent: 'statement',
    headline: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Work Begins' }] }],
    },
    afterSlideId: null,
  }))
  execute(session, structuralCommand(2, 'section.move', {
    sectionId: secondSectionId,
    afterSectionId: null,
  }))
  execute(session, structuralCommand(3, 'slide.move', {
    slideId: secondSlideId,
    targetSectionId: openingSectionId,
    afterSlideId: openingSlideId,
  }))

  const structuralStory = kernel.query(session, 'story.document', {})
  assert.equal(structuralStory.revision, 4)
  assert.deepEqual(JSON.parse(JSON.stringify(structuralStory.sections.map((section) => section.id))), [
    secondSectionId,
    openingSectionId,
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(structuralStory.sections[1].slides.map((slide) => slide.id))), [
    openingSlideId,
    secondSlideId,
  ])

  execute(session, structuralCommand(4, 'section.rename', {
    sectionId: secondSectionId,
    title: 'Act II',
  }))
  execute(session, structuralCommand(5, 'slide.intent.set', {
    slideId: secondSlideId,
    intent: 'editorial-body',
  }))
  execute(session, structuralCommand(6, 'deck.rename', { title: 'The Hill' }))
  execute(session, structuralCommand(7, 'content.add', {
    slideId: secondSlideId,
    blockId: bodyBlockId,
    semanticKey: 'story.body.1',
    role: 'body',
    value: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A body block that survives design.' }] }],
    },
  }))
  const story = kernel.query(session, 'story.document', {})
  assert.equal(story.revision, 8)
  assert.equal(story.deckTitle, 'The Hill')
  assert.equal(story.sections[0].title, 'Act II')
  assert.equal(story.sections[1].slides[1].intent, 'editorial-body')
  assert.deepEqual(JSON.parse(JSON.stringify(story.sections[1].slides[1].contentBlocks.map((block) => block.role))), [
    'headline',
    'body',
  ])

  const reopened = kernel.open(kernel.serializeSession(session))
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.deepEqual(JSON.parse(JSON.stringify(kernel.query(reopened, 'story.document', {}).sections[1].slides[1].contentBlocks.map((block) => block.role))), ['headline'])
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.equal(kernel.query(reopened, 'story.document', {}).deckTitle, 'Tracer Deck')
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.equal(kernel.query(reopened, 'story.document', {}).sections[1].slides[1].intent, 'statement')
  kernel.commit(reopened, kernel.prepareUndo(reopened))
  assert.equal(kernel.query(reopened, 'story.document', {}).sections[0].title, 'Act Two')
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  kernel.commit(reopened, kernel.prepareRedo(reopened))
  assert.equal(kernel.query(reopened, 'story.document', {}).revision, 16)
})

test('invalid structural commands reject atomically without consuming identities', () => {
  const session = kernel.open(checkpoint())
  const before = JSON.stringify(kernel.serializeSession(session))
  const invalidMove = kernel.prepare(session, structuralCommand(0, 'slide.move', {
    slideId: 'slide-00000000-0000-4000-8000-000000000001',
    targetSectionId: 'missing-section',
    afterSlideId: null,
  }))
  const duplicateSection = kernel.prepare(session, structuralCommand(0, 'section.add', {
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    title: 'Duplicate',
    afterSectionId: null,
  }, 'duplicate-section'))
  const emptyRename = kernel.prepare(session, structuralCommand(0, 'section.rename', {
    sectionId: 'section-00000000-0000-4000-8000-000000000001',
    title: '',
  }, 'empty-rename'))
  const duplicateSemanticKey = kernel.prepare(session, structuralCommand(0, 'content.add', {
    slideId: 'slide-00000000-0000-4000-8000-000000000001',
    blockId: 'new-block',
    semanticKey: 'cover.headline',
    role: 'body',
    value: { type: 'doc', content: [] },
  }, 'duplicate-semantic-key'))

  assert.equal(invalidMove.error.name, 'InvalidCommand')
  assert.equal(duplicateSection.error.name, 'InvalidCommand')
  assert.equal(emptyRename.error.name, 'InvalidCommand')
  assert.equal(duplicateSemanticKey.error.name, 'InvalidCommand')
  assert.equal(JSON.stringify(kernel.serializeSession(session)), before)
})
