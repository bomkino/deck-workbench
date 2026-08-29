let workspaceFocusLease = 0

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

function workspaceFocusNode(target) {
  if (!target) return null
  if (target.blockId) return storyField(target.blockId)
  if (target.headline) return elements.headline
  if (target.slideId) {
    return [...elements.sequenceList.querySelectorAll('[data-slide-id]')]
      .find((candidate) => candidate.dataset.slideId === target.slideId) ?? null
  }
  if (target.sectionId) {
    return [...elements.sequenceList.querySelectorAll('[data-section-id]')]
      .find((candidate) => candidate.dataset.sectionId === target.sectionId) ?? null
  }
  return null
}

function focusWorkspaceNode(node, target) {
  if (!node || node.disabled || !node.isConnected) return false
  node.focus()
  if (
    target.selectionStart !== null
    && target.selectionStart !== undefined
    && target.selectionEnd !== null
    && target.selectionEnd !== undefined
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

function scheduleWorkspaceFocusLease(target) {
  const leaseId = ++workspaceFocusLease
  globalThis.setTimeout(() => {
    if (leaseId !== workspaceFocusLease || !focusWasLost()) return
    focusWorkspaceNode(workspaceFocusNode(target), target)
  }, 0)
}

function restoreWorkspaceFocus(target, { onlyIfLost = false, lease = false } = {}) {
  if (!target) return false
  const node = workspaceFocusNode(target)
  const restored = onlyIfLost && !focusWasLost()
    ? document.activeElement === node
    : focusWorkspaceNode(node, target)
  if (lease) scheduleWorkspaceFocusLease(target)
  return restored
}

function cancelWorkspaceFocusLease() {
  workspaceFocusLease += 1
}

document.addEventListener('focusin', (event) => {
  if (event.target !== document.body && event.target !== document.documentElement) cancelWorkspaceFocusLease()
})

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
      restoreWorkspaceFocus(target, { onlyIfLost: true, lease: true })
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
    restoreWorkspaceFocus(focus, { lease: true })
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
    restoreWorkspaceFocus({ slideId }, { lease: true })
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
    restoreWorkspaceFocus({ sectionId }, { lease: true })
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
