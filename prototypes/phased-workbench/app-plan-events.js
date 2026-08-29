function bindPlanEvents() {
  elements.showAllParts.addEventListener('click', () => {
    planPartFilter = 'all'
    renderPlan()
  })
  elements.planSearch.addEventListener('input', (event) => {
    planSearch = event.target.value.toLowerCase()
    renderDeckMap()
  })
  elements.planStatusFilter.addEventListener('change', (event) => {
    planStatusFilter = event.target.value
    renderDeckMap()
  })
  elements.partsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-part-id]')
    if (!button) return
    planPartFilter = button.dataset.partId
    renderPlan()
  })
  elements.deckMap.addEventListener('click', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (!card) return
    const slideId = card.dataset.slideId
    state.selectedSlideId = slideId
    saveState()
    const action = event.target.closest('[data-slide-action]')?.dataset.slideAction
    if (!action) {
      renderDeckMap()
      return
    }
    if (action === 'edit') openPlanEditor(slideId)
    if (action === 'curate') setPhase('curate')
    if (action === 'skip') toggleSlideSkip(slideId)
    if (action === 'up') reorderSlide(slideId, -1)
    if (action === 'down') reorderSlide(slideId, 1)
  })
  elements.deckMap.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (card) openPlanEditor(card.dataset.slideId)
  })
  elements.deckMap.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (!card) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', card.dataset.slideId)
    card.classList.add('is-dragging')
  })
  elements.deckMap.addEventListener('dragend', () => {
    elements.deckMap.querySelectorAll('.is-dragging, .is-drop-target').forEach((node) => node.classList.remove('is-dragging', 'is-drop-target'))
  })
  elements.deckMap.addEventListener('dragover', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (!card) return
    event.preventDefault()
    elements.deckMap.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'))
    card.classList.add('is-drop-target')
  })
  elements.deckMap.addEventListener('drop', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (!card) return
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain')
    const targetIndex = state.slides.findIndex((slide) => slide.id === card.dataset.slideId)
    if (sourceId && targetIndex >= 0) {
      commit('Slide reordered', (draft) => {
        draft.slides = [...moveIncludedSlide(draft.slides, sourceId, targetIndex)]
      })
    }
  })

  elements.copyConversionPrompt.addEventListener('click', async () => {
    await navigator.clipboard.writeText(conversionPrompt)
    showToast('Conversion prompt copied')
  })
  elements.openImport.addEventListener('click', () => {
    elements.importMarkdown.value = sampleWorkbenchMarkdown()
    elements.importPreview.innerHTML = '<p>Paste or edit the Markdown, then preview it before importing.</p>'
    elements.applyImport.disabled = true
    pendingImport = null
    elements.importDialog.showModal()
  })
  elements.previewImport.addEventListener('click', () => {
    try {
      pendingImport = parseWorkbenchMarkdown(elements.importMarkdown.value)
      elements.importPreview.innerHTML = renderImportPreview(pendingImport)
      elements.applyImport.disabled = pendingImport.slides.length === 0
    } catch (error) {
      pendingImport = null
      elements.applyImport.disabled = true
      elements.importPreview.innerHTML = `<strong>Could not parse the document.</strong><p>${escapeHTML(error.message)}</p>`
    }
  })
  elements.applyImport.addEventListener('click', (event) => {
    if (!pendingImport) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    const imported = pendingImport
    commit(`Imported ${imported.slides.length} Slides`, (draft) => {
      draft.project.title = imported.title || draft.project.title
      draft.project.version = imported.version || draft.project.version
      draft.parts = imported.parts
      draft.slides = imported.slides
      draft.selectedSlideId = imported.slides[0]?.id ?? null
      draft.slideMediaDecisions = {}
    })
    seedMediaDecisions()
    elements.importDialog.close()
  })

  elements.saveSlideEdit.addEventListener('click', (event) => {
    event.preventDefault()
    savePlanEditor()
    elements.planEditor.close()
  })
  elements.editTextPresence.addEventListener('change', updatePlanEditorCopyVisibility)
  elements.editContentPattern.addEventListener('change', updateSupportingItemsVisibility)
}
