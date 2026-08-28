const INTERFACE_SCALE_STEPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])
const W02_PATTERN_IDS = Object.freeze(['cover', 'full-bleed-statement', 'editorial-body'])
const ARTBOARD_BASE_WIDTH = 1088

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

const elements = {
  workbench: document.querySelector('.workbench'),
  deckTitle: document.querySelector('#deck-title'),
  renameDeck: document.querySelector('#rename-deck'),
  sequenceList: document.querySelector('#sequence-list'),
  addSection: document.querySelector('#add-section'),
  addSlide: document.querySelector('#add-slide'),
  headline: document.querySelector('#headline'),
  additionalContent: document.querySelector('#additional-content'),
  addBody: document.querySelector('#add-body'),
  artboardHeadline: document.querySelector('#artboard-headline'),
  artboardIntent: document.querySelector('#artboard-intent'),
  semanticFallback: document.querySelector('#semantic-fallback'),
  compositionLayer: document.querySelector('#composition-layer'),
  revision: document.querySelector('#revision'),
  saveState: document.querySelector('#save-state'),
  binding: document.querySelector('#binding'),
  canvasPreset: document.querySelector('#canvas-preset'),
  commit: document.querySelector('#commit-headline'),
  undo: document.querySelector('#undo'),
  redo: document.querySelector('#redo'),
  interfaceScale: document.querySelector('#interface-scale'),
  artboardZoom: document.querySelector('#artboard-zoom'),
  fitArtboard: document.querySelector('#fit-artboard'),
  zoomLabel: document.querySelector('#zoom-label'),
  inspectorZoom: document.querySelector('#inspector-zoom'),
  inspectorInterface: document.querySelector('#inspector-interface'),
  slideIntent: document.querySelector('#slide-intent'),
  stageScroll: document.querySelector('#stage-scroll'),
  artboardShell: document.querySelector('#artboard-shell'),
  artboard: document.querySelector('#artboard'),
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
  assetLabel: document.querySelector('#asset-label'),
  addAssetReference: document.querySelector('#add-asset-reference'),
  assetReference: document.querySelector('#asset-reference'),
  assignPrimaryAsset: document.querySelector('#assign-primary-asset'),
}

let projection = null
let storyDocument = null
let interfaceScale = 1
let artboardZoom = 0.35
let assetCatalog = []

function richText(value) {
  const normalized = value.replace(/\r\n?/g, '\n')
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

function setBusy(label) {
  elements.workbench.setAttribute('aria-busy', 'true')
  elements.saveState.textContent = label
  elements.commit.disabled = true
  elements.undo.disabled = true
  elements.redo.disabled = true
  elements.addSection.disabled = true
  elements.addSlide.disabled = true
  elements.slideIntent.disabled = true
  elements.renameDeck.disabled = true
  elements.addBody.disabled = true
  elements.patternChoice.disabled = true
  elements.patternBodyBlock.disabled = true
  elements.applyPattern.disabled = true
  elements.visualElement.disabled = true
  elements.alignActions.querySelectorAll('button').forEach((button) => { button.disabled = true })
  elements.cropControls.disabled = true
  elements.assetLabel.disabled = true
  elements.addAssetReference.disabled = true
  elements.assetReference.disabled = true
  elements.assignPrimaryAsset.disabled = true
  elements.sequenceList.querySelectorAll('button').forEach((button) => { button.disabled = true })
  elements.sequenceList.querySelectorAll('.section-row').forEach((row) => {
    row.tabIndex = -1
    row.setAttribute('aria-disabled', 'true')
  })
  elements.additionalContent.querySelectorAll('button').forEach((button) => { button.disabled = true })
}

function compositionElementLabel(element) {
  return element.patternElementKey
    ? `${element.patternElementKey} · ${element.kind}`
    : `${element.kind} · ${element.id.slice(0, 8)}`
}

function renderComposition(next) {
  elements.compositionLayer.replaceChildren()
  const composition = next.composition
  elements.semanticFallback.hidden = Boolean(composition)
  if (!composition) return
  composition.elements.forEach((element, index) => {
    const node = document.createElement('div')
    node.className = `composition-element composition-${element.kind === 'image' ? 'image-placeholder' : element.kind}`
    node.dataset.elementId = element.id
    node.style.left = `${(element.frame.x / next.canvas.width) * 100}%`
    node.style.top = `${(element.frame.y / next.canvas.height) * 100}%`
    node.style.width = `${(element.frame.width / next.canvas.width) * 100}%`
    node.style.height = `${(element.frame.height / next.canvas.height) * 100}%`
    node.style.zIndex = String(index + 1)
    if (element.kind === 'text') {
      const content = next.contentBlocks.find((block) => block.id === element.contentBlockId)
      node.textContent = content?.plainText ?? `Missing Content Block · ${element.contentBlockId ?? 'unbound'}`
      node.setAttribute('aria-label', `${compositionElementLabel(element)} from canonical Story`)
    } else if (element.kind === 'image') {
      const assignment = next.mediaAssignments?.find((candidate) => candidate.role === element.mediaRole)
      const assetLabel = assignment?.assetReference?.label ?? 'unassigned Asset'
      const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
      node.textContent = `${element.mediaRole ?? 'Image'} · ${assetLabel}\nCrop ${Math.round(crop.x * 100)}%, ${Math.round(crop.y * 100)}% · ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`
      node.dataset.assetResolution = 'placeholder'
      node.setAttribute('aria-label', `${element.mediaRole ?? 'Image'} placeholder: ${assetLabel}`)
    } else {
      node.textContent = compositionElementLabel(element)
      node.setAttribute('aria-label', compositionElementLabel(element))
    }
    elements.compositionLayer.append(node)
  })
}

function syncVisualControls(next) {
  elements.patternChoice.disabled = false
  const previousBodyId = elements.patternBodyBlock.value
  elements.patternBodyBlock.replaceChildren()
  next.contentBlocks.filter((block) => block.role === 'body').forEach((block) => {
    const option = document.createElement('option')
    option.value = block.id
    option.textContent = block.semanticKey
    elements.patternBodyBlock.append(option)
  })
  if ([...elements.patternBodyBlock.options].some((option) => option.value === previousBodyId)) {
    elements.patternBodyBlock.value = previousBodyId
  }
  const needsBody = elements.patternChoice.value === 'editorial-body'
  elements.patternBodyBlock.disabled = !needsBody || elements.patternBodyBlock.options.length === 0
  elements.applyPattern.disabled = needsBody && elements.patternBodyBlock.options.length === 0

  const previousElementId = elements.visualElement.value
  elements.visualElement.replaceChildren()
  ;(next.composition?.elements ?? []).forEach((element) => {
    const option = document.createElement('option')
    option.value = element.id
    option.textContent = compositionElementLabel(element)
    elements.visualElement.append(option)
  })
  if ([...elements.visualElement.options].some((option) => option.value === previousElementId)) {
    elements.visualElement.value = previousElementId
  }
  const selected = next.composition?.elements.find((element) => element.id === elements.visualElement.value)
  elements.visualElement.disabled = !selected
  elements.alignActions.querySelectorAll('button').forEach((button) => { button.disabled = !selected })
  const assignment = selected?.mediaRole
    ? next.mediaAssignments?.find((candidate) => candidate.role === selected.mediaRole)
    : null
  const canCrop = selected?.kind === 'image' && Boolean(assignment)
  elements.cropControls.disabled = !canCrop
  const crop = selected?.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  elements.cropX.value = String(crop.x)
  elements.cropY.value = String(crop.y)
  elements.cropWidth.value = String(crop.width)
  elements.cropHeight.value = String(crop.height)

  elements.assetLabel.disabled = false
  elements.addAssetReference.disabled = elements.assetLabel.value.trim().length === 0
  renderAssetCatalog(assetCatalog)
}

function renderAssetCatalog(assets) {
  const priorSelection = elements.assetReference.value
  const assignedAssetId = projection?.mediaAssignments?.find(
    (assignment) => assignment.role === 'primary',
  )?.assetReference?.id
  elements.assetReference.replaceChildren()
  assets.forEach((asset) => {
    const option = document.createElement('option')
    option.value = asset.id
    option.textContent = `${asset.label} · ${asset.mediaKind}`
    elements.assetReference.append(option)
  })
  const requestedSelection = assignedAssetId ?? priorSelection
  if ([...elements.assetReference.options].some((option) => option.value === requestedSelection)) {
    elements.assetReference.value = requestedSelection
  }
  const hasAssets = Boolean(projection) && elements.assetReference.options.length > 0
  elements.assetReference.disabled = !hasAssets
  elements.assignPrimaryAsset.disabled = !hasAssets
}

async function refreshAssetCatalog() {
  try {
    const result = await window.deckBridge.query({ name: 'asset.catalog', params: {} })
    assetCatalog = result.assets ?? []
    renderAssetCatalog(assetCatalog)
  } catch {
    assetCatalog = []
    renderAssetCatalog(assetCatalog)
  }
}

function renderProjection(next, options = {}) {
  projection = next
  elements.deckTitle.textContent = next.deckTitle
  elements.headline.disabled = false
  elements.headline.value = next.headline.plainText
  renderAdditionalContent(next.contentBlocks ?? [])
  elements.artboardHeadline.textContent = next.headline.plainText
  elements.artboardIntent.textContent = next.slide.intent
  elements.slideIntent.value = next.slide.intent
  elements.revision.textContent = `Revision ${next.revision}`
  elements.binding.textContent = next.headline.semanticKey
  elements.canvasPreset.textContent = `${next.canvas.width} × ${next.canvas.height}`
  renderComposition(next)
  syncVisualControls(next)
  elements.commit.disabled = false
  elements.undo.disabled = !next.history.canUndo
  elements.redo.disabled = !next.history.canRedo
  elements.addSection.disabled = false
  elements.addSlide.disabled = false
  elements.slideIntent.disabled = false
  elements.renameDeck.disabled = false
  elements.addBody.disabled = false
  elements.saveState.textContent = 'Durable and projected'
  elements.workbench.setAttribute('aria-busy', 'false')
  applyScales()
  void refreshSequence({
    slideId: options.sequenceFocusSlideId ?? null,
    sectionId: options.sequenceFocusSectionId ?? null,
  })
  void refreshAssetCatalog()
  return next
}

function clearProjection() {
  projection = null
  storyDocument = null
  elements.deckTitle.textContent = 'No Deck open'
  elements.sequenceList.replaceChildren()
  elements.headline.value = ''
  elements.headline.disabled = true
  elements.additionalContent.replaceChildren()
  elements.compositionLayer.replaceChildren()
  elements.semanticFallback.hidden = false
  elements.artboardHeadline.textContent = 'No Deck open'
  elements.artboardIntent.textContent = '—'
  elements.revision.textContent = 'Revision —'
  elements.binding.textContent = '—'
  elements.commit.disabled = true
  elements.undo.disabled = true
  elements.redo.disabled = true
  elements.addSection.disabled = true
  elements.addSlide.disabled = true
  elements.slideIntent.disabled = true
  elements.renameDeck.disabled = true
  elements.addBody.disabled = true
  elements.patternChoice.disabled = true
  elements.patternBodyBlock.replaceChildren()
  elements.patternBodyBlock.disabled = true
  elements.applyPattern.disabled = true
  elements.visualElement.replaceChildren()
  elements.visualElement.disabled = true
  elements.alignActions.querySelectorAll('button').forEach((button) => { button.disabled = true })
  elements.cropControls.disabled = true
  elements.assetLabel.disabled = true
  elements.addAssetReference.disabled = true
  elements.assetReference.replaceChildren()
  elements.assetReference.disabled = true
  elements.assignPrimaryAsset.disabled = true
  assetCatalog = []
  elements.saveState.textContent = 'No document session'
  elements.workbench.setAttribute('aria-busy', 'false')
}

function renderAdditionalContent(blocks) {
  elements.additionalContent.replaceChildren()
  blocks.filter((block) => block.id !== projection?.headline.id).forEach((block) => {
    const field = document.createElement('label')
    field.className = 'content-field'
    const role = document.createElement('span')
    role.textContent = block.role
    const textarea = document.createElement('textarea')
    textarea.value = block.plainText
    textarea.rows = 4
    textarea.dataset.blockId = block.id
    textarea.setAttribute('aria-describedby', 'save-state')
    textarea.addEventListener('keydown', (event) => handleStoryFieldKeydown(event, block.id, textarea))
    const footer = document.createElement('footer')
    const key = document.createElement('span')
    key.textContent = block.semanticKey
    const commit = document.createElement('button')
    commit.type = 'button'
    commit.textContent = 'Commit'
    commit.addEventListener('click', () => updateContentBlock(block.id, textarea.value))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = 'Remove'
    remove.className = 'remove-content'
    remove.setAttribute('aria-label', `Remove ${block.role} Content Block`)
    remove.addEventListener('click', () => removeContentBlock(block.id))
    const actions = document.createElement('div')
    actions.append(commit, remove)
    footer.append(key, actions)
    field.append(role, textarea, footer)
    elements.additionalContent.append(field)
  })
}

function renderSequence(next) {
  storyDocument = next
  elements.sequenceList.replaceChildren()
  let slideNumber = 1
  next.sections.forEach((section) => {
    const sectionRow = document.createElement('div')
    sectionRow.className = 'section-row'
    sectionRow.tabIndex = 0
    sectionRow.dataset.sectionId = section.id
    sectionRow.setAttribute('role', 'group')
    sectionRow.setAttribute('aria-label', `${section.title} Section`)
    sectionRow.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
    sectionRow.addEventListener('keydown', (event) => moveSectionByKeyboard(event, section.id))
    const title = document.createElement('strong')
    title.textContent = section.title
    sectionRow.append(title)
    const tools = document.createElement('span')
    tools.className = 'section-tools'
    const rename = document.createElement('button')
    rename.type = 'button'
    rename.className = 'rename-section'
    rename.textContent = 'Rename'
    rename.setAttribute('aria-label', `Rename ${section.title}`)
    rename.addEventListener('click', () => renameSection(section.id, section.title))
    tools.append(rename)
    const sectionPlans = sequenceControlPlans(next, section.id)
    if (sectionPlans.up) {
      const move = document.createElement('button')
      move.type = 'button'
      move.className = 'move-sequence'
      move.textContent = '↑'
      move.dataset.direction = 'up'
      move.setAttribute('aria-label', `Move ${section.title} up`)
      move.addEventListener('click', () => moveSection(section.id, 'up'))
      tools.append(move)
    }
    if (sectionPlans.down) {
      const move = document.createElement('button')
      move.type = 'button'
      move.className = 'move-sequence'
      move.textContent = '↓'
      move.dataset.direction = 'down'
      move.setAttribute('aria-label', `Move ${section.title} down`)
      move.addEventListener('click', () => moveSection(section.id, 'down'))
      tools.append(move)
    }
    if (section.slides.length === 0 && next.sections.length > 1) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'remove-structure'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove empty Section ${section.title}`)
      remove.addEventListener('click', () => removeSection(section.id))
      tools.append(remove)
    }
    sectionRow.append(tools)
    elements.sequenceList.append(sectionRow)

    section.slides.forEach((slide) => {
      const entry = document.createElement('div')
      entry.className = 'slide-entry'
      const select = document.createElement('button')
      select.type = 'button'
      select.className = `slide-row${projection?.slide.id === slide.id ? ' selected' : ''}`
      select.dataset.slideId = slide.id
      select.setAttribute('aria-label', `Slide ${slideNumber}: ${slide.headline?.plainText || slide.intent}`)
      select.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
      if (projection?.slide.id === slide.id) select.setAttribute('aria-current', 'page')
      const number = document.createElement('span')
      number.className = 'slide-number'
      number.textContent = String(slideNumber).padStart(2, '0')
      const label = document.createElement('span')
      label.textContent = slide.headline?.plainText || slide.intent
      select.append(number, label)
      select.addEventListener('click', () => selectSlide(slide.id))
      select.addEventListener('keydown', (event) => moveSlideByKeyboard(event, section.id, slide.id))
      entry.append(select)
      const slideTools = document.createElement('span')
      slideTools.className = 'slide-tools'
      const slidePlans = sequenceControlPlans(next, section.id, slide.id)
      if (slidePlans.up) {
        const move = document.createElement('button')
        move.type = 'button'
        move.className = 'move-sequence'
        move.textContent = '↑'
        move.dataset.direction = 'up'
        move.setAttribute('aria-label', `Move Slide ${slideNumber} up`)
        move.addEventListener('click', () => moveSlide(section.id, slide.id, 'up'))
        slideTools.append(move)
      }
      if (slidePlans.down) {
        const move = document.createElement('button')
        move.type = 'button'
        move.className = 'move-sequence'
        move.textContent = '↓'
        move.dataset.direction = 'down'
        move.setAttribute('aria-label', `Move Slide ${slideNumber} down`)
        move.addEventListener('click', () => moveSlide(section.id, slide.id, 'down'))
        slideTools.append(move)
      }
      const totalSlides = next.sections.reduce((sum, candidate) => sum + candidate.slides.length, 0)
      if (totalSlides > 1) {
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'remove-structure'
        remove.textContent = '×'
        remove.setAttribute('aria-label', `Remove Slide ${slideNumber}`)
        remove.addEventListener('click', () => removeSlide(slide.id))
        slideTools.append(remove)
      }
      if (slideTools.childElementCount > 0) entry.append(slideTools)
      elements.sequenceList.append(entry)
      slideNumber += 1
    })
  })
}

async function refreshSequence(focus = {}) {
  try {
    renderSequence(await window.deckBridge.query({ name: 'story.document', params: {} }))
    const target = focus.slideId
      ? elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(focus.slideId)}"]`)
      : elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(focus.sectionId ?? '')}"]`)
    target?.focus()
  } catch {
    // No Deck is open yet; the native shell owns empty-document state.
  }
}

async function executeStructural(type, payload, selectedSlideId = projection?.slide.id, options = {}) {
  if (!projection) return
  setBusy(`Validating ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: options.sourceKind ?? 'ui', label: options.sourceLabel ?? 'Story document' },
        issuedAt: new Date().toISOString(),
      },
    })
    const next = await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: selectedSlideId ? { slideId: selectedSlideId } : {},
    })
    return renderProjection(next, {
      sequenceFocusSlideId: options.sequenceFocusSlideId,
      sequenceFocusSectionId: options.sequenceFocusSectionId,
    })
  } catch (error) {
    renderProjection(projection)
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    return null
  }
}

async function applySelectedPattern() {
  if (!projection) return
  const payload = patternApplyPlan(
    projection,
    elements.patternChoice.value,
    crypto.randomUUID(),
    elements.patternBodyBlock.value || null,
  )
  if (!payload) {
    elements.saveState.textContent = 'InvalidCommand: Select the canonical body Content Block for Editorial Body'
    return
  }
  await executeStructural('designOption.applyPattern', payload, projection.slide.id, {
    sourceLabel: 'Apply authored Pattern',
  })
}

async function alignSelectedElement(alignment) {
  if (!projection) return
  const payload = elementAlignPlan(projection, elements.visualElement.value, alignment)
  if (!payload) return
  await executeStructural('element.frame.update', payload, projection.slide.id, {
    sourceLabel: `Align Element ${alignment}`,
  })
}

async function applySelectedCrop() {
  if (!projection) return
  const payload = imageCropPlan(projection, elements.visualElement.value, {
    x: elements.cropX.value,
    y: elements.cropY.value,
    width: elements.cropWidth.value,
    height: elements.cropHeight.value,
  })
  if (!payload) {
    elements.saveState.textContent = 'InvalidCommand: Crop must stay inside normalized source bounds'
    return
  }
  await executeStructural('element.crop.update', payload, projection.slide.id, {
    sourceLabel: 'Adjust Image crop',
  })
}

async function addNeutralAssetReference() {
  if (!projection) return
  const label = elements.assetLabel.value.trim()
  if (!label) return
  const result = await executeStructural('asset.reference.add', {
    assetReferenceId: crypto.randomUUID(),
    label,
    mediaKind: 'image',
  }, projection.slide.id, { sourceLabel: 'Add neutral Asset Reference' })
  if (result) {
    elements.assetLabel.value = ''
    elements.addAssetReference.disabled = true
  }
}

async function assignPrimaryAsset() {
  if (!projection) return
  const payload = assetAssignmentPlan(
    projection,
    elements.assetReference.value,
    crypto.randomUUID(),
  )
  if (!payload) return
  await executeStructural('asset.assign', payload, projection.slide.id, {
    sourceLabel: 'Assign Primary Asset',
  })
}

async function selectSlide(slideId) {
  try {
    renderProjection(await window.deckBridge.query({ name: 'slide.activeProjection', params: { slideId } }))
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
}

async function addSection() {
  if (!storyDocument) return
  await executeStructural('section.add', {
    sectionId: crypto.randomUUID(),
    title: `Section ${storyDocument.sections.length + 1}`,
    afterSectionId: storyDocument.sections.at(-1)?.id ?? null,
  })
}

async function addSlide() {
  if (!storyDocument || !projection) return
  const section = storyDocument.sections.find((candidate) => candidate.id === projection.section.id)
  if (!section) return
  const slideId = crypto.randomUUID()
  await executeStructural('slide.add', {
    sectionId: section.id,
    slideId,
    blockId: crypto.randomUUID(),
    intent: 'statement',
    headline: richText('Untitled Story'),
    afterSlideId: section.slides.at(-1)?.id ?? null,
  }, slideId)
}

async function moveSection(sectionId, direction) {
  if (!storyDocument) return
  const payload = sectionMovePlan(storyDocument, sectionId, direction)
  if (!payload) return
  await executeStructural('section.move', payload, projection?.slide.id, {
    sequenceFocusSectionId: sectionId,
  })
}

function moveSectionByKeyboard(event, sectionId) {
  if (event.target !== event.currentTarget) return
  if (event.currentTarget.getAttribute('aria-disabled') === 'true') return
  const direction = sequenceShortcut(event)
  if (!direction) return
  const payload = sectionMovePlan(storyDocument, sectionId, direction)
  if (!payload) return
  event.preventDefault()
  void executeStructural('section.move', payload, projection?.slide.id, {
    sourceKind: 'keyboard',
    sequenceFocusSectionId: sectionId,
  })
}

async function renameSection(sectionId, currentTitle) {
  const title = window.prompt('Section name', currentTitle)?.trim()
  if (!title || title === currentTitle) return
  await executeStructural('section.rename', { sectionId, title })
}

async function removeSection(sectionId) {
  if (!storyDocument || !projection) return
  await executeStructural('section.remove', { sectionId }, projection.slide.id)
}

async function moveSlide(sectionId, slideId, direction) {
  if (!storyDocument) return
  const payload = slideMovePlan(storyDocument, sectionId, slideId, direction)
  if (!payload) return
  await executeStructural('slide.move', payload, projection?.slide.id, {
    sequenceFocusSlideId: slideId,
  })
}

function moveSlideByKeyboard(event, sectionId, slideId) {
  const direction = sequenceShortcut(event)
  if (!direction) return
  const payload = slideMovePlan(storyDocument, sectionId, slideId, direction)
  if (!payload) return
  event.preventDefault()
  void executeStructural('slide.move', payload, slideId, {
    sourceKind: 'keyboard',
    sequenceFocusSlideId: slideId,
  })
}

async function removeSlide(slideId) {
  if (!storyDocument || !projection) return
  const orderedSlides = storyDocument.sections.flatMap((section) => section.slides)
  const removedIndex = orderedSlides.findIndex((slide) => slide.id === slideId)
  const remainingSlides = orderedSlides.filter((slide) => slide.id !== slideId)
  if (removedIndex < 0 || remainingSlides.length === 0) return
  const selectedSlideId = projection.slide.id === slideId
    ? remainingSlides[Math.min(removedIndex, remainingSlides.length - 1)].id
    : projection.slide.id
  await executeStructural('slide.remove', { slideId }, selectedSlideId)
}

function applyScales() {
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const transforms = workspaceTransforms({ interfaceScale, artboardZoom, canvas })
  document.documentElement.style.setProperty('--interface-scale', String(transforms.interfaceScale))
  document.documentElement.style.setProperty('--artboard-zoom', String(artboardZoom))
  elements.artboardShell.style.width = `${transforms.artboardViewport.width}px`
  elements.artboardShell.style.height = `${transforms.artboardViewport.height}px`
  document.documentElement.dataset.workspaceLayout = workspaceLayoutMode({
    viewportWidth: window.innerWidth,
    interfaceScale,
  })
  elements.interfaceScale.value = String(interfaceScale)
  elements.artboardZoom.value = String(artboardZoom)
  const zoomPercent = `${Math.round(artboardZoom * 100)}%`
  elements.zoomLabel.textContent = zoomPercent
  elements.inspectorZoom.textContent = zoomPercent
  elements.inspectorInterface.textContent = `${Math.round(interfaceScale * 100)}%`
}

async function setArtboardZoom(requested) {
  try {
    const result = await window.deckBridge.setArtboardZoom({ value: requested })
    artboardZoom = result.artboardZoom
    applyScales()
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
}

function fittedArtboardZoom() {
  const style = getComputedStyle(elements.stageScroll)
  const availableWidth = elements.stageScroll.clientWidth
    - Number.parseFloat(style.paddingLeft)
    - Number.parseFloat(style.paddingRight)
  const availableHeight = elements.stageScroll.clientHeight
    - Number.parseFloat(style.paddingTop)
    - Number.parseFloat(style.paddingBottom)
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const baseHeight = ARTBOARD_BASE_WIDTH * canvas.height / canvas.width
  const raw = Math.min(availableWidth / ARTBOARD_BASE_WIDTH, availableHeight / baseHeight)
  const step = Number(elements.artboardZoom.step)
  const minimum = Number(elements.artboardZoom.min)
  const maximum = Number(elements.artboardZoom.max)
  return Math.min(maximum, Math.max(minimum, Math.floor(raw / step) * step))
}

async function commitHeadline() {
  if (!projection) return
  await updateContentBlock(projection.headline.id, elements.headline.value)
}

function storyField(blockId) {
  if (projection?.headline.id === blockId) return elements.headline
  return [...elements.additionalContent.querySelectorAll('textarea')]
    .find((textarea) => textarea.dataset.blockId === blockId)
}

function projectedPlainText(blockId) {
  return projection?.contentBlocks.find((block) => block.id === blockId)?.plainText
}

function restoreStoryFocus(blockId) {
  const field = storyField(blockId)
  if (!field) return false
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
  return document.activeElement === field
}

async function updateContentBlock(blockId, value, options = {}) {
  if (!projection) return
  const { restoreFocus = false, sourceKind = 'ui' } = options
  const selectedSlideId = projection.slide.id
  setBusy('Validating and writing journal…')
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type: 'content.update',
        payload: {
          slideId: projection.slide.id,
          blockId,
          value: richText(value),
        },
        source: { kind: sourceKind, label: 'Story content' },
        issuedAt: new Date().toISOString(),
      },
    })
    renderProjection(await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: { slideId: selectedSlideId },
    }))
    if (restoreFocus) restoreStoryFocus(blockId)
  } catch (error) {
    renderProjection(projection)
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    if (restoreFocus) restoreStoryFocus(blockId)
  }
}

function handleStoryFieldKeydown(event, blockId, field) {
  const action = storyShortcut(event, field.value !== projectedPlainText(blockId))
  if (!action) return
  event.preventDefault()
  if (action === 'commit') {
    void updateContentBlock(blockId, field.value, { restoreFocus: true, sourceKind: 'keyboard' })
  } else {
    void historyAction(action, blockId)
  }
}

async function renameDeck() {
  if (!projection) return
  const title = window.prompt('Deck name', projection.deckTitle)?.trim()
  if (!title || title === projection.deckTitle) return
  await executeStructural('deck.rename', { title })
}

async function addBody() {
  if (!projection) return
  const blockId = crypto.randomUUID()
  await executeStructural('content.add', {
    slideId: projection.slide.id,
    blockId,
    semanticKey: `story.body.${blockId}`,
    role: 'body',
    value: richText('New Story body'),
    afterBlockId: projection.contentBlocks.at(-1)?.id ?? null,
  }, projection.slide.id)
}

async function removeContentBlock(blockId) {
  if (!projection) return
  await executeStructural('content.remove', {
    slideId: projection.slide.id,
    blockId,
  }, projection.slide.id)
}

async function historyAction(method, restoreFocusBlockId = null) {
  if (!projection) return
  const selectedSlideId = projection.slide.id
  setBusy(method === 'undo' ? 'Writing undo…' : 'Writing redo…')
  try {
    const result = await window.deckBridge[method]()
    let next = result.projection
    try {
      next = await window.deckBridge.query({
        name: 'slide.activeProjection',
        params: { slideId: selectedSlideId },
      })
    } catch {
      // The history operation may have removed the selected Slide; use the host fallback.
    }
    renderProjection(next)
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  } catch (error) {
    renderProjection(projection)
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  }
}

elements.commit.addEventListener('click', commitHeadline)
elements.renameDeck.addEventListener('click', renameDeck)
elements.addBody.addEventListener('click', addBody)
elements.addSection.addEventListener('click', addSection)
elements.addSlide.addEventListener('click', addSlide)
elements.headline.addEventListener('keydown', (event) => {
  if (!projection) return
  handleStoryFieldKeydown(event, projection.headline.id, elements.headline)
})
elements.undo.addEventListener('click', () => historyAction('undo'))
elements.redo.addEventListener('click', () => historyAction('redo'))
elements.patternChoice.addEventListener('change', () => {
  if (projection) syncVisualControls(projection)
})
elements.applyPattern.addEventListener('click', applySelectedPattern)
elements.visualElement.addEventListener('change', () => {
  if (projection) syncVisualControls(projection)
})
elements.alignActions.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', () => alignSelectedElement(button.dataset.align))
})
elements.applyCrop.addEventListener('click', applySelectedCrop)
elements.assetLabel.addEventListener('input', () => {
  elements.addAssetReference.disabled = !projection || elements.assetLabel.value.trim().length === 0
})
elements.addAssetReference.addEventListener('click', addNeutralAssetReference)
elements.assignPrimaryAsset.addEventListener('click', assignPrimaryAsset)
elements.interfaceScale.addEventListener('change', async () => {
  const requested = Number(elements.interfaceScale.value)
  try {
    const result = await window.deckBridge.setInterfaceScale({ value: requested })
    interfaceScale = result.interfaceScale
    applyScales()
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
})
elements.artboardZoom.addEventListener('input', () => setArtboardZoom(Number(elements.artboardZoom.value)))
elements.fitArtboard.addEventListener('click', () => setArtboardZoom(fittedArtboardZoom()))
elements.slideIntent.addEventListener('change', async () => {
  if (!projection) return
  await executeStructural('slide.intent.set', {
    slideId: projection.slide.id,
    intent: elements.slideIntent.value,
  }, projection.slide.id)
})
window.addEventListener('resize', applyScales)

async function boot() {
  try {
    const preferences = await window.deckBridge.getPreferences()
    interfaceScale = preferences.interfaceScale
    artboardZoom = preferences.artboardZoom
    applyScales()
    const next = await window.deckBridge.query({ name: 'slide.activeProjection', params: {} })
    renderProjection(next)
  } catch {
    applyScales()
  }
}

window.deckWorkbench = Object.freeze({
  renderProjection,
  clearProjection,
  exportFrame() {
    const rect = elements.artboard.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  },
  async tracerEditHeadline(text) {
    elements.headline.value = text
    await commitHeadline()
    return projection
  },
  projection() {
    return projection
  },
})

boot()
