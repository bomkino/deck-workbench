function installSequenceFocusTargets() {
  let sectionId = null
  for (const child of elements.sequenceList.children) {
    if (child.matches?.('[data-section-id]')) {
      sectionId = child.dataset.sectionId
      continue
    }
    const row = child.querySelector?.('button.slide-row[data-slide-id]')
    if (!row || !sectionId) continue
    const slideId = row.dataset.slideId
    const targetSectionId = sectionId
    const target = document.createElement('textarea')
    target.rows = 1
    target.wrap = 'off'
    target.inputMode = 'none'
    target.autocomplete = 'off'
    target.spellcheck = false
    target.className = 'slide-focus-target'
    target.dataset.slideId = slideId
    target.value = ''
    target.setAttribute('role', 'button')
    for (const attribute of ['aria-label', 'aria-current', 'aria-keyshortcuts', 'aria-disabled']) {
      const value = row.getAttribute(attribute)
      if (value !== null) target.setAttribute(attribute, value)
      row.removeAttribute(attribute)
    }
    row.removeAttribute('data-slide-id')
    row.tabIndex = -1
    row.setAttribute('aria-hidden', 'true')
    const preventTextMutation = (event) => {
      event.preventDefault()
      target.value = ''
    }
    target.addEventListener('beforeinput', preventTextMutation)
    target.addEventListener('paste', preventTextMutation)
    target.addEventListener('drop', preventTextMutation)
    target.addEventListener('input', () => { target.value = '' })
    target.addEventListener('click', () => selectSlide(slideId))
    target.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        void selectSlide(slideId)
        return
      }
      moveSlideByKeyboard(event, targetSectionId, slideId)
    })
    row.before(target)
  }
}

const renderSequenceWithoutStableTargets = renderSequence
renderSequence = function renderSequenceWithStableTargets(next) {
  renderSequenceWithoutStableTargets(next)
  installSequenceFocusTargets()
}
