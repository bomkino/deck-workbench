const planDraftDeltas = new Map()
let planEditorSlideId = null
let planEditorBaseline = null

function planDraftSnapshotFromRecord(record) {
  return {
    internalTitle: record.metadata.internalTitle,
    partId: record.section.id,
    purpose: record.metadata.purpose,
    textPresence: record.metadata.textPresence,
    contentPattern: record.metadata.contentPattern,
    visualStyle: record.visualStyle,
    copies: Object.fromEntries(['headline', 'subheadline', 'body'].map((role) => [role, {
      state: record.metadata.copyFieldStates[role],
      value: record[role]?.plainText ?? '',
    }])),
    supportingItems: structuredClone(record.metadata.supportingItems),
  }
}

function currentPlanDraftSnapshot() {
  return {
    internalTitle: elements.internalTitle.value,
    partId: elements.partSelect.value,
    purpose: elements.slidePurpose.value,
    textPresence: elements.textPresence.value,
    contentPattern: elements.contentPattern.value,
    visualStyle: elements.slideIntent.value,
    copies: Object.fromEntries(['headline', 'subheadline', 'body'].map((role) => [role, readCopyDraft(role)])),
    supportingItems: readSupportingItems(),
  }
}

function planDraftDelta(baseline, current) {
  if (!baseline || !current) return {}
  const delta = {}
  for (const key of ['internalTitle', 'partId', 'purpose', 'textPresence', 'contentPattern', 'visualStyle', 'supportingItems']) {
    if (JSON.stringify(current[key]) !== JSON.stringify(baseline[key])) delta[key] = structuredClone(current[key])
  }
  const copies = {}
  for (const role of ['headline', 'subheadline', 'body']) {
    if (JSON.stringify(current.copies[role]) !== JSON.stringify(baseline.copies[role])) {
      copies[role] = structuredClone(current.copies[role])
    }
  }
  if (Object.keys(copies).length) delta.copies = copies
  return delta
}

function restorePlanDraft(canonical, delta = {}) {
  return {
    ...structuredClone(canonical),
    ...structuredClone(delta),
    copies: {
      ...structuredClone(canonical.copies),
      ...structuredClone(delta.copies ?? {}),
    },
  }
}

function planDraftIsDirty(delta) {
  return Boolean(delta && Object.keys(delta).length)
}

function updatePlanDraftPresentation(dirty = planDraftIsDirty(planDraftDeltas.get(planEditorSlideId))) {
  const label = dirty ? 'Unsaved changes' : 'Saved'
  const buttonLabel = dirty ? 'Save changes' : 'Save Slide plan'
  if (elements.planDraftState.textContent !== label) elements.planDraftState.textContent = label
  elements.planDraftState.classList.toggle('is-dirty', dirty)
  if (elements.savePlan.textContent !== buttonLabel) elements.savePlan.textContent = buttonLabel
}

function captureCurrentPlanDraft() {
  if (!planEditorSlideId || !planEditorBaseline || elements.planForm.hidden) return null
  const delta = planDraftDelta(planEditorBaseline, currentPlanDraftSnapshot())
  if (planDraftIsDirty(delta)) planDraftDeltas.set(planEditorSlideId, delta)
  else planDraftDeltas.delete(planEditorSlideId)
  updatePlanDraftPresentation(planDraftIsDirty(delta))
  updateWorkspaceDraftStatus({ capturePlan: false })
  return delta
}

function clearPlanDrafts() {
  planDraftDeltas.clear()
  planEditorSlideId = null
  planEditorBaseline = null
  updatePlanDraftPresentation(false)
}

function bindPlanEvents() {
  bindWritingImportEvents()
  elements.addSection.addEventListener('click', addSection)
  elements.addSlide.addEventListener('click', addSlide)
  elements.renameDeck.addEventListener('click', renameDeck)
  elements.planSearch.addEventListener('input', () => {
    planSearch = elements.planSearch.value.toLowerCase()
    renderDeckMap()
  })
  elements.planFilter.addEventListener('change', () => {
    planFilter = elements.planFilter.value
    renderDeckMap()
  })
  elements.deckMap.addEventListener('click', (event) => {
    const card = event.target.closest('[data-map-slide-id]')
    if (!card) return
    const slideId = card.dataset.mapSlideId
    const action = event.target.closest('[data-map-action]')?.dataset.mapAction
    if (action === 'edit') {
      void selectSlide(slideId).then((next) => {
        if (next?.slide?.id === slideId) focusPlanControl(elements.internalTitle)
      })
      return
    }
    if (action === 'curate') {
      void enterPhaseForSlide('curate', slideId)
      return
    }
    if (action === 'assemble') {
      void enterPhaseForSlide('assemble', slideId)
      return
    }
    if (action === 'skip') {
      void setSlideLifecycle(slideId, 'skipped', 'map')
      return
    }
    if (action === 'restore') {
      void setSlideLifecycle(slideId, 'included', 'map')
      return
    }
    void selectSlide(slideId)
  })
  elements.planForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void savePlanSlide()
  })
  elements.savePlanAndCurate.addEventListener('click', () => void savePlanAndContinueToCurate())
  elements.planForm.addEventListener('input', captureCurrentPlanDraft)
  elements.planForm.addEventListener('change', captureCurrentPlanDraft)
  elements.commitHeadline.addEventListener('click', commitHeadline)
  elements.headline.addEventListener('keydown', (event) => {
    if (!projection) return
    handleStoryFieldKeydown(event, projection.headline.id, elements.headline)
  })
  elements.textPresence.addEventListener('change', syncPlanEditorVisibility)
  elements.contentPattern.addEventListener('change', syncPlanEditorVisibility)
  elements.addSupportingItem.addEventListener('click', () => {
    draftSupportingItems = readSupportingItems()
    draftSupportingItems.push({ id: crypto.randomUUID(), title: '', caption: '', link: '' })
    renderSupportingItems()
    captureCurrentPlanDraft()
  })
  elements.supportingItems.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-item]')
    if (!remove) return
    draftSupportingItems = readSupportingItems()
    draftSupportingItems = draftSupportingItems.filter((item) => item.id !== remove.dataset.removeItem)
    renderSupportingItems()
    captureCurrentPlanDraft()
  })
}

function renderPlan() {
  renderSequence(storyDocument)
  renderPlanSummary()
  renderDeckMap()
  renderPlanEditor()
}

function renderPlanSummary() {
  const records = planRecords()
  const counts = { ready: 0, review: 0, blocked: 0 }
  for (const record of records.filter((candidate) => candidate.metadata.lifecycle === 'included')) {
    counts[planReadiness(record).state] += 1
  }
  elements.planSummary.innerHTML = [
    summaryChip(records.filter((record) => record.metadata.lifecycle === 'included').length, 'Included'),
    summaryChip(counts.ready, 'Ready'),
    summaryChip(counts.review, 'Review'),
    summaryChip(counts.blocked, 'Blocked'),
  ].join('')
}

function planRecords() {
  const records = []
  for (const section of storyDocument?.sections ?? []) {
    for (const slide of section.slides) records.push(planRecordForSlide(slide, section))
  }
  return records
}

function renderDeckMap() {
  if (!storyDocument) {
    elements.deckMap.innerHTML = '<div class="empty-workspace"><strong>No Deck open.</strong><p>Create or open a Deck to begin.</p></div>'
    return
  }
  const groups = []
  for (const section of storyDocument.sections) {
    const records = section.slides.map((slide) => planRecordForSlide(slide, section)).filter((record) => {
      const readiness = planReadiness(record).state
      if (planFilter === 'skipped' && record.metadata.lifecycle !== 'skipped') return false
      if (planFilter === 'cut' && record.metadata.lifecycle !== 'cut') return false
      if (!['all', 'skipped', 'cut'].includes(planFilter) && readiness !== planFilter) return false
      if (planFilter === 'all' && record.metadata.lifecycle === 'cut') return false
      if (planSearch) {
        const haystack = [
          record.metadata.internalTitle,
          record.metadata.purpose,
          record.headline?.plainText,
          record.subheadline?.plainText,
          record.body?.plainText,
        ].join(' ').toLowerCase()
        if (!haystack.includes(planSearch)) return false
      }
      return true
    })
    if (records.length) groups.push({ section, records })
  }
  if (!groups.length) {
    elements.deckMap.innerHTML = '<div class="empty-workspace"><strong>No matching Slides.</strong><p>Change the Plan filter or search.</p></div>'
    return
  }
  let pageNumber = 1
  const pageNumbers = new Map()
  for (const record of planRecords()) {
    if (record.metadata.lifecycle === 'included') {
      pageNumbers.set(record.slide.id, pageNumber)
      pageNumber += 1
    }
  }
  elements.deckMap.innerHTML = groups.map(({ section, records }) => `
    <section class="map-part">
      <h3 class="map-part-heading">${escapeHTML(section.title)}</h3>
      ${records.map((record) => renderMapCard(record, pageNumbers.get(record.slide.id))).join('')}
    </section>
  `).join('')
}

function renderMapCard(record, pageNumber) {
  const readiness = planReadiness(record)
  const headline = record.headline?.plainText ?? ''
  const action = record.metadata.lifecycle === 'included' ? 'skip' : 'restore'
  return `<article class="map-card ${selectedSlideId === record.slide.id ? 'is-selected' : ''} ${record.metadata.lifecycle === 'skipped' ? 'is-skipped' : ''} ${record.metadata.lifecycle === 'cut' ? 'is-cut' : ''}" data-map-slide-id="${escapeAttribute(record.slide.id)}">
    <div class="map-number"><strong>${pageNumber ? String(pageNumber).padStart(2, '0') : '—'}</strong></div>
    <div class="map-copy">
      <h3>${escapeHTML(record.metadata.internalTitle || 'Untitled Slide')}</h3>
      <p>${escapeHTML(record.metadata.purpose || 'Purpose not written.')}</p>
      <div class="map-headline">${escapeHTML(headline || (record.metadata.textPresence === 'no-on-slide-text' ? 'No on-Slide text — intentional' : 'Headline unreviewed'))}</div>
      <div class="map-meta">
        <span class="meta-pill">${escapeHTML(record.metadata.lifecycle)}</span>
        <span class="meta-pill">${escapeHTML(contentPatternLabel(record.metadata.contentPattern))}</span>
        <span class="meta-pill">${escapeHTML(visualStyleLabel(record.visualStyle))}</span>
        <span class="readiness-pill ${readiness.state}">${readiness.state}</span>
      </div>
    </div>
    <div class="map-actions">
      <button type="button" data-map-action="edit" aria-label="Edit plan for ${escapeAttribute(record.metadata.internalTitle || 'Untitled Slide')}">Edit plan</button>
      <button type="button" data-map-action="${action}" aria-label="${action === 'skip' ? 'Skip' : 'Restore'} ${escapeAttribute(record.metadata.internalTitle || 'Untitled Slide')}">${action === 'skip' ? 'Skip' : 'Restore'}</button>
    </div>
  </article>`
}

function renderPlanEditor() {
  captureCurrentPlanDraft()
  const record = selectedPlanRecord()
  if (!record || !projection) {
    planEditorSlideId = null
    planEditorBaseline = null
    elements.planEmpty.hidden = false
    elements.planForm.hidden = true
    elements.planEditorHeading.textContent = 'No Slide selected'
    elements.headline.value = ''
    elements.headline.disabled = true
    elements.commitHeadline.disabled = true
    elements.slideIntent.disabled = true
    elements.savePlan.disabled = true
    elements.savePlanAndCurate.disabled = true
    updatePlanDraftPresentation(false)
    return
  }
  const canonical = planDraftSnapshotFromRecord(record)
  const restoredDraft = restorePlanDraft(canonical, planDraftDeltas.get(record.slide.id) ?? {})
  const delta = planDraftDelta(canonical, restoredDraft)
  if (planDraftIsDirty(delta)) planDraftDeltas.set(record.slide.id, delta)
  else planDraftDeltas.delete(record.slide.id)
  const draft = restorePlanDraft(canonical, delta)
  planEditorSlideId = record.slide.id
  planEditorBaseline = canonical
  elements.planEmpty.hidden = true
  elements.planForm.hidden = false
  elements.planEditorHeading.textContent = record.metadata.internalTitle || 'Untitled Slide'
  elements.internalTitle.value = draft.internalTitle
  elements.partSelect.innerHTML = storyDocument.sections.map((section) => `<option value="${escapeAttribute(section.id)}">${escapeHTML(section.title)}</option>`).join('')
  elements.partSelect.value = [...elements.partSelect.options].some((option) => option.value === draft.partId) ? draft.partId : record.section.id
  elements.slidePurpose.value = draft.purpose
  elements.textPresence.value = draft.textPresence
  elements.contentPattern.value = draft.contentPattern
  elements.slideIntent.disabled = false
  elements.slideIntent.value = draft.visualStyle
  elements.headlineState.value = draft.copies.headline.state
  elements.headline.value = draft.copies.headline.value
  elements.headline.disabled = draft.copies.headline.state !== 'present'
  elements.commitHeadline.disabled = draft.copies.headline.state !== 'present'
  draftSupportingItems = structuredClone(draft.supportingItems)
  renderAdditionalContent(projection.contentBlocks ?? [], record)
  for (const role of ['subheadline', 'body']) {
    const field = elements.additionalContent.querySelector(`[data-copy-role="${role}"]`)
    const state = field?.querySelector('[data-copy-state]')
    const input = field?.querySelector('[data-copy-input]')
    const commit = field?.querySelector('button')
    if (state) state.value = draft.copies[role].state
    if (input) {
      input.value = draft.copies[role].value
      input.disabled = draft.copies[role].state !== 'present'
    }
    if (commit) commit.disabled = draft.copies[role].state !== 'present'
  }
  renderSupportingItems()
  elements.savePlan.disabled = false
  elements.savePlanAndCurate.disabled = false
  elements.cutSlide.textContent = record.metadata.lifecycle === 'cut' ? 'Restore from Cut Bin' : 'Move to Cut Bin'
  syncPlanEditorVisibility()
  updatePlanDraftPresentation(planDraftIsDirty(delta))
}

function renderAdditionalContent(blocks, record = selectedPlanRecord()) {
  elements.additionalContent.replaceChildren()
  for (const role of ['subheadline', 'body']) {
    const block = blocks.find((candidate) => candidate.role === role)
    const state = record?.metadata.copyFieldStates?.[role] ?? defaultCopyState(block)
    const field = document.createElement('label')
    field.className = 'story-field content-field'
    field.dataset.copyRole = role
    const heading = document.createElement('span')
    heading.className = 'copy-label-row'
    const title = document.createElement('strong')
    title.textContent = role === 'subheadline' ? 'Subheadline' : 'Body'
    const stateSelect = document.createElement('select')
    stateSelect.dataset.copyState = role
    stateSelect.setAttribute('aria-label', `${title.textContent} state`)
    for (const value of COPY_FIELD_STATES) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = value === 'present' ? 'Present' : value === 'intentionally-blank' ? 'Intentionally blank' : 'Unreviewed'
      stateSelect.append(option)
    }
    stateSelect.value = state
    heading.append(title, stateSelect)
    const textarea = document.createElement('textarea')
    textarea.rows = role === 'body' ? 9 : 4
    textarea.value = block?.plainText ?? ''
    textarea.dataset.copyInput = role
    if (block) textarea.dataset.blockId = block.id
    textarea.disabled = state !== 'present'
    textarea.setAttribute('aria-describedby', 'save-state')
    textarea.addEventListener('keydown', (event) => {
      if (block) handleStoryFieldKeydown(event, block.id, textarea)
    })
    stateSelect.addEventListener('change', () => {
      textarea.disabled = stateSelect.value !== 'present'
      if (stateSelect.value === 'intentionally-blank') textarea.value = ''
    })
    const footer = document.createElement('footer')
    const key = document.createElement('span')
    key.textContent = block?.semanticKey ?? `workbench.copy.${role}`
    const actions = document.createElement('div')
    const commit = document.createElement('button')
    commit.type = 'button'
    commit.textContent = 'Commit'
    commit.hidden = true
    commit.disabled = state !== 'present'
    commit.addEventListener('click', () => saveCopyRole(role))
    stateSelect.addEventListener('change', () => { commit.disabled = stateSelect.value !== 'present' })
    actions.append(commit)
    footer.append(key, actions)
    field.append(heading, textarea, footer)
    elements.additionalContent.append(field)
  }
}

function renderSupportingItems() {
  elements.supportingItemsSection.hidden = elements.contentPattern.value !== 'repeater'
  elements.supportingItems.innerHTML = draftSupportingItems.length
    ? draftSupportingItems.map((item, index) => `<div class="supporting-item" data-item-id="${escapeAttribute(item.id)}">
        <strong>${String(index + 1).padStart(2, '0')}</strong>
        <label><span>Title</span><input data-item-field="title" value="${escapeAttribute(item.title)}" /></label>
        <label><span>Caption</span><textarea data-item-field="caption" rows="3">${escapeHTML(item.caption)}</textarea></label>
        <button class="icon-button" type="button" data-remove-item="${escapeAttribute(item.id)}" aria-label="Remove ${escapeAttribute(item.title || `item ${index + 1}`)}" title="Remove ${escapeAttribute(item.title || `item ${index + 1}`)}">${phosphorIconMarkup('trashSimple')}</button>
        <span></span><label><span>Link</span><input data-item-field="link" value="${escapeAttribute(item.link)}" /></label>
      </div>`).join('')
    : '<div class="empty-workspace"><strong>No Supporting Items.</strong><p>Add stable items for comps, cast, team, episodes or locations.</p></div>'
}

function syncPlanEditorVisibility() {
  if (elements.planForm.hidden) return
  const noText = elements.textPresence.value === 'no-on-slide-text'
  elements.planForm.querySelector('.copy-editor').hidden = noText
  elements.supportingItemsSection.hidden = elements.contentPattern.value !== 'repeater'
}

function readSupportingItems() {
  return [...elements.supportingItems.querySelectorAll('[data-item-id]')].map((card) => ({
    id: card.dataset.itemId,
    title: card.querySelector('[data-item-field="title"]')?.value ?? '',
    caption: card.querySelector('[data-item-field="caption"]')?.value ?? '',
    link: card.querySelector('[data-item-field="link"]')?.value ?? '',
  }))
}

function readCopyDraft(role) {
  if (role === 'headline') {
    return { state: elements.headlineState.value, value: elements.headline.value }
  }
  const field = elements.additionalContent.querySelector(`[data-copy-role="${role}"]`)
  return {
    state: field?.querySelector('[data-copy-state]')?.value ?? 'unreviewed',
    value: field?.querySelector('[data-copy-input]')?.value ?? '',
  }
}

function mediaSlotCountForStyle(style, items) {
  if (style === 'text-only') return 0
  if (['full-bleed', 'full-bleed-overlay', 'image-text'].includes(style)) return 1
  if (style === 'diptych') return 2
  if (style === 'triptych') return 3
  if (style === 'gallery') return Math.max(1, items.length || 6)
  return 0
}

async function savePlanSlide() {
  const record = selectedPlanRecord()
  if (!record) return false
  captureCurrentPlanDraft()
  return savePlanDraftById(record.slide.id, { announce: true })
}

async function savePlanAndContinueToCurate() {
  const record = selectedPlanRecord()
  if (!record) return false
  const slideId = record.slide.id
  captureCurrentPlanDraft()
  if (!await savePlanDraftById(slideId)) return false
  const entered = await enterPhaseForSlide('curate', slideId)
  if (entered) setStatus('Slide plan saved · ready to Curate')
  return entered
}

function preparePlanDraftOperations(record, draft) {
  for (const [role, copy] of Object.entries(draft.copies)) {
    if (copy.state === 'present' && copy.value.trim().length === 0) {
      return { error: `${role} is Present but empty`, errorRole: role, operations: [] }
    }
  }
  const target = storyDocument.sections.find((section) => section.id === draft.partId)
  if (!target) return { error: 'The selected Part no longer exists', errorRole: 'part', operations: [] }
  const items = draft.supportingItems
  const metadata = normalizePlanMetadata({
    internalTitle: draft.internalTitle.trim(),
    purpose: draft.purpose.trim(),
    lifecycle: record.metadata.lifecycle,
    textPresence: draft.textPresence,
    contentPattern: draft.contentPattern,
    copyFieldStates: Object.fromEntries(Object.entries(draft.copies).map(([role, copy]) => [role, copy.state])),
    supportingItems: items,
    mediaSlotCount: mediaSlotCountForStyle(draft.visualStyle, items),
    textHint: record.metadata.textHint,
  }, record.slide)
  const operations = []
  if (record.section.id !== draft.partId) {
    operations.push({
      type: 'slide.move',
      payload: { slideId: record.slide.id, targetSectionId: target.id, afterSlideId: target.slides.at(-1)?.id ?? null },
      label: 'Move Slide to Part',
    })
  }
  if (record.visualStyle !== draft.visualStyle) {
    operations.push({
      type: 'slide.intent.set',
      payload: { slideId: record.slide.id, intent: draft.visualStyle },
      label: 'Set Visual Style',
    })
  }
  for (const role of ['headline', 'subheadline', 'body']) {
    operations.push(...copyOperations(record, role, draft.copies[role]))
  }
  const metadataText = serializePlanMetadata(metadata, record.slide)
  if (record.metadataBlock) {
    if (record.metadataBlock.plainText !== metadataText) {
      operations.push({
        type: 'content.update',
        payload: { slideId: record.slide.id, blockId: record.metadataBlock.id, value: richText(metadataText) },
        label: 'Update Plan metadata',
      })
    }
  } else {
    operations.push({
      type: 'content.add',
      payload: {
        slideId: record.slide.id,
        blockId: crypto.randomUUID(),
        semanticKey: PLAN_BLOCK_KEY,
        role: PLAN_BLOCK_ROLE,
        value: richText(metadataText),
        afterBlockId: record.slide.contentBlocks.at(-1)?.id ?? null,
      },
      label: 'Add Plan metadata',
    })
  }
  return { error: '', errorRole: '', operations }
}

async function focusPlanDraftError(slideId, role) {
  await enterPhaseForSlide('plan', slideId)
  const target = role === 'headline'
    ? elements.headline
    : role === 'part'
      ? elements.partSelect
      : elements.additionalContent.querySelector(`[data-copy-role="${CSS.escape(role)}"] [data-copy-input]`)
  focusPlanControl(target)
}

function focusPlanControl(target) {
  if (!target) return false
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
  requestAnimationFrame(() => {
    const phase = target.closest('[data-phase-view]')
    if (!phase || phase.getAttribute('aria-hidden') === 'true') return
    const targetRect = target.getBoundingClientRect()
    const phaseRect = phase.getBoundingClientRect()
    const margin = 16 * interfaceScale
    const outside = targetRect.top < phaseRect.top + margin
      || targetRect.bottom > phaseRect.bottom - margin
      || targetRect.left < phaseRect.left + margin
      || targetRect.right > phaseRect.right - margin
    if (outside) target.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  return document.activeElement === target
}

async function savePlanDraftById(slideId, { announce = false } = {}) {
  if (slideId === planEditorSlideId) captureCurrentPlanDraft()
  const record = planRecords().find((candidate) => candidate.slide.id === slideId)
  if (!record) {
    planDraftDeltas.delete(slideId)
    updateWorkspaceDraftStatus()
    return true
  }
  const canonical = planDraftSnapshotFromRecord(record)
  const draft = restorePlanDraft(canonical, planDraftDeltas.get(slideId) ?? {})
  const prepared = preparePlanDraftOperations(record, draft)
  if (prepared.error) {
    setStatus(`InvalidCommand: ${prepared.error}`)
    await focusPlanDraftError(slideId, prepared.errorRole)
    return false
  }
  const requestedSlideId = selectedSlideId
  if (prepared.operations.length > 0) {
    const saved = await executeBatch(prepared.operations, requestedSlideId)
    if (!saved) return false
  }
  planDraftDeltas.delete(slideId)
  if (slideId === planEditorSlideId) {
    planEditorSlideId = null
    planEditorBaseline = null
  }
  if (selectedSlideId === slideId && activePhase === 'plan') renderPlanEditor()
  updateWorkspaceDraftStatus()
  if (announce) setStatus(prepared.operations.length ? 'Slide plan saved' : 'No Plan changes')
  return true
}

async function saveAllPlanDrafts() {
  captureCurrentPlanDraft()
  const slideIds = [...planDraftDeltas.keys()]
  let savedCount = 0
  for (const slideId of slideIds) {
    if (!await savePlanDraftById(slideId)) return { saved: false, count: savedCount }
    savedCount += 1
  }
  return { saved: true, count: savedCount }
}

function copyOperations(record, role, draft) {
  if (draft.state === 'unreviewed') return []
  const block = record[role]
  const value = draft.state === 'intentionally-blank' ? '' : draft.value
  if (block) {
    if (block.plainText === value) return []
    return [{
      type: 'content.update',
      payload: { slideId: record.slide.id, blockId: block.id, value: richText(value) },
      label: `Update ${role}`,
    }]
  }
  return [{
    type: 'content.add',
    payload: {
      slideId: record.slide.id,
      blockId: crypto.randomUUID(),
      semanticKey: `workbench.copy.${role}`,
      role,
      value: richText(value),
      afterBlockId: record.slide.contentBlocks.filter((candidate) => candidate.role !== PLAN_BLOCK_ROLE).at(-1)?.id ?? null,
    },
    label: `Add ${role}`,
  }]
}

async function setSlideLifecycle(slideId, lifecycle, focusTarget = 'map') {
  const location = findStoryLocation(slideId)
  if (!location) return
  const record = planRecordForSlide(location.slide, location.section)
  const metadata = { ...record.metadata, lifecycle }
  const text = serializePlanMetadata(metadata, record.slide)
  const operation = record.metadataBlock
    ? { type: 'content.update', payload: { slideId, blockId: record.metadataBlock.id, value: richText(text) }, label: 'Set Slide lifecycle' }
    : { type: 'content.add', payload: { slideId, blockId: crypto.randomUUID(), semanticKey: PLAN_BLOCK_KEY, role: PLAN_BLOCK_ROLE, value: richText(text), afterBlockId: location.slide.contentBlocks.at(-1)?.id ?? null }, label: 'Add Slide lifecycle' }
  const interactionGeneration = typeof workspaceInteractionGeneration === 'number'
    ? workspaceInteractionGeneration
    : null
  const saved = Boolean(await executeBatch([operation], slideId))
  const interactionUnchanged = interactionGeneration === null
    || interactionGeneration === workspaceInteractionGeneration
  if (interactionUnchanged) {
    if (focusTarget === 'editor') {
      elements.cutSlide.focus({ preventScroll: true })
    } else {
      const nextAction = saved
        ? lifecycle === 'included' ? 'skip' : 'restore'
        : lifecycle === 'included' ? 'restore' : 'skip'
      const successor = elements.deckMap.querySelector(
        `[data-map-slide-id="${CSS.escape(slideId)}"] [data-map-action="${nextAction}"]`,
      )
      if (successor) successor.focus({ preventScroll: true })
      else elements.planFilter.focus({ preventScroll: true })
    }
  }
  return saved
}

async function commitHeadline() {
  if (!projection) return
  await updateContentBlock(projection.headline.id, elements.headline.value)
}

async function saveCopyRole(role) {
  const record = selectedPlanRecord()
  if (!record) return
  const draft = readCopyDraft(role)
  await executeBatch(copyOperations(record, role, draft), record.slide.id)
}

function storyField(blockId) {
  if (projection?.headline.id === blockId) return elements.headline
  return [...elements.additionalContent.querySelectorAll('textarea')]
    .find((textarea) => textarea.dataset.blockId === blockId)
}

function projectedPlainText(blockId) {
  return projection?.contentBlocks.find((block) => block.id === blockId)?.plainText
}

function restoreStoryFocus(blockId) {
  const field = storyField(blockId)
  if (!field) return false
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
  return document.activeElement === field
}

async function updateContentBlock(blockId, value, options = {}) {
  if (!projection) return
  const selected = projection.slide.id
  setBusy('Writing Story content…')
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type: 'content.update',
        payload: { slideId: selected, blockId, value: richText(value) },
        source: { kind: options.sourceKind ?? 'ui', label: 'Story content' },
        issuedAt: new Date().toISOString(),
      },
    })
    await refreshWorkspace(selected)
    if (options.restoreFocus) restoreStoryFocus(blockId)
  } catch (error) {
    renderAll()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    if (options.restoreFocus) restoreStoryFocus(blockId)
  }
}

function handleStoryFieldKeydown(event, blockId, field) {
  const action = storyShortcut(event, field.value !== projectedPlainText(blockId))
  if (!action) return
  event.preventDefault()
  if (action === 'commit') void updateContentBlock(blockId, field.value, { restoreFocus: true, sourceKind: 'keyboard' })
  else void historyAction(action, blockId)
}

async function addSection() {
  if (!storyDocument) return
  const sectionId = crypto.randomUUID()
  await executeStructural('section.add', {
    sectionId,
    title: `Part ${storyDocument.sections.length + 1}`,
    afterSectionId: storyDocument.sections.at(-1)?.id ?? null,
  }, selectedSlideId, { focus: { sectionId } })
}

async function addSlide() {
  if (!storyDocument || !projection) return
  const section = storyDocument.sections.find((candidate) => candidate.id === projection.section.id) ?? storyDocument.sections[0]
  const slideId = crypto.randomUUID()
  await executeStructural('slide.add', {
    sectionId: section.id,
    slideId,
    blockId: crypto.randomUUID(),
    intent: 'full-bleed',
    headline: richText('Untitled Slide'),
    afterSlideId: section.slides.at(-1)?.id ?? null,
  }, slideId, { focus: { slideId } })
}

async function renameSection(sectionId, currentTitle) {
  const title = window.prompt('Part name', currentTitle)?.trim()
  if (!title || title === currentTitle) return
  await executeStructural('section.rename', { sectionId, title }, selectedSlideId, { focus: { sectionId } })
}

async function removeSection(sectionId) {
  await executeStructural('section.remove', { sectionId }, selectedSlideId)
}

async function moveSection(sectionId, direction) {
  const payload = sectionMovePlan(storyDocument, sectionId, direction)
  if (!payload) return
  await executeStructural('section.move', payload, selectedSlideId, { focus: { sectionId } })
}

function moveSectionByKeyboard(event, sectionId) {
  if (event.target !== event.currentTarget) return
  const direction = sequenceShortcut(event)
  if (!direction) return
  const payload = sectionMovePlan(storyDocument, sectionId, direction)
  if (!payload) return
  event.preventDefault()
  void executeStructural('section.move', payload, selectedSlideId, { sourceKind: 'keyboard', focus: { sectionId } })
}

async function moveSlide(sectionId, slideId, direction) {
  const payload = slideMovePlan(storyDocument, sectionId, slideId, direction)
  if (!payload) return
  await executeStructural('slide.move', payload, selectedSlideId, { focus: { slideId } })
}

function moveSlideByKeyboard(event, sectionId, slideId) {
  const direction = sequenceShortcut(event)
  if (!direction) return
  const payload = slideMovePlan(storyDocument, sectionId, slideId, direction)
  if (!payload) return
  event.preventDefault()
  void executeStructural('slide.move', payload, slideId, { sourceKind: 'keyboard', focus: { slideId } })
}

function renderSequence(next) {
  elements.sequenceList.replaceChildren()
  if (!next) return
  let pageNumber = 1
  for (const section of next.sections) {
    const sectionRow = document.createElement('div')
    sectionRow.className = 'section-row'
    sectionRow.tabIndex = 0
    sectionRow.dataset.sectionId = section.id
    sectionRow.setAttribute('role', 'group')
    sectionRow.setAttribute('aria-label', `${section.title} Section`)
    sectionRow.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
    sectionRow.addEventListener('keydown', (event) => moveSectionByKeyboard(event, section.id))
    const title = document.createElement('strong')
    title.textContent = section.title
    const tools = document.createElement('span')
    tools.className = 'section-tools'
    const rename = document.createElement('button')
    rename.type = 'button'
    rename.textContent = 'Rename'
    rename.setAttribute('aria-label', `Rename ${section.title}`)
    rename.addEventListener('click', () => renameSection(section.id, section.title))
    tools.append(rename)
    const plans = sequenceControlPlans(next, section.id)
    for (const direction of ['up', 'down']) {
      if (!plans[direction]) continue
      const move = document.createElement('button')
      move.type = 'button'
      move.className = 'move-sequence'
      move.dataset.direction = direction
      setPhosphorIconButton(move, direction === 'up' ? 'arrowUp' : 'arrowDown', `Move ${section.title} ${direction}`)
      move.addEventListener('click', () => moveSection(section.id, direction))
      tools.append(move)
    }
    if (section.slides.length === 0 && next.sections.length > 1) {
      const remove = document.createElement('button')
      remove.type = 'button'
      setPhosphorIconButton(remove, 'trashSimple', `Remove empty Section ${section.title}`)
      remove.addEventListener('click', () => removeSection(section.id))
      tools.append(remove)
    }
    sectionRow.append(title, tools)
    elements.sequenceList.append(sectionRow)

    for (const slide of section.slides) {
      const record = planRecordForSlide(slide, section)
      const readiness = planReadiness(record).state
      const entry = document.createElement('div')
      entry.className = 'slide-entry'
      const select = document.createElement('button')
      select.type = 'button'
      select.className = `slide-row${selectedSlideId === slide.id ? ' selected' : ''}`
      select.dataset.slideId = slide.id
      select.setAttribute('aria-label', `Slide ${pageNumber}: ${slide.headline?.plainText || slide.intent}`)
      select.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
      if (selectedSlideId === slide.id) select.setAttribute('aria-current', 'page')
      select.dataset.lifecycle = record.metadata.lifecycle
      const number = document.createElement('span')
      number.className = 'slide-number'
      number.textContent = record.metadata.lifecycle === 'included' ? String(pageNumber).padStart(2, '0') : '—'
      const label = document.createElement('span')
      label.textContent = record.metadata.internalTitle || slide.headline?.plainText || slide.intent
      const status = document.createElement('span')
      status.className = `sequence-status ${readiness}`
      status.textContent = readiness
      select.append(number, label, status)
      select.addEventListener('click', () => selectSlide(slide.id))
      select.addEventListener('keydown', (event) => moveSlideByKeyboard(event, section.id, slide.id))
      entry.append(select)
      const slideTools = document.createElement('span')
      slideTools.className = 'slide-tools'
      const slidePlans = sequenceControlPlans(next, section.id, slide.id)
      for (const direction of ['up', 'down']) {
        if (!slidePlans[direction]) continue
        const move = document.createElement('button')
        move.type = 'button'
        move.className = 'move-sequence'
        move.dataset.direction = direction
        const lifecycleLabel = record.metadata.lifecycle === 'included'
          ? `Slide ${pageNumber}`
          : record.metadata.lifecycle === 'skipped'
            ? 'Skipped Slide'
            : 'Cut Bin Slide'
        const displayLabel = record.metadata.internalTitle || slide.headline?.plainText || slide.intent
        setPhosphorIconButton(move, direction === 'up' ? 'arrowUp' : 'arrowDown', `Move ${lifecycleLabel}: ${displayLabel} ${direction}`)
        move.addEventListener('click', () => moveSlide(section.id, slide.id, direction))
        slideTools.append(move)
      }
      if (slideTools.childElementCount) entry.append(slideTools)
      elements.sequenceList.append(entry)
      if (record.metadata.lifecycle === 'included') pageNumber += 1
    }
  }
}
