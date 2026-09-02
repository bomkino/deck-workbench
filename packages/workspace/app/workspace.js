selectedPlanRecord = function selectedPlanRecordWithProjectionFallback() {
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
      if (focus.slideId) focusSequenceTarget({ kind: 'slide', id: focus.slideId })
      if (focus.sectionId) focusSequenceTarget({ kind: 'section', id: focus.sectionId })
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
  if (slideId && (slideId !== selectedSlideId || projection?.slide?.id !== slideId)) {
    const priorPhase = activePhase
    if (phase !== 'curate') closeCurateOverlays()
    activePhase = phase
    pendingWorkspaceSlideId = slideId
    const next = await refreshWorkspace(slideId)
    if (!next || next.slide?.id !== slideId) {
      activePhase = priorPhase
      renderAll()
      return false
    }
    if (phase !== priorPhase) elements.phaseViews.find((view) => view.dataset.phaseView === phase)?.focus({ preventScroll: true })
    return true
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

function workspaceDraftSummary({ capturePlan = true } = {}) {
  if (capturePlan) captureCurrentPlanDraft()
  const plan = planDraftDeltas.size
  const findMore = curateFindMoreDrafts.size
  return { plan, findMore, total: plan + findMore }
}

function updateWorkspaceDraftStatus(options = {}) {
  if (!projection) {
    setStatus('No document session')
    return workspaceDraftSummary({ capturePlan: false })
  }
  const summary = workspaceDraftSummary(options)
  setStatus(summary.total
    ? `${summary.total} unsaved Slide draft${summary.total === 1 ? '' : 's'}`
    : 'All changes saved')
  return summary
}

async function saveWorkspaceDrafts() {
  const before = workspaceDraftSummary()
  const plan = await saveAllPlanDrafts()
  if (!plan.saved) return { saved: false, before, plan, findMore: { saved: false, count: 0 } }
  const findMore = await saveAllCurateFindMoreDrafts()
  const after = workspaceDraftSummary()
  return { saved: findMore.saved && after.total === 0, before, after, plan, findMore }
}

const clearProjectionWithoutRefreshInvalidation = clearProjection
clearProjection = function clearProjectionAndInvalidateRefresh() {
  refreshGeneration += 1
  pendingWorkspaceSlideId = null
  pendingProjectionFocus = null
  clearPlanDrafts()
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
    restored = focusSequenceTarget({ kind: 'slide', id: target.slideId })
  } else if (target.sectionId) {
    restored = focusSequenceTarget({ kind: 'section', id: target.sectionId })
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
    clearPlanDrafts()
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
  elements.createDeck.addEventListener('click', () => void presentDocumentAction('create', 'Creating Deck…'))
  elements.openDeck.addEventListener('click', () => void presentDocumentAction('open', 'Opening Deck…'))
  elements.phaseButtons.forEach((button) => button.addEventListener('click', () => void enterPhaseForSlide(button.dataset.phase)))
  elements.undo.addEventListener('click', () => historyAction('undo'))
  elements.redo.addEventListener('click', () => historyAction('redo'))
  elements.toggleNavigator.addEventListener('click', () => toggleWorkspacePanel('navigator'))
  elements.toggleInspector.addEventListener('click', () => toggleWorkspacePanel('inspector'))
  elements.theme.addEventListener('change', async () => {
    try {
      const result = await window.deckBridge.setTheme({ value: elements.theme.value })
      applyThemePreference(result.theme)
    } catch (error) {
      elements.theme.value = themePreference
      setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    }
  })
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
  elements.cutSlide.addEventListener('click', () => {
    const record = selectedPlanRecord()
    if (record) void setSlideLifecycle(record.slide.id, record.metadata.lifecycle === 'cut' ? 'included' : 'cut', 'editor')
  })
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
  themeMediaQuery?.addEventListener('change', () => {
    if (themePreference === 'system') applyThemePreference('system')
  })
}

async function presentDocumentAction(method, busyLabel) {
  setBusy(busyLabel)
  try {
    await window.deckBridge[method]()
    setIdle()
  } catch (error) {
    if (error?.name === 'JobCancelled') {
      setIdle()
      return
    }
    setStatus(`${error?.name ?? 'Error'}: ${error?.message ?? 'Document action failed'}`)
  }
}

async function boot() {
  bindWorkspaceEvents()
  try {
    await loadWorkbenchFonts()
    const preferences = await window.deckBridge.getPreferences()
    applyThemePreference(preferences.theme ?? 'system')
    interfaceScale = preferences.interfaceScale
    artboardZoom = preferences.artboardZoom
    markArtboardZoomPersisted(artboardZoom)
    applyScales()
    const next = await window.deckBridge.query({ name: 'slide.activeProjection', params: {} })
    projection = next
    selectedSlideId = next.slide.id
    await refreshWorkspace(selectedSlideId)
  } catch (error) {
    applyScales()
    renderAll()
    const documentUnavailable = error?.name === 'DocumentUnavailable'
      || String(error?.message ?? '').includes('DocumentUnavailable:')
    const message = documentUnavailable
      ? 'No document session'
      : `${error?.name ?? 'Error'}: ${error?.message ?? 'Workbench could not load'}`
    setStatus(message)
  }
}

async function loadWorkbenchFonts() {
  const fontSet = document.fonts
  if (!fontSet) {
    document.documentElement.dataset.fontsReady = 'true'
    return
  }
  const requiredFaces = [
    ['500 1rem "PD Head"', 'Workbench'],
    ['500 1rem "PD Head Alt"', 'Workbench'],
    ['400 1rem "PD Body"', 'Workbench'],
    ['italic 400 1rem "PD Body"', 'Workbench'],
    ['400 1rem "PD Body Alt"', 'Workbench'],
    ['italic 400 1rem "PD Body Alt"', 'Workbench'],
    ['500 1rem "PD Eyebrow"', 'WORKBENCH'],
    ['400 1rem "Phosphor"', '\uE136'],
  ]
  try {
    const loaded = await Promise.all(requiredFaces.map(([font, sample]) => fontSet.load(font, sample)))
    await fontSet.ready
    if (loaded.some((faces) => faces.length === 0)) throw new Error('A required bundled UI font did not load')
  } finally {
    document.documentElement.dataset.fontsReady = 'true'
  }
}

let workspaceExportSession = null
let workspaceExportPreparing = false
let workspaceExportSequence = 0

window.deckWorkbench = Object.freeze({
  renderProjection,
  clearProjection,
  selectSlide,
  async exportFrame(mode = 'native') {
    if (!['native', 'linux'].includes(mode)) throw new RangeError('Unknown workspace export mode')
    if (workspaceExportSession || workspaceExportPreparing) return { error: 'ExportBusy' }
    workspaceExportPreparing = true
    const returnPhase = activePhase
    let exportSurfaceStarted = false
    try {
      const preparation = await prepareAssemblyForExport(projection)
      if (preparation?.error) return preparation
      const exportProjection = preparation?.projection
      if (!exportProjection || projection !== exportProjection) return { error: 'ExportStale' }
      await (document.fonts?.ready ?? Promise.resolve())
      if (projection !== exportProjection) return { error: 'ExportStale' }
      const overflowCount = compositionOverflowCountForProjection(exportProjection)
      if (overflowCount > 0) return { error: 'CompositionOverflow', overflowCount }

      const token = String(++workspaceExportSequence)
      exportSurfaceStarted = true
      activePhase = 'assemble'
      renderAll()
      elements.workbench.inert = true
      document.documentElement.dataset.workspaceExport = mode
      if (!await waitForAssemblyImageDecode(exportProjection)) {
        return {
          error: 'AssemblyMediaUnavailable',
          message: 'Assigned media did not load completely; PDF export was not started',
        }
      }
      document.documentElement.getBoundingClientRect()
      if (projection !== exportProjection) return { error: 'ExportStale' }
      const rect = elements.artboard.getBoundingClientRect()
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
        throw new RangeError('Slide export frame is invalid')
      }
      workspaceExportSession = { token, returnPhase }
      exportSurfaceStarted = false
      const exportCanvas = exportProjection.canvas
      return {
        token,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        canvasPresetId: exportCanvas.id ?? 'cinemascope-2576x1080',
        canvasWidth: exportCanvas.width,
        canvasHeight: exportCanvas.height,
        pageWidthMm: Number.isFinite(exportCanvas.pageWidthMm) ? exportCanvas.pageWidthMm : exportCanvas.width / 10,
        pageHeightMm: Number.isFinite(exportCanvas.pageHeightMm) ? exportCanvas.pageHeightMm : exportCanvas.height / 10,
      }
    } finally {
      workspaceExportPreparing = false
      if (exportSurfaceStarted && !workspaceExportSession) {
        delete document.documentElement.dataset.workspaceExport
        elements.workbench.inert = false
        activePhase = returnPhase
        try { renderAll() } catch {}
      }
    }
  },
  finishExport(token) {
    if (!workspaceExportSession || token !== workspaceExportSession.token) return { finished: false }
    const returnPhase = workspaceExportSession.returnPhase
    workspaceExportSession = null
    delete document.documentElement.dataset.workspaceExport
    elements.workbench.inert = false
    if (returnPhase) activePhase = returnPhase
    renderAll()
    return { finished: true }
  },
  async tracerEditHeadline(text) {
    elements.headline.value = text
    await commitHeadline()
    return projection
  },
  projection() {
    return projection
  },
  draftSummary: workspaceDraftSummary,
  saveDrafts: saveWorkspaceDrafts,
  phase() {
    return activePhase
  },
  theme() {
    return applyThemePreference(themePreference)
  },
})

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true })
else void boot()
