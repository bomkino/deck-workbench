const { fixture, workflowModel } = globalThis.WB_DEPS
const {
  CONTENT_PATTERNS,
  TYPE_SCALE_TOKENS,
  VISUAL_STYLE_DEFINITIONS,
  assemblyIssues,
  copyField,
  copyFieldText,
  createPitchGrid,
  curateIssues,
  gradientStopsForFeather,
  handoffIssues,
  moveIncludedSlide,
  planIssues,
  primarySlotKeys,
  requiredMediaSlots,
  slideReadiness,
  snapValue,
  transitionMediaDecision,
} = workflowModel

const STORE_KEY = 'pitchdog.workbench.phased-tracer.v1'
const MEDIA_COUNT = 2400
const pitchGrid = createPitchGrid()
const typeScales = {
  XXS: { headline: 56, subheadline: 30, body: 20 },
  XS: { headline: 72, subheadline: 38, body: 24 },
  S: { headline: 96, subheadline: 48, body: 28 },
  M: { headline: 128, subheadline: 60, body: 32 },
  L: { headline: 160, subheadline: 76, body: 38 },
  XL: { headline: 200, subheadline: 96, body: 46 },
  XXL: { headline: 248, subheadline: 120, body: 56 },
}

const gradientPresets = {
  left: { label: 'Fade Left', start: { x: 0.02, y: 0.5 }, end: { x: 0.74, y: 0.5 }, feather: 0.68, opacity: 0.84 },
  right: { label: 'Fade Right', start: { x: 0.98, y: 0.5 }, end: { x: 0.26, y: 0.5 }, feather: 0.68, opacity: 0.84 },
  bottom: { label: 'Fade Bottom', start: { x: 0.5, y: 0.98 }, end: { x: 0.5, y: 0.25 }, feather: 0.72, opacity: 0.82 },
  top: { label: 'Fade Top', start: { x: 0.5, y: 0.02 }, end: { x: 0.5, y: 0.75 }, feather: 0.72, opacity: 0.82 },
  'bottom-left': { label: 'Protect Bottom Left', start: { x: 0.02, y: 0.96 }, end: { x: 0.78, y: 0.22 }, feather: 0.78, opacity: 0.88 },
  'bottom-right': { label: 'Protect Bottom Right', start: { x: 0.98, y: 0.96 }, end: { x: 0.22, y: 0.22 }, feather: 0.78, opacity: 0.88 },
  wash: { label: 'Black Wash', start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 }, feather: 1, opacity: 0.44 },
  vignette: { label: 'Soft Vignette', type: 'radial', start: { x: 0.5, y: 0.5 }, end: { x: 0.98, y: 0.5 }, feather: 0.72, opacity: 0.82, reverse: true },
  none: { label: 'None', enabled: false, start: { x: 0, y: 0.5 }, end: { x: 0.5, y: 0.5 }, feather: 0.5, opacity: 0 },
}

const conversionPrompt = `Convert the supplied pitch-deck writing into the exact Workbench Markdown format shown below.

Hard rules:
1. Do not rewrite, improve, summarise, shorten, expand or invent copy.
2. Preserve the supplied Slide order.
3. Preserve paragraph breaks.
4. Use only Headline, Subheadline and Body for visible Slide copy.
5. Leave a field empty when the source does not contain it.
6. Group Slides into Parts only when the source provides or strongly implies a grouping.
7. Add a concise Internal title and a clear Purpose explaining what each Slide accomplishes.
8. Do not invent a visual concept.
9. Set Style to undecided unless the source explicitly specifies one.
10. Preserve Markdown links.
11. Return valid Workbench Markdown only.

FORMAT:
# Deck
Title: [Project title]
Version: [Version]
Canvas: 2576x1080

## Part: [Part name]

### Slide
Internal title: [Internal title]
Purpose: [Purpose]
Style: undecided
Text presence: visible
Content pattern: simple-copy

#### Headline
[Exact headline]

#### Subheadline
[Exact subheadline]

#### Body
[Exact body copy]`

const mediaAssets = createMediaAssets(MEDIA_COUNT)
let state = loadState()
let history = []
let future = []
let planPartFilter = 'all'
let planStatusFilter = 'all'
let planSearch = ''
let queueFilter = 'all'
let handoffFilter = 'all'
let contextAssetId = null
let editingSlideId = null
let pendingImport = null
let toastTimer = null
let mediaResizeObserver = null
let virtualMedia = []
let dragState = null
let rangeSnapshots = new Map()

ensureStateShape()

const elements = {
  appShell: document.querySelector('#app-shell'),
  phaseRoot: document.querySelector('#phase-root'),
  projectTitle: document.querySelector('#project-title'),
  projectVersion: document.querySelector('#project-version'),
  phaseButtons: [...document.querySelectorAll('.phase-button')],
  phaseViews: [...document.querySelectorAll('.phase-view')],
  saveState: document.querySelector('#save-state'),
  undo: document.querySelector('#undo-button'),
  redo: document.querySelector('#redo-button'),
  reset: document.querySelector('#reset-prototype'),
  partsList: document.querySelector('#parts-list'),
  showAllParts: document.querySelector('#show-all-parts'),
  planSummary: document.querySelector('#plan-summary'),
  planSearch: document.querySelector('#plan-search'),
  planStatusFilter: document.querySelector('#plan-status-filter'),
  deckMap: document.querySelector('#deck-map'),
  copyConversionPrompt: document.querySelector('#copy-conversion-prompt'),
  openImport: document.querySelector('#open-import'),
  planEditor: document.querySelector('#plan-editor'),
  planEditorTitle: document.querySelector('#plan-editor-title'),
  editInternalTitle: document.querySelector('#edit-internal-title'),
  editPart: document.querySelector('#edit-part'),
  editPurpose: document.querySelector('#edit-purpose'),
  editLifecycle: document.querySelector('#edit-lifecycle'),
  editTextPresence: document.querySelector('#edit-text-presence'),
  editContentPattern: document.querySelector('#edit-content-pattern'),
  editVisualStyle: document.querySelector('#edit-visual-style'),
  saveSlideEdit: document.querySelector('#save-slide-edit'),
  supportingItemsEditor: document.querySelector('#supporting-items-editor'),
  importDialog: document.querySelector('#import-dialog'),
  importMarkdown: document.querySelector('#import-markdown'),
  importPreview: document.querySelector('#import-preview'),
  previewImport: document.querySelector('#preview-import'),
  applyImport: document.querySelector('#apply-import'),
  curateSlideList: document.querySelector('#curate-slide-list'),
  queueFilterButtons: [...document.querySelectorAll('[data-queue-filter]')],
  nextMediaIssue: document.querySelector('#next-media-issue'),
  mediaSearch: document.querySelector('#media-search'),
  folderFilter: document.querySelector('#folder-filter'),
  typeFilter: document.querySelector('#type-filter'),
  mediaStateFilter: document.querySelector('#media-state-filter'),
  thumbnailDensity: document.querySelector('#thumbnail-density'),
  mediaCount: document.querySelector('#media-count'),
  mediaScroll: document.querySelector('#media-scroll'),
  mediaCanvas: document.querySelector('#media-canvas'),
  slideBriefContent: document.querySelector('#slide-brief-content'),
  slotProgress: document.querySelector('#slot-progress'),
  primaryTray: document.querySelector('#primary-tray'),
  alternateTray: document.querySelector('#alternate-tray'),
  shortlistTray: document.querySelector('#shortlist-tray'),
  mediaPreview: document.querySelector('#media-preview'),
  previewMediaTitle: document.querySelector('#preview-media-title'),
  previewMediaImage: document.querySelector('#preview-media-image'),
  previewMediaActions: document.querySelector('#preview-media-actions'),
  contextMenu: document.querySelector('#media-context-menu'),
  assemblySlideList: document.querySelector('#assembly-slide-list'),
  assemblyToolbarTools: [...document.querySelectorAll('[data-tool]')],
  toggleGrid: document.querySelector('#toggle-grid'),
  toggleSnap: document.querySelector('#toggle-snap'),
  toggleGuides: document.querySelector('#toggle-guides'),
  toggleCleanPreview: document.querySelector('#toggle-clean-preview'),
  zoomOut: document.querySelector('#zoom-out'),
  zoomIn: document.querySelector('#zoom-in'),
  fitArtboard: document.querySelector('#fit-artboard'),
  zoomLabel: document.querySelector('#zoom-label'),
  stageViewport: document.querySelector('#stage-viewport'),
  stagePan: document.querySelector('#stage-pan'),
  artboard: document.querySelector('#artboard'),
  imageLayer: document.querySelector('#image-layer'),
  gradientLayer: document.querySelector('#gradient-layer'),
  textStack: document.querySelector('#text-stack'),
  textHeadline: document.querySelector('#text-headline'),
  textSubheadline: document.querySelector('#text-subheadline'),
  textBody: document.querySelector('#text-body'),
  textResizeHandle: document.querySelector('#text-resize-handle'),
  pitchGrid: document.querySelector('#pitch-grid'),
  interactionOverlay: document.querySelector('#interaction-overlay'),
  slideAnnotations: document.querySelector('#slide-annotations'),
  assemblyTitle: document.querySelector('#assembly-title'),
  assemblyPurpose: document.querySelector('#assembly-purpose'),
  selectionSummary: document.querySelector('#selection-summary'),
  typeScaleTokens: document.querySelector('#type-scale-tokens'),
  bodyColumns: document.querySelector('#body-columns'),
  columnGap: document.querySelector('#column-gap'),
  resetText: document.querySelector('#reset-text'),
  imageScale: document.querySelector('#image-scale'),
  centreImage: document.querySelector('#centre-image'),
  resetImage: document.querySelector('#reset-image'),
  sourceTreatment: document.querySelector('#source-treatment'),
  demotePrimaryShortlist: document.querySelector('#demote-primary-shortlist'),
  demotePrimaryAlternate: document.querySelector('#demote-primary-alternate'),
  gradientPresets: document.querySelector('#gradient-presets'),
  gradientFeather: document.querySelector('#gradient-feather'),
  gradientOpacity: document.querySelector('#gradient-opacity'),
  gradientEnabled: document.querySelector('#gradient-enabled'),
  designerNotes: document.querySelector('#designer-notes'),
  findMoreState: document.querySelector('#find-more-state'),
  findMoreBrief: document.querySelector('#find-more-brief'),
  assemblyPrimaryTray: document.querySelector('#assembly-primary-tray'),
  assemblyAlternateTray: document.querySelector('#assembly-alternate-tray'),
  assemblyShortlistTray: document.querySelector('#assembly-shortlist-tray'),
  projectPicksTray: document.querySelector('#project-picks-tray'),
  handoffFilterButtons: [...document.querySelectorAll('[data-handoff-filter]')],
  handoffSummary: document.querySelector('#handoff-summary'),
  handoffContactSheet: document.querySelector('#handoff-contact-sheet'),
  issueList: document.querySelector('#issue-list'),
  downloadHandoffJson: document.querySelector('#download-handoff-json'),
  downloadCopyMarkdown: document.querySelector('#download-copy-markdown'),
  toast: document.querySelector('#toast'),
}
