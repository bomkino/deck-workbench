const INTERFACE_SCALE_STEPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])
const W02_PATTERN_IDS = Object.freeze(['cover', 'full-bleed-statement', 'editorial-body'])
const ARTBOARD_BASE_WIDTH = 1088
const PLAN_BLOCK_ROLE = 'workbench-plan'
const PLAN_BLOCK_KEY = 'workbench.plan.v1'
const PLAN_FORMAT = 'pitchdog.workbench-plan'
const PLAN_VERSION = 1
const VISUAL_STYLE_IDS = Object.freeze([
  'undecided',
  'text-only',
  'full-bleed',
  'full-bleed-overlay',
  'image-text',
  'diptych',
  'triptych',
  'gallery',
  'custom',
])
const CONTENT_PATTERN_IDS = Object.freeze([
  'simple-copy',
  'quote',
  'repeater',
  'comparison',
  'gallery-captions',
  'no-on-slide-text',
  'custom',
])
const COPY_FIELD_STATES = Object.freeze(['present', 'intentionally-blank', 'unreviewed'])
const TEXT_PRESENCE_STATES = Object.freeze(['visible', 'no-on-slide-text', 'undecided'])
const SLIDE_LIFECYCLES = Object.freeze(['included', 'skipped', 'cut'])

function patternApplyPlan(activeProjection, patternId, designOptionId, bodyBlockId = null) {
  if (!activeProjection || !W02_PATTERN_IDS.includes(patternId) || !designOptionId) return null
  const headline = activeProjection.contentBlocks.find((block) => block.id === activeProjection.headline.id)
  if (!headline) return null
  const contentBindings = { headline: headline.id }
  if (patternId === 'editorial-body') {
    const body = activeProjection.contentBlocks.find(
      (block) => block.id === bodyBlockId && block.role === 'body',
    )
    if (!body) return null
    contentBindings.body = body.id
  }
  return Object.freeze({
    slideId: activeProjection.slide.id,
    designOptionId,
    patternId,
    patternVersion: 1,
    contentBindings: Object.freeze(contentBindings),
  })
}

function elementAlignPlan(activeProjection, elementId, alignment) {
  if (!activeProjection?.composition || !activeProjection.designOption) return null
  const element = activeProjection.composition.elements.find((candidate) => candidate.id === elementId)
  if (!element || !['left', 'center', 'right'].includes(alignment)) return null
  const x = alignment === 'left'
    ? 0
    : alignment === 'center'
      ? (activeProjection.canvas.width - element.frame.width) / 2
      : activeProjection.canvas.width - element.frame.width
  return Object.freeze({
    slideId: activeProjection.slide.id,
    designOptionId: activeProjection.designOption.id,
    elementId: element.id,
    frame: Object.freeze({ ...element.frame, x }),
  })
}

function imageCropPlan(activeProjection, elementId, crop) {
  if (!activeProjection?.composition || !activeProjection.designOption) return null
  const element = activeProjection.composition.elements.find((candidate) => candidate.id === elementId)
  if (!element || element.kind !== 'image') return null
  const normalized = {
    x: Number(crop.x),
    y: Number(crop.y),
    width: Number(crop.width),
    height: Number(crop.height),
  }
  if (Object.values(normalized).some((value) => !Number.isFinite(value))) return null
  if (
    normalized.x < 0
    || normalized.y < 0
    || normalized.width <= 0
    || normalized.height <= 0
    || normalized.x + normalized.width > 1
    || normalized.y + normalized.height > 1
  ) return null
  return Object.freeze({
    slideId: activeProjection.slide.id,
    designOptionId: activeProjection.designOption.id,
    elementId: element.id,
    crop: Object.freeze(normalized),
  })
}

function assetAssignmentPlan(activeProjection, assetReferenceId, newAssignmentId) {
  if (!activeProjection || !assetReferenceId) return null
  const current = activeProjection.mediaAssignments?.find((assignment) => assignment.role === 'primary')
  const mediaAssignmentId = current?.id ?? newAssignmentId
  if (!mediaAssignmentId) return null
  return Object.freeze({
    slideId: activeProjection.slide.id,
    mediaAssignmentId,
    role: 'primary',
    assetReferenceId,
  })
}

function workspaceLayoutMode({ viewportWidth: requestedViewportWidth, interfaceScale: requestedInterfaceScale }) {
  const viewportWidth = Number(requestedViewportWidth)
  const scale = Number(requestedInterfaceScale)
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new RangeError('Viewport width must be positive')
  if (!INTERFACE_SCALE_STEPS.includes(scale)) throw new RangeError('Interface Scale must use an allowed step')
  const remPixels = 16 * scale
  if (viewportWidth < 50 * remPixels) return 'single-column'
  if (viewportWidth < 88 * remPixels) return 'two-column'
  return 'four-column'
}

function workspaceTransforms({ interfaceScale: requestedInterfaceScale, artboardZoom: requestedZoom, canvas }) {
  const ui = Number(requestedInterfaceScale)
  const zoom = Number(requestedZoom)
  if (!INTERFACE_SCALE_STEPS.includes(ui)) throw new RangeError('Interface Scale must use an allowed step')
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 4) {
    throw new RangeError('Artboard zoom must be between 10% and 400%')
  }
  return Object.freeze({
    interfaceScale: ui,
    chromeRemPixels: 16 * ui,
    artboardTransform: `scale(${zoom})`,
    artboardViewport: Object.freeze({
      width: ARTBOARD_BASE_WIDTH * zoom,
      height: (ARTBOARD_BASE_WIDTH * canvas.height / canvas.width) * zoom,
    }),
    exportGeometry: Object.freeze({ width: canvas.width, height: canvas.height }),
  })
}

function richText(value) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n')
  return {
    type: 'doc',
    content: normalized.split('\n').map((text) => ({
      type: 'paragraph',
      content: text.length > 0 ? [{ type: 'text', text }] : [],
    })),
  }
}

function storyShortcut(event, dirty) {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return null
  if (event.key === 'Enter') return 'commit'
  if (event.key.toLowerCase() !== 'z' || dirty) return null
  return event.shiftKey ? 'redo' : 'undo'
}

function sequenceShortcut(event) {
  if (event.isComposing || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null
  if (event.key === 'ArrowUp') return 'up'
  if (event.key === 'ArrowDown') return 'down'
  return null
}

function slideMovePlan(story, sectionId, slideId, direction) {
  if (!story || (direction !== 'up' && direction !== 'down')) return null
  const sectionIndex = story.sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex < 0) return null
  const section = story.sections[sectionIndex]
  const slideIndex = section.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex < 0) return null
  if (direction === 'up') {
    if (slideIndex > 0) {
      return {
        slideId,
        targetSectionId: sectionId,
        afterSlideId: slideIndex > 1 ? section.slides[slideIndex - 2].id : null,
      }
    }
    const target = story.sections[sectionIndex - 1]
    if (!target) return null
    return { slideId, targetSectionId: target.id, afterSlideId: target.slides.at(-1)?.id ?? null }
  }
  if (slideIndex < section.slides.length - 1) {
    return { slideId, targetSectionId: sectionId, afterSlideId: section.slides[slideIndex + 1].id }
  }
  const target = story.sections[sectionIndex + 1]
  if (!target) return null
  return { slideId, targetSectionId: target.id, afterSlideId: null }
}

function sectionMovePlan(story, sectionId, direction) {
  if (!story || (direction !== 'up' && direction !== 'down')) return null
  const index = story.sections.findIndex((section) => section.id === sectionId)
  if (index < 0) return null
  if (direction === 'up') {
    if (index === 0) return null
    return { sectionId, afterSectionId: index > 1 ? story.sections[index - 2].id : null }
  }
  if (index === story.sections.length - 1) return null
  return { sectionId, afterSectionId: story.sections[index + 1].id }
}

function sequenceControlPlans(story, sectionId, slideId = null) {
  const plan = slideId
    ? (direction) => slideMovePlan(story, sectionId, slideId, direction)
    : (direction) => sectionMovePlan(story, sectionId, direction)
  return Object.freeze({ up: plan('up'), down: plan('down') })
}

function blockByRole(slide, role) {
  return slide?.contentBlocks?.find((block) => block.role === role) ?? null
}

function planMetadataBlock(slide) {
  return slide?.contentBlocks?.find(
    (block) => block.role === PLAN_BLOCK_ROLE || block.semanticKey === PLAN_BLOCK_KEY,
  ) ?? null
}

function defaultCopyState(block) {
  if (!block) return 'unreviewed'
  return String(block.plainText ?? '').length > 0 ? 'present' : 'unreviewed'
}

function visualStyleFromIntent(intent) {
  if (VISUAL_STYLE_IDS.includes(intent)) return intent
  if (intent === 'cover' || intent === 'statement') return 'full-bleed-overlay'
  if (intent === 'editorial-body') return 'image-text'
  return 'undecided'
}

function defaultPlanMetadata(slide) {
  const headline = blockByRole(slide, 'headline')
  const headlineText = String(headline?.plainText ?? '').trim()
  return {
    format: PLAN_FORMAT,
    version: PLAN_VERSION,
    internalTitle: headlineText.split('\n')[0] || 'Untitled Slide',
    purpose: '',
    lifecycle: 'included',
    textPresence: headlineText ? 'visible' : 'undecided',
    contentPattern: 'simple-copy',
    copyFieldStates: {
      headline: defaultCopyState(headline),
      subheadline: defaultCopyState(blockByRole(slide, 'subheadline')),
      body: defaultCopyState(blockByRole(slide, 'body')),
    },
    supportingItems: [],
    mediaSlotCount: 0,
    textHint: 'left',
  }
}

function normalizePlanMetadata(value, slide) {
  const fallback = defaultPlanMetadata(slide)
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const copyFieldStates = { ...fallback.copyFieldStates, ...(source.copyFieldStates ?? {}) }
  for (const role of ['headline', 'subheadline', 'body']) {
    if (!COPY_FIELD_STATES.includes(copyFieldStates[role])) copyFieldStates[role] = fallback.copyFieldStates[role]
  }
  return {
    format: PLAN_FORMAT,
    version: PLAN_VERSION,
    internalTitle: typeof source.internalTitle === 'string' ? source.internalTitle : fallback.internalTitle,
    purpose: typeof source.purpose === 'string' ? source.purpose : fallback.purpose,
    lifecycle: SLIDE_LIFECYCLES.includes(source.lifecycle) ? source.lifecycle : fallback.lifecycle,
    textPresence: TEXT_PRESENCE_STATES.includes(source.textPresence) ? source.textPresence : fallback.textPresence,
    contentPattern: CONTENT_PATTERN_IDS.includes(source.contentPattern) ? source.contentPattern : fallback.contentPattern,
    copyFieldStates,
    supportingItems: Array.isArray(source.supportingItems)
      ? source.supportingItems.map((item) => ({
          id: typeof item?.id === 'string' && item.id ? item.id : crypto.randomUUID(),
          title: typeof item?.title === 'string' ? item.title : '',
          caption: typeof item?.caption === 'string' ? item.caption : '',
          link: typeof item?.link === 'string' ? item.link : '',
        }))
      : [],
    mediaSlotCount: Number.isInteger(source.mediaSlotCount) && source.mediaSlotCount >= 0 ? source.mediaSlotCount : fallback.mediaSlotCount,
    textHint: ['left', 'centre', 'right', 'free'].includes(source.textHint) ? source.textHint : fallback.textHint,
  }
}

function parsePlanMetadata(slide) {
  const block = planMetadataBlock(slide)
  if (!block?.plainText) return normalizePlanMetadata(null, slide)
  try {
    const parsed = JSON.parse(block.plainText)
    if (parsed?.format !== PLAN_FORMAT || parsed?.version !== PLAN_VERSION) return normalizePlanMetadata(null, slide)
    return normalizePlanMetadata(parsed, slide)
  } catch {
    return normalizePlanMetadata(null, slide)
  }
}

function serializePlanMetadata(metadata, slide) {
  return JSON.stringify(normalizePlanMetadata(metadata, slide))
}

function planRecordForSlide(slide, section) {
  const metadata = parsePlanMetadata(slide)
  return {
    slide,
    section,
    metadata,
    visualStyle: visualStyleFromIntent(slide.intent),
    headline: blockByRole(slide, 'headline'),
    subheadline: blockByRole(slide, 'subheadline'),
    body: blockByRole(slide, 'body'),
    metadataBlock: planMetadataBlock(slide),
  }
}

function planReadiness(record) {
  if (!record) return { state: 'blocked', issues: [{ severity: 'blocker', message: 'Slide is unavailable' }] }
  if (record.metadata.lifecycle !== 'included') return { state: 'ready', issues: [] }
  const issues = []
  if (!record.metadata.internalTitle.trim()) issues.push({ severity: 'blocker', message: 'Internal title is missing' })
  if (!record.metadata.purpose.trim()) issues.push({ severity: 'blocker', message: 'Purpose is missing' })
  if (record.metadata.textPresence === 'undecided') issues.push({ severity: 'blocker', message: 'Text presence is undecided' })
  if (record.visualStyle === 'undecided') issues.push({ severity: 'blocker', message: 'Visual Style is undecided' })
  if (record.metadata.textPresence === 'visible') {
    const states = record.metadata.copyFieldStates
    if (!['headline', 'subheadline', 'body'].some((role) => states[role] === 'present')) {
      issues.push({ severity: 'blocker', message: 'Visible text is selected but no copy field is present' })
    }
    const unreviewed = ['headline', 'subheadline', 'body'].filter((role) => states[role] === 'unreviewed')
    if (unreviewed.length) issues.push({ severity: 'warning', message: `${unreviewed.length} copy field${unreviewed.length === 1 ? '' : 's'} remain unreviewed` })
  }
  if (record.metadata.contentPattern === 'repeater' && record.metadata.supportingItems.length === 0) {
    issues.push({ severity: 'blocker', message: 'Repeater has no Supporting Items' })
  }
  return {
    state: issues.some((issue) => issue.severity === 'blocker') ? 'blocked' : issues.length ? 'review' : 'ready',
    issues,
  }
}

function visualStyleLabel(value) {
  return {
    undecided: 'Undecided',
    'text-only': 'Text Only',
    'full-bleed': 'Full Bleed',
    'full-bleed-overlay': 'Full Bleed + Overlay',
    'image-text': 'Image + Text',
    diptych: 'Diptych',
    triptych: 'Triptych',
    gallery: 'Gallery',
    custom: 'Custom',
  }[value] ?? value
}

function contentPatternLabel(value) {
  return {
    'simple-copy': 'Simple Copy',
    quote: 'Quote',
    repeater: 'Repeater',
    comparison: 'Comparison',
    'gallery-captions': 'Gallery Captions',
    'no-on-slide-text': 'No On-Slide Text',
    custom: 'Custom',
  }[value] ?? value
}

const elements = {
  workbench: document.querySelector('.workbench'),
  phaseWorkspaces: document.querySelector('#phase-workspaces'),
  phaseButtons: [...document.querySelectorAll('[data-phase]')],
  phaseViews: [...document.querySelectorAll('[data-phase-view]')],
  deckTitle: document.querySelector('#deck-title'),
  renameDeck: document.querySelector('#rename-deck'),
  undo: document.querySelector('#undo'),
  redo: document.querySelector('#redo'),
  interfaceScale: document.querySelector('#interface-scale'),
  saveState: document.querySelector('#save-state'),
  sequenceList: document.querySelector('#sequence-list'),
  addSection: document.querySelector('#add-section'),
  addSlide: document.querySelector('#add-slide'),
  planSummary: document.querySelector('#plan-summary'),
  planSearch: document.querySelector('#plan-search'),
  planFilter: document.querySelector('#plan-filter'),
  deckMap: document.querySelector('#deck-map'),
  planEditorHeading: document.querySelector('#plan-editor-heading'),
  revision: document.querySelector('#revision'),
  planEmpty: document.querySelector('#plan-empty'),
  planForm: document.querySelector('#plan-form'),
  internalTitle: document.querySelector('#internal-title'),
  partSelect: document.querySelector('#part-select'),
  slidePurpose: document.querySelector('#slide-purpose'),
  slideLifecycle: document.querySelector('#slide-lifecycle'),
  textPresence: document.querySelector('#text-presence'),
  contentPattern: document.querySelector('#content-pattern'),
  slideIntent: document.querySelector('#slide-intent'),
  headlineState: document.querySelector('#headline-state'),
  headline: document.querySelector('#headline'),
  commitHeadline: document.querySelector('#commit-headline'),
  additionalContent: document.querySelector('#additional-content'),
  supportingItemsSection: document.querySelector('#supporting-items-section'),
  supportingItems: document.querySelector('#supporting-items'),
  addSupportingItem: document.querySelector('#add-supporting-item'),
  cutSlide: document.querySelector('#cut-slide'),
  savePlan: document.querySelector('#save-plan'),
  curateQueueFilters: [...document.querySelectorAll('[data-curate-queue-filter]')],
  nextCurateIssue: document.querySelector('#next-curate-issue'),
  curateSlideQueue: document.querySelector('#curate-slide-queue'),
  mediaSearch: document.querySelector('#media-search'),
  mediaRootFilter: document.querySelector('#media-root-filter'),
  mediaTypeFilter: document.querySelector('#media-type-filter'),
  mediaAvailabilityFilter: document.querySelector('#media-availability-filter'),
  mediaDecisionFilter: document.querySelector('#media-decision-filter'),
  thumbnailDensity: document.querySelector('#thumbnail-density'),
  mediaCount: document.querySelector('#media-count'),
  mediaRootStatus: document.querySelector('#media-root-status'),
  authoriseMediaRoot: document.querySelector('#authorise-media-root'),
  reconnectMediaRoot: document.querySelector('#reconnect-media-root'),
  scanMediaRoot: document.querySelector('#scan-media-root'),
  revealMediaSource: document.querySelector('#reveal-media-source'),
  focusedAssetSummary: document.querySelector('#focused-asset-summary'),
  toggleProjectPick: document.querySelector('#toggle-project-pick'),
  projectRating: document.querySelector('#project-rating'),
  projectReview: document.querySelector('#project-review'),
  previewMedia: document.querySelector('#preview-media'),
  shortlistMedia: document.querySelector('#shortlist-media'),
  assignPrimaryMedia: document.querySelector('#assign-primary-media'),
  alternateMedia: document.querySelector('#alternate-media'),
  rejectSlideMedia: document.querySelector('#reject-slide-media'),
  clearSlideMedia: document.querySelector('#clear-slide-media'),
  toggleCompareMedia: document.querySelector('#toggle-compare-media'),
  openMediaCompare: document.querySelector('#open-media-compare'),
  compareCount: document.querySelector('#compare-count'),
  mediaFocusOwner: document.querySelector('#media-focus-owner'),
  mediaScroll: document.querySelector('#media-scroll'),
  mediaCanvas: document.querySelector('#media-canvas'),
  mediaWallState: document.querySelector('#media-wall-state'),
  curateBriefHeading: document.querySelector('#curate-brief-heading'),
  curateBriefContent: document.querySelector('#curate-brief-content'),
  findMoreForm: document.querySelector('#find-more-form'),
  findMoreState: document.querySelector('#find-more-state'),
  findMorePrimaryStatus: document.querySelector('#find-more-primary-status'),
  findMoreBrief: document.querySelector('#find-more-brief'),
  saveFindMore: document.querySelector('#save-find-more'),
  primaryTray: document.querySelector('#primary-tray'),
  alternateTray: document.querySelector('#alternate-tray'),
  shortlistTray: document.querySelector('#shortlist-tray'),
  unplacedTray: document.querySelector('#unplaced-tray'),
  slotProgress: document.querySelector('#slot-progress'),
  mediaPreview: document.querySelector('#media-preview'),
  previewMediaTitle: document.querySelector('#preview-media-title'),
  previewMediaImage: document.querySelector('#preview-media-image'),
  previewCapabilityState: document.querySelector('#preview-capability-state'),
  previewMediaDetails: document.querySelector('#preview-media-details'),
  mediaCompare: document.querySelector('#media-compare'),
  compareMediaGrid: document.querySelector('#compare-media-grid'),
  mediaContextMenu: document.querySelector('#media-context-menu'),
  curateStatus: document.querySelector('#curate-status'),
  stageScroll: document.querySelector('#stage-scroll'),
  artboardShell: document.querySelector('#artboard-shell'),
  artboard: document.querySelector('#artboard'),
  artboardIntent: document.querySelector('#artboard-intent'),
  artboardHeadline: document.querySelector('#artboard-headline'),
  semanticFallback: document.querySelector('#semantic-fallback'),
  compositionLayer: document.querySelector('#composition-layer'),
  artboardZoom: document.querySelector('#artboard-zoom'),
  zoomLabel: document.querySelector('#zoom-label'),
  fitArtboard: document.querySelector('#fit-artboard'),
  patternChoice: document.querySelector('#pattern-choice'),
  patternBodyBlock: document.querySelector('#pattern-body-block'),
  applyPattern: document.querySelector('#apply-pattern'),
  visualElement: document.querySelector('#visual-element'),
  alignActions: document.querySelector('.align-actions'),
  cropControls: document.querySelector('.crop-controls'),
  cropX: document.querySelector('#crop-x'),
  cropY: document.querySelector('#crop-y'),
  cropWidth: document.querySelector('#crop-width'),
  cropHeight: document.querySelector('#crop-height'),
  applyCrop: document.querySelector('#apply-crop'),
  handoffSummary: document.querySelector('#handoff-summary'),
  handoffList: document.querySelector('#handoff-list'),
  exportPDF: document.querySelector('#export-pdf'),
}

let projection = null
let storyDocument = null
let selectedSlideId = null
let interfaceScale = 1
let artboardZoom = 0.35
let activePhase = 'plan'
let planSearch = ''
let planFilter = 'all'
let draftSupportingItems = []
let refreshGeneration = 0
let pendingWorkspaceSlideId = null

function setStatus(message) {
  elements.saveState.textContent = message
}

function setBusy(message) {
  elements.workbench.setAttribute('aria-busy', 'true')
  setStatus(message)
  elements.undo.disabled = true
  elements.redo.disabled = true
}

function setIdle() {
  elements.workbench.setAttribute('aria-busy', 'false')
  if (projection) setStatus('Durable and projected')
  else setStatus('No document session')
}

function findStoryLocation(slideId) {
  for (const section of storyDocument?.sections ?? []) {
    const slide = section.slides.find((candidate) => candidate.id === slideId)
    if (slide) return { section, slide }
  }
  return null
}

function selectedPlanRecord() {
  const location = findStoryLocation(selectedSlideId)
  return location ? planRecordForSlide(location.slide, location.section) : null
}

function renderAll() {
  elements.phaseButtons.forEach((button) => {
    const active = button.dataset.phase === activePhase
    button.setAttribute('aria-current', active ? 'page' : 'false')
  })
  elements.phaseViews.forEach((view) => {
    const active = view.dataset.phaseView === activePhase
    view.classList.toggle('is-active', active)
    view.setAttribute('aria-hidden', String(!active))
  })
  elements.deckTitle.textContent = storyDocument?.deckTitle ?? projection?.deckTitle ?? 'No Deck open'
  elements.revision.textContent = projection ? `Revision ${projection.revision}` : 'Revision —'
  elements.undo.disabled = !projection?.history?.canUndo
  elements.redo.disabled = !projection?.history?.canRedo
  elements.renameDeck.disabled = !projection
  elements.addSection.disabled = !projection
  elements.addSlide.disabled = !projection
  elements.exportPDF.disabled = !projection
  renderPlan()
  renderCurate()
  renderAssemble()
  renderHandoff()
  applyScales()
  setIdle()
}

function setPhase(phase) {
  if (!['plan', 'curate', 'assemble', 'handoff'].includes(phase)) return
  if (phase !== 'curate') closeCurateOverlays()
  activePhase = phase
  renderAll()
  elements.phaseWorkspaces.focus({ preventScroll: true })
}

async function refreshWorkspace(requestedSlideId = selectedSlideId, focus = {}) {
  const generation = ++refreshGeneration
  try {
    const nextStory = await window.deckBridge.query({ name: 'story.document', params: {} })
    if (generation !== refreshGeneration) return projection
    storyDocument = nextStory
    const orderedSlides = nextStory.sections.flatMap((section) => section.slides)
    const fallbackSlideId = orderedSlides[0]?.id ?? null
    selectedSlideId = orderedSlides.some((slide) => slide.id === requestedSlideId) ? requestedSlideId : fallbackSlideId
    if (selectedSlideId) {
      projection = await window.deckBridge.query({ name: 'slide.activeProjection', params: { slideId: selectedSlideId } })
    } else {
      projection = null
    }
    if (generation !== refreshGeneration) return projection
    renderAll()
    if (focus.slideId) elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(focus.slideId)}"]`)?.focus()
    if (focus.sectionId) elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(focus.sectionId)}"]`)?.focus()
    return projection
  } catch (error) {
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    elements.workbench.setAttribute('aria-busy', 'false')
    return null
  }
}

function renderProjection(next) {
  projection = next
  selectedSlideId = next?.slide?.id ?? selectedSlideId
  renderAll()
  void refreshWorkspace(selectedSlideId)
  return next
}

function clearProjection() {
  projection = null
  storyDocument = null
  selectedSlideId = null
  clearCurateState()
  renderAll()
}

async function executeStructural(type, payload, requestedSlideId = selectedSlideId, options = {}) {
  if (!projection) return null
  setBusy(`Writing ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: options.sourceKind ?? 'ui', label: options.sourceLabel ?? 'Phased Workbench' },
        issuedAt: new Date().toISOString(),
      },
    })
    const refreshSlideId = options.preserveCurrentSelection
      ? pendingWorkspaceSlideId ?? selectedSlideId
      : requestedSlideId
    return await refreshWorkspace(refreshSlideId, options.focus ?? {})
  } catch (error) {
    renderAll()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    return null
  }
}

async function executeBatch(operations, requestedSlideId = selectedSlideId) {
  if (!projection || operations.length === 0) return projection
  setBusy(`Writing ${operations.length} Plan change${operations.length === 1 ? '' : 's'}…`)
  try {
    for (const operation of operations) {
      const story = await window.deckBridge.query({ name: 'story.document', params: {} })
      await window.deckBridge.execute({
        command: {
          commandId: crypto.randomUUID(),
          expectedRevision: story.revision,
          type: operation.type,
          payload: operation.payload,
          source: { kind: operation.sourceKind ?? 'ui', label: operation.label ?? 'Plan Slide' },
          issuedAt: new Date().toISOString(),
        },
      })
    }
    return await refreshWorkspace(requestedSlideId)
  } catch (error) {
    await refreshWorkspace(requestedSlideId)
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    return null
  }
}

async function selectSlide(slideId) {
  if (!findStoryLocation(slideId)) return
  pendingWorkspaceSlideId = slideId
  await refreshWorkspace(slideId)
}

async function historyAction(method, restoreFocusBlockId = null) {
  if (!projection) return
  setBusy(method === 'undo' ? 'Writing undo…' : 'Writing redo…')
  try {
    await window.deckBridge[method]()
    await refreshWorkspace(selectedSlideId)
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  } catch (error) {
    renderAll()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  }
}

async function renameDeck() {
  if (!projection) return
  const title = window.prompt('Deck name', storyDocument?.deckTitle ?? projection.deckTitle)?.trim()
  if (!title || title === storyDocument?.deckTitle) return
  await executeStructural('deck.rename', { title })
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll('\n', '&#10;')
}

function summaryChip(value, label) {
  return `<span class="summary-chip"><strong>${value}</strong><span>${escapeHTML(label)}</span></span>`
}
