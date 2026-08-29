function captureWorkspaceFocus() {
  const active = document.activeElement
  if (!active || active === document.body || active === document.documentElement) return null
  const slideId = active?.dataset?.slideId
    ?? active?.closest?.('.slide-entry')?.querySelector?.('[data-slide-id]')?.dataset?.slideId
    ?? null
  const sectionId = active?.dataset?.sectionId
    ?? active?.closest?.('[data-section-id]')?.dataset?.sectionId
    ?? null
  const blockId = active?.dataset?.blockId ?? null
  const headline = active === elements.headline
  return {
    slideId,
    sectionId,
    blockId,
    headline,
    selectionStart: typeof active?.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active?.selectionEnd === 'number' ? active.selectionEnd : null,
  }
}

function focusWasLost() {
  const active = document.activeElement
  return !active
    || active === document.body
    || active === document.documentElement
    || active === elements.workbench
    || active === elements.phaseWorkspaces
}

function restoreWorkspaceFocus(target, { onlyIfLost = false } = {}) {
  if (!target || (onlyIfLost && !focusWasLost())) return false
  let node = null
  if (target.blockId) node = storyField(target.blockId)
  else if (target.headline) node = elements.headline
  else if (target.slideId) node = elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(target.slideId)}"]`)
  else if (target.sectionId) node = elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(target.sectionId)}"]`)
  if (!node || node.disabled || !node.isConnected) return false
  node.focus()
  if (
    target.selectionStart !== null
    && target.selectionEnd !== null
    && typeof node.setSelectionRange === 'function'
  ) {
    const maximum = node.value?.length ?? 0
    node.setSelectionRange(
      Math.min(target.selectionStart, maximum),
      Math.min(target.selectionEnd, maximum),
    )
  }
  return document.activeElement === node
}

const renderSequenceWithoutFocusPreservation = renderSequence
renderSequence = function renderSequenceWithFocusPreservation(next) {
  const target = captureWorkspaceFocus()
  renderSequenceWithoutFocusPreservation(next)
  restoreWorkspaceFocus(target)
}

const renderPlanEditorWithoutFocusPreservation = renderPlanEditor
renderPlanEditor = function renderPlanEditorWithFocusPreservation() {
  const target = captureWorkspaceFocus()
  renderPlanEditorWithoutFocusPreservation()
  restoreWorkspaceFocus(target)
}

const nativeDeckBridge = window.deckBridge
window.deckBridge = Object.freeze({
  ...nativeDeckBridge,
  async query(payload = {}) {
    const target = captureWorkspaceFocus()
    try {
      return await nativeDeckBridge.query(payload)
    } finally {
      restoreWorkspaceFocus(target, { onlyIfLost: true })
    }
  },
})

async function executeSequenceMove(type, payload, requestedSlideId, focus, sourceKind) {
  if (!projection) return null
  setBusy(`Writing ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: sourceKind, label: 'Sequence reorder' },
        issuedAt: new Date().toISOString(),
      },
    })
    const nextProjection = await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: requestedSlideId ? { slideId: requestedSlideId } : {},
    })
    const nextStory = await window.deckBridge.query({ name: 'story.document', params: {} })
    projection = nextProjection
    selectedSlideId = nextProjection.slide.id
    storyDocument = nextStory
    renderAll()
    restoreWorkspaceFocus(focus)
    return projection
  } catch (error) {
    renderAll()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    return null
  }
}

async function planSlideMove(sectionId, slideId, direction, sourceKind) {
  const canonicalStory = await window.deckBridge.query({ name: 'story.document', params: {} })
  storyDocument = canonicalStory
  const payload = slideMovePlan(canonicalStory, sectionId, slideId, direction)
  if (!payload) {
    setStatus(`Slide cannot move ${direction}`)
    restoreWorkspaceFocus({ slideId })
    return null
  }
  return executeSequenceMove('slide.move', payload, slideId, { slideId }, sourceKind)
}

async function planSectionMove(sectionId, direction, sourceKind) {
  const canonicalStory = await window.deckBridge.query({ name: 'story.document', params: {} })
  storyDocument = canonicalStory
  const payload = sectionMovePlan(canonicalStory, sectionId, direction)
  if (!payload) {
    setStatus(`Part cannot move ${direction}`)
    restoreWorkspaceFocus({ sectionId })
    return null
  }
  return executeSequenceMove('section.move', payload, selectedSlideId, { sectionId }, sourceKind)
}

moveSlide = async function moveSlideFromCanonicalStory(sectionId, slideId, direction) {
  await planSlideMove(sectionId, slideId, direction, 'ui')
}

moveSlideByKeyboard = function moveSlideByKeyboardFromCanonicalStory(event, sectionId, slideId) {
  const direction = sequenceShortcut(event)
  if (!direction) return
  event.preventDefault()
  void planSlideMove(sectionId, slideId, direction, 'keyboard')
}

moveSection = async function moveSectionFromCanonicalStory(sectionId, direction) {
  await planSectionMove(sectionId, direction, 'ui')
}

moveSectionByKeyboard = function moveSectionByKeyboardFromCanonicalStory(event, sectionId) {
  if (event.target !== event.currentTarget) return
  const direction = sequenceShortcut(event)
  if (!direction) return
  event.preventDefault()
  void planSectionMove(sectionId, direction, 'keyboard')
}
