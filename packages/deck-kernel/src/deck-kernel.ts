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
  role: 'headline'
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

type CommandEnvelope = {
  commandId: string
  expectedRevision: number
  type: 'content.update'
  payload: {
    slideId: string
    blockId: string
    value: RichTextDocument
  }
  source: {
    kind: 'ui' | 'keyboard' | 'cli' | 'mcp' | 'migration'
    label?: string
  }
  issuedAt: string
}

type HistoryEntry = {
  id: string
  label: string
  forward: CommandEnvelope['payload']
  inverse: CommandEnvelope['payload']
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

function replaceBlockValue(
  deck: DeckSnapshot,
  payload: CommandEnvelope['payload'],
): DeckSnapshot {
  const next = clone(deck)
  const block = findBlock(next, payload.slideId, payload.blockId)
  if (!block) throw new Error('Content Block does not exist')
  block.value = clone(payload.value)
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
  if (command.type !== 'content.update') {
    return failure('InvalidCommand', `Unsupported command type: ${String(command.type)}`)
  }
  const payload = command.payload
  if (!payload || typeof payload.slideId !== 'string' || typeof payload.blockId !== 'string') {
    return failure('InvalidCommand', 'content.update requires slideId and blockId')
  }
  if (!isRichTextDocument(payload.value)) {
    return failure('InvalidCommand', 'content.update value must be semantic rich-text JSON')
  }
  const currentBlock = findBlock(session.checkpoint.deck, payload.slideId, payload.blockId)
  if (!currentBlock) return failure('InvalidCommand', 'Content Block does not exist')

  const before = clone(currentBlock.value)
  const nextDeck = replaceBlockValue(session.checkpoint.deck, payload)
  const nextRevision = session.checkpoint.revision + 1
  const entry: HistoryEntry = {
    id: command.commandId,
    label: 'Update headline',
    forward: clone(payload),
    inverse: {
      slideId: payload.slideId,
      blockId: payload.blockId,
      value: before,
    },
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
    projectionHints: ['story', 'slide.activeProjection', 'history'],
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
    nextDeck: replaceBlockValue(session.checkpoint.deck, entry.inverse),
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
    nextDeck: replaceBlockValue(session.checkpoint.deck, entry.forward),
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
