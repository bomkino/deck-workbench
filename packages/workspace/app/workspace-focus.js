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
  node.focus({ preventScroll: true })
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
