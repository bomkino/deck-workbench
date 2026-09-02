let pendingArtboardZoomFrame = null
let pendingArtboardZoom = artboardZoom
let persistedArtboardZoom = artboardZoom
let artboardZoomGeneration = 0
let assemblyAssetLoadGeneration = 0
let assemblyAssetLoadKey = ''
let assemblyAssetLoadPromise = null
let assemblyAssetRenditions = new Map()
let assemblyCandidateLoadGeneration = 0
let assemblyCandidateLoadKey = ''
let assemblyCandidateAssets = new Map()
let assemblyRailLoadGeneration = 0
let assemblyRailLoadKey = ''
let assemblyRailPrimaryBySlide = new Map()
let assemblyRailAssets = new Map()
let assemblyCreationQueue = Promise.resolve(null)
const assemblyCreationPromises = new Map()
let assemblyInteractionPending = false

function finishAssemblyInteraction() {
  assemblyInteractionPending = false
  if (activePhase === 'assemble') renderAssemble()
}

const GRADIENT_DIRECTIONS = Object.freeze({
  right: Object.freeze({ start: Object.freeze({ x: 0, y: 0.5 }), end: Object.freeze({ x: 1, y: 0.5 }) }),
  'down-right': Object.freeze({ start: Object.freeze({ x: 0, y: 0 }), end: Object.freeze({ x: 1, y: 1 }) }),
  down: Object.freeze({ start: Object.freeze({ x: 0.5, y: 0 }), end: Object.freeze({ x: 0.5, y: 1 }) }),
  'down-left': Object.freeze({ start: Object.freeze({ x: 1, y: 0 }), end: Object.freeze({ x: 0, y: 1 }) }),
  left: Object.freeze({ start: Object.freeze({ x: 1, y: 0.5 }), end: Object.freeze({ x: 0, y: 0.5 }) }),
  'up-left': Object.freeze({ start: Object.freeze({ x: 1, y: 1 }), end: Object.freeze({ x: 0, y: 0 }) }),
  up: Object.freeze({ start: Object.freeze({ x: 0.5, y: 1 }), end: Object.freeze({ x: 0.5, y: 0 }) }),
  'up-right': Object.freeze({ start: Object.freeze({ x: 0, y: 1 }), end: Object.freeze({ x: 1, y: 0 }) }),
})

function bindVisualEvents() {
  elements.canvasPreset.addEventListener('change', () => {
    elements.applyCanvas.disabled = !projection || elements.canvasPreset.value === projection.canvas.id
  })
  elements.applyCanvas.addEventListener('click', applySelectedCanvasPreset)
  elements.visualElement.addEventListener('change', () => {
    if (projection) {
      syncVisualControls(projection)
      syncCompositionSelection()
    }
  })
  elements.alignActions.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => alignSelectedElement(button.dataset.align))
  })
  elements.textSizeActions.forEach((button) => {
    button.addEventListener('click', () => void updateSelectedTextSize(button.dataset.textSize))
  })
  elements.imageFitActions.forEach((button) => {
    button.addEventListener('click', () => void updateSelectedImageFit(button.dataset.imageFit))
  })
  elements.imageSwapCandidates.addEventListener('click', (event) => {
    const target = event.target.closest('[data-assembly-swap-asset-id]')
    if (target && !target.disabled) void swapSelectedAssemblyImage(target.dataset.assemblySwapAssetId)
  })
  elements.editGradient.addEventListener('click', selectAssemblyGradient)
  elements.gradientDirectionActions.forEach((button) => {
    button.addEventListener('click', () => void updateSelectedGradientDirection(button.dataset.gradientDirection))
  })
  elements.gradientStrength.addEventListener('input', () => {
    elements.gradientStrengthOutput.value = `${elements.gradientStrength.value}%`
  })
  elements.gradientStrength.addEventListener('change', () => void updateSelectedGradientPatch({
    opacity: Number(elements.gradientStrength.value) / 100,
  }, 'Adjust Gradient strength'))
  elements.gradientStartColor.addEventListener('change', () => void updateSelectedGradientColours())
  elements.gradientEndColor.addEventListener('change', () => void updateSelectedGradientColours())
  elements.applyCrop.addEventListener('click', applySelectedCrop)
  elements.artboardZoom.addEventListener('input', () => previewArtboardZoom(Number(elements.artboardZoom.value)))
  elements.artboardZoom.addEventListener('change', () => void setArtboardZoom(Number(elements.artboardZoom.value)))
  elements.fitArtboard.addEventListener('click', () => setArtboardZoom(fittedArtboardZoom()))
  elements.assemblySlideRail.addEventListener('click', (event) => {
    const target = event.target.closest('[data-assembly-slide-id]')
    if (target?.dataset.assemblySlideId) void selectSlide(target.dataset.assemblySlideId)
  })
  elements.editAssemblyPlan.addEventListener('click', () => void enterPhaseForSlide('plan'))
  elements.rebuildAssembly.addEventListener('click', () => void rebuildAssemblyFromPlan())
  elements.assemblyBack.addEventListener('click', () => void enterPhaseForSlide('curate'))
  elements.assemblyNext.addEventListener('click', () => void enterPhaseForSlide('handoff'))
  elements.stageScroll.addEventListener('pointerdown', beginStagePan)
  document.addEventListener('keydown', handleAssemblyKeydown)
}

function renderAssemble() {
  renderAssemblySlideRail()
  if (!projection) {
    elements.artboardHeadline.textContent = 'No Deck open'
    elements.artboardIntent.textContent = '—'
    elements.compositionLayer.replaceChildren()
    elements.assemblyOverflowState.hidden = true
    elements.assemblyOverflowState.textContent = ''
    elements.semanticFallback.hidden = false
    elements.assemblyLayoutSource.textContent = 'Open a Deck to assemble its Slides.'
    elements.rebuildAssembly.hidden = true
    syncVisualControls(null)
    applyScales()
    return
  }
  const visualStyle = visualStyleFromIntent(projection.slide.intent)
  elements.rebuildAssembly.hidden = !projection.composition || visualStyle === 'undecided'
  elements.rebuildAssembly.disabled = assemblyInteractionPending
  elements.artboardHeadline.textContent = projection.headline.plainText
  elements.artboardIntent.textContent = visualStyleLabel(visualStyle)
  if (visualStyle === 'undecided') {
    elements.assemblyLayoutSource.textContent = 'Choose and save a Visual Style in 01 Plan to create this Assembly.'
  } else if (projection.designOption?.planReviewRequired) {
    const labels = {
      'visual-style-changed': 'Visual Style',
      'content-pattern-changed': 'Content Pattern',
      'curate-slots-changed': 'media slots',
      'content-bindings-changed': 'copy fields',
      'canvas-changed': 'Canvas',
    }
    const changes = projection.designOption.planReviewReasons.map((reason) => labels[reason] ?? reason).join(', ')
    elements.assemblyLayoutSource.textContent = `Assembly preserved. 01 Plan changed (${changes}); review it here or rebuild from the current Plan. Rebuild is undoable.`
  } else if (projection.designOption?.source === 'plan') {
    elements.assemblyLayoutSource.textContent = `Started from ${visualStyleLabel(visualStyle)} in 01 Plan. Direct Assembly edits stay here.`
  } else if (projection.composition) {
    elements.assemblyLayoutSource.textContent = 'This Assembly is authored here and will not be replaced by later Plan changes.'
  } else {
    elements.assemblyLayoutSource.textContent = `Creating a ${visualStyleLabel(visualStyle)} starting layout from 01 Plan…`
  }
  renderComposition(projection)
  syncVisualControls(projection)
  syncCompositionSelection()
  applyScales()
  void hydrateAssemblyAssets(projection)
  void hydrateAssemblySwapCandidates(projection)
  void hydrateAssemblyRailPreviews(projection)
  if (!projection.composition && visualStyle !== 'undecided') void ensureAssemblyFromPlan(projection)
}

function renderAssemblySlideRail() {
  elements.assemblySlideRail.replaceChildren()
  let slideNumber = 0
  for (const section of storyDocument?.sections ?? []) {
    const sectionLabel = document.createElement('p')
    sectionLabel.className = 'assembly-rail-part'
    sectionLabel.textContent = section.title
    elements.assemblySlideRail.append(sectionLabel)
    for (const slide of section.slides ?? []) {
      slideNumber += 1
      const record = planRecordForSlide(slide, section)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'assembly-slide-item'
      button.dataset.assemblySlideId = slide.id
      button.setAttribute('aria-current', slide.id === selectedSlideId ? 'true' : 'false')
      const thumbnail = document.createElement('span')
      thumbnail.className = 'assembly-slide-thumb'
      if (projection?.canvas) thumbnail.style.aspectRatio = `${projection.canvas.width} / ${projection.canvas.height}`
      const assetId = assemblyRailPrimaryBySlide.get(slide.id)
      const asset = assetId ? assemblyRailAssets.get(assetId) : null
      const rendition = asset?.renditions?.gridStandard
      if (typeof rendition === 'string' && rendition.startsWith('pitchdog-asset:')) {
        const image = document.createElement('img')
        image.src = rendition
        image.alt = ''
        thumbnail.append(image)
      }
      const ordinal = document.createElement('span')
      ordinal.textContent = String(slideNumber).padStart(2, '0')
      thumbnail.append(ordinal)
      const copy = document.createElement('span')
      const title = document.createElement('strong')
      title.textContent = record.metadata.internalTitle || record.headline?.plainText || `Slide ${slideNumber}`
      const style = document.createElement('small')
      style.textContent = visualStyleLabel(record.visualStyle)
      copy.append(title, style)
      button.append(thumbnail, copy)
      elements.assemblySlideRail.append(button)
    }
  }
}

async function hydrateAssemblyRailPreviews(next) {
  const slideIds = (storyDocument?.sections ?? []).flatMap((section) => section.slides.map((slide) => slide.id))
  const mediaGeneration = typeof curateMediaLoadGeneration === 'number' ? curateMediaLoadGeneration : 0
  const key = `${next?.deckId ?? ''}:${next?.revision ?? ''}:${mediaGeneration}:${slideIds.join(',')}`
  if (key === assemblyRailLoadKey) return assemblyRailAssets
  assemblyRailLoadKey = key
  const generation = ++assemblyRailLoadGeneration
  const expectedRevision = next?.revision
  try {
    const primaryBySlide = new Map()
    for (let index = 0; index < slideIds.length; index += 8) {
      const results = await Promise.all(slideIds.slice(index, index + 8).map((slideId) => (
        window.deckBridge.query({ name: 'curate.slide', params: { slideId } })
      )))
      if (generation !== assemblyRailLoadGeneration || projection?.revision !== expectedRevision || curateMediaLoadGeneration !== mediaGeneration) return null
      for (const result of results) {
        if (result?.revision !== expectedRevision) throw new Error('Assembly Slide previews changed while loading')
        const selected = (result?.slots ?? []).find((slot) => slot.selected)?.selected?.assetReferenceId
        if (selected) primaryBySlide.set(result.slide.id, selected)
      }
    }
    const assetIds = [...new Set(primaryBySlide.values())]
    const assets = new Map()
    for (let index = 0; index < assetIds.length; index += 250) {
      const result = await window.deckBridge.query({ name: 'media.assets', params: { assetIds: assetIds.slice(index, index + 250) } })
      if (generation !== assemblyRailLoadGeneration || projection?.revision !== expectedRevision || curateMediaLoadGeneration !== mediaGeneration) return null
      for (const asset of result?.items ?? result?.assets ?? []) assets.set(asset.id, asset)
    }
    assemblyRailPrimaryBySlide = primaryBySlide
    assemblyRailAssets = assets
    if (activePhase === 'assemble' && projection?.revision === expectedRevision) renderAssemblySlideRail()
    return assets
  } catch {
    if (generation !== assemblyRailLoadGeneration) return null
    assemblyRailPrimaryBySlide = new Map()
    assemblyRailAssets = new Map()
    assemblyRailLoadKey = ''
    return null
  }
}

async function ensureAssemblyFromPlan(next) {
  if (!next?.slide?.id || next.composition) return next ?? null
  const inFlight = assemblyCreationPromises.get(next.slide.id)
  if (inFlight) return inFlight
  const creation = assemblyCreationQueue
    .catch(() => null)
    .then(() => {
      if (!projection || projection.deckId !== next.deckId) return null
      if (projection.slide?.id === next.slide.id && projection.composition) return projection
      return executeStructural(
        'designOption.createFromPlan',
        { slideId: next.slide.id, designOptionId: crypto.randomUUID() },
        next.slide.id,
        { sourceLabel: 'Create Assembly from Plan', preserveCurrentSelection: true },
      )
    })
  assemblyCreationPromises.set(next.slide.id, creation)
  assemblyCreationQueue = creation.catch(() => null)
  try {
    return await creation
  } finally {
    if (assemblyCreationPromises.get(next.slide.id) === creation) assemblyCreationPromises.delete(next.slide.id)
  }
}

async function rebuildAssemblyFromPlan() {
  if (!projection?.slide?.id || !projection.designOption?.id || assemblyInteractionPending) return
  assemblyInteractionPending = true
  renderAssemble()
  try {
    await executeStructural(
      'designOption.rebuildFromPlan',
      { slideId: projection.slide.id, designOptionId: projection.designOption.id },
      projection.slide.id,
      { sourceLabel: 'Rebuild Assembly from current Plan', preserveCurrentSelection: true },
    )
  } finally {
    assemblyInteractionPending = false
    if (activePhase === 'assemble') renderAssemble()
  }
}

function assignedAssemblyAssetIds(next) {
  return [...new Set((next?.mediaAssignments ?? [])
    .map((assignment) => assignment.assetReference?.id)
    .filter(Boolean))]
}

async function hydrateAssemblyAssets(next, { refresh = false } = {}) {
  const assetIds = assignedAssemblyAssetIds(next)
  const mediaGeneration = typeof curateMediaLoadGeneration === 'number' ? curateMediaLoadGeneration : 0
  const key = `${next?.deckId ?? ''}:${next?.slide?.id ?? ''}:${next?.revision ?? ''}:${mediaGeneration}:${assetIds.slice().sort().join(',')}`
  if (key === assemblyAssetLoadKey) {
    if (assemblyAssetLoadPromise) return assemblyAssetLoadPromise
    if (!refresh) return assemblyAssetRenditions
  }
  assemblyAssetLoadKey = key
  const generation = ++assemblyAssetLoadGeneration
  const load = (async () => {
    if (assetIds.length === 0) {
      assemblyAssetRenditions = new Map()
      return assemblyAssetRenditions
    }
    try {
      const result = await window.deckBridge.query({
        name: 'media.assets',
        params: { assetIds },
      })
      if (generation !== assemblyAssetLoadGeneration || projection?.slide?.id !== next.slide.id) return null
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result?.assets) ? result.assets : []
      assemblyAssetRenditions = new Map(items.map((asset) => [asset.id, asset]))
      if (activePhase === 'assemble' && projection?.slide?.id === next.slide.id) {
        renderComposition(projection)
        syncCompositionSelection()
      }
      return assemblyAssetRenditions
    } catch (error) {
      if (generation !== assemblyAssetLoadGeneration || projection?.slide?.id !== next.slide.id) return null
      assemblyAssetRenditions = new Map()
      assemblyAssetLoadKey = ''
      setStatus(`${error.name ?? 'MediaUnavailable'}: ${error.message}`)
      return assemblyAssetRenditions
    }
  })()
  assemblyAssetLoadPromise = load
  try {
    return await load
  } finally {
    if (assemblyAssetLoadPromise === load) assemblyAssetLoadPromise = null
  }
}

function assemblyCandidateAssetIds(next) {
  const selectedIds = (curateSlideProjection?.slots ?? [])
    .map((slot) => slot.selected?.assetReferenceId)
    .filter(Boolean)
  const candidateIds = (curateSlideProjection?.decisions ?? [])
    .filter((entry) => ['shortlisted', 'alternate'].includes(normalizedSlideDecision(entry)?.state))
    .map((entry) => entry.assetReferenceId)
  return [...new Set([...selectedIds, ...candidateIds])]
}

async function hydrateAssemblySwapCandidates(next) {
  const assetIds = assemblyCandidateAssetIds(next)
  const mediaGeneration = typeof curateMediaLoadGeneration === 'number' ? curateMediaLoadGeneration : 0
  const key = `${next?.deckId ?? ''}:${next?.slide?.id ?? ''}:${next?.revision ?? ''}:${mediaGeneration}:${assetIds.slice().sort().join(',')}`
  if (key === assemblyCandidateLoadKey) return assemblyCandidateAssets
  assemblyCandidateLoadKey = key
  const generation = ++assemblyCandidateLoadGeneration
  if (assetIds.length === 0) {
    assemblyCandidateAssets = new Map()
    renderAssemblySwapCandidates(next)
    return assemblyCandidateAssets
  }
  try {
    const hydrated = new Map()
    for (let index = 0; index < assetIds.length; index += 250) {
      const result = await window.deckBridge.query({ name: 'media.assets', params: { assetIds: assetIds.slice(index, index + 250) } })
      if (generation !== assemblyCandidateLoadGeneration || projection?.slide?.id !== next.slide.id || curateMediaLoadGeneration !== mediaGeneration) return null
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result?.assets) ? result.assets : []
      for (const asset of items) hydrated.set(asset.id, asset)
    }
    assemblyCandidateAssets = hydrated
    if (activePhase === 'assemble') renderAssemblySwapCandidates(projection)
    return assemblyCandidateAssets
  } catch (error) {
    if (generation !== assemblyCandidateLoadGeneration) return null
    assemblyCandidateAssets = new Map()
    assemblyCandidateLoadKey = ''
    if (activePhase === 'assemble') renderAssemblySwapCandidates(projection)
    return null
  }
}

function assemblyExportFailure(error, message) {
  return { error, message }
}

async function prepareAssemblyForExport(next) {
  if (!next?.slide?.id) return assemblyExportFailure('AssemblyUnavailable', 'No active Slide is available for export')
  if (!next.composition) {
    return assemblyExportFailure(
      'AssemblyUnavailable',
      'Open this Slide in 03 Assemble first so Workbench can create its Assembly before export',
    )
  }
  const requestedSlideId = next.slide.id
  if (projection !== next) {
    return assemblyExportFailure('ExportStale', 'The active Slide changed while preparing export')
  }
  await hydrateAssemblyAssets(next, { refresh: true })
  if (projection !== next || next.slide?.id !== requestedSlideId) {
    return assemblyExportFailure('ExportStale', 'The active Slide changed while loading its media')
  }
  for (const element of next.composition.elements.filter((candidate) => candidate.kind === 'image')) {
    const assignment = next.mediaAssignments?.find((candidate) => candidate.role === element.mediaRole)
    if (!assignment?.assetReference?.id) {
      return assemblyExportFailure('AssemblyMediaUnavailable', `${element.mediaRole ?? 'Image'} has no assigned media`)
    }
    const asset = assemblyAssetRenditions.get(assignment.assetReference.id)
    if (!asset?.renditions?.previewStandard && !asset?.renditions?.gridStandard) {
      return assemblyExportFailure('AssemblyMediaUnavailable', `${assignment.assetReference.label ?? 'Assigned media'} is not available for export`)
    }
  }
  return { projection: next }
}

async function waitForAssemblyImageDecode(next) {
  const imageElements = next?.composition?.elements.filter((element) => element.kind === 'image') ?? []
  for (const element of imageElements) {
    const node = [...elements.compositionLayer.children]
      .find((candidate) => candidate.dataset.elementId === element.id)
    const image = node?.querySelector('img')
    if (!image) return false
    try {
      if (typeof image.decode === 'function') {
        await image.decode()
      } else if (!image.complete) {
        await new Promise((resolve, reject) => {
          const loaded = () => resolve()
          const failed = () => reject(new Error('Assigned image failed to load'))
          image.addEventListener('load', loaded, { once: true })
          image.addEventListener('error', failed, { once: true })
          if (image.complete) {
            if (image.naturalWidth > 0 && image.naturalHeight > 0) loaded()
            else failed()
          }
        })
      }
    } catch {
      return false
    }
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false
    if (!applyProportionalImagePlacement(node, element.frame)) return false
  }
  return true
}

function compositionElementLabel(element) {
  if (element.kind === 'shape' && element.gradient) return 'Gradient overlay'
  if (element.kind === 'image') {
    const role = String(element.mediaRole ?? '').split(':')
    const ordinal = role[1] ? Number(role[1]) : 1
    return role[0] === 'primary' ? `Image · Primary ${ordinal}` : `Image · ${element.mediaRole ?? 'unassigned'}`
  }
  if (element.kind === 'text') {
    const role = String(element.patternElementKey ?? element.contentRole ?? element.contentSlot ?? 'Text')
    return role ? `${role[0].toUpperCase()}${role.slice(1)}` : 'Text'
  }
  return `${element.kind} · ${element.id.slice(0, 8)}`
}

function proportionalImagePlacement({ sourceWidth, sourceHeight, frameWidth, frameHeight, crop, imageFit }) {
  const safeSourceWidth = Number(sourceWidth)
  const safeSourceHeight = Number(sourceHeight)
  const safeFrameWidth = Number(frameWidth)
  const safeFrameHeight = Number(frameHeight)
  if (![safeSourceWidth, safeSourceHeight, safeFrameWidth, safeFrameHeight].every((value) => Number.isFinite(value) && value > 0)) return null
  const normalizedCrop = imageFit === 'fit'
    ? { x: 0, y: 0, width: 1, height: 1 }
    : {
        x: clamp(Number(crop?.x ?? 0), 0, 0.99),
        y: clamp(Number(crop?.y ?? 0), 0, 0.99),
        width: clamp(Number(crop?.width ?? 1), 0.01, 1),
        height: clamp(Number(crop?.height ?? 1), 0.01, 1),
      }
  normalizedCrop.width = Math.min(normalizedCrop.width, 1 - normalizedCrop.x)
  normalizedCrop.height = Math.min(normalizedCrop.height, 1 - normalizedCrop.y)
  const cropWidth = safeSourceWidth * normalizedCrop.width
  const cropHeight = safeSourceHeight * normalizedCrop.height
  const scale = imageFit === 'fit'
    ? Math.min(safeFrameWidth / safeSourceWidth, safeFrameHeight / safeSourceHeight)
    : Math.max(safeFrameWidth / cropWidth, safeFrameHeight / cropHeight)
  const renderedWidth = safeSourceWidth * scale
  const renderedHeight = safeSourceHeight * scale
  const cropCenterX = (normalizedCrop.x + normalizedCrop.width / 2) * renderedWidth
  const cropCenterY = (normalizedCrop.y + normalizedCrop.height / 2) * renderedHeight
  const desiredLeft = safeFrameWidth / 2 - cropCenterX
  const desiredTop = safeFrameHeight / 2 - cropCenterY
  const left = imageFit === 'fit' ? desiredLeft : clamp(desiredLeft, safeFrameWidth - renderedWidth, 0)
  const top = imageFit === 'fit' ? desiredTop : clamp(desiredTop, safeFrameHeight - renderedHeight, 0)
  return {
    left: `${left / safeFrameWidth * 100}%`,
    top: `${top / safeFrameHeight * 100}%`,
    width: `${renderedWidth / safeFrameWidth * 100}%`,
    height: `${renderedHeight / safeFrameHeight * 100}%`,
    renderedAspect: renderedWidth / renderedHeight,
  }
}

function assemblyImageSourceDimensions(node, image) {
  const naturalWidth = Number(image?.naturalWidth)
  const naturalHeight = Number(image?.naturalHeight)
  if (naturalWidth > 0 && naturalHeight > 0) return { width: naturalWidth, height: naturalHeight }
  return {
    width: Number(node.dataset.sourceWidth),
    height: Number(node.dataset.sourceHeight),
  }
}

function applyProportionalImagePlacement(node, frame) {
  const image = node.querySelector('img')
  if (!image) return false
  const source = assemblyImageSourceDimensions(node, image)
  const placement = proportionalImagePlacement({
    sourceWidth: source.width,
    sourceHeight: source.height,
    frameWidth: frame.width,
    frameHeight: frame.height,
    crop: JSON.parse(node.dataset.imageCrop ?? '{"x":0,"y":0,"width":1,"height":1}'),
    imageFit: node.dataset.imageFit === 'fit' ? 'fit' : 'fill',
  })
  if (!placement) return false
  image.style.left = placement.left
  image.style.top = placement.top
  image.style.width = placement.width
  image.style.height = placement.height
  return true
}

function renderComposition(next) {
  elements.compositionLayer.replaceChildren()
  const composition = next.composition
  elements.semanticFallback.hidden = Boolean(composition)
  elements.assemblyOverflowState.hidden = true
  elements.assemblyOverflowState.textContent = ''
  const reviewMessage = canvasReviewMessage(next)
  elements.assemblyOverflowState.hidden = !reviewMessage
  elements.assemblyOverflowState.textContent = reviewMessage
  if (!composition) return
  appendCompositionElements(elements.compositionLayer, next)
  scheduleCompositionOverflowCheck(next)
}

function canvasPresetLabel(id) {
  return [...elements.canvasPreset.options].find((option) => option.value === id)?.textContent ?? id
}

function canvasReviewMessage(next) {
  const authoredPresetId = next?.designOption?.pattern?.canvasPresetId
  const reviewRequired = Boolean(next?.designOption?.canvasReviewRequired && authoredPresetId)
  return reviewRequired
    ? `Scaled from ${canvasPresetLabel(authoredPresetId)}. Review typography and crop; Undo restores the exact authored geometry.`
    : ''
}

function appendCompositionElements(layer, next) {
  const imageInteractions = []
  const gradientInteractions = []
  next.composition?.elements.forEach((element, index) => {
    const node = document.createElement('div')
    const isGradient = element.kind === 'shape' && element.gradient
    node.className = `composition-element composition-${isGradient ? 'gradient' : element.kind}`
    node.dataset.elementId = element.id
    applyElementNodeFrame(node, element.frame, next.canvas)
    node.style.zIndex = String(index + 1)
    if (element.kind === 'text') {
      const content = next.contentBlocks.find((block) => block.id === element.contentBlockId)
      node.dataset.contentRole = content?.role ?? element.contentRole ?? element.contentSlot ?? 'text'
      node.dataset.textSize = element.textSize ?? 'medium'
      node.textContent = content?.plainText ?? `Missing Content Block · ${element.contentBlockId ?? 'unbound'}`
      node.setAttribute('aria-label', `${compositionElementLabel(element)} from canonical Story`)
    } else if (element.kind === 'image') {
      const assignment = next.mediaAssignments?.find((candidate) => candidate.role === element.mediaRole)
      const assetLabel = assignment?.assetReference?.label ?? 'unassigned Asset'
      const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
      node.dataset.imageFit = element.imageFit ?? 'fill'
      node.dataset.imageCrop = JSON.stringify(crop)
      const asset = assignment?.assetReference?.id
        ? assemblyAssetRenditions.get(assignment.assetReference.id)
        : null
      const rendition = asset?.renditions?.previewStandard ?? asset?.renditions?.gridStandard
      if (rendition) {
        const image = document.createElement('img')
        image.src = rendition
        image.alt = ''
        image.draggable = false
        if (Number(asset?.width) > 0 && Number(asset?.height) > 0) {
          node.dataset.sourceWidth = String(asset.width)
          node.dataset.sourceHeight = String(asset.height)
        }
        image.addEventListener('load', () => applyProportionalImagePlacement(node, element.frame), { once: true })
        node.append(image)
        applyProportionalImagePlacement(node, element.frame)
        node.classList.add('has-rendition')
      } else {
        const empty = document.createElement('span')
        empty.className = 'composition-image-state'
        empty.textContent = assignment
          ? `${assetLabel}\nReconnect or rescan its media folder to show this image.`
          : `${element.mediaRole ?? 'Image'}\nChoose a primary image in 02 Curate.`
        node.append(empty)
      }
      node.setAttribute('aria-label', `${element.mediaRole ?? 'Image'}: ${assetLabel}`)
    } else if (isGradient) {
      renderGradientElement(node, element)
      gradientInteractions.push({ element, node })
      node.setAttribute('aria-label', 'Gradient overlay')
    } else {
      node.textContent = compositionElementLabel(element)
      node.setAttribute('aria-label', compositionElementLabel(element))
    }
    node.tabIndex = 0
    node.addEventListener('pointerdown', (event) => beginElementPointerInteraction(event, element, node))
    node.addEventListener('focus', () => selectCompositionElement(element.id))
    if (!isGradient) appendElementResizeHandle(node, element)
    if (element.kind === 'image') imageInteractions.push({ element, node })
    layer.append(node)
  })
  for (const { element, node } of imageInteractions) {
    appendImagePanInteractionLayer(layer, node, element, next)
  }
  for (const { element, node } of gradientInteractions) {
    appendGradientInteractionLayer(layer, node, element, next)
  }
}

function applyElementNodeFrame(node, frame, canvas = projection?.canvas) {
  if (!canvas) return
  node.style.left = `${(frame.x / canvas.width) * 100}%`
  node.style.top = `${(frame.y / canvas.height) * 100}%`
  node.style.width = `${(frame.width / canvas.width) * 100}%`
  node.style.height = `${(frame.height / canvas.height) * 100}%`
  applyProportionalImagePlacement(node, frame)
}

function appendElementResizeHandle(node, element) {
  const handle = document.createElement('span')
  handle.className = 'composition-resize-handle'
  handle.dataset.resizeElementId = element.id
  handle.setAttribute('aria-hidden', 'true')
  node.append(handle)
}

function appendImagePanInteractionLayer(layer, imageNode, element, next) {
  const interaction = document.createElement('div')
  interaction.className = 'image-pan-interaction-layer'
  interaction.dataset.imagePanInteractionFor = element.id
  interaction.dataset.imageFit = element.imageFit ?? 'fill'
  interaction.style.left = `${(element.frame.x / next.canvas.width) * 100}%`
  interaction.style.top = `${(element.frame.y / next.canvas.height) * 100}%`
  interaction.style.width = `${(element.frame.width / next.canvas.width) * 100}%`
  interaction.style.height = `${(element.frame.height / next.canvas.height) * 100}%`
  interaction.style.zIndex = String((next.composition?.elements.length ?? 0) + 9)
  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'image-pan-handle'
  handle.dataset.panImageElementId = element.id
  handle.textContent = '✥'
  handle.setAttribute('aria-label', 'Pan image within frame')
  handle.addEventListener('pointerdown', (event) => beginImagePanInteraction(event, element, imageNode, {
    slideId: next.slide.id,
    designOptionId: next.designOption.id,
  }))
  interaction.append(handle)
  layer.append(interaction)
}

function renderGradientElement(node, element) {
  const gradient = element.gradient
  const colors = gradient.colors ?? { start: '#000000', end: '#000000' }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('composition-gradient-svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const paint = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
  const paintId = `gradient-${String(element.id).replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`
  paint.id = paintId
  paint.setAttribute('x1', `${gradient.start.x * 100}%`)
  paint.setAttribute('y1', `${gradient.start.y * 100}%`)
  paint.setAttribute('x2', `${gradient.end.x * 100}%`)
  paint.setAttribute('y2', `${gradient.end.y * 100}%`)
  const start = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  start.setAttribute('offset', '0%')
  start.setAttribute('stop-color', colors.start)
  start.setAttribute('stop-opacity', String(gradient.opacity))
  const end = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  end.setAttribute('offset', '100%')
  end.setAttribute('stop-color', colors.end)
  end.setAttribute('stop-opacity', '0')
  paint.append(start, end)
  defs.append(paint)
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('width', '100')
  rect.setAttribute('height', '100')
  rect.setAttribute('fill', `url(#${paintId})`)
  svg.append(defs, rect)
  node.append(svg)
}

function appendGradientInteractionLayer(layer, gradientNode, element, next) {
  const gradient = element.gradient
  const interaction = document.createElement('div')
  interaction.className = 'gradient-interaction-layer'
  interaction.dataset.gradientInteractionFor = element.id
  interaction.style.left = `${(element.frame.x / next.canvas.width) * 100}%`
  interaction.style.top = `${(element.frame.y / next.canvas.height) * 100}%`
  interaction.style.width = `${(element.frame.width / next.canvas.width) * 100}%`
  interaction.style.height = `${(element.frame.height / next.canvas.height) * 100}%`
  interaction.style.zIndex = String((next.composition?.elements.length ?? 0) + 10)
  for (const point of ['start', 'end']) {
    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = 'gradient-handle'
    handle.dataset.gradientPoint = point
    handle.style.left = `${gradient[point].x * 100}%`
    handle.style.top = `${gradient[point].y * 100}%`
    handle.setAttribute('aria-label', `Move gradient ${point}`)
    handle.addEventListener('pointerdown', (event) => beginGradientPointerInteraction(event, element, gradientNode, point, interaction))
    interaction.append(handle)
  }
  const move = document.createElement('button')
  move.type = 'button'
  move.className = 'gradient-move-handle'
  move.dataset.gradientPoint = 'both'
  move.style.left = `${((gradient.start.x + gradient.end.x) / 2) * 100}%`
  move.style.top = `${((gradient.start.y + gradient.end.y) / 2) * 100}%`
  move.setAttribute('aria-label', 'Move gradient')
  move.addEventListener('pointerdown', (event) => beginGradientPointerInteraction(event, element, gradientNode, 'both', interaction))
  interaction.append(move)
  layer.append(interaction)
}

function selectCompositionElement(elementId) {
  if (!projection?.composition?.elements.some((element) => element.id === elementId)) return
  if (elements.visualElement.value !== elementId) elements.visualElement.value = elementId
  syncVisualControls(projection)
  syncCompositionSelection()
}

function syncCompositionSelection() {
  const selectedId = elements.visualElement.value
  for (const node of elements.compositionLayer.querySelectorAll('[data-element-id]')) {
    const selected = node.dataset.elementId === selectedId
    node.classList.toggle('is-selected', selected)
    node.setAttribute('aria-selected', String(selected))
  }
  for (const interaction of elements.compositionLayer.querySelectorAll('[data-gradient-interaction-for]')) {
    interaction.classList.toggle('is-selected', interaction.dataset.gradientInteractionFor === selectedId)
  }
  for (const interaction of elements.compositionLayer.querySelectorAll('[data-image-pan-interaction-for]')) {
    interaction.classList.toggle('is-selected', interaction.dataset.imagePanInteractionFor === selectedId)
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function pointerFrameDelta(event, originEvent, canvas, artboardRect) {
  return {
    x: (event.clientX - originEvent.clientX) * canvas.width / artboardRect.width,
    y: (event.clientY - originEvent.clientY) * canvas.height / artboardRect.height,
  }
}

function visibleImageCrop({ sourceWidth, sourceHeight, frameWidth, frameHeight, crop }) {
  const normalizedCrop = {
    x: clamp(Number(crop?.x ?? 0), 0, 0.99),
    y: clamp(Number(crop?.y ?? 0), 0, 0.99),
    width: clamp(Number(crop?.width ?? 1), 0.01, 1),
    height: clamp(Number(crop?.height ?? 1), 0.01, 1),
  }
  normalizedCrop.width = Math.min(normalizedCrop.width, 1 - normalizedCrop.x)
  normalizedCrop.height = Math.min(normalizedCrop.height, 1 - normalizedCrop.y)
  const scale = Math.max(
    frameWidth / (sourceWidth * normalizedCrop.width),
    frameHeight / (sourceHeight * normalizedCrop.height),
  )
  const width = frameWidth / (sourceWidth * scale)
  const height = frameHeight / (sourceHeight * scale)
  const centerX = normalizedCrop.x + normalizedCrop.width / 2
  const centerY = normalizedCrop.y + normalizedCrop.height / 2
  return {
    x: clamp(centerX - width / 2, 0, 1 - width),
    y: clamp(centerY - height / 2, 0, 1 - height),
    width,
    height,
  }
}

function isFullCanvasFrame(frame, canvas) {
  const tolerance = 0.001
  return Math.abs(frame.x) <= tolerance
    && Math.abs(frame.y) <= tolerance
    && Math.abs(frame.width - canvas.width) <= tolerance
    && Math.abs(frame.height - canvas.height) <= tolerance
}

function beginImagePanInteraction(event, element, node, operation) {
  const image = node.querySelector('img')
  const source = assemblyImageSourceDimensions(node, image)
  if (!image || !(source.width > 0 && source.height > 0)) return false
  event.preventDefault()
  event.stopPropagation()
  selectCompositionElement(element.id)
  const pointerId = event.pointerId
  const target = event.target.closest('[data-pan-image-element-id]') ?? node
  const rect = node.getBoundingClientRect()
  const originEvent = { clientX: event.clientX, clientY: event.clientY }
  const storedCrop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  let moved = false
  const origin = visibleImageCrop({
    sourceWidth: source.width,
    sourceHeight: source.height,
    frameWidth: element.frame.width,
    frameHeight: element.frame.height,
    crop: storedCrop,
  })
  target.setPointerCapture(pointerId)

  const move = (nextEvent) => {
    moved = true
    const crop = {
      ...origin,
      x: clamp(origin.x - ((nextEvent.clientX - originEvent.clientX) / rect.width) * origin.width, 0, 1 - origin.width),
      y: clamp(origin.y - ((nextEvent.clientY - originEvent.clientY) / rect.height) * origin.height, 0, 1 - origin.height),
    }
    node.dataset.previewCrop = JSON.stringify(crop)
    node.dataset.imageCrop = JSON.stringify(crop)
    applyProportionalImagePlacement(node, element.frame)
  }
  const finish = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', cancel)
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    if (!moved) return
    const crop = node.dataset.previewCrop ? JSON.parse(node.dataset.previewCrop) : origin
    delete node.dataset.previewCrop
    if (JSON.stringify(crop) === JSON.stringify(storedCrop)) return
    if (projection?.slide?.id !== operation.slideId || projection?.designOption?.id !== operation.designOptionId) {
      node.dataset.imageCrop = JSON.stringify(storedCrop)
      applyProportionalImagePlacement(node, element.frame)
      return
    }
    assemblyInteractionPending = true
    void executeStructural('element.crop.update', {
      slideId: operation.slideId,
      designOptionId: operation.designOptionId,
      elementId: element.id,
      crop,
    }, operation.slideId, { sourceLabel: 'Pan Assembly Image', preserveCurrentSelection: true })
      .finally(finishAssemblyInteraction)
  }
  const cancel = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', cancel)
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    delete node.dataset.previewCrop
    node.dataset.imageCrop = JSON.stringify(storedCrop)
    applyProportionalImagePlacement(node, element.frame)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', finish)
  target.addEventListener('pointercancel', cancel)
  return true
}

function beginElementPointerInteraction(event, element, node) {
  if (event.button !== 0 || assemblyInteractionPending || event.target.closest('[data-gradient-point]')) return
  if (element.kind === 'shape' && element.gradient) {
    selectCompositionElement(element.id)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  selectCompositionElement(element.id)
  const canvas = projection?.canvas
  const designOption = projection?.designOption
  if (!canvas || !designOption) return
  const operationSlideId = projection.slide.id
  const operationDesignOptionId = designOption.id
  const resizing = Boolean(event.target.closest('[data-resize-element-id]'))
  const panningImage = element.kind === 'image'
    && (element.imageFit ?? 'fill') === 'fill'
    && !resizing
    && (Boolean(event.target.closest('[data-pan-image-element-id]')) || isFullCanvasFrame(element.frame, canvas))
  if (panningImage && beginImagePanInteraction(event, element, node, {
    slideId: operationSlideId,
    designOptionId: operationDesignOptionId,
  })) return
  const originEvent = { clientX: event.clientX, clientY: event.clientY }
  const origin = { ...element.frame }
  const artboardRect = elements.artboard.getBoundingClientRect()
  const pointerId = event.pointerId
  node.setPointerCapture(pointerId)

  const move = (nextEvent) => {
    const delta = pointerFrameDelta(nextEvent, originEvent, canvas, artboardRect)
    const frame = resizing
      ? {
          ...origin,
          width: clamp(origin.width + delta.x, Math.max(24, canvas.width * 0.02), canvas.width - origin.x),
          height: clamp(origin.height + delta.y, Math.max(24, canvas.height * 0.02), canvas.height - origin.y),
        }
      : {
          ...origin,
          x: clamp(origin.x + delta.x, 0, canvas.width - origin.width),
          y: clamp(origin.y + delta.y, 0, canvas.height - origin.height),
        }
    node.dataset.previewFrame = JSON.stringify(frame)
    applyElementNodeFrame(node, frame, canvas)
  }
  const finish = (nextEvent) => {
    node.removeEventListener('pointermove', move)
    node.removeEventListener('pointerup', finish)
    node.removeEventListener('pointercancel', cancel)
    if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId)
    const frame = node.dataset.previewFrame ? JSON.parse(node.dataset.previewFrame) : origin
    delete node.dataset.previewFrame
    if (JSON.stringify(frame) === JSON.stringify(origin)) return
    if (projection?.slide?.id !== operationSlideId || projection?.designOption?.id !== operationDesignOptionId) {
      applyElementNodeFrame(node, origin, canvas)
      return
    }
    assemblyInteractionPending = true
    void executeStructural(
      'element.frame.update',
      { slideId: operationSlideId, designOptionId: operationDesignOptionId, elementId: element.id, frame },
      operationSlideId,
      { sourceLabel: resizing ? 'Resize Assembly Element' : 'Move Assembly Element', preserveCurrentSelection: true },
    ).finally(finishAssemblyInteraction)
  }
  const cancel = () => {
    node.removeEventListener('pointermove', move)
    node.removeEventListener('pointerup', finish)
    node.removeEventListener('pointercancel', cancel)
    delete node.dataset.previewFrame
    applyElementNodeFrame(node, origin, canvas)
  }
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', finish)
  node.addEventListener('pointercancel', cancel)
}

function previewGradient(node, gradient, interaction = node) {
  const paint = node.querySelector('linearGradient')
  paint?.setAttribute('x1', `${gradient.start.x * 100}%`)
  paint?.setAttribute('y1', `${gradient.start.y * 100}%`)
  paint?.setAttribute('x2', `${gradient.end.x * 100}%`)
  paint?.setAttribute('y2', `${gradient.end.y * 100}%`)
  const stops = node.querySelectorAll('stop')
  const colors = gradient.colors ?? { start: '#000000', end: '#000000' }
  stops[0]?.setAttribute('stop-color', colors.start)
  stops[0]?.setAttribute('stop-opacity', String(gradient.opacity))
  stops[1]?.setAttribute('stop-color', colors.end)
  stops[1]?.setAttribute('stop-opacity', '0')
  for (const point of ['start', 'end']) {
    const handle = interaction.querySelector(`[data-gradient-point="${point}"]`)
    if (!handle) continue
    handle.style.left = `${gradient[point].x * 100}%`
    handle.style.top = `${gradient[point].y * 100}%`
  }
  const move = interaction.querySelector('[data-gradient-point="both"]')
  if (move) {
    move.style.left = `${((gradient.start.x + gradient.end.x) / 2) * 100}%`
    move.style.top = `${((gradient.start.y + gradient.end.y) / 2) * 100}%`
  }
}

function beginGradientPointerInteraction(event, element, node, point, interaction) {
  if (event.button !== 0 || assemblyInteractionPending || !element.gradient) return
  event.preventDefault()
  event.stopPropagation()
  selectCompositionElement(element.id)
  const designOption = projection?.designOption
  if (!designOption) return
  const operationSlideId = projection.slide.id
  const operationDesignOptionId = designOption.id
  const pointerId = event.pointerId
  const originEvent = { clientX: event.clientX, clientY: event.clientY }
  const origin = JSON.parse(JSON.stringify(element.gradient))
  const rect = node.getBoundingClientRect()
  event.currentTarget.setPointerCapture(pointerId)

  const move = (nextEvent) => {
    let gradient = JSON.parse(JSON.stringify(origin))
    if (point === 'both') {
      const deltaX = (nextEvent.clientX - originEvent.clientX) / rect.width
      const deltaY = (nextEvent.clientY - originEvent.clientY) / rect.height
      const boundedX = clamp(deltaX, -Math.min(origin.start.x, origin.end.x), 1 - Math.max(origin.start.x, origin.end.x))
      const boundedY = clamp(deltaY, -Math.min(origin.start.y, origin.end.y), 1 - Math.max(origin.start.y, origin.end.y))
      gradient.start.x += boundedX
      gradient.end.x += boundedX
      gradient.start.y += boundedY
      gradient.end.y += boundedY
    } else {
      gradient[point] = {
        x: clamp((nextEvent.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((nextEvent.clientY - rect.top) / rect.height, 0, 1),
      }
    }
    node.dataset.previewGradient = JSON.stringify(gradient)
    previewGradient(node, gradient, interaction)
  }
  const target = event.currentTarget
  const finish = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', cancel)
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    const gradient = node.dataset.previewGradient ? JSON.parse(node.dataset.previewGradient) : origin
    delete node.dataset.previewGradient
    if (JSON.stringify(gradient) === JSON.stringify(origin)) return
    if (projection?.slide?.id !== operationSlideId || projection?.designOption?.id !== operationDesignOptionId) {
      previewGradient(node, origin, interaction)
      return
    }
    assemblyInteractionPending = true
    void executeStructural(
      'element.gradient.update',
      { slideId: operationSlideId, designOptionId: operationDesignOptionId, elementId: element.id, gradient },
      operationSlideId,
      { sourceLabel: 'Move Assembly Gradient', preserveCurrentSelection: true },
    ).finally(finishAssemblyInteraction)
  }
  const cancel = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', cancel)
    delete node.dataset.previewGradient
    previewGradient(node, origin, interaction)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', finish)
  target.addEventListener('pointercancel', cancel)
}

function beginStagePan(event) {
  if (event.button !== 0 || event.target.closest('.artboard')) return
  const pointerId = event.pointerId
  const origin = {
    x: event.clientX,
    y: event.clientY,
    left: elements.stageScroll.scrollLeft,
    top: elements.stageScroll.scrollTop,
  }
  elements.stageScroll.classList.add('is-panning')
  elements.stageScroll.setPointerCapture(pointerId)
  const move = (nextEvent) => {
    elements.stageScroll.scrollLeft = origin.left - (nextEvent.clientX - origin.x)
    elements.stageScroll.scrollTop = origin.top - (nextEvent.clientY - origin.y)
  }
  const finish = () => {
    elements.stageScroll.classList.remove('is-panning')
    elements.stageScroll.removeEventListener('pointermove', move)
    elements.stageScroll.removeEventListener('pointerup', finish)
    elements.stageScroll.removeEventListener('pointercancel', finish)
    if (elements.stageScroll.hasPointerCapture(pointerId)) elements.stageScroll.releasePointerCapture(pointerId)
  }
  elements.stageScroll.addEventListener('pointermove', move)
  elements.stageScroll.addEventListener('pointerup', finish)
  elements.stageScroll.addEventListener('pointercancel', finish)
}

function handleAssemblyKeydown(event) {
  if (activePhase !== 'assemble' || assemblyInteractionPending || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return
  const selected = projection?.composition?.elements.find((element) => element.id === elements.visualElement.value)
  if (!selected || !projection?.designOption) return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 1
  const delta = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[event.key]
  const frame = {
    ...selected.frame,
    x: clamp(selected.frame.x + delta[0], 0, projection.canvas.width - selected.frame.width),
    y: clamp(selected.frame.y + delta[1], 0, projection.canvas.height - selected.frame.height),
  }
  if (frame.x === selected.frame.x && frame.y === selected.frame.y) return
  assemblyInteractionPending = true
  void executeStructural(
    'element.frame.update',
    {
      slideId: projection.slide.id,
      designOptionId: projection.designOption.id,
      elementId: selected.id,
      frame,
    },
    projection.slide.id,
    { sourceKind: 'keyboard', sourceLabel: 'Nudge Assembly Element', preserveCurrentSelection: true },
  ).finally(finishAssemblyInteraction)
}

function compositionOverflowNodes(layer) {
  return [...layer.querySelectorAll('.composition-text')]
    .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
}

function compositionOverflowCountForProjection(next) {
  if (!next?.composition) return 0
  const surface = document.createElement('div')
  surface.className = 'artboard composition-preflight-artboard'
  surface.setAttribute('aria-hidden', 'true')
  surface.inert = true
  const layer = document.createElement('div')
  layer.className = 'composition-preflight-layer'
  surface.append(layer)
  appendCompositionElements(layer, next)
  document.body.append(surface)
  try {
    return compositionOverflowNodes(layer).length
  } finally {
    surface.remove()
  }
}

function scheduleCompositionOverflowCheck(next) {
  const check = () => {
    const clipped = compositionOverflowNodes(elements.compositionLayer)
    const messages = [canvasReviewMessage(next)]
    if (clipped.length) {
      messages.push(`${clipped.length} element${clipped.length === 1 ? '' : 's'} exceed the composition frame. Resize or reposition them before handoff.`)
    }
    const text = messages.filter(Boolean).join(' ')
    elements.assemblyOverflowState.hidden = !text
    elements.assemblyOverflowState.textContent = text
  }
  requestAnimationFrame(check)
  void document.fonts?.ready.then(check)
}

function selectedAssemblyElement(next = projection) {
  return next?.composition?.elements.find((element) => element.id === elements.visualElement.value) ?? null
}

function assemblyGradientElement(next = projection) {
  return next?.composition?.elements.find((element) => element.kind === 'shape' && element.gradient) ?? null
}

function gradientDirectionName(gradient) {
  return Object.entries(GRADIENT_DIRECTIONS).find(([, value]) => (
    value.start.x === gradient.start.x
    && value.start.y === gradient.start.y
    && value.end.x === gradient.end.x
    && value.end.y === gradient.end.y
  ))?.[0] ?? null
}

function normalizedGradient(element) {
  return {
    type: 'linear',
    start: { ...element.gradient.start },
    end: { ...element.gradient.end },
    opacity: element.gradient.opacity,
    colors: { ...(element.gradient.colors ?? { start: '#000000', end: '#000000' }) },
  }
}

function setAssemblyPressed(buttons, value, dataKey) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset[dataKey] === value))
}

function selectAssemblyGradient() {
  const gradient = assemblyGradientElement()
  if (!gradient) return
  selectCompositionElement(gradient.id)
  elements.compositionLayer.querySelector(`[data-element-id="${CSS.escape(gradient.id)}"]`)?.focus({ preventScroll: true })
}

async function updateSelectedTextSize(textSize) {
  const element = selectedAssemblyElement()
  if (!projection?.designOption || element?.kind !== 'text' || !['small', 'medium', 'large'].includes(textSize)) return
  if ((element.textSize ?? 'medium') === textSize || assemblyInteractionPending) return
  assemblyInteractionPending = true
  try {
    await executeStructural('element.textSize.update', {
      slideId: projection.slide.id,
      designOptionId: projection.designOption.id,
      elementId: element.id,
      textSize,
    }, projection.slide.id, { sourceLabel: `Set Text size: ${textSize}`, preserveCurrentSelection: true })
  } finally {
    finishAssemblyInteraction()
  }
}

async function updateSelectedImageFit(imageFit) {
  const element = selectedAssemblyElement()
  if (!projection?.designOption || element?.kind !== 'image' || !['fit', 'fill'].includes(imageFit)) return
  if ((element.imageFit ?? 'fill') === imageFit || assemblyInteractionPending) return
  assemblyInteractionPending = true
  try {
    await executeStructural('element.imageFit.update', {
      slideId: projection.slide.id,
      designOptionId: projection.designOption.id,
      elementId: element.id,
      imageFit,
    }, projection.slide.id, { sourceLabel: `Set Image frame: ${imageFit}`, preserveCurrentSelection: true })
  } finally {
    finishAssemblyInteraction()
  }
}

async function updateSelectedGradientPatch(patch, sourceLabel) {
  const element = assemblyGradientElement()
  if (!projection?.designOption || !element || assemblyInteractionPending) return
  const gradient = { ...normalizedGradient(element), ...patch }
  if (patch.colors) gradient.colors = { ...normalizedGradient(element).colors, ...patch.colors }
  if (JSON.stringify(gradient) === JSON.stringify(normalizedGradient(element))) return
  assemblyInteractionPending = true
  try {
    await executeStructural('element.gradient.update', {
      slideId: projection.slide.id,
      designOptionId: projection.designOption.id,
      elementId: element.id,
      gradient,
    }, projection.slide.id, { sourceLabel, preserveCurrentSelection: true })
  } finally {
    finishAssemblyInteraction()
  }
}

async function updateSelectedGradientDirection(direction) {
  const endpoints = GRADIENT_DIRECTIONS[direction]
  if (!endpoints) return
  await updateSelectedGradientPatch({
    start: { ...endpoints.start },
    end: { ...endpoints.end },
  }, `Set Gradient direction: ${direction.replaceAll('-', ' ')}`)
}

async function updateSelectedGradientColours() {
  await updateSelectedGradientPatch({
    colors: {
      start: elements.gradientStartColor.value.toLowerCase(),
      end: elements.gradientEndColor.value.toLowerCase(),
    },
  }, 'Set Gradient colours')
}

function assemblySwapSlot(next, element) {
  return (curateSlideProjection?.slots ?? []).find((slot) => slot.assignmentRole === element?.mediaRole) ?? null
}

function assemblySwapDecision(assetId) {
  const entry = (curateSlideProjection?.decisions ?? []).find((candidate) => candidate.assetReferenceId === assetId)
  return normalizedSlideDecision(entry)
}

function assemblySwapAsset(assetId) {
  return assemblyCandidateAssets.get(assetId)
    ?? assemblyAssetRenditions.get(assetId)
    ?? curateAssetById(assetId)
    ?? null
}

function appendAssemblySwapThumbnail(target, asset) {
  const thumb = document.createElement('span')
  thumb.className = 'assembly-swap-thumb'
  const url = asset?.renditions?.gridStandard
  if (typeof url === 'string' && url.startsWith('pitchdog-asset:')) {
    const image = document.createElement('img')
    image.src = url
    image.alt = ''
    thumb.append(image)
  } else {
    const unavailable = document.createElement('span')
    unavailable.textContent = 'No preview'
    thumb.append(unavailable)
  }
  target.append(thumb)
}

function renderAssemblySwapCandidates(next = projection) {
  elements.imageSwapCandidates.replaceChildren()
  const element = selectedAssemblyElement(next)
  const slot = element?.kind === 'image' ? assemblySwapSlot(next, element) : null
  if (!slot) {
    elements.imageSwapRole.textContent = element?.kind === 'image' ? 'No matching Curate slot' : 'Select an image'
    return
  }
  elements.imageSwapRole.textContent = slotDisplayName(slot)
  const candidateEntries = (curateSlideProjection?.decisions ?? [])
    .filter((entry) => ['shortlisted', 'alternate'].includes(normalizedSlideDecision(entry)?.state))
  const orderedIds = [...new Set([
    slot.selected?.assetReferenceId,
    ...candidateEntries.map((entry) => entry.assetReferenceId),
  ].filter(Boolean))]
  const usedElsewhere = new Set((curateSlideProjection?.slots ?? [])
    .filter((candidate) => candidate.key !== slot.key)
    .map((candidate) => candidate.selected?.assetReferenceId)
    .filter(Boolean))
  if (orderedIds.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'assembly-help'
    empty.textContent = 'Shortlist images in 02 Curate, then swap them here.'
    elements.imageSwapCandidates.append(empty)
    return
  }
  for (const assetId of orderedIds) {
    const asset = assemblySwapAsset(assetId)
    const decision = assemblySwapDecision(assetId)
    const current = slot.selected?.assetReferenceId === assetId
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.assemblySwapAssetId = assetId
    button.setAttribute('aria-pressed', String(current))
    button.disabled = current || usedElsewhere.has(assetId) || assemblyInteractionPending
    appendAssemblySwapThumbnail(button, asset)
    const copy = document.createElement('span')
    const title = document.createElement('strong')
    title.textContent = asset?.label ?? asset?.filename ?? `Asset ${assetId.slice(0, 8)}`
    const detail = document.createElement('small')
    detail.textContent = current ? 'Current' : usedElsewhere.has(assetId) ? 'Used in another slot' : decision?.state === 'alternate' ? 'Alternate' : 'Shortlist'
    copy.append(title, detail)
    button.append(copy)
    elements.imageSwapCandidates.append(button)
  }
}

async function swapSelectedAssemblyImage(assetId) {
  const element = selectedAssemblyElement()
  const slot = element?.kind === 'image' ? assemblySwapSlot(projection, element) : null
  if (!projection || !slot || !assetId || assemblyInteractionPending) return false
  if (slot.selected?.assetReferenceId === assetId) return true
  const usedElsewhere = (curateSlideProjection?.slots ?? []).some((candidate) => (
    candidate.key !== slot.key && candidate.selected?.assetReferenceId === assetId
  ))
  if (usedElsewhere) {
    setStatus('That image is already used in another slot. Choose a shortlist or alternate for this exact slot.')
    return false
  }
  const asset = assemblySwapAsset(assetId)
  if (!asset) return false
  const decision = { state: 'selected', slotKey: slot.key }
  if (!slot.selected) decision.mediaAssignmentId = crypto.randomUUID()
  const attached = curateAttachedReference(assetId)
  assemblyInteractionPending = true
  renderAssemblySwapCandidates(projection)
  try {
    const next = await executeStructural('curate.slideDecision.set', {
      slideId: projection.slide.id,
      assetReferenceId: assetId,
      ...(attached ? {} : { assetReference: neutralAssetReferenceSnapshot(normalizeCurateAsset(asset)) }),
      decision,
    }, projection.slide.id, { sourceLabel: `Swap ${slotDisplayName(slot)} image`, preserveCurrentSelection: true })
    if (next) setStatus(`${slotDisplayName(slot)} now uses ${asset.label ?? asset.filename ?? 'the selected image'}.`)
    return Boolean(next)
  } finally {
    finishAssemblyInteraction()
  }
}

function syncVisualControls(next) {
  const enabled = Boolean(next)
  elements.canvasPreset.disabled = !enabled
  if (next?.canvas?.id) elements.canvasPreset.value = next.canvas.id
  elements.applyCanvas.disabled = !enabled || elements.canvasPreset.value === next?.canvas?.id

  const previousElementId = elements.visualElement.value
  elements.visualElement.replaceChildren()
  for (const element of next?.composition?.elements ?? []) {
    const option = document.createElement('option')
    option.value = element.id
    option.textContent = compositionElementLabel(element)
    elements.visualElement.append(option)
  }
  if ([...elements.visualElement.options].some((option) => option.value === previousElementId)) {
    elements.visualElement.value = previousElementId
  }
  const selected = next?.composition?.elements.find((element) => element.id === elements.visualElement.value)
  elements.visualElement.disabled = !selected
  elements.alignActions.querySelectorAll('button').forEach((button) => {
    button.disabled = !selected || Boolean(selected?.kind === 'shape' && selected.gradient)
  })
  const isText = selected?.kind === 'text'
  elements.textControls.disabled = !isText || assemblyInteractionPending
  setAssemblyPressed(elements.textSizeActions, isText ? selected.textSize ?? 'medium' : '', 'textSize')
  const isImage = selected?.kind === 'image'
  elements.imageControls.disabled = !isImage || assemblyInteractionPending
  setAssemblyPressed(elements.imageFitActions, isImage ? selected.imageFit ?? 'fill' : '', 'imageFit')
  renderAssemblySwapCandidates(next)
  const gradientElement = assemblyGradientElement(next)
  const gradient = gradientElement ? normalizedGradient(gradientElement) : null
  elements.gradientControls.disabled = !gradient || assemblyInteractionPending
  elements.editGradient.disabled = !gradient || assemblyInteractionPending
  elements.gradientStrength.value = String(Math.round((gradient?.opacity ?? 0) * 100))
  elements.gradientStrengthOutput.value = `${elements.gradientStrength.value}%`
  elements.gradientStartColor.value = gradient?.colors.start ?? '#000000'
  elements.gradientEndColor.value = gradient?.colors.end ?? '#000000'
  setAssemblyPressed(elements.gradientDirectionActions, gradient ? gradientDirectionName(gradient) : '', 'gradientDirection')
  const assignment = selected?.mediaRole
    ? next?.mediaAssignments?.find((candidate) => candidate.role === selected.mediaRole)
    : null
  const canCrop = selected?.kind === 'image' && (selected.imageFit ?? 'fill') === 'fill' && Boolean(assignment)
  elements.cropControls.disabled = !canCrop
  elements.cropHelp.textContent = selected?.kind === 'image' && selected.imageFit === 'fit'
    ? 'Fit shows the whole image and does not crop it. Switch to Fill to crop or pan.'
    : 'Fill crops the source proportionally. Drag the image for the intuitive path, or enter exact percentages here.'
  const crop = selected?.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  elements.cropX.value = String(Math.round(crop.x * 100))
  elements.cropY.value = String(Math.round(crop.y * 100))
  elements.cropWidth.value = String(Math.round(crop.width * 100))
  elements.cropHeight.value = String(Math.round(crop.height * 100))
}

async function applySelectedCanvasPreset() {
  if (!projection) return
  const canvasPresetId = elements.canvasPreset.value
  if (!canvasPresetId || canvasPresetId === projection.canvas.id) return
  const next = await executeStructural(
    'canvas.preset.set',
    { canvasPresetId },
    projection.slide.id,
    { sourceLabel: `Set Canvas: ${canvasPresetLabel(canvasPresetId)}` },
  )
  if (next) setStatus(`Canvas changed to ${canvasPresetLabel(canvasPresetId)} · review scaled Assemblies`)
}

async function alignSelectedElement(alignment) {
  if (!projection) return
  const payload = elementAlignPlan(projection, elements.visualElement.value, alignment)
  if (!payload) return
  await executeStructural('element.frame.update', payload, projection.slide.id, { sourceLabel: `Align Element ${alignment}` })
}

async function applySelectedCrop() {
  if (!projection) return
  const payload = imageCropPlan(projection, elements.visualElement.value, {
    x: Number(elements.cropX.value) / 100,
    y: Number(elements.cropY.value) / 100,
    width: Number(elements.cropWidth.value) / 100,
    height: Number(elements.cropHeight.value) / 100,
  })
  if (!payload) {
    setStatus('InvalidCommand: Crop must stay inside normalised source bounds')
    return
  }
  await executeStructural('element.crop.update', payload, projection.slide.id, { sourceLabel: 'Adjust Image crop' })
}

function applyScales() {
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const transforms = workspaceTransforms({ interfaceScale, artboardZoom, canvas })
  const baseHeight = ARTBOARD_BASE_WIDTH * canvas.height / canvas.width
  const pageWidthMm = Number.isFinite(canvas.pageWidthMm) ? canvas.pageWidthMm : canvas.width / 10
  const pageHeightMm = Number.isFinite(canvas.pageHeightMm) ? canvas.pageHeightMm : canvas.height / 10
  const linuxExportWidth = pageWidthMm * 96 / 25.4
  const linuxExportHeight = pageHeightMm * 96 / 25.4
  document.documentElement.style.setProperty('--interface-scale', String(transforms.interfaceScale))
  document.documentElement.style.setProperty('--artboard-zoom', String(artboardZoom))
  document.documentElement.style.setProperty('--artboard-base-height', `${baseHeight}px`)
  document.documentElement.style.setProperty('--linux-export-width', `${linuxExportWidth}px`)
  document.documentElement.style.setProperty('--linux-export-height', `${linuxExportHeight}px`)
  document.documentElement.style.setProperty('--linux-export-scale', String(linuxExportWidth / ARTBOARD_BASE_WIDTH))
  elements.artboardShell.style.width = `${transforms.artboardViewport.width}px`
  elements.artboardShell.style.height = `${transforms.artboardViewport.height}px`
  document.documentElement.dataset.workspaceLayout = workspaceLayoutMode({ viewportWidth: window.innerWidth, interfaceScale })
  elements.interfaceScale.value = String(interfaceScale)
  elements.artboardZoom.value = String(artboardZoom)
  elements.zoomLabel.textContent = `${Math.round(artboardZoom * 100)}%`
}

function boundedArtboardZoom(requested) {
  const minimum = Number(elements.artboardZoom.min)
  const maximum = Number(elements.artboardZoom.max)
  return Math.min(maximum, Math.max(minimum, Number(requested)))
}

function flushArtboardZoomPreview() {
  if (pendingArtboardZoomFrame !== null) cancelAnimationFrame(pendingArtboardZoomFrame)
  pendingArtboardZoomFrame = null
  artboardZoom = pendingArtboardZoom
  applyScales()
}

function previewArtboardZoom(requested) {
  pendingArtboardZoom = boundedArtboardZoom(requested)
  artboardZoomGeneration += 1
  if (pendingArtboardZoomFrame !== null) return artboardZoomGeneration
  pendingArtboardZoomFrame = requestAnimationFrame(() => {
    pendingArtboardZoomFrame = null
    artboardZoom = pendingArtboardZoom
    applyScales()
  })
  return artboardZoomGeneration
}

function markArtboardZoomPersisted(value) {
  persistedArtboardZoom = boundedArtboardZoom(value)
  pendingArtboardZoom = persistedArtboardZoom
}

async function setArtboardZoom(requested) {
  const generation = previewArtboardZoom(requested)
  flushArtboardZoomPreview()
  try {
    const result = await window.deckBridge.setArtboardZoom({ value: pendingArtboardZoom })
    if (generation !== artboardZoomGeneration) return
    persistedArtboardZoom = result.artboardZoom
    artboardZoom = result.artboardZoom
    pendingArtboardZoom = result.artboardZoom
    applyScales()
  } catch (error) {
    if (generation !== artboardZoomGeneration) return
    artboardZoom = persistedArtboardZoom
    pendingArtboardZoom = persistedArtboardZoom
    applyScales()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
  }
}

function fittedArtboardZoom() {
  const style = getComputedStyle(elements.stageScroll)
  const availableWidth = elements.stageScroll.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  const availableHeight = elements.stageScroll.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const baseHeight = ARTBOARD_BASE_WIDTH * canvas.height / canvas.width
  const raw = Math.min(availableWidth / ARTBOARD_BASE_WIDTH, availableHeight / baseHeight)
  const step = Number(elements.artboardZoom.step)
  const minimum = Number(elements.artboardZoom.min)
  const maximum = Number(elements.artboardZoom.max)
  return Math.min(maximum, Math.max(minimum, Math.floor(raw / step) * step))
}
