const renderSequenceWithoutFocusPreservation = renderSequence
renderSequence = function renderSequenceWithFocusPreservation(next) {
  const active = document.activeElement
  const activeSlideId = active?.dataset?.slideId
    ?? active?.closest?.('.slide-entry')?.querySelector?.('[data-slide-id]')?.dataset?.slideId
    ?? null
  const activeSectionId = active?.dataset?.sectionId
    ?? active?.closest?.('[data-section-id]')?.dataset?.sectionId
    ?? null

  renderSequenceWithoutFocusPreservation(next)

  if (activeSlideId) {
    const slide = elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(activeSlideId)}"]`)
    slide?.focus({ preventScroll: true })
    return
  }
  if (activeSectionId) {
    const section = elements.sequenceList.querySelector(`[data-section-id="${CSS.escape(activeSectionId)}"]`)
    section?.focus({ preventScroll: true })
  }
}

const renderPlanEditorWithoutFocusPreservation = renderPlanEditor
renderPlanEditor = function renderPlanEditorWithFocusPreservation() {
  const active = document.activeElement
  const activeBlockId = active?.dataset?.blockId ?? null
  const headlineFocused = active === elements.headline
  const selectionStart = typeof active?.selectionStart === 'number' ? active.selectionStart : null
  const selectionEnd = typeof active?.selectionEnd === 'number' ? active.selectionEnd : null

  renderPlanEditorWithoutFocusPreservation()

  const field = activeBlockId
    ? storyField(activeBlockId)
    : headlineFocused
      ? elements.headline
      : null
  if (!field || field.disabled) return
  field.focus({ preventScroll: true })
  if (selectionStart !== null && selectionEnd !== null) {
    const maximum = field.value.length
    field.setSelectionRange(Math.min(selectionStart, maximum), Math.min(selectionEnd, maximum))
  }
}
