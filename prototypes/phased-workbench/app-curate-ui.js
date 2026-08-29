function bindCurateEvents() {
  elements.queueFilterButtons.forEach((button) => button.addEventListener('click', () => {
    queueFilter = button.dataset.queueFilter
    renderCurateSlideList()
  }))
  elements.nextMediaIssue.addEventListener('click', selectNextMediaIssue)
  elements.curateSlideList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slide-id]')
    if (!button) return
    selectSlide(button.dataset.slideId)
    renderCurate({ preserveMediaScroll: true })
  })
  elements.mediaSearch.addEventListener('input', (event) => {
    state.curate.search = event.target.value
    state.curate.scrollTop = 0
    saveState()
    renderMediaWall(true)
  })
  elements.folderFilter.addEventListener('change', (event) => {
    state.curate.folderFilter = event.target.value
    state.curate.scrollTop = 0
    saveState()
    renderMediaWall(true)
  })
  elements.typeFilter.addEventListener('change', (event) => {
    state.curate.typeFilter = event.target.value
    state.curate.scrollTop = 0
    saveState()
    renderMediaWall(true)
  })
  elements.mediaStateFilter.addEventListener('change', (event) => {
    state.curate.stateFilter = event.target.value
    state.curate.scrollTop = 0
    saveState()
    renderMediaWall(true)
  })
  elements.thumbnailDensity.addEventListener('input', (event) => {
    state.curate.density = Number(event.target.value)
    saveState()
    renderMediaWall(true)
  })
  elements.mediaScroll.addEventListener('scroll', () => {
    state.curate.scrollTop = elements.mediaScroll.scrollTop
    renderMediaVirtualWindow()
  }, { passive: true })
  elements.mediaCanvas.addEventListener('click', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (!card) return
    state.curate.selectedAssetId = card.dataset.assetId
    saveState()
    renderMediaVirtualWindow()
  })
  elements.mediaCanvas.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (card) openMediaPreview(card.dataset.assetId)
  })
  elements.mediaCanvas.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (!card) return
    event.preventDefault()
    contextAssetId = card.dataset.assetId
    state.curate.selectedAssetId = contextAssetId
    saveState()
    openContextMenu(event.clientX, event.clientY)
    renderMediaVirtualWindow()
  })
  elements.contextMenu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-context-action]')?.dataset.contextAction
    if (!action || !contextAssetId) return
    closeContextMenu()
    if (action === 'preview') openMediaPreview(contextAssetId)
    if (action === 'shortlist') setSlideMediaDecision(contextAssetId, 'shortlist')
    if (action === 'select') setSlideMediaDecision(contextAssetId, 'select')
    if (action === 'alternate') setSlideMediaDecision(contextAssetId, 'alternate')
    if (action === 'reject') setSlideMediaDecision(contextAssetId, 'reject')
    if (action === 'project-pick') toggleProjectPick(contextAssetId)
    if (action === 'reveal') showToast(`Reveal source: ${getAsset(contextAssetId)?.filename ?? 'Asset'}`)
  })
  elements.primaryTray.addEventListener('click', handleTrayClick)
  elements.alternateTray.addEventListener('click', handleTrayClick)
  elements.shortlistTray.addEventListener('click', handleTrayClick)
  elements.previewMediaActions.addEventListener('click', (event) => {
    const action = event.target.closest('[data-preview-action]')?.dataset.previewAction
    if (!action) return
    const assetId = state.curate.selectedAssetId
    if (action === 'previous' || action === 'next') navigatePreview(action === 'next' ? 1 : -1)
    if (action === 'shortlist') setSlideMediaDecision(assetId, 'shortlist')
    if (action === 'select') setSlideMediaDecision(assetId, 'select')
    if (action === 'alternate') setSlideMediaDecision(assetId, 'alternate')
    if (action === 'reject') setSlideMediaDecision(assetId, 'reject')
    if (action === 'project-pick') toggleProjectPick(assetId)
    renderMediaPreview()
  })

  mediaResizeObserver = new ResizeObserver(() => {
    if (state.phase === 'curate') renderMediaWall(false)
  })
  mediaResizeObserver.observe(elements.mediaScroll)
}

function renderCurate(options = {}) {
  elements.queueFilterButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.queueFilter === queueFilter))
  populateMediaFilters()
  elements.mediaSearch.value = state.curate.search
  elements.typeFilter.value = state.curate.typeFilter
  elements.mediaStateFilter.value = state.curate.stateFilter
  elements.thumbnailDensity.value = String(state.curate.density)
  renderCurateSlideList()
  renderSlideBrief()
  renderCurateTray()
  renderMediaWall(!options.preserveMediaScroll)
}

function populateMediaFilters() {
  const folders = ['all', ...new Set(mediaAssets.map((asset) => asset.folder))]
  elements.folderFilter.innerHTML = folders.map((folder) => `<option value="${escapeAttribute(folder)}">${folder === 'all' ? 'All folders' : escapeHTML(folder)}</option>`).join('')
  elements.folderFilter.value = state.curate.folderFilter
}

function renderCurateSlideList() {
  elements.queueFilterButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.queueFilter === queueFilter))
  const slides = state.slides.filter((slide) => {
    if (slide.lifecycle !== 'included') return false
    const readiness = slideReadiness(slide, getDecisions(slide.id)).curate
    if (queueFilter === 'needs') return readiness !== 'ready'
    if (queueFilter === 'find-more') return slide.findMoreMedia?.state === 'needed'
    if (queueFilter === 'ready') return readiness === 'ready'
    return true
  })
  elements.curateSlideList.innerHTML = slides.map((slide) => {
    const readiness = slideReadiness(slide, getDecisions(slide.id)).curate
    const slots = primarySlotKeys(slide)
    const filled = slots.filter((slot) => getSelectedAssetForSlot(slide, slot)).length
    const label = requiredMediaSlots(slide) === 0 ? 'Text' : `${filled}/${slots.length}`
    return `<button class="queue-slide ${state.selectedSlideId === slide.id ? 'is-active' : ''}" data-slide-id="${escapeAttribute(slide.id)}" type="button">
      <strong>${String(pageNumberForSlide(slide.id)).padStart(2, '0')}</strong>
      <span><strong>${escapeHTML(slide.internalTitle)}</strong><small>${escapeHTML(getPart(slide.partId)?.title ?? '')}</small></span>
      <span class="queue-status ${readiness}"><strong>${label}</strong><small>${slide.findMoreMedia?.state === 'needed' ? 'Find more' : readinessLabel(readiness)}</small></span>
    </button>`
  }).join('')
}

function renderSlideBrief() {
  const slide = getSlide()
  if (!slide) return
  const headline = copyFieldText(slide.copy?.headline)
  const subheadline = copyFieldText(slide.copy?.subheadline)
  const body = copyFieldText(slide.copy?.body)
  const slots = primarySlotKeys(slide)
  const filled = slots.filter((slot) => getSelectedAssetForSlot(slide, slot)).length
  elements.slideBriefContent.innerHTML = `
    <p class="panel-label">Slide ${String(pageNumberForSlide(slide.id)).padStart(2, '0')} / ${escapeHTML(getPart(slide.partId)?.title ?? '')}</p>
    <h2>${escapeHTML(slide.internalTitle)}</h2>
    <h3>Purpose</h3>
    <p>${escapeHTML(slide.purpose)}</p>
    <h3>Copy</h3>
    ${slide.textPresence === 'no-on-slide-text'
      ? '<p><em>No on-Slide text intended.</em></p>'
      : `${headline ? `<p class="brief-headline">${renderInlineMarkdown(headline)}</p>` : ''}
         ${subheadline ? `<p>${renderInlineMarkdown(subheadline)}</p>` : ''}
         ${body ? `<div class="brief-body">${renderMarkdown(body)}</div>` : ''}`}
    ${slide.supportingItems?.length ? `<h3>Supporting Items</h3><ol>${slide.supportingItems.map((item) => `<li><strong>${escapeHTML(item.title)}</strong><br>${escapeHTML(item.caption ?? '')}</li>`).join('')}</ol>` : ''}
    <div class="brief-style"><strong>${escapeHTML(VISUAL_STYLE_DEFINITIONS[slide.visualStyle]?.label ?? slide.visualStyle)}</strong><p>${filled}/${slots.length} required slots filled</p></div>
    ${slide.findMoreMedia?.state === 'needed' ? `<div class="find-more-card"><strong>Find More Media</strong><p>${escapeHTML(slide.findMoreMedia.brief || 'No brief yet.')}</p></div>` : ''}
  `
}

function filteredMediaAssets() {
  const slide = getSlide()
  const decisions = getDecisions(slide?.id)
  const query = state.curate.search.trim().toLowerCase()
  return mediaAssets.filter((asset) => {
    if (query && !`${asset.filename} ${asset.folder}`.toLowerCase().includes(query)) return false
    if (state.curate.folderFilter !== 'all' && asset.folder !== state.curate.folderFilter) return false
    if (state.curate.typeFilter !== 'all' && asset.type !== state.curate.typeFilter) return false
    const decision = decisions[asset.id]
    if (state.curate.stateFilter === 'project-picks' && !state.projectAssetJudgments[asset.id]?.projectPick) return false
    if (state.curate.stateFilter === 'slide-shortlist' && decision?.state !== 'shortlisted') return false
    if (state.curate.stateFilter === 'selected' && decision?.state !== 'selected') return false
    if (state.curate.stateFilter === 'alternates' && decision?.state !== 'alternate') return false
    if (state.curate.stateFilter === 'unused' && decision && decision.state !== 'considered') return false
    return true
  })
}

function renderMediaWall(resetScroll = false) {
  virtualMedia = filteredMediaAssets()
  elements.mediaCount.textContent = `${virtualMedia.length.toLocaleString()} assets`
  if (resetScroll) elements.mediaScroll.scrollTop = 0
  else elements.mediaScroll.scrollTop = state.curate.scrollTop
  renderMediaVirtualWindow()
}
