type JsonObject = { [key: string]: unknown }

type RichTextNode = {
  type: 'text'
  text: string
}

type RichTextParagraph = {
  type: 'paragraph'
  content: RichTextNode[]
}

type RichTextDocument = {
  type: 'doc'
  content: RichTextParagraph[]
}

type ContentBlock = {
  id: string
  semanticKey: string
  role: string
  value: RichTextDocument
}

type Slide = {
  id: string
  intent: string
  contentBlocks: ContentBlock[]
}

type Section = {
  id: string
  title: string
  slides: Slide[]
}

type DeckSnapshot = {
  schemaVersion: 1
  deckId: string
  title: string
  canvasPreset: {
    id: 'cinemascope-2576x1080'
    width: 2576
    height: 1080
  }
  sections: Section[]
}

type ContentUpdatePayload = {
  slideId: string
  blockId: string
  value: RichTextDocument
}

type ContentAddPayload = {
  slideId: string
  blockId: string
  semanticKey: string
  role: string
  value: RichTextDocument
  afterBlockId?: string | null
}

type ContentRemovePayload = {
  slideId: string
  blockId: string
}

type DeckRenamePayload = {
  title: string
}

type SectionAddPayload = {
  sectionId: string
  title: string
  afterSectionId?: string | null
}

type SectionMovePayload = {
  sectionId: string
  afterSectionId: string | null
}

type SectionRenamePayload = {
  sectionId: string
  title: string
}

type SectionRemovePayload = {
  sectionId: string
}

type SlideAddPayload = {
  sectionId: string
  slideId: string
  blockId: string
  intent: string
  headline: RichTextDocument
  afterSlideId?: string | null
}

type SlideMovePayload = {
  slideId: string
  targetSectionId: string
  afterSlideId: string | null
}

type SlideIntentPayload = {
  slideId: string
  intent: string
}

type SlideRemovePayload = {
  slideId: string
}

type CommandEnvelope = {
  commandId: string
  expectedRevision: number
  type: 'deck.rename' | 'content.add' | 'content.update' | 'content.remove' | 'section.add' | 'section.rename' | 'section.move' | 'section.remove' | 'slide.add' | 'slide.move' | 'slide.intent.set' | 'slide.remove'
  payload: JsonObject
  source: {
    kind: 'ui' | 'keyboard' | 'cli' | 'mcp' | 'migration'
    label?: string
  }
  issuedAt: string
}

type HistoryOperation =
  | { type: 'deck.rename'; payload: DeckRenamePayload }
  | { type: 'content.set'; payload: ContentUpdatePayload }
  | { type: 'content.insert'; payload: { slideId: string; block: ContentBlock; afterBlockId: string | null } }
  | { type: 'content.remove'; payload: ContentRemovePayload }
  | { type: 'section.insert'; payload: { section: Section; afterSectionId: string | null } }
  | { type: 'section.remove'; payload: SectionRemovePayload }
  | { type: 'section.rename'; payload: SectionRenamePayload }
  | { type: 'section.move'; payload: SectionMovePayload }
  | { type: 'slide.insert'; payload: { sectionId: string; slide: Slide; afterSlideId: string | null } }
  | { type: 'slide.remove'; payload: SlideRemovePayload }
  | { type: 'slide.move'; payload: SlideMovePayload }
  | { type: 'slide.intent.set'; payload: SlideIntentPayload }

type HistoryEntry = {
  id: string
  label: string
  forward: HistoryOperation
  inverse: HistoryOperation
}

type Checkpoint = {
  format: 'pitchdog.deck-checkpoint'
  schemaVersion: 1
  revision: number
  deck: DeckSnapshot
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  processedCommands: Record<string, JsonObject>
}

type KernelSession = {
  checkpoint: Checkpoint
}

type PreparedChange = {
  ok: true
  duplicate?: false
  operation: 'command' | 'undo' | 'redo'
  commandId: string
  baseRevision: number
  nextRevision: number
  nextDeck: DeckSnapshot
  nextUndoStack: HistoryEntry[]
  nextRedoStack: HistoryEntry[]
  nextProcessedCommands: Record<string, JsonObject>
  journalOperation: JsonObject
  projectionHints: string[]
}

type DuplicateResult = {
  ok: true
  duplicate: true
  acknowledgement: JsonObject
}

type KernelError = {
  ok: false
  error: {
    name: string
    message: string
  }
}

type PrepareResult = PreparedChange | DuplicateResult | KernelError

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function failure(name: string, message: string): KernelError {
  return { ok: false, error: { name, message } }
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as JsonObject
  if (document.type !== 'doc' || !Array.isArray(document.content)) return false
  return document.content.every((paragraph) => {
    if (!paragraph || typeof paragraph !== 'object') return false
    const candidate = paragraph as JsonObject
    if (candidate.type !== 'paragraph' || !Array.isArray(candidate.content)) return false
    return candidate.content.every((node) => {
      if (!node || typeof node !== 'object') return false
      const text = node as JsonObject
      return text.type === 'text' && typeof text.text === 'string'
    })
  })
}

function richTextToPlainText(value: RichTextDocument): string {
  return value.content
    .map((paragraph) => paragraph.content.map((node) => node.text).join(''))
    .join('\n')
}

function findBlock(deck: DeckSnapshot, slideId: string, blockId: string): ContentBlock | undefined {
  for (const section of deck.sections) {
    const slide = section.slides.find((candidate) => candidate.id === slideId)
    if (!slide) continue
    return slide.contentBlocks.find((candidate) => candidate.id === blockId)
  }
  return undefined
}

function blockIdentityExists(deck: DeckSnapshot, blockId: string): boolean {
  return deck.sections.some((section) =>
    section.slides.some((slide) => slide.contentBlocks.some((block) => block.id === blockId)),
  )
}

function findSlideLocation(deck: DeckSnapshot, slideId: string): { sectionIndex: number; slideIndex: number } | undefined {
  for (let sectionIndex = 0; sectionIndex < deck.sections.length; sectionIndex += 1) {
    const slideIndex = deck.sections[sectionIndex].slides.findIndex((slide) => slide.id === slideId)
    if (slideIndex >= 0) return { sectionIndex, slideIndex }
  }
  return undefined
}

function insertAfter<T extends { id: string }>(items: T[], value: T, afterId: string | null): void {
  if (items.some((item) => item.id === value.id)) throw new Error(`Identity already exists: ${value.id}`)
  if (afterId === null) {
    items.unshift(value)
    return
  }
  const anchorIndex = items.findIndex((item) => item.id === afterId)
  if (anchorIndex < 0) throw new Error(`Ordering anchor does not exist: ${afterId}`)
  items.splice(anchorIndex + 1, 0, value)
}

function applyHistoryOperation(deck: DeckSnapshot, operation: HistoryOperation): DeckSnapshot {
  const next = clone(deck)
  if (operation.type === 'deck.rename') {
    next.title = operation.payload.title
    return next
  }
  if (operation.type === 'content.set') {
    const block = findBlock(next, operation.payload.slideId, operation.payload.blockId)
    if (!block) throw new Error('Content Block does not exist')
    block.value = clone(operation.payload.value)
    return next
  }
  if (operation.type === 'content.insert') {
    const location = findSlideLocation(next, operation.payload.slideId)
    if (!location) throw new Error('Slide does not exist')
    if (blockIdentityExists(next, operation.payload.block.id)) throw new Error('Content Block identity already exists')
    const blocks = next.sections[location.sectionIndex].slides[location.slideIndex].contentBlocks
    insertAfter(blocks, clone(operation.payload.block), operation.payload.afterBlockId)
    return next
  }
  if (operation.type === 'content.remove') {
    const location = findSlideLocation(next, operation.payload.slideId)
    if (!location) throw new Error('Slide does not exist')
    const blocks = next.sections[location.sectionIndex].slides[location.slideIndex].contentBlocks
    const index = blocks.findIndex((block) => block.id === operation.payload.blockId)
    if (index < 0) throw new Error('Content Block does not exist')
    blocks.splice(index, 1)
    return next
  }
  if (operation.type === 'section.insert') {
    insertAfter(next.sections, clone(operation.payload.section), operation.payload.afterSectionId)
    return next
  }
  if (operation.type === 'section.remove') {
    const index = next.sections.findIndex((section) => section.id === operation.payload.sectionId)
    if (index < 0) throw new Error('Section does not exist')
    next.sections.splice(index, 1)
    return next
  }
  if (operation.type === 'section.rename') {
    const section = next.sections.find((candidate) => candidate.id === operation.payload.sectionId)
    if (!section) throw new Error('Section does not exist')
    section.title = operation.payload.title
    return next
  }
  if (operation.type === 'section.move') {
    const index = next.sections.findIndex((section) => section.id === operation.payload.sectionId)
    if (index < 0) throw new Error('Section does not exist')
    if (operation.payload.afterSectionId === operation.payload.sectionId) {
      throw new Error('Section cannot be ordered after itself')
    }
    const [section] = next.sections.splice(index, 1)
    insertAfter(next.sections, section, operation.payload.afterSectionId)
    return next
  }
  if (operation.type === 'slide.insert') {
    const section = next.sections.find((candidate) => candidate.id === operation.payload.sectionId)
    if (!section) throw new Error('Target Section does not exist')
    if (findSlideLocation(next, operation.payload.slide.id)) throw new Error('Slide identity already exists')
    insertAfter(section.slides, clone(operation.payload.slide), operation.payload.afterSlideId)
    return next
  }
  if (operation.type === 'slide.remove') {
    const location = findSlideLocation(next, operation.payload.slideId)
    if (!location) throw new Error('Slide does not exist')
    next.sections[location.sectionIndex].slides.splice(location.slideIndex, 1)
    return next
  }
  if (operation.type === 'slide.intent.set') {
    const location = findSlideLocation(next, operation.payload.slideId)
    if (!location) throw new Error('Slide does not exist')
    next.sections[location.sectionIndex].slides[location.slideIndex].intent = operation.payload.intent
    return next
  }
  const location = findSlideLocation(next, operation.payload.slideId)
  if (!location) throw new Error('Slide does not exist')
  if (operation.payload.afterSlideId === operation.payload.slideId) {
    throw new Error('Slide cannot be ordered after itself')
  }
  const target = next.sections.find((section) => section.id === operation.payload.targetSectionId)
  if (!target) throw new Error('Target Section does not exist')
  const [slide] = next.sections[location.sectionIndex].slides.splice(location.slideIndex, 1)
  insertAfter(target.slides, slide, operation.payload.afterSlideId)
  return next
}

function validateCheckpoint(input: unknown): Checkpoint | KernelError {
  if (!input || typeof input !== 'object') {
    return failure('InvalidCommand', 'Checkpoint must be an object')
  }
  const checkpoint = input as Partial<Checkpoint>
  if (checkpoint.schemaVersion !== 1 || checkpoint.format !== 'pitchdog.deck-checkpoint') {
    return failure('UnsupportedSchema', 'Only Deck checkpoint schema 1 is supported')
  }
  if (!Number.isSafeInteger(checkpoint.revision) || (checkpoint.revision as number) < 0) {
    return failure('InvalidCommand', 'Checkpoint revision must be a non-negative integer')
  }
  if (!checkpoint.deck || checkpoint.deck.schemaVersion !== 1) {
    return failure('UnsupportedSchema', 'Only Deck schema 1 is supported')
  }
  if (!Array.isArray(checkpoint.deck.sections)) {
    return failure('InvalidCommand', 'Deck sections must be an array')
  }
  if (!Array.isArray(checkpoint.undoStack) || !Array.isArray(checkpoint.redoStack)) {
    return failure('InvalidCommand', 'Checkpoint history stacks must be arrays')
  }
  if (!checkpoint.processedCommands || typeof checkpoint.processedCommands !== 'object') {
    return failure('InvalidCommand', 'Checkpoint processed-command map is required')
  }
  return clone(checkpoint as Checkpoint)
}

function createInitialCheckpoint(seed: JsonObject): Checkpoint {
  const deckId = assertString(seed.deckId, 'deckId')
  const sectionId = assertString(seed.sectionId, 'sectionId')
  const slideId = assertString(seed.slideId, 'slideId')
  const blockId = assertString(seed.blockId, 'blockId')
  const title = assertString(seed.title, 'title')
  const initialHeadline = assertString(seed.initialHeadline, 'initialHeadline')

  return {
    format: 'pitchdog.deck-checkpoint',
    schemaVersion: 1,
    revision: 0,
    deck: {
      schemaVersion: 1,
      deckId,
      title,
      canvasPreset: {
        id: 'cinemascope-2576x1080',
        width: 2576,
        height: 1080,
      },
      sections: [
        {
          id: sectionId,
          title: 'Opening',
          slides: [
            {
              id: slideId,
              intent: 'cover',
              contentBlocks: [
                {
                  id: blockId,
                  semanticKey: 'cover.headline',
                  role: 'headline',
                  value: {
                    type: 'doc',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: initialHeadline }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    undoStack: [],
    redoStack: [],
    processedCommands: {},
  }
}

function open(input: unknown): KernelSession | KernelError {
  const validated = validateCheckpoint(input)
  if ('ok' in validated && validated.ok === false) return validated
  return { checkpoint: validated as Checkpoint }
}

function query(session: KernelSession, name: string, params: JsonObject = {}): JsonObject | KernelError {
  const checkpoint = session.checkpoint
  if (name === 'deck.summary') {
    return {
      deckId: checkpoint.deck.deckId,
      title: checkpoint.deck.title,
      revision: checkpoint.revision,
      sectionCount: checkpoint.deck.sections.length,
      slideCount: checkpoint.deck.sections.reduce((sum, section) => sum + section.slides.length, 0),
    }
  }
  if (name === 'history.summary') {
    return {
      revision: checkpoint.revision,
      canUndo: checkpoint.undoStack.length > 0,
      canRedo: checkpoint.redoStack.length > 0,
      undoDepth: checkpoint.undoStack.length,
      redoDepth: checkpoint.redoStack.length,
    }
  }
  if (name === 'story.document') {
    return {
      deckId: checkpoint.deck.deckId,
      deckTitle: checkpoint.deck.title,
      revision: checkpoint.revision,
      sections: checkpoint.deck.sections.map((section) => ({
        id: section.id,
        title: section.title,
        slides: section.slides.map((slide) => {
          const headline = slide.contentBlocks.find((block) => block.role === 'headline')
          return {
            id: slide.id,
            intent: slide.intent,
            contentBlocks: slide.contentBlocks.map((block) => ({
              id: block.id,
              semanticKey: block.semanticKey,
              role: block.role,
              plainText: richTextToPlainText(block.value),
            })),
            headline: headline
              ? {
                  id: headline.id,
                  plainText: richTextToPlainText(headline.value),
                }
              : null,
          }
        }),
      })),
      history: {
        canUndo: checkpoint.undoStack.length > 0,
        canRedo: checkpoint.redoStack.length > 0,
      },
    }
  }
  if (name === 'slide.activeProjection') {
    const requestedSlideId = typeof params.slideId === 'string' ? params.slideId : undefined
    for (const section of checkpoint.deck.sections) {
      for (const slide of section.slides) {
        if (requestedSlideId && slide.id !== requestedSlideId) continue
        const headline = slide.contentBlocks.find((block) => block.role === 'headline')
        if (!headline) return failure('InvalidCommand', 'Slide has no headline Content Block')
        return {
          deckId: checkpoint.deck.deckId,
          deckTitle: checkpoint.deck.title,
          revision: checkpoint.revision,
          section: { id: section.id, title: section.title },
          slide: { id: slide.id, intent: slide.intent },
          headline: {
            id: headline.id,
            semanticKey: headline.semanticKey,
            role: headline.role,
            value: clone(headline.value),
            plainText: richTextToPlainText(headline.value),
          },
          contentBlocks: slide.contentBlocks.map((block) => ({
            id: block.id,
            semanticKey: block.semanticKey,
            role: block.role,
            value: clone(block.value),
            plainText: richTextToPlainText(block.value),
          })),
          canvas: clone(checkpoint.deck.canvasPreset),
          history: {
            canUndo: checkpoint.undoStack.length > 0,
            canRedo: checkpoint.redoStack.length > 0,
          },
        }
      }
    }
    return failure('InvalidCommand', 'Slide does not exist')
  }
  return failure('InvalidCommand', `Unknown named query: ${name}`)
}

function prepare(session: KernelSession, command: CommandEnvelope): PrepareResult {
  if (!command || typeof command !== 'object') {
    return failure('InvalidCommand', 'Command must be an object')
  }
  if (typeof command.commandId !== 'string' || command.commandId.length === 0) {
    return failure('InvalidCommand', 'commandId is required')
  }
  const duplicate = session.checkpoint.processedCommands[command.commandId]
  if (duplicate) return { ok: true, duplicate: true, acknowledgement: clone(duplicate) }
  if (command.expectedRevision !== session.checkpoint.revision) {
    return failure(
      'StaleRevision',
      `Expected revision ${session.checkpoint.revision}; received ${String(command.expectedRevision)}`,
    )
  }
  if (!command.payload || typeof command.payload !== 'object') {
    return failure('InvalidCommand', `${String(command.type)} requires a payload`)
  }

  let forward: HistoryOperation
  let inverse: HistoryOperation
  let label: string
  let projectionHints: string[] = ['story', 'slide.activeProjection', 'history']
  try {
    if (command.type === 'deck.rename') {
      const title = assertString(command.payload.title, 'title')
      forward = { type: 'deck.rename', payload: { title } }
      inverse = { type: 'deck.rename', payload: { title: session.checkpoint.deck.title } }
      label = `Rename Deck: ${title}`
      projectionHints = ['story', 'sequence', 'slide.activeProjection', 'history']
    } else if (command.type === 'content.add') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const blockId = assertString(command.payload.blockId, 'blockId')
      const semanticKey = assertString(command.payload.semanticKey, 'semanticKey')
      const role = assertString(command.payload.role, 'role')
      if (blockIdentityExists(session.checkpoint.deck, blockId)) throw new Error('Content Block identity already exists')
      if (!isRichTextDocument(command.payload.value)) {
        throw new Error('content.add value must be semantic rich-text JSON')
      }
      const blocks = session.checkpoint.deck.sections[location.sectionIndex].slides[location.slideIndex].contentBlocks
      if (blocks.some((block) => block.semanticKey === semanticKey)) {
        throw new Error('Content Block semantic key already exists on Slide')
      }
      const afterBlockId = command.payload.afterBlockId === undefined
        ? blocks.at(-1)?.id ?? null
        : command.payload.afterBlockId === null
          ? null
          : assertString(command.payload.afterBlockId, 'afterBlockId')
      const block: ContentBlock = {
        id: blockId,
        semanticKey,
        role,
        value: clone(command.payload.value),
      }
      forward = { type: 'content.insert', payload: { slideId, block, afterBlockId } }
      inverse = { type: 'content.remove', payload: { slideId, blockId } }
      label = `Add Content: ${role}`
    } else if (command.type === 'content.update') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const blockId = assertString(command.payload.blockId, 'blockId')
      if (!isRichTextDocument(command.payload.value)) {
        throw new Error('content.update value must be semantic rich-text JSON')
      }
      const currentBlock = findBlock(session.checkpoint.deck, slideId, blockId)
      if (!currentBlock) throw new Error('Content Block does not exist')
      forward = {
        type: 'content.set',
        payload: { slideId, blockId, value: clone(command.payload.value) },
      }
      inverse = {
        type: 'content.set',
        payload: { slideId, blockId, value: clone(currentBlock.value) },
      }
      label = `Update Content: ${currentBlock.role}`
    } else if (command.type === 'content.remove') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const blockId = assertString(command.payload.blockId, 'blockId')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const blocks = session.checkpoint.deck.sections[location.sectionIndex].slides[location.slideIndex].contentBlocks
      const blockIndex = blocks.findIndex((block) => block.id === blockId)
      if (blockIndex < 0) throw new Error('Content Block does not exist')
      const block = blocks[blockIndex]
      if (block.role === 'headline') throw new Error('Headline Content Block cannot be removed')
      const afterBlockId = blockIndex > 0 ? blocks[blockIndex - 1].id : null
      forward = { type: 'content.remove', payload: { slideId, blockId } }
      inverse = { type: 'content.insert', payload: { slideId, block: clone(block), afterBlockId } }
      label = `Remove Content: ${block.role}`
    } else if (command.type === 'section.add') {
      const sectionId = assertString(command.payload.sectionId, 'sectionId')
      const title = assertString(command.payload.title, 'title')
      const afterSectionId = command.payload.afterSectionId === undefined
        ? session.checkpoint.deck.sections.at(-1)?.id ?? null
        : command.payload.afterSectionId === null
          ? null
          : assertString(command.payload.afterSectionId, 'afterSectionId')
      forward = {
        type: 'section.insert',
        payload: { section: { id: sectionId, title, slides: [] }, afterSectionId },
      }
      inverse = { type: 'section.remove', payload: { sectionId } }
      label = `Add Section: ${title}`
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.rename') {
      const sectionId = assertString(command.payload.sectionId, 'sectionId')
      const title = assertString(command.payload.title, 'title')
      const section = session.checkpoint.deck.sections.find((candidate) => candidate.id === sectionId)
      if (!section) throw new Error('Section does not exist')
      forward = { type: 'section.rename', payload: { sectionId, title } }
      inverse = { type: 'section.rename', payload: { sectionId, title: section.title } }
      label = `Rename Section: ${title}`
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.move') {
      const sectionId = assertString(command.payload.sectionId, 'sectionId')
      const index = session.checkpoint.deck.sections.findIndex((section) => section.id === sectionId)
      if (index < 0) throw new Error('Section does not exist')
      const afterSectionId = command.payload.afterSectionId === null
        ? null
        : assertString(command.payload.afterSectionId, 'afterSectionId')
      const previousAfterSectionId = index > 0 ? session.checkpoint.deck.sections[index - 1].id : null
      forward = { type: 'section.move', payload: { sectionId, afterSectionId } }
      inverse = { type: 'section.move', payload: { sectionId, afterSectionId: previousAfterSectionId } }
      label = 'Move Section'
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.remove') {
      const sectionId = assertString(command.payload.sectionId, 'sectionId')
      const sectionIndex = session.checkpoint.deck.sections.findIndex((section) => section.id === sectionId)
      if (sectionIndex < 0) throw new Error('Section does not exist')
      if (session.checkpoint.deck.sections.length <= 1) throw new Error('Deck must retain at least one Section')
      const section = session.checkpoint.deck.sections[sectionIndex]
      if (section.slides.length > 0) throw new Error('Section must be empty before removal')
      const afterSectionId = sectionIndex > 0 ? session.checkpoint.deck.sections[sectionIndex - 1].id : null
      forward = { type: 'section.remove', payload: { sectionId } }
      inverse = { type: 'section.insert', payload: { section: clone(section), afterSectionId } }
      label = `Remove Section: ${section.title}`
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'slide.add') {
      const sectionId = assertString(command.payload.sectionId, 'sectionId')
      const section = session.checkpoint.deck.sections.find((candidate) => candidate.id === sectionId)
      if (!section) throw new Error('Target Section does not exist')
      const slideId = assertString(command.payload.slideId, 'slideId')
      const blockId = assertString(command.payload.blockId, 'blockId')
      const intent = assertString(command.payload.intent, 'intent')
      if (!isRichTextDocument(command.payload.headline)) {
        throw new Error('slide.add headline must be semantic rich-text JSON')
      }
      if (blockIdentityExists(session.checkpoint.deck, blockId)) throw new Error('Content Block identity already exists')
      const afterSlideId = command.payload.afterSlideId === undefined
        ? section.slides.at(-1)?.id ?? null
        : command.payload.afterSlideId === null
          ? null
          : assertString(command.payload.afterSlideId, 'afterSlideId')
      const slide: Slide = {
        id: slideId,
        intent,
        contentBlocks: [{
          id: blockId,
          semanticKey: 'slide.headline',
          role: 'headline',
          value: clone(command.payload.headline),
        }],
      }
      forward = { type: 'slide.insert', payload: { sectionId, slide, afterSlideId } }
      inverse = { type: 'slide.remove', payload: { slideId } }
      label = 'Add Slide'
      projectionHints = ['story', 'sequence', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.move') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const targetSectionId = assertString(command.payload.targetSectionId, 'targetSectionId')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const sourceSection = session.checkpoint.deck.sections[location.sectionIndex]
      const previousAfterSlideId = location.slideIndex > 0 ? sourceSection.slides[location.slideIndex - 1].id : null
      const afterSlideId = command.payload.afterSlideId === null
        ? null
        : assertString(command.payload.afterSlideId, 'afterSlideId')
      forward = { type: 'slide.move', payload: { slideId, targetSectionId, afterSlideId } }
      inverse = {
        type: 'slide.move',
        payload: { slideId, targetSectionId: sourceSection.id, afterSlideId: previousAfterSlideId },
      }
      label = 'Move Slide'
      projectionHints = ['story', 'sequence', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.intent.set') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const intent = assertString(command.payload.intent, 'intent')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const currentIntent = session.checkpoint.deck.sections[location.sectionIndex].slides[location.slideIndex].intent
      forward = { type: 'slide.intent.set', payload: { slideId, intent } }
      inverse = { type: 'slide.intent.set', payload: { slideId, intent: currentIntent } }
      label = `Set Slide intent: ${intent}`
      projectionHints = ['story', 'sequence', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.remove') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const slideCount = session.checkpoint.deck.sections.reduce((sum, section) => sum + section.slides.length, 0)
      if (slideCount <= 1) throw new Error('Deck must retain at least one Slide')
      const section = session.checkpoint.deck.sections[location.sectionIndex]
      const slide = section.slides[location.slideIndex]
      const afterSlideId = location.slideIndex > 0 ? section.slides[location.slideIndex - 1].id : null
      forward = { type: 'slide.remove', payload: { slideId } }
      inverse = { type: 'slide.insert', payload: { sectionId: section.id, slide: clone(slide), afterSlideId } }
      label = 'Remove Slide'
      projectionHints = ['story', 'sequence', 'slide.activeProjection', 'history']
    } else {
      return failure('InvalidCommand', `Unsupported command type: ${String(command.type)}`)
    }
  } catch (error) {
    return failure('InvalidCommand', (error as Error).message)
  }

  let nextDeck: DeckSnapshot
  try {
    nextDeck = applyHistoryOperation(session.checkpoint.deck, forward)
  } catch (error) {
    return failure('InvalidCommand', (error as Error).message)
  }
  const nextRevision = session.checkpoint.revision + 1
  const entry: HistoryEntry = {
    id: command.commandId,
    label,
    forward: clone(forward),
    inverse: clone(inverse),
  }
  const acknowledgement = {
    commandId: command.commandId,
    revision: nextRevision,
    status: 'committed',
  }
  return {
    ok: true,
    operation: 'command',
    commandId: command.commandId,
    baseRevision: session.checkpoint.revision,
    nextRevision,
    nextDeck,
    nextUndoStack: [...clone(session.checkpoint.undoStack), entry],
    nextRedoStack: [],
    nextProcessedCommands: {
      ...clone(session.checkpoint.processedCommands),
      [command.commandId]: acknowledgement,
    },
    journalOperation: {
      operation: 'command',
      command: clone(command),
    },
    projectionHints,
  }
}

function prepareUndo(session: KernelSession): PrepareResult {
  const stack = session.checkpoint.undoStack
  if (stack.length === 0) return failure('InvalidCommand', 'Nothing to undo')
  const entry = clone(stack[stack.length - 1])
  const nextRevision = session.checkpoint.revision + 1
  return {
    ok: true,
    operation: 'undo',
    commandId: `undo:${entry.id}:${nextRevision}`,
    baseRevision: session.checkpoint.revision,
    nextRevision,
    nextDeck: applyHistoryOperation(session.checkpoint.deck, entry.inverse),
    nextUndoStack: clone(stack.slice(0, -1)),
    nextRedoStack: [...clone(session.checkpoint.redoStack), entry],
    nextProcessedCommands: clone(session.checkpoint.processedCommands),
    journalOperation: { operation: 'undo', historyEntryId: entry.id },
    projectionHints: ['story', 'slide.activeProjection', 'history'],
  }
}

function prepareRedo(session: KernelSession): PrepareResult {
  const stack = session.checkpoint.redoStack
  if (stack.length === 0) return failure('InvalidCommand', 'Nothing to redo')
  const entry = clone(stack[stack.length - 1])
  const nextRevision = session.checkpoint.revision + 1
  return {
    ok: true,
    operation: 'redo',
    commandId: `redo:${entry.id}:${nextRevision}`,
    baseRevision: session.checkpoint.revision,
    nextRevision,
    nextDeck: applyHistoryOperation(session.checkpoint.deck, entry.forward),
    nextUndoStack: [...clone(session.checkpoint.undoStack), entry],
    nextRedoStack: clone(stack.slice(0, -1)),
    nextProcessedCommands: clone(session.checkpoint.processedCommands),
    journalOperation: { operation: 'redo', historyEntryId: entry.id },
    projectionHints: ['story', 'slide.activeProjection', 'history'],
  }
}

function commit(session: KernelSession, prepared: PreparedChange): JsonObject | KernelError {
  if (!prepared || prepared.ok !== true || prepared.duplicate === true) {
    return failure('InvalidCommand', 'Only a prepared non-duplicate change can commit')
  }
  if (session.checkpoint.revision !== prepared.baseRevision) {
    return failure('StaleRevision', 'Prepared change no longer matches live state')
  }
  session.checkpoint = {
    format: 'pitchdog.deck-checkpoint',
    schemaVersion: 1,
    revision: prepared.nextRevision,
    deck: clone(prepared.nextDeck),
    undoStack: clone(prepared.nextUndoStack),
    redoStack: clone(prepared.nextRedoStack),
    processedCommands: clone(prepared.nextProcessedCommands),
  }
  return {
    commandId: prepared.commandId,
    revision: prepared.nextRevision,
    status: 'committed',
  }
}

function serializeSession(session: KernelSession): Checkpoint {
  return clone(session.checkpoint)
}

function replayRecord(session: KernelSession, record: JsonObject): JsonObject | KernelError {
  if (!Number.isSafeInteger(record.revision) || record.revision !== session.checkpoint.revision + 1) {
    return failure('JournalCorruption', 'Journal revision is not contiguous')
  }
  let prepared: PrepareResult
  if (record.operation === 'command') {
    prepared = prepare(session, record.command as CommandEnvelope)
  } else if (record.operation === 'undo') {
    prepared = prepareUndo(session)
  } else if (record.operation === 'redo') {
    prepared = prepareRedo(session)
  } else {
    return failure('JournalCorruption', 'Journal operation is unknown')
  }
  if (!prepared.ok || prepared.duplicate === true) {
    return failure('JournalCorruption', 'Journal operation cannot be replayed')
  }
  if (prepared.nextRevision !== record.revision) {
    return failure('JournalCorruption', 'Prepared revision does not match journal')
  }
  return commit(session, prepared)
}

const DeckKernel = Object.freeze({
  createInitialCheckpoint,
  open,
  query,
  prepare,
  prepareUndo,
  prepareRedo,
  commit,
  replayRecord,
  serializeSession,
})

let adapterSession: KernelSession | undefined

function adapterResult(value: unknown): string {
  return JSON.stringify(value)
}

const DeckKernelJSON = Object.freeze({
  createInitialCheckpoint(seedJSON: string): string {
    try {
      return adapterResult(DeckKernel.createInitialCheckpoint(JSON.parse(seedJSON)))
    } catch (error) {
      return adapterResult(failure('InvalidCommand', (error as Error).message))
    }
  },
  open(checkpointJSON: string): string {
    const result = DeckKernel.open(JSON.parse(checkpointJSON))
    if ('ok' in result && result.ok === false) return adapterResult(result)
    adapterSession = result as KernelSession
    return adapterResult({ ok: true, revision: adapterSession.checkpoint.revision })
  },
  query(name: string, paramsJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.query(adapterSession, name, JSON.parse(paramsJSON)))
  },
  prepare(commandJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.prepare(adapterSession, JSON.parse(commandJSON)))
  },
  prepareUndo(): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.prepareUndo(adapterSession))
  },
  prepareRedo(): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.prepareRedo(adapterSession))
  },
  commit(preparedJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.commit(adapterSession, JSON.parse(preparedJSON)))
  },
  replay(recordJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.replayRecord(adapterSession, JSON.parse(recordJSON)))
  },
  serialize(): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.serializeSession(adapterSession))
  },
})

;(globalThis as unknown as { DeckKernel: typeof DeckKernel }).DeckKernel = DeckKernel
;(globalThis as unknown as { DeckKernelJSON: typeof DeckKernelJSON }).DeckKernelJSON = DeckKernelJSON
