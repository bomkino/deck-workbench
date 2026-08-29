function selectedPlanRecord() {
  const location = findStoryLocation(selectedSlideId)
  if (location) return planRecordForSlide(location.slide, location.section)
  if (projection?.slide?.id !== selectedSlideId) return null
  const slide = {
    ...projection.slide,
    contentBlocks: projection.contentBlocks ?? [],
  }
  const section = projection.section ?? {
    id: projection.slide.sectionId ?? 'selected-part',
    title: 'Selected Part',
  }
  return planRecordForSlide(slide, section)
}

const renderPlanEditorFromStory = renderPlanEditor
renderPlanEditor = function renderPlanEditorWithProjectionFallback() {
  if (storyDocument || !projection) return renderPlanEditorFromStory()
  const fallbackSection = projection.section ?? {
    id: projection.slide.sectionId ?? 'selected-part',
    title: 'Selected Part',
  }
  const fallbackSlide = {
    ...projection.slide,
    contentBlocks: projection.contentBlocks ?? [],
  }
  storyDocument = {
    deckTitle: projection.deckTitle,
    revision: projection.revision,
    sections: [{ ...fallbackSection, slides: [fallbackSlide] }],
  }
  try {
    return renderPlanEditorFromStory()
  } finally {
    storyDocument = null
  }
}

refreshWorkspace = async function refreshWorkspaceAtomically(requestedSlideId = selectedSlideId, focus = {}) {
  const generation = ++refreshGeneration
  try {
    const nextStory = await window.deckBridge.query({ name: 'story.document', params: {} })
    if (generation !== refreshGeneration) return projection
    const orderedSlides = nextStory.sections.flatMap((section) => section.slides)
    const fallbackSlideId = orderedSlides[0]?.id ?? null
    const nextSelectedSlideId = orderedSlides.some((slide) => slide.id === requestedSlideId)
      ? requestedSlideId
      : fallbackSlideId
    const nextProjection = nextSelectedSlideId
      ? await window.deckBridge.query({ name: 'slide.activeProjection', params: { slideId: nextSelectedSlideId } })
      : null
    if (generation !== refreshGeneration) return projection
    let nextAssetCatalog = []
    if (nextProjection) {
      try {
        const result = await window.deckBridge.query({ name: 'asset.catalog', params: {} })
        nextAssetCatalog = result.assets ?? []
      } catch {
        nextAssetCatalog = []
      }
    }
    if (generation !== refreshGeneration) return projection
    storyDocument = nextStory
    selectedSlideId = nextSelectedSlideId
    projection = nextProjection
    assetCatalog = nextAssetCatalog
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

function patchStoryDocumentFromProjection(next) {
  if (!storyDocument || !next?.slide) return
  storyDocument.deckTitle = next.deckTitle ?? storyDocument.deckTitle
  storyDocument.revision = next.revision ?? storyDocument.revision
  const sectionId = next.section?.id ?? next.slide.sectionId
  const section = storyDocument.sections.find((candidate) => candidate.id === sectionId)
  if (!section) return
  const index = section.slides.findIndex((candidate) => candidate.id === next.slide.id)
  const slide = {
    ...(index >= 0 ? section.slides[index] : {}),
    ...next.slide,
    contentBlocks: next.contentBlocks ?? [],
  }
  if (index >= 0) section.slides.splice(index, 1, slide)
  else section.slides.push(slide)
}

renderProjection = function renderProjectionFromCanonicalCache(next) {
  projection = next
  selectedSlideId = next?.slide?.id ?? selectedSlideId
  const cachedStory = globalThis.__deckBridgeStoryDocument
  if (cachedStory?.revision === next?.revision) storyDocument = cachedStory
  else patchStoryDocumentFromProjection(next)
  const cachedAssets = globalThis.__deckBridgeAssetCatalog
  if (cachedAssets?.assets) assetCatalog = cachedAssets.assets
  renderAll()
  return next
}

function bindWorkspaceEvents() {
  elements.phaseButtons.forEach((button) => button.addEventListener('click', () => setPhase(button.dataset.phase)))
  elements.undo.addEventListener('click', () => historyAction('undo'))
  elements.redo.addEventListener('click', () => historyAction('redo'))
  elements.interfaceScale.addEventListener('change', async () => {
    try {
      const result = await window.deckBridge.setInterfaceScale({ value: Number(elements.interfaceScale.value) })
      interfaceScale = result.interfaceScale
      applyScales()
    } catch (error) {
      setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    }
  })
  bindPlanEvents()
  elements.cutSlide.addEventListener('click', (event) => {
    event.stopImmediatePropagation()
    const record = selectedPlanRecord()
    if (record) void setSlideLifecycle(record.slide.id, record.metadata.lifecycle === 'cut' ? 'included' : 'cut')
  }, { capture: true })
  bindVisualEvents()
  elements.fitArtboard.textContent = 'Fit Artboard'
  bindHandoffEvents()
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    if (['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault()
      setPhase(['plan', 'curate', 'assemble', 'handoff'][Number(event.key) - 1])
    }
  })
  window.addEventListener('resize', applyScales)
}

async function boot() {
  bindWorkspaceEvents()
  try {
    const preferences = await window.deckBridge.getPreferences()
    interfaceScale = preferences.interfaceScale
    artboardZoom = preferences.artboardZoom
    applyScales()
    const next = await window.deckBridge.query({ name: 'slide.activeProjection', params: {} })
    projection = next
    selectedSlideId = next.slide.id
    await refreshWorkspace(selectedSlideId)
  } catch {
    applyScales()
    renderAll()
  }
}

window.deckWorkbench = Object.freeze({
  renderProjection,
  clearProjection,
  exportFrame() {
    activePhase = 'assemble'
    renderAll()
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
  phase() {
    return activePhase
  },
})

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true })
else void boot()
