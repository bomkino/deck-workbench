function openPlanEditor(slideId) {
  const slide = getSlide(slideId)
  if (!slide) return
  editingSlideId = slideId
  elements.planEditorTitle.textContent = slide.internalTitle || 'Untitled Slide'
  elements.editInternalTitle.value = slide.internalTitle ?? ''
  elements.editPart.innerHTML = state.parts.map((part) => `<option value="${escapeAttribute(part.id)}">${escapeHTML(part.title)}</option>`).join('')
  elements.editPart.value = slide.partId
  elements.editPurpose.value = slide.purpose ?? ''
  elements.editLifecycle.value = slide.lifecycle
  elements.editTextPresence.value = slide.textPresence
  elements.editContentPattern.value = slide.contentPattern
  elements.editVisualStyle.value = slide.visualStyle
  elements.planEditor.querySelectorAll('[data-copy-role]').forEach((container) => {
    const role = container.dataset.copyRole
    const field = slide.copy?.[role] ?? copyField('unreviewed')
    container.querySelector('[data-state-select]').value = field.state
    container.querySelector('[data-markdown-input]').value = copyFieldText(field)
  })
  renderSupportingItemsEditor(slide)
  updatePlanEditorCopyVisibility()
  updateSupportingItemsVisibility()
  elements.planEditor.showModal()
}

function updatePlanEditorCopyVisibility() {
  const hidden = elements.editTextPresence.value === 'no-on-slide-text'
  elements.planEditor.querySelector('.copy-fields').hidden = hidden
}

function updateSupportingItemsVisibility() {
  elements.supportingItemsEditor.hidden = elements.editContentPattern.value !== 'repeater'
}

function renderSupportingItemsEditor(slide) {
  if ((slide.supportingItems ?? []).length === 0) {
    elements.supportingItemsEditor.innerHTML = '<header><strong>Supporting Items</strong><p>No repeated items in this Slide.</p></header>'
    return
  }
  elements.supportingItemsEditor.innerHTML = `<header><strong>Supporting Items</strong><p>Stable items keep captions, links and media attached when reordered.</p></header>
    ${slide.supportingItems.map((item, index) => `<div class="supporting-item-card" data-item-id="${escapeAttribute(item.id)}">
      <strong>${String(index + 1).padStart(2, '0')}</strong>
      <label><span>Title</span><input data-item-field="title" value="${escapeAttribute(item.title ?? '')}" /></label>
      <label><span>Caption</span><textarea data-item-field="caption" rows="3">${escapeHTML(item.caption ?? '')}</textarea></label>
      <span></span>
      <label><span>Link</span><input data-item-field="link" value="${escapeAttribute(item.link ?? '')}" /></label>
    </div>`).join('')}`
}

function savePlanEditor() {
  const source = getSlide(editingSlideId)
  if (!source) return
  const nextCopy = {}
  elements.planEditor.querySelectorAll('[data-copy-role]').forEach((container) => {
    const role = container.dataset.copyRole
    const fieldState = container.querySelector('[data-state-select]').value
    const markdown = container.querySelector('[data-markdown-input]').value
    nextCopy[role] = copyField(fieldState, markdown)
  })
  const supportingItems = [...elements.supportingItemsEditor.querySelectorAll('[data-item-id]')].map((container) => ({
    id: container.dataset.itemId,
    title: container.querySelector('[data-item-field="title"]')?.value ?? '',
    caption: container.querySelector('[data-item-field="caption"]')?.value ?? '',
    link: container.querySelector('[data-item-field="link"]')?.value ?? '',
  }))
  const copyChanged = JSON.stringify(source.copy) !== JSON.stringify(nextCopy)
  const layoutChanged = source.visualStyle !== elements.editVisualStyle.value
  commit('Slide updated', (draft) => {
    const slide = draft.slides.find((candidate) => candidate.id === editingSlideId)
    slide.internalTitle = elements.editInternalTitle.value.trim()
    slide.partId = elements.editPart.value
    slide.purpose = elements.editPurpose.value.trim()
    slide.lifecycle = elements.editLifecycle.value
    slide.textPresence = elements.editTextPresence.value
    slide.contentPattern = elements.editContentPattern.value
    slide.visualStyle = elements.editVisualStyle.value
    slide.copy = nextCopy
    if (supportingItems.length > 0) slide.supportingItems = supportingItems
    if (copyChanged) slide.copyReviewState = 'changed-after-assembly'
    if (layoutChanged) slide.layoutReviewState = 'changed-after-curation'
  })
}
