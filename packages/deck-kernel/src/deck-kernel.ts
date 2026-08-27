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

type AssetReference = {
  id: string
  label: string
  mediaKind: 'image' | 'gif' | 'video'
  availability: 'unknown' | 'available' | 'missing'
}

type MediaAssignment = {
  id: string
  role: string
  assetReferenceId: string
}

type ElementFrame = {
  x: number
  y: number
  width: number
  height: number
}

type NormalizedCrop = {
  x: number
  y: number
  width: number
  height: number
}

type CompositionElement = {
  id: string
  kind: 'text' | 'image' | 'shape' | 'line' | 'group'
  frame: ElementFrame
  patternElementKey?: string
  contentBlockId?: string
  mediaRole?: string
  crop?: NormalizedCrop
}

type Composition = {
  id: string
  elements: CompositionElement[]
}

type AuthoredPatternId = 'cover' | 'full-bleed-statement' | 'editorial-body'

type PatternElementSnapshot = {
  key: string
  kind: CompositionElement['kind']
  frame: ElementFrame
  contentSlot?: string
  contentRole?: string
  mediaRole?: string
}

type LayoutPatternSnapshot = {
  id: AuthoredPatternId
  version: 1
  name: string
  elements: PatternElementSnapshot[]
}

type DesignOption = {
  id: string
  name: string
  patternSnapshot?: LayoutPatternSnapshot
  composition: Composition
}

type Slide = {
  id: string
  intent: string
  contentBlocks: ContentBlock[]
  mediaAssignments?: MediaAssignment[]
  designOptions?: DesignOption[]
  activeDesignOptionId?: string
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
  assetReferences?: AssetReference[]
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

type ElementFrameUpdatePayload = {
  slideId: string
  designOptionId: string
  elementId: string
  frame: ElementFrame
}

type AssetReferenceInsertPayload = {
  assetReference: AssetReference
}

type AssetReferenceRemovePayload = {
  assetReferenceId: string
}

type MediaAssignmentInsertPayload = {
  slideId: string
  assignment: MediaAssignment
}

type MediaAssignmentRemovePayload = {
  slideId: string
  mediaAssignmentId: string
}

type MediaAssignmentAssetSetPayload = {
  slideId: string
  mediaAssignmentId: string
  assetReferenceId: string
}

type ElementCropSetPayload = {
  slideId: string
  designOptionId: string
  elementId: string
  crop: NormalizedCrop | null
}

type DesignOptionInsertPayload = {
  slideId: string
  designOption: DesignOption
  afterDesignOptionId: string | null
  activeDesignOptionId: string
}

type DesignOptionRemovePayload = {
  slideId: string
  designOptionId: string
  activeDesignOptionId: string | null
}

type DesignOptionActivatePayload = {
  slideId: string
  designOptionId: string | null
}

type CommandEnvelope = {
  commandId: string
  expectedRevision: number
  type: 'deck.rename' | 'content.add' | 'content.update' | 'content.remove' | 'section.add' | 'section.rename' | 'section.move' | 'section.remove' | 'slide.add' | 'slide.move' | 'slide.intent.set' | 'slide.remove' | 'asset.reference.add' | 'asset.assign' | 'designOption.applyPattern' | 'designOption.activate' | 'element.frame.update' | 'element.crop.update'
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
  | { type: 'asset.reference.insert'; payload: AssetReferenceInsertPayload }
  | { type: 'asset.reference.remove'; payload: AssetReferenceRemovePayload }
  | { type: 'asset.assignment.insert'; payload: MediaAssignmentInsertPayload }
  | { type: 'asset.assignment.remove'; payload: MediaAssignmentRemovePayload }
  | { type: 'asset.assignment.asset.set'; payload: MediaAssignmentAssetSetPayload }
  | { type: 'designOption.insert'; payload: DesignOptionInsertPayload }
  | { type: 'designOption.remove'; payload: DesignOptionRemovePayload }
  | { type: 'designOption.activate.set'; payload: DesignOptionActivatePayload }
  | { type: 'element.frame.set'; payload: ElementFrameUpdatePayload }
  | { type: 'element.crop.set'; payload: ElementCropSetPayload }

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

const AUTHORED_PATTERNS: LayoutPatternSnapshot[] = [
  {
    id: 'cover',
    version: 1,
    name: 'Cover',
    elements: [
      {
        key: 'primary-image',
        kind: 'image',
        mediaRole: 'primary',
        frame: { x: 0, y: 0, width: 2576, height: 1080 },
      },
      {
        key: 'headline',
        kind: 'text',
        contentSlot: 'headline',
        contentRole: 'headline',
        frame: { x: 160, y: 660, width: 1700, height: 260 },
      },
    ],
  },
  {
    id: 'full-bleed-statement',
    version: 1,
    name: 'Full-bleed Statement',
    elements: [
      {
        key: 'primary-image',
        kind: 'image',
        mediaRole: 'primary',
        frame: { x: 0, y: 0, width: 2576, height: 1080 },
      },
      {
        key: 'headline',
        kind: 'text',
        contentSlot: 'headline',
        contentRole: 'headline',
        frame: { x: 288, y: 300, width: 2000, height: 480 },
      },
    ],
  },
  {
    id: 'editorial-body',
    version: 1,
    name: 'Editorial Body',
    elements: [
      {
        key: 'headline',
        kind: 'text',
        contentSlot: 'headline',
        contentRole: 'headline',
        frame: { x: 160, y: 140, width: 1050, height: 240 },
      },
      {
        key: 'body',
        kind: 'text',
        contentSlot: 'body',
        contentRole: 'body',
        frame: { x: 160, y: 420, width: 1050, height: 460 },
      },
      {
        key: 'primary-image',
        kind: 'image',
        mediaRole: 'primary',
        frame: { x: 1376, y: 0, width: 1200, height: 1080 },
      },
    ],
  },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function failure(name: string, message: string): KernelError {
  return { ok: false, error: { name, message } }
}

function assertString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  if (value.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters`)
  return value
}

function utf8ByteLength(value: string): number {
  let length = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) as number
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return length
}

function assertBoundedJsonStrings(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    if (value.length > 262144) throw new Error('Command contains a string longer than 262144 characters')
    return
  }
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertBoundedJsonStrings(item, seen)
    return
  }
  for (const item of Object.values(value as JsonObject)) assertBoundedJsonStrings(item, seen)
}

function assertCommandEnvelope(command: CommandEnvelope): void {
  assertString(command.commandId, 'commandId', 256)
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw new Error('expectedRevision must be a non-negative integer')
  }
  assertString(command.type, 'type', 128)
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) {
    throw new Error(`${String(command.type)} requires an object payload`)
  }
  if (!command.source || typeof command.source !== 'object' || Array.isArray(command.source)) {
    throw new Error('source must be an object')
  }
  if (!['ui', 'keyboard', 'cli', 'mcp', 'migration'].includes(command.source.kind)) {
    throw new Error('source.kind is unsupported')
  }
  if (command.source.label !== undefined) assertString(command.source.label, 'source.label', 512)
  const issuedAt = assertString(command.issuedAt, 'issuedAt', 64)
  const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
  if (!iso8601.test(issuedAt) || !Number.isFinite(Date.parse(issuedAt))) {
    throw new Error('issuedAt must be an ISO-8601 timestamp')
  }
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(command)
  } catch {
    throw new Error('Command must be JSON-serializable')
  }
  if (typeof serialized !== 'string') throw new Error('Command must be JSON-serializable')
  if (utf8ByteLength(serialized) > 1048576) throw new Error('Command exceeds the 1 MiB limit')
  assertBoundedJsonStrings(command)
}

function assertElementFrame(value: unknown): ElementFrame {
  if (!value || typeof value !== 'object') throw new Error('frame must be an object')
  const candidate = value as Partial<ElementFrame>
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field])) {
      throw new Error(`frame.${field} must be a finite number`)
    }
  }
  if ((candidate.width as number) <= 0 || (candidate.height as number) <= 0) {
    throw new Error('frame width and height must be greater than zero')
  }
  return {
    x: candidate.x as number,
    y: candidate.y as number,
    width: candidate.width as number,
    height: candidate.height as number,
  }
}

function assertMediaKind(value: unknown): AssetReference['mediaKind'] {
  if (value !== 'image' && value !== 'gif' && value !== 'video') {
    throw new Error('mediaKind must be image, gif, or video')
  }
  return value
}

function assertNormalizedCrop(value: unknown): NormalizedCrop {
  if (!value || typeof value !== 'object') throw new Error('crop must be an object')
  const candidate = value as Partial<NormalizedCrop>
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field])) {
      throw new Error(`crop.${field} must be a finite number`)
    }
  }
  const x = candidate.x as number
  const y = candidate.y as number
  const width = candidate.width as number
  const height = candidate.height as number
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new Error('crop must be a positive normalized rectangle within the source image')
  }
  return { x, y, width, height }
}

function assertContentBindings(value: unknown, pattern: LayoutPatternSnapshot): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('contentBindings must be an object')
  }
  const candidate = value as JsonObject
  const requiredSlots = pattern.elements
    .map((element) => element.contentSlot)
    .filter((slot): slot is string => typeof slot === 'string')
  for (const suppliedSlot of Object.keys(candidate)) {
    if (!requiredSlots.includes(suppliedSlot)) {
      throw new Error(`Pattern does not define content slot: ${suppliedSlot}`)
    }
  }
  return Object.fromEntries(
    requiredSlots.map((slot) => [slot, assertString(candidate[slot], `contentBindings.${slot}`)]),
  )
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

function findSlide(deck: DeckSnapshot, slideId: string): Slide | undefined {
  const location = findSlideLocation(deck, slideId)
  return location ? deck.sections[location.sectionIndex].slides[location.slideIndex] : undefined
}

function designOptionIdentityExists(deck: DeckSnapshot, designOptionId: string): boolean {
  return deck.sections.some((section) =>
    section.slides.some((slide) => slide.designOptions?.some((option) => option.id === designOptionId) ?? false),
  )
}

function assetReferenceIdentityExists(deck: DeckSnapshot, assetReferenceId: string): boolean {
  return deck.assetReferences?.some((asset) => asset.id === assetReferenceId) ?? false
}

function mediaAssignmentIdentityExists(deck: DeckSnapshot, mediaAssignmentId: string): boolean {
  return deck.sections.some((section) =>
    section.slides.some((slide) =>
      slide.mediaAssignments?.some((assignment) => assignment.id === mediaAssignmentId) ?? false,
    ),
  )
}

function findMediaAssignment(slide: Slide, mediaAssignmentId: string): MediaAssignment | undefined {
  return slide.mediaAssignments?.find((assignment) => assignment.id === mediaAssignmentId)
}

function authoredPattern(patternId: string, patternVersion: number): LayoutPatternSnapshot | undefined {
  return AUTHORED_PATTERNS.find((pattern) => pattern.id === patternId && pattern.version === patternVersion)
}

function instantiatePattern(
  slide: Slide,
  designOptionId: string,
  name: string,
  pattern: LayoutPatternSnapshot,
  contentBindings: Record<string, string>,
): DesignOption {
  const elements = pattern.elements.map((patternElement): CompositionElement => {
    const element: CompositionElement = {
      id: `${designOptionId}:element:${patternElement.key}`,
      kind: patternElement.kind,
      frame: clone(patternElement.frame),
      patternElementKey: patternElement.key,
    }
    if (patternElement.contentSlot && patternElement.contentRole) {
      const contentBlockId = contentBindings[patternElement.contentSlot]
      const contentBlock = slide.contentBlocks.find((block) => block.id === contentBlockId)
      if (!contentBlock) throw new Error(`Pattern Content Block does not exist: ${patternElement.contentSlot}`)
      if (contentBlock.role !== patternElement.contentRole) {
        throw new Error(`Pattern content slot ${patternElement.contentSlot} requires role ${patternElement.contentRole}`)
      }
      element.contentBlockId = contentBlock.id
    }
    if (patternElement.mediaRole) {
      element.mediaRole = patternElement.mediaRole
      if (patternElement.kind === 'image') element.crop = { x: 0, y: 0, width: 1, height: 1 }
    }
    return element
  })
  return {
    id: designOptionId,
    name,
    patternSnapshot: clone(pattern),
    composition: {
      id: `${designOptionId}:composition`,
      elements,
    },
  }
}

function findElement(
  deck: DeckSnapshot,
  slideId: string,
  designOptionId: string,
  elementId: string,
): CompositionElement | undefined {
  const location = findSlideLocation(deck, slideId)
  if (!location) return undefined
  const slide = deck.sections[location.sectionIndex].slides[location.slideIndex]
  const option = slide.designOptions?.find((candidate) => candidate.id === designOptionId)
  return option?.composition.elements.find((candidate) => candidate.id === elementId)
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
  if (operation.type === 'asset.reference.insert') {
    if (assetReferenceIdentityExists(next, operation.payload.assetReference.id)) {
      throw new Error('Asset Reference identity already exists')
    }
    const assetReferences = next.assetReferences ?? []
    next.assetReferences = assetReferences
    assetReferences.push(clone(operation.payload.assetReference))
    return next
  }
  if (operation.type === 'asset.reference.remove') {
    const assetReferences = next.assetReferences ?? []
    const assetIndex = assetReferences.findIndex((asset) => asset.id === operation.payload.assetReferenceId)
    if (assetIndex < 0) throw new Error('Asset Reference does not exist')
    const isAssigned = next.sections.some((section) =>
      section.slides.some((slide) =>
        slide.mediaAssignments?.some(
          (assignment) => assignment.assetReferenceId === operation.payload.assetReferenceId,
        ) ?? false,
      ),
    )
    if (isAssigned) throw new Error('Asset Reference is assigned to a Slide')
    assetReferences.splice(assetIndex, 1)
    return next
  }
  if (operation.type === 'asset.assignment.insert') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    if (!assetReferenceIdentityExists(next, operation.payload.assignment.assetReferenceId)) {
      throw new Error('Asset Reference does not exist')
    }
    if (mediaAssignmentIdentityExists(next, operation.payload.assignment.id)) {
      throw new Error('Media Assignment identity already exists')
    }
    const mediaAssignments = slide.mediaAssignments ?? []
    if (mediaAssignments.some((assignment) => assignment.role === operation.payload.assignment.role)) {
      throw new Error('Media role already has an assignment')
    }
    slide.mediaAssignments = mediaAssignments
    mediaAssignments.push(clone(operation.payload.assignment))
    return next
  }
  if (operation.type === 'asset.assignment.remove') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    const mediaAssignments = slide.mediaAssignments ?? []
    const assignmentIndex = mediaAssignments.findIndex(
      (assignment) => assignment.id === operation.payload.mediaAssignmentId,
    )
    if (assignmentIndex < 0) throw new Error('Media Assignment does not exist')
    mediaAssignments.splice(assignmentIndex, 1)
    return next
  }
  if (operation.type === 'asset.assignment.asset.set') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    if (!assetReferenceIdentityExists(next, operation.payload.assetReferenceId)) {
      throw new Error('Asset Reference does not exist')
    }
    const assignment = findMediaAssignment(slide, operation.payload.mediaAssignmentId)
    if (!assignment) throw new Error('Media Assignment does not exist')
    assignment.assetReferenceId = operation.payload.assetReferenceId
    return next
  }
  if (operation.type === 'designOption.insert') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    if (designOptionIdentityExists(next, operation.payload.designOption.id)) {
      throw new Error('Design Option identity already exists')
    }
    const designOptions = slide.designOptions ?? []
    slide.designOptions = designOptions
    insertAfter(designOptions, clone(operation.payload.designOption), operation.payload.afterDesignOptionId)
    slide.activeDesignOptionId = operation.payload.activeDesignOptionId
    return next
  }
  if (operation.type === 'designOption.remove') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    const designOptions = slide.designOptions ?? []
    const optionIndex = designOptions.findIndex((option) => option.id === operation.payload.designOptionId)
    if (optionIndex < 0) throw new Error('Design Option does not exist')
    designOptions.splice(optionIndex, 1)
    if (operation.payload.activeDesignOptionId === null) {
      delete slide.activeDesignOptionId
    } else {
      if (!designOptions.some((option) => option.id === operation.payload.activeDesignOptionId)) {
        throw new Error('Restored active Design Option does not exist')
      }
      slide.activeDesignOptionId = operation.payload.activeDesignOptionId
    }
    return next
  }
  if (operation.type === 'designOption.activate.set') {
    const slide = findSlide(next, operation.payload.slideId)
    if (!slide) throw new Error('Slide does not exist')
    if (operation.payload.designOptionId === null) {
      delete slide.activeDesignOptionId
      return next
    }
    if (!slide.designOptions?.some((option) => option.id === operation.payload.designOptionId)) {
      throw new Error('Design Option does not exist')
    }
    slide.activeDesignOptionId = operation.payload.designOptionId
    return next
  }
  if (operation.type === 'element.frame.set') {
    const element = findElement(
      next,
      operation.payload.slideId,
      operation.payload.designOptionId,
      operation.payload.elementId,
    )
    if (!element) throw new Error('Element does not exist in Design Option')
    element.frame = clone(operation.payload.frame)
    return next
  }
  if (operation.type === 'element.crop.set') {
    const element = findElement(
      next,
      operation.payload.slideId,
      operation.payload.designOptionId,
      operation.payload.elementId,
    )
    if (!element) throw new Error('Element does not exist in Design Option')
    if (element.kind !== 'image') throw new Error('Only an Image Element can be cropped')
    if (operation.payload.crop === null) {
      delete element.crop
    } else {
      element.crop = clone(operation.payload.crop)
    }
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
  if (name === 'asset.catalog') {
    return {
      assets: clone(checkpoint.deck.assetReferences ?? []),
    }
  }
  if (name === 'pattern.catalog') {
    return {
      patterns: AUTHORED_PATTERNS.map((pattern) => ({
        id: pattern.id,
        version: pattern.version,
        name: pattern.name,
      })),
    }
  }
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
    const requestedDesignOptionId = typeof params.designOptionId === 'string' ? params.designOptionId : undefined
    for (const section of checkpoint.deck.sections) {
      for (const slide of section.slides) {
        if (requestedSlideId && slide.id !== requestedSlideId) continue
        const headline = slide.contentBlocks.find((block) => block.role === 'headline')
        if (!headline) return failure('InvalidCommand', 'Slide has no headline Content Block')
        const selectedDesignOptionId = requestedDesignOptionId ?? slide.activeDesignOptionId
        const designOption = selectedDesignOptionId
          ? slide.designOptions?.find((candidate) => candidate.id === selectedDesignOptionId)
          : slide.designOptions?.[0]
        if (selectedDesignOptionId && !designOption) {
          return failure('InvalidCommand', 'Design Option does not exist')
        }
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
          mediaAssignments: (slide.mediaAssignments ?? []).map((assignment) => {
            const assetReference = checkpoint.deck.assetReferences?.find(
              (asset) => asset.id === assignment.assetReferenceId,
            )
            return {
              id: assignment.id,
              role: assignment.role,
              assetReference: assetReference ? clone(assetReference) : null,
            }
          }),
          canvas: clone(checkpoint.deck.canvasPreset),
          designOption: designOption
            ? {
                id: designOption.id,
                name: designOption.name,
                pattern: designOption.patternSnapshot
                  ? {
                      id: designOption.patternSnapshot.id,
                      version: designOption.patternSnapshot.version,
                      name: designOption.patternSnapshot.name,
                    }
                  : null,
              }
            : null,
          composition: designOption ? clone(designOption.composition) : null,
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
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return failure('InvalidCommand', 'Command must be an object')
  }
  try {
    assertCommandEnvelope(command)
  } catch (error) {
    return failure('InvalidCommand', (error as Error).message)
  }
  const duplicate = session.checkpoint.processedCommands[command.commandId]
  if (duplicate) return { ok: true, duplicate: true, acknowledgement: clone(duplicate) }
  if (command.expectedRevision !== session.checkpoint.revision) {
    return failure(
      'StaleRevision',
      `Expected revision ${session.checkpoint.revision}; received ${String(command.expectedRevision)}`,
    )
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
    } else if (command.type === 'asset.reference.add') {
      const assetReferenceId = assertString(command.payload.assetReferenceId, 'assetReferenceId')
      if (assetReferenceIdentityExists(session.checkpoint.deck, assetReferenceId)) {
        throw new Error('Asset Reference identity already exists')
      }
      const labelValue = assertString(command.payload.label, 'label')
      const mediaKind = assertMediaKind(command.payload.mediaKind)
      const assetReference: AssetReference = {
        id: assetReferenceId,
        label: labelValue,
        mediaKind,
        availability: 'unknown',
      }
      forward = { type: 'asset.reference.insert', payload: { assetReference } }
      inverse = { type: 'asset.reference.remove', payload: { assetReferenceId } }
      label = `Add Asset Reference: ${labelValue}`
      projectionHints = ['slide.activeProjection', 'history']
    } else if (command.type === 'asset.assign') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const mediaAssignmentId = assertString(command.payload.mediaAssignmentId, 'mediaAssignmentId')
      const role = assertString(command.payload.role, 'role')
      const assetReferenceId = assertString(command.payload.assetReferenceId, 'assetReferenceId')
      if (!assetReferenceIdentityExists(session.checkpoint.deck, assetReferenceId)) {
        throw new Error('Asset Reference does not exist')
      }
      const existingForRole = slide.mediaAssignments?.find((assignment) => assignment.role === role)
      if (existingForRole) {
        if (existingForRole.id !== mediaAssignmentId) {
          throw new Error('Media role replacement must preserve assignment identity')
        }
        if (existingForRole.assetReferenceId === assetReferenceId) {
          throw new Error('Asset Reference is already assigned to media role')
        }
        forward = {
          type: 'asset.assignment.asset.set',
          payload: { slideId, mediaAssignmentId, assetReferenceId },
        }
        inverse = {
          type: 'asset.assignment.asset.set',
          payload: { slideId, mediaAssignmentId, assetReferenceId: existingForRole.assetReferenceId },
        }
        label = `Replace Asset: ${role}`
      } else {
        if (mediaAssignmentIdentityExists(session.checkpoint.deck, mediaAssignmentId)) {
          throw new Error('Media Assignment identity already exists')
        }
        const assignment: MediaAssignment = { id: mediaAssignmentId, role, assetReferenceId }
        forward = { type: 'asset.assignment.insert', payload: { slideId, assignment } }
        inverse = { type: 'asset.assignment.remove', payload: { slideId, mediaAssignmentId } }
        label = `Assign Asset: ${role}`
      }
      projectionHints = ['slide.activeProjection', 'history']
    } else if (command.type === 'designOption.applyPattern') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const designOptionId = assertString(command.payload.designOptionId, 'designOptionId')
      if (designOptionIdentityExists(session.checkpoint.deck, designOptionId)) {
        throw new Error('Design Option identity already exists')
      }
      const patternId = assertString(command.payload.patternId, 'patternId')
      if (!Number.isSafeInteger(command.payload.patternVersion)) {
        throw new Error('patternVersion must be an integer')
      }
      const pattern = authoredPattern(patternId, command.payload.patternVersion as number)
      if (!pattern) throw new Error('Authored Layout Pattern version does not exist')
      const name = command.payload.name === undefined
        ? pattern.name
        : assertString(command.payload.name, 'name')
      const contentBindings = assertContentBindings(command.payload.contentBindings, pattern)
      const previousActiveDesignOptionId = slide.activeDesignOptionId ?? null
      if (
        previousActiveDesignOptionId !== null
        && !slide.designOptions?.some((option) => option.id === previousActiveDesignOptionId)
      ) {
        throw new Error('Active Design Option does not exist')
      }
      const designOption = instantiatePattern(slide, designOptionId, name, pattern, contentBindings)
      const afterDesignOptionId = slide.designOptions?.at(-1)?.id ?? null
      forward = {
        type: 'designOption.insert',
        payload: { slideId, designOption, afterDesignOptionId, activeDesignOptionId: designOptionId },
      }
      inverse = {
        type: 'designOption.remove',
        payload: { slideId, designOptionId, activeDesignOptionId: previousActiveDesignOptionId },
      }
      label = `Apply Pattern: ${pattern.name}`
      projectionHints = ['slide.activeProjection', 'history']
    } else if (command.type === 'designOption.activate') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const designOptionId = assertString(command.payload.designOptionId, 'designOptionId')
      if (!slide.designOptions?.some((option) => option.id === designOptionId)) {
        throw new Error('Design Option does not exist')
      }
      const previousActiveDesignOptionId = slide.activeDesignOptionId ?? null
      if (previousActiveDesignOptionId === designOptionId) {
        throw new Error('Design Option is already active')
      }
      forward = {
        type: 'designOption.activate.set',
        payload: { slideId, designOptionId },
      }
      inverse = {
        type: 'designOption.activate.set',
        payload: { slideId, designOptionId: previousActiveDesignOptionId },
      }
      label = `Activate Design Option: ${designOptionId}`
      projectionHints = ['slide.activeProjection', 'history']
    } else if (command.type === 'element.frame.update') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const designOptionId = assertString(command.payload.designOptionId, 'designOptionId')
      const elementId = assertString(command.payload.elementId, 'elementId')
      const frame = assertElementFrame(command.payload.frame)
      const currentElement = findElement(session.checkpoint.deck, slideId, designOptionId, elementId)
      if (!currentElement) throw new Error('Element does not exist in Design Option')
      forward = {
        type: 'element.frame.set',
        payload: { slideId, designOptionId, elementId, frame },
      }
      inverse = {
        type: 'element.frame.set',
        payload: { slideId, designOptionId, elementId, frame: clone(currentElement.frame) },
      }
      label = 'Update Element frame'
      projectionHints = ['slide.activeProjection', 'history']
    } else if (command.type === 'element.crop.update') {
      const slideId = assertString(command.payload.slideId, 'slideId')
      const designOptionId = assertString(command.payload.designOptionId, 'designOptionId')
      const elementId = assertString(command.payload.elementId, 'elementId')
      const crop = assertNormalizedCrop(command.payload.crop)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const element = findElement(session.checkpoint.deck, slideId, designOptionId, elementId)
      if (!element) throw new Error('Element does not exist in Design Option')
      if (element.kind !== 'image') throw new Error('Only an Image Element can be cropped')
      if (!element.mediaRole) throw new Error('Image Element is not bound to a media role')
      if (!slide.mediaAssignments?.some((assignment) => assignment.role === element.mediaRole)) {
        throw new Error('Image Element media role has no Asset assignment')
      }
      forward = {
        type: 'element.crop.set',
        payload: { slideId, designOptionId, elementId, crop },
      }
      inverse = {
        type: 'element.crop.set',
        payload: { slideId, designOptionId, elementId, crop: clone(element.crop ?? null) },
      }
      label = 'Update Image crop'
      projectionHints = ['slide.activeProjection', 'history']
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
