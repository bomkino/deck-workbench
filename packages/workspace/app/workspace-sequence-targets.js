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
    const target = document.createElement('input')
    target.type = 'text'
    target.readOnly = true
    target.inputMode = 'none'
    target.className = 'slide-focus-target'
    target.dataset.slideId = slideId
    target.value = row.getAttribute('aria-label') ?? ''
    target.setAttribute('role', 'button')
    for (const attribute of ['aria-label', 'aria-current', 'aria-keyshortcuts', 'aria-disabled']) {
      const value = row.getAttribute(attribute)
      if (value !== null) target.setAttribute(attribute, value)
      row.removeAttribute(attribute)
    }
    row.removeAttribute('data-slide-id')
    row.tabIndex = -1
    row.setAttribute('aria-hidden', 'true')
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
