let workspaceFocusLease = 0
let workspaceInteractionGeneration = 0
let workspaceExpectedFocus = null
let workspaceExpectedFocusGeneration = 0
let applyingWorkspaceFocus = false

function semanticSequenceTargetForNode(active) {
  if (!active || !elements.sequenceList.contains(active)) return null
  const state = sequenceFocusState()
  if (state.kind && state.id) return { sequenceKind: state.kind, sequenceId: state.id }
  const item = active.closest?.('[data-sequence-kind]')
    ?? active.closest?.('.slide-entry')?.querySelector?.('[data-sequence-kind="slide"]')
  return item
    ? { sequenceKind: item.dataset.sequenceKind, sequenceId: item.dataset.sequenceId }
    : null
}

function workspaceFocusTarget(active) {
  if (!active || active === document.body || active === document.documentElement) return null
  const sequence = active === elements.sequenceList
    ? sequenceFocusState()
    : semanticSequenceTargetForNode(active)
  if (sequence?.kind && sequence?.id) return { sequenceKind: sequence.kind, sequenceId: sequence.id }
  if (sequence?.sequenceKind && sequence?.sequenceId) return sequence
  const blockId = active?.dataset?.blockId ?? null
  const headline = active === elements.headline
  if (!blockId && !headline) return null
  return {
    blockId,
    headline,
    selectionStart: typeof active?.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active?.selectionEnd === 'number' ? active.selectionEnd : null,
  }
}

function captureWorkspaceFocus() {
  return workspaceFocusTarget(document.activeElement)
}

function rememberWorkspaceFocus(target) {
  if (!target) return
  workspaceExpectedFocus = { ...target }
  workspaceExpectedFocusGeneration = workspaceInteractionGeneration
}

function expectedWorkspaceFocus() {
  return workspaceExpectedFocusGeneration === workspaceInteractionGeneration
    ? workspaceExpectedFocus
    : null
}

function workspaceFocusNode(target) {
  if (!target) return null
  if (target.sequenceKind && target.sequenceId) return elements.sequenceList
  if (target.blockId) return storyField(target.blockId)
  if (target.headline) return elements.headline
  return null
}

function focusWorkspaceNode(node, target) {
  if (target?.sequenceKind && target?.sequenceId) {
    const restored = focusSequenceTarget({ kind: target.sequenceKind, id: target.sequenceId })
    if (restored) rememberWorkspaceFocus(target)
    return restored
  }
  if (!node || node.disabled || !node.isConnected) return false
  applyingWorkspaceFocus = true
  try {
    try {
      node.focus({ preventScroll: true })
    } catch {
      node.focus()
    }
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
  } finally {
    applyingWorkspaceFocus = false
  }
  const restored = document.activeElement === node
  if (restored) rememberWorkspaceFocus(target)
  return restored
}

function cancelWorkspaceFocusLease() {
  workspaceFocusLease += 1
}

function recordTrustedWorkspaceInteraction(event) {
  if (!event.isTrusted) return
  workspaceInteractionGeneration += 1
  workspaceExpectedFocus = null
  workspaceExpectedFocusGeneration = workspaceInteractionGeneration
  cancelWorkspaceFocusLease()
}

document.addEventListener('pointerdown', recordTrustedWorkspaceInteraction, true)
document.addEventListener('keydown', recordTrustedWorkspaceInteraction, true)
document.addEventListener('focusin', (event) => {
  if (applyingWorkspaceFocus) return
  const target = workspaceFocusTarget(event.target)
  if (target) rememberWorkspaceFocus(target)
}, true)

function scheduleWorkspaceFocusLease(target) {
  if (!target) return
  rememberWorkspaceFocus(target)
  const leaseId = ++workspaceFocusLease
  const interactionGeneration = workspaceInteractionGeneration
  const delays = [0, 16, 64, 250]
  for (const delay of delays) {
    globalThis.setTimeout(() => {
      if (leaseId !== workspaceFocusLease || interactionGeneration !== workspaceInteractionGeneration) return
      const expected = expectedWorkspaceFocus() ?? target
      const node = workspaceFocusNode(expected)
      const sequenceState = expected.sequenceKind ? sequenceFocusState() : null
      const alreadyRestored = expected.sequenceKind
        ? sequenceState?.ownerFocused && sequenceState.kind === expected.sequenceKind && sequenceState.id === expected.sequenceId
        : document.activeElement === node
      if (!alreadyRestored) focusWorkspaceNode(node, expected)
    }, delay)
  }
}

function restoreWorkspaceFocus(target, { lease = false } = {}) {
  if (!target) return false
  const restored = focusWorkspaceNode(workspaceFocusNode(target), target)
  if (lease) scheduleWorkspaceFocusLease(target)
  return restored
}

const renderSequenceWithoutFocusPreservation = renderSequence
renderSequence = function renderSequenceWithFocusPreservation(next) {
  const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
  renderSequenceWithoutFocusPreservation(next)
  restoreWorkspaceFocus(target)
}

const renderPlanEditorWithoutFocusPreservation = renderPlanEditor
renderPlanEditor = function renderPlanEditorWithFocusPreservation() {
  const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
  renderPlanEditorWithoutFocusPreservation()
  restoreWorkspaceFocus(target)
}

const nativeDeckBridge = window.deckBridge
window.deckBridge = Object.freeze({
  ...nativeDeckBridge,
  async query(payload = {}) {
    const interactionGeneration = workspaceInteractionGeneration
    const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
    try {
      return await nativeDeckBridge.query(payload)
    } finally {
      if (interactionGeneration === workspaceInteractionGeneration) {
        restoreWorkspaceFocus(target, { lease: true })
      }
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
    restoreWorkspaceFocus({ sequenceKind: 'slide', sequenceId: slideId }, { lease: true })
    return null
  }
  return executeSequenceMove(
    'slide.move',
    payload,
    slideId,
    { sequenceKind: 'slide', sequenceId: slideId },
    sourceKind,
  )
}

async function planSectionMove(sectionId, direction, sourceKind) {
  const canonicalStory = await window.deckBridge.query({ name: 'story.document', params: {} })
  storyDocument = canonicalStory
  const payload = sectionMovePlan(canonicalStory, sectionId, direction)
  if (!payload) {
    setStatus(`Part cannot move ${direction}`)
    restoreWorkspaceFocus({ sequenceKind: 'section', sequenceId: sectionId }, { lease: true })
    return null
  }
  return executeSequenceMove(
    'section.move',
    payload,
    selectedSlideId,
    { sequenceKind: 'section', sequenceId: sectionId },
    sourceKind,
  )
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
  if (event.target !== event.currentTarget && event.target !== elements.sequenceList) return
  const direction = sequenceShortcut(event)
  if (!direction) return
  event.preventDefault()
  void planSectionMove(sectionId, direction, 'keyboard')
}
