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

type ProjectAssetJudgment = {
  rating: 0 | 1 | 2 | 3 | 4 | 5
  review: 'unreviewed' | 'keep' | 'maybe' | 'reject'
  projectPick: boolean
}

type FindMoreMedia = {
  state: 'not-needed' | 'needed' | 'resolved' | 'waived'
  brief: string
  existingPrimaryStatus: 'none' | 'temporary' | 'usable' | 'approved'
}

type CurateSlot = {
  key: string
  assignmentRole: string
  kind: 'primary' | 'supporting-item'
  ordinal: number
  supportingItemId?: string
}

type SlideAssetDisposition =
  | { state: 'considered' }
  | { state: 'shortlisted' }
  | { state: 'alternate' }
  | { state: 'rejected-for-slide' }
  | {
      state: 'unplaced'
      assignmentId: string
      previousSlotKey: string
      previousAssignmentRole: string
      reason: 'visual-style-change' | 'supporting-item-removed' | 'slot-contract-change'
    }

type SlideCurateState = {
  slotManifest: CurateSlot[]
  decisions: Record<string, SlideAssetDisposition>
  findMoreMedia: FindMoreMedia
}

type CurateEnvelopeV1 = {
  format: 'pitchdog.workbench-curate'
  version: 1
  projectJudgments: Record<string, ProjectAssetJudgment>
  slides: Record<string, SlideCurateState>
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
  workbenchCurate?: CurateEnvelopeV1
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

type CurateProjectJudgmentSetPayload = {
  assetReferenceId: string
  value: ProjectAssetJudgment | null
}

type CurateSlideDecisionSetPayload = {
  slideId: string
  assetReferenceId: string
  value: SlideAssetDisposition | null
}

type CurateFindMoreSetPayload = {
  slideId: string
  value: FindMoreMedia
}

type CurateSlotManifestSetPayload = {
  slideId: string
  value: CurateSlot[]
}

type CommandEnvelope = {
  commandId: string
  expectedRevision: number
  type: 'deck.rename' | 'content.add' | 'content.update' | 'content.remove' | 'section.add' | 'section.rename' | 'section.move' | 'section.remove' | 'slide.add' | 'slide.move' | 'slide.intent.set' | 'slide.remove' | 'asset.reference.add' | 'asset.assign' | 'curate.projectJudgment.set' | 'curate.slideDecision.set' | 'curate.findMore.set' | 'curate.reconcile' | 'designOption.applyPattern' | 'designOption.activate' | 'element.frame.update' | 'element.crop.update'
  payload: JsonObject
  source: {
    kind: 'ui' | 'keyboard' | 'cli' | 'mcp' | 'migration'
    label?: string
  }
  issuedAt: string
}

type HistoryOperation =
  | { type: 'compound'; payload: { operations: HistoryOperation[] } }
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
  | { type: 'curate.envelope.insert'; payload: { value: CurateEnvelopeV1 } }
  | { type: 'curate.envelope.remove'; payload: Record<string, never> }
  | { type: 'curate.slide.insert'; payload: { slideId: string; value: SlideCurateState } }
  | { type: 'curate.slide.remove'; payload: { slideId: string } }
  | { type: 'curate.projectJudgment.set'; payload: CurateProjectJudgmentSetPayload }
  | { type: 'curate.slideDecision.set'; payload: CurateSlideDecisionSetPayload }
  | { type: 'curate.findMore.set'; payload: CurateFindMoreSetPayload }
  | { type: 'curate.slotManifest.set'; payload: CurateSlotManifestSetPayload }
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

const UNSAFE_IDENTITY_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  '__proto__',
  'prototype',
])

function assertIdentity(value: unknown, field: string, maxLength = 4096): string {
  const identity = assertString(value, field, maxLength)
  if (UNSAFE_IDENTITY_KEYS.has(identity)) {
    throw new Error(`${field} uses a reserved identity`)
  }
  return identity
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function ownValue<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && hasOwn(record, key) ? record[key] : undefined
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
  assertIdentity(command.commandId, 'commandId', 256)
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

function assertAssetAvailability(value: unknown): AssetReference['availability'] {
  if (value !== 'unknown' && value !== 'available' && value !== 'missing') {
    throw new Error('availability must be unknown, available, or missing')
  }
  return value
}

function assertAssetReferenceSnapshot(value: unknown, expectedId?: string): AssetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('assetReference must be an object')
  }
  const candidate = value as JsonObject
  const id = assertIdentity(candidate.id, 'assetReference.id', 256)
  if (expectedId !== undefined && id !== expectedId) {
    throw new Error('assetReference.id must match assetReferenceId')
  }
  return {
    id,
    label: assertString(candidate.label, 'assetReference.label'),
    mediaKind: assertMediaKind(candidate.mediaKind),
    availability: assertAssetAvailability(candidate.availability ?? 'unknown'),
  }
}

function assertProjectAssetJudgment(value: unknown): ProjectAssetJudgment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('judgment must be an object')
  }
  const candidate = value as JsonObject
  if (!Number.isInteger(candidate.rating) || (candidate.rating as number) < 0 || (candidate.rating as number) > 5) {
    throw new Error('judgment.rating must be an integer from 0 to 5')
  }
  if (!['unreviewed', 'keep', 'maybe', 'reject'].includes(candidate.review as string)) {
    throw new Error('judgment.review is unsupported')
  }
  if (typeof candidate.projectPick !== 'boolean') throw new Error('judgment.projectPick must be a boolean')
  return {
    rating: candidate.rating as ProjectAssetJudgment['rating'],
    review: candidate.review as ProjectAssetJudgment['review'],
    projectPick: candidate.projectPick,
  }
}

function assertFindMoreMedia(value: unknown): FindMoreMedia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Find More Media value must be an object')
  }
  const candidate = value as JsonObject
  if (!['not-needed', 'needed', 'resolved', 'waived'].includes(candidate.state as string)) {
    throw new Error('Find More Media state is unsupported')
  }
  if (!['none', 'temporary', 'usable', 'approved'].includes(candidate.existingPrimaryStatus as string)) {
    throw new Error('Find More Media existingPrimaryStatus is unsupported')
  }
  const brief = typeof candidate.brief === 'string' ? candidate.brief : (() => { throw new Error('Find More Media brief must be a string') })()
  if (brief.length > 32768) throw new Error('Find More Media brief must be at most 32768 characters')
  return {
    state: candidate.state as FindMoreMedia['state'],
    brief,
    existingPrimaryStatus: candidate.existingPrimaryStatus as FindMoreMedia['existingPrimaryStatus'],
  }
}

function assertCurateSlot(value: unknown): CurateSlot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Curate slot must be an object')
  const candidate = value as JsonObject
  const kind = candidate.kind
  if (kind !== 'primary' && kind !== 'supporting-item') throw new Error('Curate slot kind is unsupported')
  if (!Number.isSafeInteger(candidate.ordinal) || (candidate.ordinal as number) < 0) {
    throw new Error('Curate slot ordinal must be a non-negative integer')
  }
  const slot: CurateSlot = {
    key: assertIdentity(candidate.key, 'Curate slot key', 512),
    assignmentRole: assertIdentity(candidate.assignmentRole, 'Curate slot assignmentRole', 512),
    kind,
    ordinal: candidate.ordinal as number,
  }
  if (kind === 'supporting-item') {
    slot.supportingItemId = assertIdentity(candidate.supportingItemId, 'Curate slot supportingItemId', 256)
  } else if (candidate.supportingItemId !== undefined) {
    throw new Error('Primary Curate slot cannot carry a Supporting Item identity')
  }
  return slot
}

function assertCurateSlotManifest(value: unknown): CurateSlot[] {
  if (!Array.isArray(value)) throw new Error('Curate slot manifest must be an array')
  if (value.length > 100) throw new Error('Curate slot manifest must contain at most 100 slots')
  const slots = value.map(assertCurateSlot)
  const keys = new Set<string>()
  const roles = new Set<string>()
  for (const [index, slot] of slots.entries()) {
    if (keys.has(slot.key)) throw new Error(`Duplicate Curate slot key: ${slot.key}`)
    if (roles.has(slot.assignmentRole)) throw new Error(`Duplicate Curate assignment role: ${slot.assignmentRole}`)
    if (slot.ordinal !== index) throw new Error('Curate slot ordinals must match manifest order')
    if (slot.kind === 'primary') {
      const expectedKey = `primary:${index + 1}`
      const expectedRole = index === 0 ? 'primary' : expectedKey
      if (slot.key !== expectedKey || slot.assignmentRole !== expectedRole) {
        throw new Error('Primary Curate slot identity does not match its ordinal')
      }
    } else {
      const expectedIdentity = `item:${slot.supportingItemId}:media`
      if (slot.key !== expectedIdentity || slot.assignmentRole !== expectedIdentity) {
        throw new Error('Supporting Item Curate slot identity does not match its stable item identity')
      }
    }
    keys.add(slot.key)
    roles.add(slot.assignmentRole)
  }
  return slots
}

function assertSlideAssetDisposition(value: unknown, allowUnplaced = true): SlideAssetDisposition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Slide Asset decision must be an object')
  }
  const candidate = value as JsonObject
  if (['considered', 'shortlisted', 'alternate', 'rejected-for-slide'].includes(candidate.state as string)) {
    return { state: candidate.state as 'considered' | 'shortlisted' | 'alternate' | 'rejected-for-slide' }
  }
  if (candidate.state !== 'unplaced' || !allowUnplaced) throw new Error('Slide Asset decision state is unsupported')
  if (!['visual-style-change', 'supporting-item-removed', 'slot-contract-change'].includes(candidate.reason as string)) {
    throw new Error('Unplaced Asset reason is unsupported')
  }
  return {
    state: 'unplaced',
    assignmentId: assertIdentity(candidate.assignmentId, 'Unplaced Asset assignmentId', 256),
    previousSlotKey: assertIdentity(candidate.previousSlotKey, 'Unplaced Asset previousSlotKey', 512),
    previousAssignmentRole: assertIdentity(candidate.previousAssignmentRole, 'Unplaced Asset previousAssignmentRole', 512),
    reason: candidate.reason as 'visual-style-change' | 'supporting-item-removed' | 'slot-contract-change',
  }
}

function defaultFindMoreMedia(): FindMoreMedia {
  return { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' }
}

function emptyCurateEnvelope(): CurateEnvelopeV1 {
  return {
    format: 'pitchdog.workbench-curate',
    version: 1,
    projectJudgments: {},
    slides: {},
  }
}

function normalizedVisualStyle(intent: string): string {
  if (['undecided', 'text-only', 'full-bleed', 'full-bleed-overlay', 'image-text', 'diptych', 'triptych', 'gallery', 'custom'].includes(intent)) {
    return intent
  }
  if (intent === 'cover' || intent === 'statement' || intent === 'full-bleed-statement') return 'full-bleed-overlay'
  if (intent === 'editorial-body') return 'image-text'
  return 'undecided'
}

type PlanSlotBasis = {
  contentPattern: string
  mediaSlotCount: number
  supportingItems: { id: string; title: string }[]
}

const WORKBENCH_CONTENT_PATTERNS = new Set([
  'simple-copy',
  'quote',
  'repeater',
  'comparison',
  'gallery-captions',
  'no-on-slide-text',
  'custom',
])

function planSlotBasis(slide: Slide): PlanSlotBasis {
  const fallback: PlanSlotBasis = { contentPattern: 'simple-copy', mediaSlotCount: 0, supportingItems: [] }
  const matchingBlocks = slide.contentBlocks.filter(
    (candidate) => candidate.role === 'workbench-plan' || candidate.semanticKey === 'workbench.plan.v1',
  )
  if (matchingBlocks.length > 1) {
    throw new Error('Slide must contain at most one Workbench Plan metadata block')
  }
  const block = matchingBlocks[0]
  if (!block) return fallback
  let parsed: JsonObject
  try {
    const value = JSON.parse(richTextToPlainText(block.value)) as unknown
    parsed = assertRecord(value, 'Workbench Plan metadata')
  } catch (error) {
    throw new Error(`Workbench Plan metadata must be valid JSON: ${(error as Error).message}`)
  }
  if (parsed.format !== 'pitchdog.workbench-plan' || parsed.version !== 1) {
    throw new Error('Workbench Plan metadata must use pitchdog.workbench-plan version 1')
  }
  const contentPattern = assertString(parsed.contentPattern, 'Workbench Plan contentPattern', 128)
  if (!WORKBENCH_CONTENT_PATTERNS.has(contentPattern)) {
    throw new Error('Workbench Plan contentPattern is unsupported')
  }
  if (
    !Number.isSafeInteger(parsed.mediaSlotCount)
    || (parsed.mediaSlotCount as number) < 0
    || (parsed.mediaSlotCount as number) > 100
  ) throw new Error('Workbench Plan mediaSlotCount must be an integer from 0 to 100')
  if (!Array.isArray(parsed.supportingItems)) {
    throw new Error('Workbench Plan supportingItems must be an array')
  }
  if (parsed.supportingItems.length > 100) {
    throw new Error('Workbench Plan supportingItems must contain at most 100 items')
  }
  const supportingItemIds = new Set<string>()
  const supportingItems = parsed.supportingItems.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Supporting Item ${index + 1} must be an object`)
    }
    const candidate = item as JsonObject
    const id = assertIdentity(candidate.id, `Supporting Item ${index + 1} id`, 256)
    if (supportingItemIds.has(id)) throw new Error(`Duplicate Supporting Item identity: ${id}`)
    supportingItemIds.add(id)
    return {
      id,
      title: typeof candidate.title === 'string' ? candidate.title : '',
    }
  })
  return { contentPattern, mediaSlotCount: parsed.mediaSlotCount as number, supportingItems }
}

function deriveCurateSlotManifest(slide: Slide): CurateSlot[] {
  const plan = planSlotBasis(slide)
  if (plan.contentPattern === 'repeater' && plan.supportingItems.length > 0) {
    return assertCurateSlotManifest(plan.supportingItems.map((item, ordinal) => ({
      key: `item:${item.id}:media`,
      assignmentRole: `item:${item.id}:media`,
      kind: 'supporting-item',
      ordinal,
      supportingItemId: item.id,
    })))
  }
  const visualStyle = normalizedVisualStyle(slide.intent)
  const count = visualStyle === 'text-only' || visualStyle === 'undecided'
    ? 0
    : ['full-bleed', 'full-bleed-overlay', 'image-text'].includes(visualStyle)
      ? 1
      : visualStyle === 'diptych'
        ? 2
        : visualStyle === 'triptych'
          ? 3
          : (visualStyle === 'gallery' || visualStyle === 'custom')
            ? plan.mediaSlotCount
            : 0
  return Array.from({ length: count }, (_, ordinal): CurateSlot => ({
    key: `primary:${ordinal + 1}`,
    assignmentRole: ordinal === 0 ? 'primary' : `primary:${ordinal + 1}`,
    kind: 'primary',
    ordinal,
  }))
}

function manifestsEqual(left: CurateSlot[], right: CurateSlot[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isDefaultProjectJudgment(value: ProjectAssetJudgment): boolean {
  return value.rating === 0 && value.review === 'unreviewed' && value.projectPick === false
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

function unplacedAssignmentIdentityExists(
  deck: DeckSnapshot,
  mediaAssignmentId: string,
  except?: { slideId: string; assetReferenceId: string },
): boolean {
  return Object.entries(deck.workbenchCurate?.slides ?? {}).some(([slideId, state]) =>
    Object.entries(state.decisions).some(([assetReferenceId, decision]) =>
      decision.state === 'unplaced'
      && decision.assignmentId === mediaAssignmentId
      && (slideId !== except?.slideId || assetReferenceId !== except.assetReferenceId),
    ),
  )
}

function findMediaAssignment(slide: Slide, mediaAssignmentId: string): MediaAssignment | undefined {
  return slide.mediaAssignments?.find((assignment) => assignment.id === mediaAssignmentId)
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`)
  return value as Record<string, unknown>
}

function assertDeckMediaIntegrity(deck: DeckSnapshot): void {
  assertIdentity(deck.deckId, 'deck.deckId', 256)
  assertString(deck.title, 'deck.title')
  if (!Array.isArray(deck.sections)) throw new Error('Deck sections must be an array')
  if (deck.assetReferences !== undefined && !Array.isArray(deck.assetReferences)) {
    throw new Error('Deck Asset References must be an array')
  }

  const assetIds = new Set<string>()
  for (const rawAsset of deck.assetReferences ?? []) {
    const asset = assertAssetReferenceSnapshot(rawAsset)
    if (assetIds.has(asset.id)) throw new Error(`Duplicate Asset Reference identity: ${asset.id}`)
    assetIds.add(asset.id)
  }

  const sectionIds = new Set<string>()
  const slideIds = new Set<string>()
  const blockIds = new Set<string>()
  const assignmentIds = new Set<string>()
  const designOptionIds = new Set<string>()
  const elementIds = new Set<string>()
  for (const [sectionIndex, rawSection] of deck.sections.entries()) {
    const section = assertRecord(rawSection, `Deck Section ${sectionIndex + 1}`) as unknown as Section
    const sectionId = assertIdentity(section.id, `Deck Section ${sectionIndex + 1} identity`, 256)
    if (sectionIds.has(sectionId)) throw new Error(`Duplicate Section identity: ${sectionId}`)
    sectionIds.add(sectionId)
    assertString(section.title, `Deck Section ${sectionIndex + 1} title`)
    if (!Array.isArray(section.slides)) throw new Error(`Deck Section ${sectionId} Slides must be an array`)

    for (const [slideIndex, rawSlide] of section.slides.entries()) {
      const slide = assertRecord(rawSlide, `Slide ${slideIndex + 1} in Section ${sectionId}`) as unknown as Slide
      const slideId = assertIdentity(slide.id, `Slide ${slideIndex + 1} identity`, 256)
      if (slideIds.has(slideId)) throw new Error(`Duplicate Slide identity: ${slideId}`)
      slideIds.add(slideId)
      assertString(slide.intent, `Slide ${slideId} intent`)
      if (!Array.isArray(slide.contentBlocks)) throw new Error(`Slide ${slideId} Content Blocks must be an array`)
      for (const [blockIndex, rawBlock] of slide.contentBlocks.entries()) {
        const block = assertRecord(rawBlock, `Content Block ${blockIndex + 1} on Slide ${slideId}`) as unknown as ContentBlock
        const blockId = assertIdentity(block.id, `Content Block ${blockIndex + 1} identity`, 256)
        if (blockIds.has(blockId)) throw new Error(`Duplicate Content Block identity: ${blockId}`)
        blockIds.add(blockId)
        assertString(block.semanticKey, `Content Block ${blockId} semanticKey`)
        assertString(block.role, `Content Block ${blockId} role`)
        if (!isRichTextDocument(block.value)) throw new Error(`Content Block ${blockId} must contain semantic rich-text JSON`)
      }

      if (slide.mediaAssignments !== undefined && !Array.isArray(slide.mediaAssignments)) {
        throw new Error(`Slide ${slideId} Media Assignments must be an array`)
      }
      const roles = new Set<string>()
      for (const [assignmentIndex, rawAssignment] of (slide.mediaAssignments ?? []).entries()) {
        const assignment = assertRecord(
          rawAssignment,
          `Media Assignment ${assignmentIndex + 1} on Slide ${slideId}`,
        ) as unknown as MediaAssignment
        const assignmentId = assertIdentity(
          assignment.id,
          `Media Assignment ${assignmentIndex + 1} identity`,
          256,
        )
        if (assignmentIds.has(assignmentId)) throw new Error(`Duplicate Media Assignment identity: ${assignmentId}`)
        assignmentIds.add(assignmentId)
        const role = assertString(assignment.role, `Media Assignment ${assignmentId} role`, 512)
        if (roles.has(role)) throw new Error(`Duplicate Media Assignment role on Slide ${slideId}: ${role}`)
        roles.add(role)
        const assetReferenceId = assertIdentity(
          assignment.assetReferenceId,
          `Media Assignment ${assignmentId} Asset Reference identity`,
          256,
        )
        if (!assetIds.has(assetReferenceId)) {
          throw new Error(`Media Assignment ${assignmentId} Asset Reference does not exist`)
        }
      }

      const currentManifest = deriveCurateSlotManifest(slide)
      const rawStoredState = deck.workbenchCurate && hasOwn(deck.workbenchCurate.slides, slideId)
        ? deck.workbenchCurate.slides[slideId]
        : undefined
      const storedManifest = rawStoredState && typeof rawStoredState === 'object'
        ? assertCurateSlotManifest((rawStoredState as SlideCurateState).slotManifest)
        : []
      const curateRoles = new Set([
        ...currentManifest.map((slot) => slot.assignmentRole),
        ...storedManifest.map((slot) => slot.assignmentRole),
      ])
      const selectedAssetIds = new Set<string>()
      for (const assignment of slide.mediaAssignments ?? []) {
        if (!curateRoles.has(assignment.role)) continue
        if (selectedAssetIds.has(assignment.assetReferenceId)) {
          throw new Error('One Asset cannot occupy multiple Curate slots on one Slide')
        }
        selectedAssetIds.add(assignment.assetReferenceId)
      }

      if (slide.designOptions !== undefined && !Array.isArray(slide.designOptions)) {
        throw new Error(`Slide ${slideId} Design Options must be an array`)
      }
      const slideDesignOptionIds = new Set<string>()
      for (const [optionIndex, rawOption] of (slide.designOptions ?? []).entries()) {
        const option = assertRecord(rawOption, `Design Option ${optionIndex + 1} on Slide ${slideId}`) as unknown as DesignOption
        const optionId = assertIdentity(option.id, `Design Option ${optionIndex + 1} identity`, 256)
        if (designOptionIds.has(optionId)) throw new Error(`Duplicate Design Option identity: ${optionId}`)
        designOptionIds.add(optionId)
        slideDesignOptionIds.add(optionId)
        assertString(option.name, `Design Option ${optionId} name`)
        const composition = assertRecord(option.composition, `Design Option ${optionId} composition`) as unknown as Composition
        assertIdentity(composition.id, `Design Option ${optionId} composition identity`, 512)
        if (!Array.isArray(composition.elements)) throw new Error(`Design Option ${optionId} Elements must be an array`)
        for (const rawElement of composition.elements) {
          const element = assertRecord(rawElement, `Element in Design Option ${optionId}`) as unknown as CompositionElement
          const elementId = assertIdentity(element.id, `Element identity in Design Option ${optionId}`, 512)
          if (elementIds.has(elementId)) throw new Error(`Duplicate Element identity: ${elementId}`)
          elementIds.add(elementId)
        }
      }
      if (
        slide.activeDesignOptionId !== undefined
        && !slideDesignOptionIds.has(assertIdentity(slide.activeDesignOptionId, `Slide ${slideId} active Design Option identity`, 256))
      ) throw new Error('Active Design Option does not exist')
    }
  }
}

function assertWorkbenchCurateEnvelope(deck: DeckSnapshot): void {
  const envelope = deck.workbenchCurate
  if (envelope === undefined) return
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('workbenchCurate must be an object')
  }
  if (envelope.format !== 'pitchdog.workbench-curate' || envelope.version !== 1) {
    throw new Error('Only Workbench Curate envelope version 1 is supported')
  }
  const projectJudgments = assertRecord(envelope.projectJudgments, 'workbenchCurate.projectJudgments')
  const slideStates = assertRecord(envelope.slides, 'workbenchCurate.slides')
  const assetIds = new Set((deck.assetReferences ?? []).map((asset) => asset.id))
  const slideIds = new Set(deck.sections.flatMap((section) => section.slides.map((slide) => slide.id)))
  const activeAssignmentIds = new Set(
    deck.sections.flatMap((section) => section.slides.flatMap((slide) => (slide.mediaAssignments ?? []).map((item) => item.id))),
  )
  const unplacedAssignmentIds = new Set<string>()

  for (const [assetReferenceId, judgment] of Object.entries(projectJudgments)) {
    assertIdentity(assetReferenceId, 'Project judgment Asset Reference identity', 256)
    if (!assetIds.has(assetReferenceId)) throw new Error('Project judgment Asset Reference does not exist')
    assertProjectAssetJudgment(judgment)
  }
  for (const [slideId, rawState] of Object.entries(slideStates)) {
    assertIdentity(slideId, 'Curate Slide identity', 256)
    if (!slideIds.has(slideId)) throw new Error('Curate Slide does not exist')
    const state = assertRecord(rawState, `Curate state for ${slideId}`)
    const manifest = assertCurateSlotManifest(state.slotManifest)
    const decisions = assertRecord(state.decisions, `Curate decisions for ${slideId}`)
    assertFindMoreMedia(state.findMoreMedia)
    const slide = findSlide(deck, slideId) as Slide
    const curateRoles = new Set([
      ...manifest.map((slot) => slot.assignmentRole),
      ...deriveCurateSlotManifest(slide).map((slot) => slot.assignmentRole),
    ])
    const selectedAssetIds = new Set(
      (slide.mediaAssignments ?? [])
        .filter((assignment) => curateRoles.has(assignment.role))
        .map((assignment) => assignment.assetReferenceId),
    )
    for (const [assetReferenceId, decision] of Object.entries(decisions)) {
      assertIdentity(assetReferenceId, 'Slide decision Asset Reference identity', 256)
      if (!assetIds.has(assetReferenceId)) throw new Error('Slide decision Asset Reference does not exist')
      if (selectedAssetIds.has(assetReferenceId)) throw new Error('Selected Asset cannot also have a non-selected Slide decision')
      const normalized = assertSlideAssetDisposition(decision)
      if (normalized.state === 'unplaced') {
        if (activeAssignmentIds.has(normalized.assignmentId) || unplacedAssignmentIds.has(normalized.assignmentId)) {
          throw new Error('Unplaced Media Assignment identity must remain unique')
        }
        unplacedAssignmentIds.add(normalized.assignmentId)
      }
    }
  }
}

function assertDeckIntegrity(deck: DeckSnapshot): void {
  assertDeckMediaIntegrity(deck)
  assertWorkbenchCurateEnvelope(deck)
}

function operationList(operations: HistoryOperation[]): HistoryOperation {
  if (operations.length === 0) throw new Error('History operation list cannot be empty')
  return operations.length === 1 ? operations[0] : { type: 'compound', payload: { operations } }
}

function appendOperationPair(
  forwardOperations: HistoryOperation[],
  inverseOperations: HistoryOperation[],
  forwardOperation: HistoryOperation,
  inverseOperation: HistoryOperation,
): void {
  forwardOperations.push(forwardOperation)
  inverseOperations.unshift(inverseOperation)
}

function appendCurateEnvelopeScaffold(
  deck: DeckSnapshot,
  forwardOperations: HistoryOperation[],
  inverseOperations: HistoryOperation[],
): void {
  if (deck.workbenchCurate) return
  appendOperationPair(
    forwardOperations,
    inverseOperations,
    { type: 'curate.envelope.insert', payload: { value: emptyCurateEnvelope() } },
    { type: 'curate.envelope.remove', payload: {} },
  )
}

function appendCurateSlideScaffold(
  deck: DeckSnapshot,
  slideId: string,
  slotManifest: CurateSlot[],
  forwardOperations: HistoryOperation[],
  inverseOperations: HistoryOperation[],
): void {
  appendCurateEnvelopeScaffold(deck, forwardOperations, inverseOperations)
  if (deck.workbenchCurate && hasOwn(deck.workbenchCurate.slides, slideId)) return
  appendOperationPair(
    forwardOperations,
    inverseOperations,
    {
      type: 'curate.slide.insert',
      payload: {
        slideId,
        value: { slotManifest: clone(slotManifest), decisions: {}, findMoreMedia: defaultFindMoreMedia() },
      },
    },
    { type: 'curate.slide.remove', payload: { slideId } },
  )
}

function appendAssetReferenceScaffold(
  deck: DeckSnapshot,
  payload: JsonObject,
  forwardOperations: HistoryOperation[],
  inverseOperations: HistoryOperation[],
): string {
  const assetReferenceId = assertIdentity(payload.assetReferenceId, 'assetReferenceId', 256)
  const existing = deck.assetReferences?.find((asset) => asset.id === assetReferenceId)
  if (existing) {
    if (payload.assetReference !== undefined) {
      const supplied = assertAssetReferenceSnapshot(payload.assetReference, assetReferenceId)
      if (supplied.mediaKind !== existing.mediaKind) throw new Error('Asset Reference media kind cannot change')
    }
    return assetReferenceId
  }
  if (payload.assetReference === undefined) {
    throw new Error('Unknown Asset Reference requires a neutral assetReference snapshot')
  }
  const assetReference = assertAssetReferenceSnapshot(payload.assetReference, assetReferenceId)
  assetReference.availability = 'unknown'
  appendOperationPair(
    forwardOperations,
    inverseOperations,
    { type: 'asset.reference.insert', payload: { assetReference } },
    { type: 'asset.reference.remove', payload: { assetReferenceId } },
  )
  return assetReferenceId
}

function appendCurateReconciliation(
  originalDeck: DeckSnapshot,
  stagedDeck: DeckSnapshot,
  slideId: string,
  forwardOperations: HistoryOperation[],
  inverseOperations: HistoryOperation[],
): void {
  const oldSlide = findSlide(originalDeck, slideId)
  const nextSlide = findSlide(stagedDeck, slideId)
  if (!oldSlide || !nextSlide) return
  const existingState = ownValue(originalDeck.workbenchCurate?.slides, slideId)
  const previousManifest = clone(existingState?.slotManifest ?? deriveCurateSlotManifest(oldSlide))
  const nextManifest = deriveCurateSlotManifest(nextSlide)
  const nextRoles = new Set(nextManifest.map((slot) => slot.assignmentRole))
  const previousSlotsByRole = new Map(previousManifest.map((slot) => [slot.assignmentRole, slot]))
  const incompatible = (oldSlide.mediaAssignments ?? []).filter(
    (assignment) => previousSlotsByRole.has(assignment.role) && !nextRoles.has(assignment.role),
  )
  if (!existingState && incompatible.length === 0) return

  appendCurateSlideScaffold(originalDeck, slideId, previousManifest, forwardOperations, inverseOperations)
  for (const assignment of incompatible) {
    const priorDecision = ownValue(existingState?.decisions, assignment.assetReferenceId) ?? null
    if (priorDecision) throw new Error('Selected Asset cannot also have a non-selected Slide decision')
    const previousSlot = previousSlotsByRole.get(assignment.role) as CurateSlot
    const nextSupportingIds = new Set(
      nextManifest.filter((slot) => slot.kind === 'supporting-item').map((slot) => slot.supportingItemId),
    )
    const reason: Extract<SlideAssetDisposition, { state: 'unplaced' }>['reason'] =
      previousSlot.kind === 'supporting-item' && !nextSupportingIds.has(previousSlot.supportingItemId)
        ? 'supporting-item-removed'
        : oldSlide.intent !== nextSlide.intent
          ? 'visual-style-change'
          : 'slot-contract-change'
    appendOperationPair(
      forwardOperations,
      inverseOperations,
      {
        type: 'asset.assignment.remove',
        payload: { slideId, mediaAssignmentId: assignment.id },
      },
      {
        type: 'asset.assignment.insert',
        payload: { slideId, assignment: clone(assignment) },
      },
    )
    appendOperationPair(
      forwardOperations,
      inverseOperations,
      {
        type: 'curate.slideDecision.set',
        payload: {
          slideId,
          assetReferenceId: assignment.assetReferenceId,
          value: {
            state: 'unplaced',
            assignmentId: assignment.id,
            previousSlotKey: previousSlot.key,
            previousAssignmentRole: previousSlot.assignmentRole,
            reason,
          },
        },
      },
      {
        type: 'curate.slideDecision.set',
        payload: { slideId, assetReferenceId: assignment.assetReferenceId, value: priorDecision },
      },
    )
  }
  if (!manifestsEqual(previousManifest, nextManifest)) {
    appendOperationPair(
      forwardOperations,
      inverseOperations,
      { type: 'curate.slotManifest.set', payload: { slideId, value: clone(nextManifest) } },
      { type: 'curate.slotManifest.set', payload: { slideId, value: clone(previousManifest) } },
    )
  }
}

function operationsWithCurateReconciliation(
  deck: DeckSnapshot,
  slideId: string,
  baseForward: HistoryOperation,
  baseInverse: HistoryOperation,
): { forward: HistoryOperation; inverse: HistoryOperation } {
  const forwardOperations: HistoryOperation[] = []
  const inverseOperations: HistoryOperation[] = []
  appendOperationPair(forwardOperations, inverseOperations, baseForward, baseInverse)
  const stagedDeck = applyHistoryOperation(deck, baseForward)
  appendCurateReconciliation(deck, stagedDeck, slideId, forwardOperations, inverseOperations)
  return {
    forward: operationList(forwardOperations),
    inverse: operationList(inverseOperations),
  }
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

function applyHistoryOperation(deck: DeckSnapshot, operation: HistoryOperation, reuseDeck = false): DeckSnapshot {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new Error('History operation must be an object')
  }
  if (typeof operation.type !== 'string') throw new Error('History operation type must be a string')
  if (!operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload)) {
    throw new Error('History operation payload must be an object')
  }
  const next = reuseDeck ? deck : clone(deck)
  if (operation.type === 'compound') {
    if (!Array.isArray(operation.payload.operations) || operation.payload.operations.length === 0) {
      throw new Error('Compound history operation must contain operations')
    }
    for (const item of operation.payload.operations) applyHistoryOperation(next, item, true)
    return next
  }
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
    const isCurated = Boolean(
      ownValue(next.workbenchCurate?.projectJudgments, operation.payload.assetReferenceId)
      || Object.values(next.workbenchCurate?.slides ?? {}).some(
        (state) => ownValue(state.decisions, operation.payload.assetReferenceId),
      ),
    )
    if (isCurated) throw new Error('Asset Reference has durable Curate decisions')
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
  if (operation.type === 'curate.envelope.insert') {
    if (next.workbenchCurate) throw new Error('Workbench Curate envelope already exists')
    next.workbenchCurate = clone(operation.payload.value)
    return next
  }
  if (operation.type === 'curate.envelope.remove') {
    if (!next.workbenchCurate) throw new Error('Workbench Curate envelope does not exist')
    if (
      Object.keys(next.workbenchCurate.projectJudgments).length > 0
      || Object.keys(next.workbenchCurate.slides).length > 0
    ) throw new Error('Workbench Curate envelope must be empty before removal')
    delete next.workbenchCurate
    return next
  }
  if (operation.type === 'curate.slide.insert') {
    if (!findSlide(next, operation.payload.slideId)) throw new Error('Slide does not exist')
    if (!next.workbenchCurate) throw new Error('Workbench Curate envelope does not exist')
    if (hasOwn(next.workbenchCurate.slides, operation.payload.slideId)) {
      throw new Error('Slide Curate state already exists')
    }
    next.workbenchCurate.slides[operation.payload.slideId] = clone(operation.payload.value)
    return next
  }
  if (operation.type === 'curate.slide.remove') {
    if (!next.workbenchCurate || !hasOwn(next.workbenchCurate.slides, operation.payload.slideId)) {
      throw new Error('Slide Curate state does not exist')
    }
    delete next.workbenchCurate.slides[operation.payload.slideId]
    return next
  }
  if (operation.type === 'curate.projectJudgment.set') {
    if (!next.workbenchCurate) throw new Error('Workbench Curate envelope does not exist')
    if (!assetReferenceIdentityExists(next, operation.payload.assetReferenceId)) {
      throw new Error('Asset Reference does not exist')
    }
    if (operation.payload.value === null) {
      delete next.workbenchCurate.projectJudgments[operation.payload.assetReferenceId]
    } else {
      next.workbenchCurate.projectJudgments[operation.payload.assetReferenceId] = clone(operation.payload.value)
    }
    return next
  }
  if (operation.type === 'curate.slideDecision.set') {
    const slideState = ownValue(next.workbenchCurate?.slides, operation.payload.slideId)
    if (!slideState) throw new Error('Slide Curate state does not exist')
    if (!assetReferenceIdentityExists(next, operation.payload.assetReferenceId)) {
      throw new Error('Asset Reference does not exist')
    }
    if (operation.payload.value === null) {
      delete slideState.decisions[operation.payload.assetReferenceId]
    } else {
      slideState.decisions[operation.payload.assetReferenceId] = clone(operation.payload.value)
    }
    return next
  }
  if (operation.type === 'curate.findMore.set') {
    const slideState = ownValue(next.workbenchCurate?.slides, operation.payload.slideId)
    if (!slideState) throw new Error('Slide Curate state does not exist')
    slideState.findMoreMedia = clone(operation.payload.value)
    return next
  }
  if (operation.type === 'curate.slotManifest.set') {
    const slideState = ownValue(next.workbenchCurate?.slides, operation.payload.slideId)
    if (!slideState) throw new Error('Slide Curate state does not exist')
    slideState.slotManifest = clone(operation.payload.value)
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
  if (operation.type !== 'slide.move') throw new Error(`Unsupported history operation: ${operation.type}`)
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

const HISTORY_OPERATION_TYPES = new Set([
  'compound',
  'deck.rename',
  'content.set',
  'content.insert',
  'content.remove',
  'section.insert',
  'section.remove',
  'section.rename',
  'section.move',
  'slide.insert',
  'slide.remove',
  'slide.move',
  'slide.intent.set',
  'asset.reference.insert',
  'asset.reference.remove',
  'asset.assignment.insert',
  'asset.assignment.remove',
  'asset.assignment.asset.set',
  'curate.envelope.insert',
  'curate.envelope.remove',
  'curate.slide.insert',
  'curate.slide.remove',
  'curate.projectJudgment.set',
  'curate.slideDecision.set',
  'curate.findMore.set',
  'curate.slotManifest.set',
  'designOption.insert',
  'designOption.remove',
  'designOption.activate.set',
  'element.frame.set',
  'element.crop.set',
])

function assertSafeIdentityFields(
  value: unknown,
  field: string,
  seen = new WeakSet<object>(),
  depth = 0,
): void {
  if (!value || typeof value !== 'object') return
  if (depth > 64) throw new Error(`${field} exceeds the maximum history value depth`)
  if (seen.has(value)) throw new Error(`${field} must not contain cycles`)
  seen.add(value)
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertSafeIdentityFields(item, `${field}[${index}]`, seen, depth + 1)
    }
    seen.delete(value)
    return
  }
  for (const [key, item] of Object.entries(value as JsonObject)) {
    if (typeof item === 'string' && (key === 'id' || key.endsWith('Id'))) {
      assertIdentity(item, `${field}.${key}`)
    }
    assertSafeIdentityFields(item, `${field}.${key}`, seen, depth + 1)
  }
  seen.delete(value)
}

function assertHistoryOperationShape(value: unknown, field: string, depth = 0): HistoryOperation {
  if (depth > 64) throw new Error(`${field} exceeds the maximum compound-operation depth`)
  const operation = assertRecord(value, field)
  const type = assertString(operation.type, `${field}.type`, 128)
  if (!HISTORY_OPERATION_TYPES.has(type)) throw new Error(`${field} uses an unsupported history operation`)
  const payload = assertRecord(operation.payload, `${field}.payload`)
  assertSafeIdentityFields(payload, `${field}.payload`)
  if (type === 'compound') {
    if (!Array.isArray(payload.operations) || payload.operations.length === 0 || payload.operations.length > 1024) {
      throw new Error(`${field} compound operations must contain 1 to 1024 items`)
    }
    for (const [index, item] of payload.operations.entries()) {
      assertHistoryOperationShape(item, `${field}.payload.operations[${index}]`, depth + 1)
    }
  }
  return value as HistoryOperation
}

function assertHistoryEntryShape(value: unknown, field: string): HistoryEntry {
  const entry = assertRecord(value, field)
  assertIdentity(entry.id, `${field}.id`, 256)
  assertString(entry.label, `${field}.label`, 4096)
  assertHistoryOperationShape(entry.forward, `${field}.forward`)
  assertHistoryOperationShape(entry.inverse, `${field}.inverse`)
  return value as HistoryEntry
}

function assertCheckpointHistory(checkpoint: Checkpoint): void {
  const historyIds = new Set<string>()
  for (const [stackName, stack] of [
    ['undoStack', checkpoint.undoStack],
    ['redoStack', checkpoint.redoStack],
  ] as const) {
    for (const [index, rawEntry] of stack.entries()) {
      const entry = assertHistoryEntryShape(rawEntry, `${stackName}[${index}]`)
      if (historyIds.has(entry.id)) throw new Error(`Duplicate History Entry identity: ${entry.id}`)
      historyIds.add(entry.id)
    }
  }

  let undoDeck = clone(checkpoint.deck)
  for (let index = checkpoint.undoStack.length - 1; index >= 0; index -= 1) {
    undoDeck = applyHistoryOperation(undoDeck, checkpoint.undoStack[index].inverse)
    assertDeckIntegrity(undoDeck)
  }
  let redoDeck = clone(checkpoint.deck)
  for (let index = checkpoint.redoStack.length - 1; index >= 0; index -= 1) {
    redoDeck = applyHistoryOperation(redoDeck, checkpoint.redoStack[index].forward)
    assertDeckIntegrity(redoDeck)
  }
}

function validateCheckpoint(input: unknown): Checkpoint | KernelError {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return failure('InvalidCommand', 'Checkpoint must be an object')
    }
    const checkpoint = input as Partial<Checkpoint>
    if (checkpoint.schemaVersion !== 1 || checkpoint.format !== 'pitchdog.deck-checkpoint') {
      return failure('UnsupportedSchema', 'Only Deck checkpoint schema 1 is supported')
    }
    if (!Number.isSafeInteger(checkpoint.revision) || (checkpoint.revision as number) < 0) {
      return failure('InvalidCommand', 'Checkpoint revision must be a non-negative integer')
    }
    if (!checkpoint.deck || typeof checkpoint.deck !== 'object' || checkpoint.deck.schemaVersion !== 1) {
      return failure('UnsupportedSchema', 'Only Deck schema 1 is supported')
    }
    if (!Array.isArray(checkpoint.undoStack) || !Array.isArray(checkpoint.redoStack)) {
      return failure('InvalidCommand', 'Checkpoint history stacks must be arrays')
    }
    if (
      !checkpoint.processedCommands
      || typeof checkpoint.processedCommands !== 'object'
      || Array.isArray(checkpoint.processedCommands)
    ) return failure('InvalidCommand', 'Checkpoint processed-command map is required')

    const normalized = checkpoint as Checkpoint
    assertDeckIntegrity(normalized.deck)
    for (const [commandId, acknowledgement] of Object.entries(normalized.processedCommands)) {
      assertIdentity(commandId, 'Processed Command identity', 256)
      assertRecord(acknowledgement, `Processed Command ${commandId} acknowledgement`)
    }
    assertCheckpointHistory(normalized)
    return clone(normalized)
  } catch (error) {
    return failure('InvalidCommand', (error as Error).message)
  }
}

function createInitialCheckpoint(seed: JsonObject): Checkpoint {
  const deckId = assertIdentity(seed.deckId, 'deckId', 256)
  const sectionId = assertIdentity(seed.sectionId, 'sectionId', 256)
  const slideId = assertIdentity(seed.slideId, 'slideId', 256)
  const blockId = assertIdentity(seed.blockId, 'blockId', 256)
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

function defaultProjectJudgment(): ProjectAssetJudgment {
  return { rating: 0, review: 'unreviewed', projectPick: false }
}

function selectedCurateDecision(
  deck: DeckSnapshot,
  slide: Slide,
  assetReferenceId: string,
): JsonObject | null {
  const slots = deriveCurateSlotManifest(slide)
  for (const slot of slots) {
    const assignment = slide.mediaAssignments?.find(
      (candidate) => candidate.role === slot.assignmentRole && candidate.assetReferenceId === assetReferenceId,
    )
    if (assignment) {
      return {
        state: 'selected',
        slotKey: slot.key,
        assignmentId: assignment.id,
      }
    }
  }
  return null
}

function curateSlideProjection(deck: DeckSnapshot, slide: Slide, revision: number): JsonObject {
  const slots = deriveCurateSlotManifest(slide)
  const stored = ownValue(deck.workbenchCurate?.slides, slide.id)
  const selectedAssetIds = new Set<string>()
  const projectedSlots = slots.map((slot) => {
    const assignment = slide.mediaAssignments?.find((candidate) => candidate.role === slot.assignmentRole)
    if (assignment) selectedAssetIds.add(assignment.assetReferenceId)
    const assetReference = assignment
      ? deck.assetReferences?.find((asset) => asset.id === assignment.assetReferenceId)
      : undefined
    return {
      ...clone(slot),
      selected: assignment
        ? {
            assignmentId: assignment.id,
            assetReferenceId: assignment.assetReferenceId,
            assetReference: assetReference ? clone(assetReference) : null,
          }
        : null,
    }
  })
  const decisions: JsonObject[] = Object.entries(stored?.decisions ?? {}).map(
    ([assetReferenceId, decision]) => ({ assetReferenceId, ...clone(decision) }),
  )
  for (const slot of projectedSlots) {
    if (!slot.selected) continue
    decisions.push({
      assetReferenceId: slot.selected.assetReferenceId,
      state: 'selected',
      slotKey: slot.key,
      assignmentId: slot.selected.assignmentId,
    })
  }
  return {
    revision,
    slide: { id: slide.id, intent: slide.intent },
    slots: projectedSlots,
    decisions,
    findMoreMedia: clone(stored?.findMoreMedia ?? defaultFindMoreMedia()),
    needsReconciliation: Boolean(stored && !manifestsEqual(stored.slotManifest, slots)),
  }
}

function query(session: KernelSession, name: string, params: JsonObject = {}): JsonObject | KernelError {
  const checkpoint = session.checkpoint
  if (name === 'curate.queue') {
    try {
      return {
        revision: checkpoint.revision,
        slides: checkpoint.deck.sections.flatMap((section) => section.slides.map((slide) => {
          const slots = deriveCurateSlotManifest(slide)
          const stored = ownValue(checkpoint.deck.workbenchCurate?.slides, slide.id)
          const roles = new Set(slots.map((slot) => slot.assignmentRole))
          const filledSlotCount = (slide.mediaAssignments ?? []).filter((assignment) => roles.has(assignment.role)).length
          const unplacedCount = Object.values(stored?.decisions ?? {}).filter(
            (decision) => decision.state === 'unplaced',
          ).length
          return {
            slideId: slide.id,
            requiredSlotCount: slots.length,
            filledSlotCount,
            unplacedCount,
            findMoreState: stored?.findMoreMedia.state ?? 'not-needed',
            needsReconciliation: Boolean(stored && !manifestsEqual(stored.slotManifest, slots)),
          }
        })),
      }
    } catch (error) {
      return failure('InvalidCommand', (error as Error).message)
    }
  }
  if (name === 'curate.slide') {
    const slideId = typeof params.slideId === 'string' ? params.slideId : undefined
    if (!slideId) return failure('InvalidCommand', 'curate.slide requires slideId')
    const slide = findSlide(checkpoint.deck, slideId)
    if (!slide) return failure('InvalidCommand', 'Slide does not exist')
    try {
      return {
        deckId: checkpoint.deck.deckId,
        ...curateSlideProjection(checkpoint.deck, slide, checkpoint.revision),
        history: {
          canUndo: checkpoint.undoStack.length > 0,
          canRedo: checkpoint.redoStack.length > 0,
        },
      }
    } catch (error) {
      return failure('InvalidCommand', (error as Error).message)
    }
  }
  if (name === 'curate.assetStates') {
    const slideId = typeof params.slideId === 'string' ? params.slideId : undefined
    if (!slideId) return failure('InvalidCommand', 'curate.assetStates requires slideId')
    const slide = findSlide(checkpoint.deck, slideId)
    if (!slide) return failure('InvalidCommand', 'Slide does not exist')
    if (!Array.isArray(params.assetReferenceIds) || params.assetReferenceIds.length > 500) {
      return failure('InvalidCommand', 'curate.assetStates requires at most 500 Asset Reference identities')
    }
    try {
      const assetReferenceIds = params.assetReferenceIds.map(
        (value, index) => assertIdentity(value, `assetReferenceIds[${index}]`, 256),
      )
      if (new Set(assetReferenceIds).size !== assetReferenceIds.length) {
        return failure('InvalidCommand', 'curate.assetStates Asset Reference identities must be unique')
      }
      const stored = ownValue(checkpoint.deck.workbenchCurate?.slides, slideId)
      return {
        revision: checkpoint.revision,
        assets: assetReferenceIds.map((assetReferenceId) => {
          const assetReference = checkpoint.deck.assetReferences?.find((asset) => asset.id === assetReferenceId)
          const selected = selectedCurateDecision(checkpoint.deck, slide, assetReferenceId)
          return {
            assetReferenceId,
            assetReference: assetReference ? clone(assetReference) : null,
            projectJudgment: clone(
              ownValue(checkpoint.deck.workbenchCurate?.projectJudgments, assetReferenceId) ?? defaultProjectJudgment(),
            ),
            slideDecision: selected ?? clone(ownValue(stored?.decisions, assetReferenceId) ?? null),
          }
        }),
      }
    } catch (error) {
      return failure('InvalidCommand', (error as Error).message)
    }
  }
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
  const duplicate = ownValue(session.checkpoint.processedCommands, command.commandId)
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
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const blockId = assertIdentity(command.payload.blockId, 'blockId', 256)
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
          : assertIdentity(command.payload.afterBlockId, 'afterBlockId', 256)
      const block: ContentBlock = {
        id: blockId,
        semanticKey,
        role,
        value: clone(command.payload.value),
      }
      const baseForward: HistoryOperation = { type: 'content.insert', payload: { slideId, block, afterBlockId } }
      const baseInverse: HistoryOperation = { type: 'content.remove', payload: { slideId, blockId } }
      if (block.role === 'workbench-plan' || block.semanticKey === 'workbench.plan.v1') {
        const operations = operationsWithCurateReconciliation(session.checkpoint.deck, slideId, baseForward, baseInverse)
        forward = operations.forward
        inverse = operations.inverse
        projectionHints = ['story', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
      } else {
        forward = baseForward
        inverse = baseInverse
      }
      label = `Add Content: ${role}`
    } else if (command.type === 'content.update') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const blockId = assertIdentity(command.payload.blockId, 'blockId', 256)
      if (!isRichTextDocument(command.payload.value)) {
        throw new Error('content.update value must be semantic rich-text JSON')
      }
      const currentBlock = findBlock(session.checkpoint.deck, slideId, blockId)
      if (!currentBlock) throw new Error('Content Block does not exist')
      const baseForward: HistoryOperation = {
        type: 'content.set',
        payload: { slideId, blockId, value: clone(command.payload.value) },
      }
      const baseInverse: HistoryOperation = {
        type: 'content.set',
        payload: { slideId, blockId, value: clone(currentBlock.value) },
      }
      if (currentBlock.role === 'workbench-plan' || currentBlock.semanticKey === 'workbench.plan.v1') {
        const operations = operationsWithCurateReconciliation(session.checkpoint.deck, slideId, baseForward, baseInverse)
        forward = operations.forward
        inverse = operations.inverse
        projectionHints = ['story', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
      } else {
        forward = baseForward
        inverse = baseInverse
      }
      label = `Update Content: ${currentBlock.role}`
    } else if (command.type === 'content.remove') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const blockId = assertIdentity(command.payload.blockId, 'blockId', 256)
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const blocks = session.checkpoint.deck.sections[location.sectionIndex].slides[location.slideIndex].contentBlocks
      const blockIndex = blocks.findIndex((block) => block.id === blockId)
      if (blockIndex < 0) throw new Error('Content Block does not exist')
      const block = blocks[blockIndex]
      if (block.role === 'headline') throw new Error('Headline Content Block cannot be removed')
      const afterBlockId = blockIndex > 0 ? blocks[blockIndex - 1].id : null
      const baseForward: HistoryOperation = { type: 'content.remove', payload: { slideId, blockId } }
      const baseInverse: HistoryOperation = {
        type: 'content.insert',
        payload: { slideId, block: clone(block), afterBlockId },
      }
      if (block.role === 'workbench-plan' || block.semanticKey === 'workbench.plan.v1') {
        const operations = operationsWithCurateReconciliation(session.checkpoint.deck, slideId, baseForward, baseInverse)
        forward = operations.forward
        inverse = operations.inverse
        projectionHints = ['story', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
      } else {
        forward = baseForward
        inverse = baseInverse
      }
      label = `Remove Content: ${block.role}`
    } else if (command.type === 'section.add') {
      const sectionId = assertIdentity(command.payload.sectionId, 'sectionId', 256)
      const title = assertString(command.payload.title, 'title')
      const afterSectionId = command.payload.afterSectionId === undefined
        ? session.checkpoint.deck.sections.at(-1)?.id ?? null
        : command.payload.afterSectionId === null
          ? null
          : assertIdentity(command.payload.afterSectionId, 'afterSectionId', 256)
      forward = {
        type: 'section.insert',
        payload: { section: { id: sectionId, title, slides: [] }, afterSectionId },
      }
      inverse = { type: 'section.remove', payload: { sectionId } }
      label = `Add Section: ${title}`
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.rename') {
      const sectionId = assertIdentity(command.payload.sectionId, 'sectionId', 256)
      const title = assertString(command.payload.title, 'title')
      const section = session.checkpoint.deck.sections.find((candidate) => candidate.id === sectionId)
      if (!section) throw new Error('Section does not exist')
      forward = { type: 'section.rename', payload: { sectionId, title } }
      inverse = { type: 'section.rename', payload: { sectionId, title: section.title } }
      label = `Rename Section: ${title}`
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.move') {
      const sectionId = assertIdentity(command.payload.sectionId, 'sectionId', 256)
      const index = session.checkpoint.deck.sections.findIndex((section) => section.id === sectionId)
      if (index < 0) throw new Error('Section does not exist')
      const afterSectionId = command.payload.afterSectionId === null
        ? null
        : assertIdentity(command.payload.afterSectionId, 'afterSectionId', 256)
      const previousAfterSectionId = index > 0 ? session.checkpoint.deck.sections[index - 1].id : null
      forward = { type: 'section.move', payload: { sectionId, afterSectionId } }
      inverse = { type: 'section.move', payload: { sectionId, afterSectionId: previousAfterSectionId } }
      label = 'Move Section'
      projectionHints = ['story', 'sequence', 'history']
    } else if (command.type === 'section.remove') {
      const sectionId = assertIdentity(command.payload.sectionId, 'sectionId', 256)
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
      const sectionId = assertIdentity(command.payload.sectionId, 'sectionId', 256)
      const section = session.checkpoint.deck.sections.find((candidate) => candidate.id === sectionId)
      if (!section) throw new Error('Target Section does not exist')
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const blockId = assertIdentity(command.payload.blockId, 'blockId', 256)
      const intent = assertString(command.payload.intent, 'intent')
      if (!isRichTextDocument(command.payload.headline)) {
        throw new Error('slide.add headline must be semantic rich-text JSON')
      }
      if (blockIdentityExists(session.checkpoint.deck, blockId)) throw new Error('Content Block identity already exists')
      const afterSlideId = command.payload.afterSlideId === undefined
        ? section.slides.at(-1)?.id ?? null
        : command.payload.afterSlideId === null
          ? null
          : assertIdentity(command.payload.afterSlideId, 'afterSlideId', 256)
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
      projectionHints = ['story', 'sequence', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.move') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const targetSectionId = assertIdentity(command.payload.targetSectionId, 'targetSectionId', 256)
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const sourceSection = session.checkpoint.deck.sections[location.sectionIndex]
      const previousAfterSlideId = location.slideIndex > 0 ? sourceSection.slides[location.slideIndex - 1].id : null
      const afterSlideId = command.payload.afterSlideId === null
        ? null
        : assertIdentity(command.payload.afterSlideId, 'afterSlideId', 256)
      forward = { type: 'slide.move', payload: { slideId, targetSectionId, afterSlideId } }
      inverse = {
        type: 'slide.move',
        payload: { slideId, targetSectionId: sourceSection.id, afterSlideId: previousAfterSlideId },
      }
      label = 'Move Slide'
      projectionHints = ['story', 'sequence', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.intent.set') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const intent = assertString(command.payload.intent, 'intent')
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const currentIntent = session.checkpoint.deck.sections[location.sectionIndex].slides[location.slideIndex].intent
      const operations = operationsWithCurateReconciliation(
        session.checkpoint.deck,
        slideId,
        { type: 'slide.intent.set', payload: { slideId, intent } },
        { type: 'slide.intent.set', payload: { slideId, intent: currentIntent } },
      )
      forward = operations.forward
      inverse = operations.inverse
      label = `Set Slide intent: ${intent}`
      projectionHints = ['story', 'sequence', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'slide.remove') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const location = findSlideLocation(session.checkpoint.deck, slideId)
      if (!location) throw new Error('Slide does not exist')
      const slideCount = session.checkpoint.deck.sections.reduce((sum, section) => sum + section.slides.length, 0)
      if (slideCount <= 1) throw new Error('Deck must retain at least one Slide')
      const section = session.checkpoint.deck.sections[location.sectionIndex]
      const slide = section.slides[location.slideIndex]
      const afterSlideId = location.slideIndex > 0 ? section.slides[location.slideIndex - 1].id : null
      const forwardOperations: HistoryOperation[] = []
      const inverseOperations: HistoryOperation[] = []
      const curateState = ownValue(session.checkpoint.deck.workbenchCurate?.slides, slideId)
      if (curateState) {
        appendOperationPair(
          forwardOperations,
          inverseOperations,
          { type: 'curate.slide.remove', payload: { slideId } },
          { type: 'curate.slide.insert', payload: { slideId, value: clone(curateState) } },
        )
      }
      appendOperationPair(
        forwardOperations,
        inverseOperations,
        { type: 'slide.remove', payload: { slideId } },
        { type: 'slide.insert', payload: { sectionId: section.id, slide: clone(slide), afterSlideId } },
      )
      forward = operationList(forwardOperations)
      inverse = operationList(inverseOperations)
      label = 'Remove Slide'
      projectionHints = ['story', 'sequence', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'asset.reference.add') {
      const assetReferenceId = assertIdentity(command.payload.assetReferenceId, 'assetReferenceId', 256)
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
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const mediaAssignmentId = assertIdentity(command.payload.mediaAssignmentId, 'mediaAssignmentId', 256)
      const role = assertString(command.payload.role, 'role')
      const assetReferenceId = assertIdentity(command.payload.assetReferenceId, 'assetReferenceId', 256)
      if (!assetReferenceIdentityExists(session.checkpoint.deck, assetReferenceId)) {
        throw new Error('Asset Reference does not exist')
      }
      const existingForRole = slide.mediaAssignments?.find((assignment) => assignment.role === role)
      const manifest = deriveCurateSlotManifest(slide)
      const curateSlot = manifest.find((slot) => slot.assignmentRole === role)
      if (curateSlot) {
        const curateRoles = new Set(manifest.map((slot) => slot.assignmentRole))
        if ((slide.mediaAssignments ?? []).some(
          (assignment) => assignment.role !== role
            && curateRoles.has(assignment.role)
            && assignment.assetReferenceId === assetReferenceId,
        )) throw new Error('Asset is already selected for another Curate slot; demote it before moving')

        const forwardOperations: HistoryOperation[] = []
        const inverseOperations: HistoryOperation[] = []
        const storedState = ownValue(session.checkpoint.deck.workbenchCurate?.slides, slideId)
        const currentDecision = ownValue(storedState?.decisions, assetReferenceId) ?? null
        appendCurateSlideScaffold(
          session.checkpoint.deck,
          slideId,
          storedState?.slotManifest ?? manifest,
          forwardOperations,
          inverseOperations,
        )
        if (existingForRole) {
          if (existingForRole.id !== mediaAssignmentId) {
            throw new Error('Media role replacement must preserve assignment identity')
          }
          if (existingForRole.assetReferenceId === assetReferenceId) {
            throw new Error('Asset Reference is already assigned to media role')
          }
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'asset.assignment.asset.set',
              payload: { slideId, mediaAssignmentId, assetReferenceId },
            },
            {
              type: 'asset.assignment.asset.set',
              payload: { slideId, mediaAssignmentId, assetReferenceId: existingForRole.assetReferenceId },
            },
          )
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'curate.slideDecision.set',
              payload: {
                slideId,
                assetReferenceId: existingForRole.assetReferenceId,
                value: { state: 'shortlisted' },
              },
            },
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId: existingForRole.assetReferenceId, value: null },
            },
          )
          label = `Replace Asset: ${role}`
        } else {
          if (mediaAssignmentIdentityExists(session.checkpoint.deck, mediaAssignmentId)) {
            throw new Error('Media Assignment identity already exists')
          }
          if (currentDecision?.state === 'unplaced' && currentDecision.assignmentId !== mediaAssignmentId) {
            throw new Error('Unplaced Curate selection must preserve assignment identity')
          }
          if (unplacedAssignmentIdentityExists(
            session.checkpoint.deck,
            mediaAssignmentId,
            { slideId, assetReferenceId },
          )) throw new Error('Media Assignment identity already exists in the unplaced tray')
          const assignment: MediaAssignment = { id: mediaAssignmentId, role, assetReferenceId }
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            { type: 'asset.assignment.insert', payload: { slideId, assignment } },
            { type: 'asset.assignment.remove', payload: { slideId, mediaAssignmentId } },
          )
          label = `Assign Asset: ${role}`
        }
        if (currentDecision) {
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId, value: null },
            },
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId, value: clone(currentDecision) },
            },
          )
        }
        forward = operationList(forwardOperations)
        inverse = operationList(inverseOperations)
        projectionHints = ['curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
      } else {
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
        projectionHints = ['curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
      }
    } else if (command.type === 'curate.projectJudgment.set') {
      const judgment = assertProjectAssetJudgment(command.payload.judgment)
      const assetReferenceId = assertIdentity(command.payload.assetReferenceId, 'assetReferenceId', 256)
      const current = ownValue(session.checkpoint.deck.workbenchCurate?.projectJudgments, assetReferenceId) ?? null
      const nextValue = isDefaultProjectJudgment(judgment) ? null : judgment
      if (JSON.stringify(current) === JSON.stringify(nextValue)) {
        throw new Error('Project Asset judgment is already set')
      }
      const forwardOperations: HistoryOperation[] = []
      const inverseOperations: HistoryOperation[] = []
      if (nextValue !== null) appendCurateEnvelopeScaffold(session.checkpoint.deck, forwardOperations, inverseOperations)
      appendAssetReferenceScaffold(session.checkpoint.deck, command.payload, forwardOperations, inverseOperations)
      if (!session.checkpoint.deck.workbenchCurate && nextValue === null) {
        throw new Error('Project Asset judgment is already at its default')
      }
      appendOperationPair(
        forwardOperations,
        inverseOperations,
        {
          type: 'curate.projectJudgment.set',
          payload: { assetReferenceId, value: nextValue },
        },
        {
          type: 'curate.projectJudgment.set',
          payload: { assetReferenceId, value: current },
        },
      )
      forward = operationList(forwardOperations)
      inverse = operationList(inverseOperations)
      label = 'Set Project Asset judgment'
      projectionHints = ['curate.assetStates', 'history']
    } else if (command.type === 'curate.slideDecision.set') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const rawDecision = command.payload.decision
      if (!rawDecision || typeof rawDecision !== 'object' || Array.isArray(rawDecision)) {
        throw new Error('decision must be an object')
      }
      const decision = rawDecision as JsonObject
      const manifest = deriveCurateSlotManifest(slide)
      const roles = new Set(manifest.map((slot) => slot.assignmentRole))
      const forwardOperations: HistoryOperation[] = []
      const inverseOperations: HistoryOperation[] = []
      const assetReferenceId = appendAssetReferenceScaffold(
        session.checkpoint.deck,
        command.payload,
        forwardOperations,
        inverseOperations,
      )
      const storedState = ownValue(session.checkpoint.deck.workbenchCurate?.slides, slideId)
      const currentDecision = ownValue(storedState?.decisions, assetReferenceId) ?? null
      const selectedAssignments = (slide.mediaAssignments ?? []).filter(
        (assignment) => roles.has(assignment.role) && assignment.assetReferenceId === assetReferenceId,
      )

      if (decision.state === 'selected') {
        const slotKey = assertString(decision.slotKey, 'decision.slotKey', 512)
        const slot = manifest.find((candidate) => candidate.key === slotKey)
        if (!slot) throw new Error('Selected Curate slot does not exist for the current Slide plan')
        if (selectedAssignments.some((assignment) => assignment.role === slot.assignmentRole)) {
          throw new Error('Asset is already selected for this Curate slot')
        }
        if (selectedAssignments.length > 0) {
          throw new Error('Asset is already selected for another Curate slot; demote it before moving')
        }
        const occupant = slide.mediaAssignments?.find((assignment) => assignment.role === slot.assignmentRole)
        if (occupant) {
          appendCurateSlideScaffold(
            session.checkpoint.deck,
            slideId,
            storedState?.slotManifest ?? manifest,
            forwardOperations,
            inverseOperations,
          )
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'asset.assignment.asset.set',
              payload: { slideId, mediaAssignmentId: occupant.id, assetReferenceId },
            },
            {
              type: 'asset.assignment.asset.set',
              payload: {
                slideId,
                mediaAssignmentId: occupant.id,
                assetReferenceId: occupant.assetReferenceId,
              },
            },
          )
          const displacedDecision = ownValue(storedState?.decisions, occupant.assetReferenceId) ?? null
          if (displacedDecision) throw new Error('Selected Asset cannot also have a non-selected Slide decision')
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'curate.slideDecision.set',
              payload: {
                slideId,
                assetReferenceId: occupant.assetReferenceId,
                value: { state: 'shortlisted' },
              },
            },
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId: occupant.assetReferenceId, value: displacedDecision },
            },
          )
        } else {
          const proposedAssignmentId = currentDecision?.state === 'unplaced'
            ? currentDecision.assignmentId
            : assertIdentity(decision.mediaAssignmentId, 'decision.mediaAssignmentId', 256)
          if (mediaAssignmentIdentityExists(session.checkpoint.deck, proposedAssignmentId)) {
            throw new Error('Media Assignment identity already exists')
          }
          const unplacedIdentityExists = unplacedAssignmentIdentityExists(
            session.checkpoint.deck,
            proposedAssignmentId,
            { slideId, assetReferenceId },
          )
          if (unplacedIdentityExists) throw new Error('Media Assignment identity already exists in the unplaced tray')
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'asset.assignment.insert',
              payload: {
                slideId,
                assignment: { id: proposedAssignmentId, role: slot.assignmentRole, assetReferenceId },
              },
            },
            { type: 'asset.assignment.remove', payload: { slideId, mediaAssignmentId: proposedAssignmentId } },
          )
        }
        if (currentDecision) {
          appendCurateSlideScaffold(
            session.checkpoint.deck,
            slideId,
            storedState?.slotManifest ?? manifest,
            forwardOperations,
            inverseOperations,
          )
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId, value: null },
            },
            {
              type: 'curate.slideDecision.set',
              payload: { slideId, assetReferenceId, value: clone(currentDecision) },
            },
          )
        }
        label = `Select Asset: ${slot.key}`
      } else {
        const nextDecision = assertSlideAssetDisposition(decision, false)
        if (selectedAssignments.length === 0 && JSON.stringify(currentDecision) === JSON.stringify(nextDecision)) {
          throw new Error('Slide Asset decision is already set')
        }
        appendCurateSlideScaffold(
          session.checkpoint.deck,
          slideId,
          storedState?.slotManifest ?? manifest,
          forwardOperations,
          inverseOperations,
        )
        for (const assignment of selectedAssignments) {
          appendOperationPair(
            forwardOperations,
            inverseOperations,
            { type: 'asset.assignment.remove', payload: { slideId, mediaAssignmentId: assignment.id } },
            { type: 'asset.assignment.insert', payload: { slideId, assignment: clone(assignment) } },
          )
        }
        appendOperationPair(
          forwardOperations,
          inverseOperations,
          {
            type: 'curate.slideDecision.set',
            payload: { slideId, assetReferenceId, value: nextDecision },
          },
          {
            type: 'curate.slideDecision.set',
            payload: { slideId, assetReferenceId, value: currentDecision },
          },
        )
        label = `Set Slide Asset decision: ${nextDecision.state}`
      }
      forward = operationList(forwardOperations)
      inverse = operationList(inverseOperations)
      projectionHints = ['curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'curate.findMore.set') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const value = assertFindMoreMedia(command.payload.value)
      const currentState = ownValue(session.checkpoint.deck.workbenchCurate?.slides, slideId)
      const current = currentState?.findMoreMedia ?? defaultFindMoreMedia()
      if (JSON.stringify(current) === JSON.stringify(value)) throw new Error('Find More Media is already set')
      const forwardOperations: HistoryOperation[] = []
      const inverseOperations: HistoryOperation[] = []
      appendCurateSlideScaffold(
        session.checkpoint.deck,
        slideId,
        currentState?.slotManifest ?? deriveCurateSlotManifest(slide),
        forwardOperations,
        inverseOperations,
      )
      appendOperationPair(
        forwardOperations,
        inverseOperations,
        { type: 'curate.findMore.set', payload: { slideId, value } },
        { type: 'curate.findMore.set', payload: { slideId, value: clone(current) } },
      )
      forward = operationList(forwardOperations)
      inverse = operationList(inverseOperations)
      label = `Set Find More Media: ${value.state}`
      projectionHints = ['curate.queue', 'curate.slide', 'history']
    } else if (command.type === 'curate.reconcile') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      if (!findSlide(session.checkpoint.deck, slideId)) throw new Error('Slide does not exist')
      const forwardOperations: HistoryOperation[] = []
      const inverseOperations: HistoryOperation[] = []
      appendCurateReconciliation(
        session.checkpoint.deck,
        session.checkpoint.deck,
        slideId,
        forwardOperations,
        inverseOperations,
      )
      if (forwardOperations.length === 0) throw new Error('Curate state is already reconciled')
      forward = operationList(forwardOperations)
      inverse = operationList(inverseOperations)
      label = 'Reconcile Curate slots'
      projectionHints = ['curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history']
    } else if (command.type === 'designOption.applyPattern') {
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const designOptionId = assertIdentity(command.payload.designOptionId, 'designOptionId', 256)
      if (designOptionIdentityExists(session.checkpoint.deck, designOptionId)) {
        throw new Error('Design Option identity already exists')
      }
      const patternId = assertIdentity(command.payload.patternId, 'patternId', 128)
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
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const slide = findSlide(session.checkpoint.deck, slideId)
      if (!slide) throw new Error('Slide does not exist')
      const designOptionId = assertIdentity(command.payload.designOptionId, 'designOptionId', 256)
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
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const designOptionId = assertIdentity(command.payload.designOptionId, 'designOptionId', 256)
      const elementId = assertIdentity(command.payload.elementId, 'elementId', 512)
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
      const slideId = assertIdentity(command.payload.slideId, 'slideId', 256)
      const designOptionId = assertIdentity(command.payload.designOptionId, 'designOptionId', 256)
      const elementId = assertIdentity(command.payload.elementId, 'elementId', 512)
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
    assertDeckIntegrity(nextDeck)
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
  const stack = session?.checkpoint?.undoStack
  if (!Array.isArray(stack)) return failure('JournalCorruption', 'Undo history stack is malformed')
  if (stack.length === 0) return failure('InvalidCommand', 'Nothing to undo')
  try {
    const entry = clone(assertHistoryEntryShape(stack[stack.length - 1], 'Undo History Entry'))
    const nextRevision = session.checkpoint.revision + 1
    const nextDeck = applyHistoryOperation(session.checkpoint.deck, entry.inverse)
    assertDeckIntegrity(nextDeck)
    return {
      ok: true,
      operation: 'undo',
      commandId: `undo:${entry.id}:${nextRevision}`,
      baseRevision: session.checkpoint.revision,
      nextRevision,
      nextDeck,
      nextUndoStack: clone(stack.slice(0, -1)),
      nextRedoStack: [...clone(session.checkpoint.redoStack), entry],
      nextProcessedCommands: clone(session.checkpoint.processedCommands),
      journalOperation: { operation: 'undo', historyEntryId: entry.id },
      projectionHints: ['story', 'sequence', 'asset.catalog', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history'],
    }
  } catch (error) {
    return failure('JournalCorruption', `Undo history is malformed: ${(error as Error).message}`)
  }
}

function prepareRedo(session: KernelSession): PrepareResult {
  const stack = session?.checkpoint?.redoStack
  if (!Array.isArray(stack)) return failure('JournalCorruption', 'Redo history stack is malformed')
  if (stack.length === 0) return failure('InvalidCommand', 'Nothing to redo')
  try {
    const entry = clone(assertHistoryEntryShape(stack[stack.length - 1], 'Redo History Entry'))
    const nextRevision = session.checkpoint.revision + 1
    const nextDeck = applyHistoryOperation(session.checkpoint.deck, entry.forward)
    assertDeckIntegrity(nextDeck)
    return {
      ok: true,
      operation: 'redo',
      commandId: `redo:${entry.id}:${nextRevision}`,
      baseRevision: session.checkpoint.revision,
      nextRevision,
      nextDeck,
      nextUndoStack: [...clone(session.checkpoint.undoStack), entry],
      nextRedoStack: clone(stack.slice(0, -1)),
      nextProcessedCommands: clone(session.checkpoint.processedCommands),
      journalOperation: { operation: 'redo', historyEntryId: entry.id },
      projectionHints: ['story', 'sequence', 'asset.catalog', 'curate.queue', 'curate.slide', 'curate.assetStates', 'slide.activeProjection', 'history'],
    }
  } catch (error) {
    return failure('JournalCorruption', `Redo history is malformed: ${(error as Error).message}`)
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
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return failure('JournalCorruption', 'Journal record must be an object')
  }
  if (!Number.isSafeInteger(record.revision) || record.revision !== session.checkpoint.revision + 1) {
    return failure('JournalCorruption', 'Journal revision is not contiguous')
  }
  let prepared: PrepareResult
  if (record.operation === 'command') {
    prepared = prepare(session, record.command as CommandEnvelope)
  } else if (record.operation === 'undo') {
    const undoStack = session?.checkpoint?.undoStack
    const expectedEntry = Array.isArray(undoStack) ? undoStack.at(-1) : undefined
    if (!expectedEntry || record.historyEntryId !== expectedEntry.id) {
      return failure('JournalCorruption', 'Undo journal history identity does not match the top Undo entry')
    }
    prepared = prepareUndo(session)
  } else if (record.operation === 'redo') {
    const redoStack = session?.checkpoint?.redoStack
    const expectedEntry = Array.isArray(redoStack) ? redoStack.at(-1) : undefined
    if (!expectedEntry || record.historyEntryId !== expectedEntry.id) {
      return failure('JournalCorruption', 'Redo journal history identity does not match the top Redo entry')
    }
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
    try {
      const result = DeckKernel.open(JSON.parse(checkpointJSON))
      if ('ok' in result && result.ok === false) return adapterResult(result)
      adapterSession = result as KernelSession
      return adapterResult({ ok: true, revision: adapterSession.checkpoint.revision })
    } catch (error) {
      return adapterResult(failure('InvalidCommand', `Checkpoint JSON is invalid: ${(error as Error).message}`))
    }
  },
  query(name: string, paramsJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    try {
      return adapterResult(DeckKernel.query(adapterSession, name, JSON.parse(paramsJSON)))
    } catch (error) {
      return adapterResult(failure('InvalidCommand', `Query parameters JSON is invalid: ${(error as Error).message}`))
    }
  },
  prepare(commandJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    try {
      return adapterResult(DeckKernel.prepare(adapterSession, JSON.parse(commandJSON)))
    } catch (error) {
      return adapterResult(failure('InvalidCommand', `Command JSON is invalid: ${(error as Error).message}`))
    }
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
    try {
      return adapterResult(DeckKernel.commit(adapterSession, JSON.parse(preparedJSON)))
    } catch (error) {
      return adapterResult(failure('InvalidCommand', `Prepared change JSON is invalid: ${(error as Error).message}`))
    }
  },
  replay(recordJSON: string): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    try {
      return adapterResult(DeckKernel.replayRecord(adapterSession, JSON.parse(recordJSON)))
    } catch (error) {
      return adapterResult(failure('JournalCorruption', `Journal record JSON is invalid: ${(error as Error).message}`))
    }
  },
  serialize(): string {
    if (!adapterSession) return adapterResult(failure('KernelUnavailable', 'No Deck session is open'))
    return adapterResult(DeckKernel.serializeSession(adapterSession))
  },
})

;(globalThis as unknown as { DeckKernel: typeof DeckKernel }).DeckKernel = DeckKernel
;(globalThis as unknown as { DeckKernelJSON: typeof DeckKernelJSON }).DeckKernelJSON = DeckKernelJSON
