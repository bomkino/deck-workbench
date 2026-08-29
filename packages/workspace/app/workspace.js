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

function workspaceSnapshotRevisionsMatch(story, slideProjection, curateSnapshot, expectedSlideId) {
  const expectedRevision = story?.revision
  if (expectedRevision === null || expectedRevision === undefined) return false
  if (curateSnapshot?.queueRevision !== expectedRevision) return false
  if (!expectedSlideId) return slideProjection === null && !curateSnapshot?.slide?.slide
  return slideProjection?.slide?.id === expectedSlideId
    && curateSnapshot?.slide?.slide?.id === expectedSlideId
    && slideProjection?.revision === expectedRevision
    && curateSnapshot?.slide?.revision === expectedRevision
}

refreshWorkspace = async function refreshWorkspaceAtomically(requestedSlideId = selectedSlideId, focus = {}) {
  const generation = ++refreshGeneration
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
      const nextCurateSnapshot = await prepareCuratePhaseSnapshot(nextSelectedSlideId)
      if (generation !== refreshGeneration) return projection
      if (
        !workspaceSnapshotRevisionsMatch(nextStory, nextProjection, nextCurateSnapshot, nextSelectedSlideId)
        || nextCurateSnapshot.assetStateMediaGeneration !== curateMediaLoadGeneration
      ) {
        if (attempt < 2) continue
        throw Object.assign(new Error('Workspace changed while its Story, Slide, and Curate snapshots were loading'), {
          name: 'QuerySnapshotChanged',
        })
      }
      storyDocument = nextStory
      selectedSlideId = nextSelectedSlideId
      projection = nextProjection
      commitCuratePhaseSnapshot(nextCurateSnapshot)
      if (pendingWorkspaceSlideId === requestedSlideId) pendingWorkspaceSlideId = null
      renderAll()
      if (focus.slideId) elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(focus.slideId)}"]`)?.focus()
      if (focus.sectionId) elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(focus.sectionId)}"]`)?.focus()
      return projection
    }
    return projection
  } catch (error) {
    if (generation === refreshGeneration && pendingWorkspaceSlideId === requestedSlideId) pendingWorkspaceSlideId = null
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    elements.workbench.setAttribute('aria-busy', 'false')
    return null
  }
}

async function enterPhaseForSlide(phase, slideId = selectedSlideId) {
  if (!['plan', 'curate', 'assemble', 'handoff'].includes(phase)) return false
  if (slideId) {
    pendingWorkspaceSlideId = slideId
    const next = await refreshWorkspace(slideId)
    if (!next || next.slide?.id !== slideId) return false
  }
  setPhase(phase)
  return true
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

let pendingProjectionFocus = null

const clearProjectionWithoutRefreshInvalidation = clearProjection
clearProjection = function clearProjectionAndInvalidateRefresh() {
  refreshGeneration += 1
  pendingWorkspaceSlideId = null
  pendingProjectionFocus = null
  return clearProjectionWithoutRefreshInvalidation()
}

function queueProjectionFocus(target) {
  pendingProjectionFocus = target ? { ...target } : null
}

function applyPendingProjectionFocus() {
  const target = pendingProjectionFocus
  if (!target) return false
  let restored = false
  if (target.blockId) {
    restored = restoreStoryFocus(target.blockId)
  } else if (target.slideId) {
    const node = elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(target.slideId)}"]`)
    node?.focus({ preventScroll: true })
    restored = document.activeElement === node
  } else if (target.sectionId) {
    const node = elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(target.sectionId)}"]`)
    node?.focus({ preventScroll: true })
    restored = document.activeElement === node
  }
  if (restored) pendingProjectionFocus = null
  return restored
}

renderProjection = function renderProjectionFromCanonicalCache(next) {
  if (!next) {
    clearProjection()
    return null
  }
  const priorDeckId = curateDocumentDeckId ?? projection?.deckId ?? storyDocument?.deckId ?? null
  const nextDeckId = next?.deckId ?? null
  const documentChanged = Boolean(priorDeckId && nextDeckId && priorDeckId !== nextDeckId)
  const refreshSlideId = documentChanged || priorDeckId === null
    ? next.slide?.id ?? null
    : pendingWorkspaceSlideId ?? selectedSlideId ?? next.slide?.id ?? null
  if (!documentChanged && priorDeckId !== null) {
    if (refreshSlideId) {
      pendingWorkspaceSlideId = refreshSlideId
      void refreshWorkspace(refreshSlideId).then(() => applyPendingProjectionFocus())
    }
    return next
  }
  if (documentChanged) {
    refreshGeneration += 1
    clearCurateState()
    storyDocument = null
    selectedSlideId = null
    pendingWorkspaceSlideId = null
    pendingProjectionFocus = null
  }
  projection = next
  selectedSlideId = refreshSlideId
  const cachedStory = globalThis.__deckBridgeStoryDocument
  if (cachedStory?.deckId === nextDeckId && cachedStory?.revision === next?.revision) storyDocument = cachedStory
  else patchStoryDocumentFromProjection(next)
  renderAll()
  applyPendingProjectionFocus()
  if (selectedSlideId) void refreshWorkspace(selectedSlideId).then(() => applyPendingProjectionFocus())
  return next
}

const executeStructuralWithoutProjectionFocus = executeStructural
executeStructural = async function executeStructuralWithProjectionFocus(type, payload, requestedSlideId = selectedSlideId, options = {}) {
  if (options.focus) queueProjectionFocus(options.focus)
  return executeStructuralWithoutProjectionFocus(type, payload, requestedSlideId, options)
}

const updateContentBlockWithoutProjectionFocus = updateContentBlock
updateContentBlock = async function updateContentBlockWithProjectionFocus(blockId, value, options = {}) {
  if (options.restoreFocus) queueProjectionFocus({ blockId })
  return updateContentBlockWithoutProjectionFocus(blockId, value, options)
}

const historyActionWithoutProjectionFocus = historyAction
historyAction = async function historyActionWithProjectionFocus(method, restoreFocusBlockId = null) {
  if (restoreFocusBlockId) queueProjectionFocus({ blockId: restoreFocusBlockId })
  return historyActionWithoutProjectionFocus(method, restoreFocusBlockId)
}

function bindWorkspaceEvents() {
  elements.phaseButtons.forEach((button) => button.addEventListener('click', () => void enterPhaseForSlide(button.dataset.phase)))
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
  bindCurateEvents()
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
      void enterPhaseForSlide(['plan', 'curate', 'assemble', 'handoff'][Number(event.key) - 1])
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
  selectSlide,
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
