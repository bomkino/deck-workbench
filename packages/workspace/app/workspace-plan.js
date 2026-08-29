function bindPlanEvents() {
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
    if (action === 'curate') {
      selectedSlideId = slideId
      setPhase('curate')
      return
    }
    if (action === 'assemble') {
      selectedSlideId = slideId
      setPhase('assemble')
      return
    }
    if (action === 'skip') {
      void setSlideLifecycle(slideId, 'skipped')
      return
    }
    if (action === 'restore') {
      void setSlideLifecycle(slideId, 'included')
      return
    }
    void selectSlide(slideId)
  })
  elements.planForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void savePlanSlide()
  })
  elements.commitHeadline.addEventListener('click', commitHeadline)
  elements.headline.addEventListener('keydown', (event) => {
    if (!projection) return
    handleStoryFieldKeydown(event, projection.headline.id, elements.headline)
  })
  elements.textPresence.addEventListener('change', syncPlanEditorVisibility)
  elements.contentPattern.addEventListener('change', syncPlanEditorVisibility)
  elements.addSupportingItem.addEventListener('click', () => {
    draftSupportingItems.push({ id: crypto.randomUUID(), title: '', caption: '', link: '' })
    renderSupportingItems()
  })
  elements.supportingItems.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-item]')
    if (!remove) return
    draftSupportingItems = draftSupportingItems.filter((item) => item.id !== remove.dataset.removeItem)
    renderSupportingItems()
  })
  elements.cutSlide.addEventListener('click', () => {
    if (selectedSlideId) void setSlideLifecycle(selectedSlideId, 'cut')
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
    <div class="map-number"><strong>${pageNumber ? String(pageNumber).padStart(2, '0') : '—'}</strong><span>${escapeHTML(record.metadata.lifecycle)}</span></div>
    <div class="map-copy">
      <h3>${escapeHTML(record.metadata.internalTitle || 'Untitled Slide')}</h3>
      <p>${escapeHTML(record.metadata.purpose || 'Purpose not written.')}</p>
      <div class="map-headline">${escapeHTML(headline || (record.metadata.textPresence === 'no-on-slide-text' ? 'No on-Slide text — intentional' : 'Headline unreviewed'))}</div>
      <div class="map-meta">
        <span class="meta-pill">${escapeHTML(contentPatternLabel(record.metadata.contentPattern))}</span>
        <span class="meta-pill">${escapeHTML(visualStyleLabel(record.visualStyle))}</span>
        <span class="readiness-pill ${readiness.state}">${readiness.state}</span>
      </div>
    </div>
    <div class="map-actions">
      <button type="button" data-map-action="edit">Edit</button>
      <button type="button" data-map-action="curate">Curate</button>
      <button type="button" data-map-action="assemble">Assemble</button>
      <button type="button" data-map-action="${action}">${action === 'skip' ? 'Skip' : 'Restore'}</button>
    </div>
  </article>`
}

function renderPlanEditor() {
  const record = selectedPlanRecord()
  if (!record || !projection) {
    elements.planEmpty.hidden = false
    elements.planForm.hidden = true
    elements.planEditorHeading.textContent = 'No Slide selected'
    elements.headline.value = ''
    elements.headline.disabled = true
    elements.commitHeadline.disabled = true
    elements.slideIntent.disabled = true
    elements.savePlan.disabled = true
    return
  }
  elements.planEmpty.hidden = true
  elements.planForm.hidden = false
  elements.planEditorHeading.textContent = record.metadata.internalTitle || 'Untitled Slide'
  elements.internalTitle.value = record.metadata.internalTitle
  elements.partSelect.innerHTML = storyDocument.sections.map((section) => `<option value="${escapeAttribute(section.id)}">${escapeHTML(section.title)}</option>`).join('')
  elements.partSelect.value = record.section.id
  elements.slidePurpose.value = record.metadata.purpose
  elements.slideLifecycle.value = record.metadata.lifecycle
  elements.textPresence.value = record.metadata.textPresence
  elements.contentPattern.value = record.metadata.contentPattern
  elements.slideIntent.disabled = false
  elements.slideIntent.value = record.visualStyle
  elements.headlineState.value = record.metadata.copyFieldStates.headline
  elements.headline.value = record.headline?.plainText ?? ''
  elements.headline.disabled = record.metadata.copyFieldStates.headline !== 'present'
  elements.commitHeadline.disabled = record.metadata.copyFieldStates.headline !== 'present'
  draftSupportingItems = structuredClone(record.metadata.supportingItems)
  renderAdditionalContent(projection.contentBlocks ?? [], record)
  renderSupportingItems()
  elements.savePlan.disabled = false
  elements.cutSlide.textContent = record.metadata.lifecycle === 'cut' ? 'Restore from Cut Bin' : 'Move to Cut Bin'
  syncPlanEditorVisibility()
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
        <button type="button" data-remove-item="${escapeAttribute(item.id)}" aria-label="Remove ${escapeAttribute(item.title || `item ${index + 1}`)}">×</button>
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
  if (!record) return
  const drafts = {
    headline: readCopyDraft('headline'),
    subheadline: readCopyDraft('subheadline'),
    body: readCopyDraft('body'),
  }
  for (const [role, draft] of Object.entries(drafts)) {
    if (draft.state === 'present' && draft.value.trim().length === 0) {
      setStatus(`InvalidCommand: ${role} is Present but empty`)
      return
    }
  }
  const items = readSupportingItems()
  const metadata = normalizePlanMetadata({
    internalTitle: elements.internalTitle.value.trim(),
    purpose: elements.slidePurpose.value.trim(),
    lifecycle: elements.slideLifecycle.value,
    textPresence: elements.textPresence.value,
    contentPattern: elements.contentPattern.value,
    copyFieldStates: Object.fromEntries(Object.entries(drafts).map(([role, draft]) => [role, draft.state])),
    supportingItems: items,
    mediaSlotCount: mediaSlotCountForStyle(elements.slideIntent.value, items),
    textHint: record.metadata.textHint,
  }, record.slide)
  const operations = []
  if (record.section.id !== elements.partSelect.value) {
    const target = storyDocument.sections.find((section) => section.id === elements.partSelect.value)
    operations.push({
      type: 'slide.move',
      payload: { slideId: record.slide.id, targetSectionId: target.id, afterSlideId: target.slides.at(-1)?.id ?? null },
      label: 'Move Slide to Part',
    })
  }
  if (record.visualStyle !== elements.slideIntent.value) {
    operations.push({
      type: 'slide.intent.set',
      payload: { slideId: record.slide.id, intent: elements.slideIntent.value },
      label: 'Set Visual Style',
    })
  }
  for (const role of ['headline', 'subheadline', 'body']) {
    operations.push(...copyOperations(record, role, drafts[role]))
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
        afterBlockId: projection.contentBlocks.at(-1)?.id ?? null,
      },
      label: 'Add Plan metadata',
    })
  }
  if (operations.length === 0) {
    setStatus('No Plan changes')
    return
  }
  await executeBatch(operations, record.slide.id)
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
      afterBlockId: projection.contentBlocks.filter((candidate) => candidate.role !== PLAN_BLOCK_ROLE).at(-1)?.id ?? null,
    },
    label: `Add ${role}`,
  }]
}

async function setSlideLifecycle(slideId, lifecycle) {
  const location = findStoryLocation(slideId)
  if (!location) return
  const record = planRecordForSlide(location.slide, location.section)
  const metadata = { ...record.metadata, lifecycle }
  const text = serializePlanMetadata(metadata, record.slide)
  const operation = record.metadataBlock
    ? { type: 'content.update', payload: { slideId, blockId: record.metadataBlock.id, value: richText(text) }, label: 'Set Slide lifecycle' }
    : { type: 'content.add', payload: { slideId, blockId: crypto.randomUUID(), semanticKey: PLAN_BLOCK_KEY, role: PLAN_BLOCK_ROLE, value: richText(text), afterBlockId: location.slide.contentBlocks.at(-1)?.id ?? null }, label: 'Add Slide lifecycle' }
  await executeBatch([operation], slideId)
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
    intent: 'undecided',
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
      move.textContent = direction === 'up' ? '↑' : '↓'
      move.setAttribute('aria-label', `Move ${section.title} ${direction}`)
      move.addEventListener('click', () => moveSection(section.id, direction))
      tools.append(move)
    }
    if (section.slides.length === 0 && next.sections.length > 1) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove empty Section ${section.title}`)
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
      if (record.metadata.lifecycle !== 'included') select.setAttribute('aria-disabled', 'true')
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
        move.textContent = direction === 'up' ? '↑' : '↓'
        move.setAttribute('aria-label', `Move Slide ${pageNumber} ${direction}`)
        move.addEventListener('click', () => moveSlide(section.id, slide.id, direction))
        slideTools.append(move)
      }
      if (slideTools.childElementCount) entry.append(slideTools)
      elements.sequenceList.append(entry)
      if (record.metadata.lifecycle === 'included') pageNumber += 1
    }
  }
}
