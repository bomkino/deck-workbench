function renderPlan() {
  elements.planSearch.value = planSearch
  elements.planStatusFilter.value = planStatusFilter
  renderParts()
  renderPlanSummary()
  renderDeckMap()
}

function renderParts() {
  elements.partsList.innerHTML = state.parts.map((part) => {
    const slides = state.slides.filter((slide) => slide.partId === part.id && slide.lifecycle !== 'cut')
    const ready = slides.filter((slide) => slideReadiness(slide, getDecisions(slide.id)).plan === 'ready').length
    return `<button class="part-button ${planPartFilter === part.id ? 'is-active' : ''}" data-part-id="${escapeAttribute(part.id)}" type="button">
      <span><strong>${escapeHTML(part.title)}</strong><small>${slides.length} Slide${slides.length === 1 ? '' : 's'}</small></span>
      <span class="part-count">${ready}/${slides.length}</span>
    </button>`
  }).join('')
}

function renderPlanSummary() {
  const included = state.slides.filter((slide) => slide.lifecycle === 'included')
  const counts = { ready: 0, review: 0, blocked: 0 }
  for (const slide of included) counts[slideReadiness(slide, getDecisions(slide.id)).plan] += 1
  elements.planSummary.innerHTML = [
    summaryChip(included.length, 'Included'),
    summaryChip(counts.ready, 'Plan ready'),
    summaryChip(counts.review, 'Review'),
    summaryChip(counts.blocked, 'Blocked'),
  ].join('')
}

function renderDeckMap() {
  const filteredSlides = state.slides.filter((slide) => {
    if (planPartFilter !== 'all' && slide.partId !== planPartFilter) return false
    const readiness = slideReadiness(slide, getDecisions(slide.id)).plan
    if (planStatusFilter === 'skipped' && slide.lifecycle !== 'skipped') return false
    if (planStatusFilter !== 'all' && planStatusFilter !== 'skipped' && readiness !== planStatusFilter) return false
    if (planSearch) {
      const text = [
        slide.internalTitle,
        slide.purpose,
        copyFieldText(slide.copy?.headline),
        copyFieldText(slide.copy?.subheadline),
        copyFieldText(slide.copy?.body),
      ].join(' ').toLowerCase()
      if (!text.includes(planSearch)) return false
    }
    return slide.lifecycle !== 'cut' || planStatusFilter === 'skipped'
  })

  const grouped = new Map()
  for (const slide of filteredSlides) {
    if (!grouped.has(slide.partId)) grouped.set(slide.partId, [])
    grouped.get(slide.partId).push(slide)
  }

  if (filteredSlides.length === 0) {
    elements.deckMap.innerHTML = '<div class="blank-copy-state">No Slides match these filters.</div>'
    return
  }

  elements.deckMap.innerHTML = [...grouped.entries()].map(([partId, slides]) => {
    const part = getPart(partId)
    return `<section class="deck-map-group">
      <h3>${escapeHTML(part?.title ?? 'Unassigned')}</h3>
      ${slides.map(renderSlideCard).join('')}
    </section>`
  }).join('')
}

function renderSlideCard(slide) {
  const index = state.slides.findIndex((candidate) => candidate.id === slide.id)
  const pageNumber = state.slides.filter((candidate, candidateIndex) => candidateIndex <= index && candidate.lifecycle === 'included').length
  const issues = planIssues(slide)
  const readiness = slideReadiness(slide, getDecisions(slide.id)).plan
  const headline = copyFieldText(slide.copy?.headline)
  const subheadline = copyFieldText(slide.copy?.subheadline)
  const body = copyFieldText(slide.copy?.body)
  const style = VISUAL_STYLE_DEFINITIONS[slide.visualStyle] ?? VISUAL_STYLE_DEFINITIONS.undecided
  const copyMeta = copyMetadata(slide)
  return `<article class="slide-card ${state.selectedSlideId === slide.id ? 'is-selected' : ''} ${slide.lifecycle === 'skipped' ? 'is-skipped' : ''} ${slide.lifecycle === 'cut' ? 'is-cut' : ''}" data-slide-id="${escapeAttribute(slide.id)}" draggable="true">
    <div class="slide-number-block">
      <strong>${slide.lifecycle === 'included' ? String(pageNumber).padStart(2, '0') : '—'}</strong>
      <span class="drag-grip" aria-hidden="true">⠿</span>
    </div>
    <div class="slide-card-content">
      <div class="slide-card-title-row">
        <h3>${escapeHTML(slide.internalTitle || 'Untitled Slide')}</h3>
        <span>${escapeHTML(slide.lifecycle)}</span>
      </div>
      <p class="slide-purpose">${escapeHTML(slide.purpose || 'No Purpose yet.')}</p>
      <div class="copy-preview">
        ${slide.textPresence === 'no-on-slide-text'
          ? '<span class="blank-copy-state">No on-Slide text — intentional</span>'
          : `${headline ? `<div class="headline-preview">${renderInlineMarkdown(headline)}</div>` : renderFieldAbsence(slide.copy?.headline, 'Headline')}
             ${subheadline ? `<div class="subheadline-preview">${renderInlineMarkdown(subheadline)}</div>` : ''}
             ${body ? `<div class="body-preview">${renderMarkdown(body)}</div>` : ''}`}
      </div>
      <div class="style-labels">
        <span class="meta-pill">${escapeHTML(contentPatternLabel(slide.contentPattern))}</span>
        <span class="meta-pill">${copyMeta}</span>
        ${slide.findMoreMedia?.state === 'needed' ? '<span class="meta-pill">Find More</span>' : ''}
        ${slide.copyReviewState === 'changed-after-assembly' ? '<span class="meta-pill">Copy changed</span>' : ''}
      </div>
    </div>
    <div class="slide-card-meta">
      <div class="style-summary">
        <div class="style-diagram" data-style="${escapeAttribute(slide.visualStyle)}" aria-hidden="true"></div>
        <strong>${escapeHTML(style.label)}</strong>
        <small>${requiredMediaSlots(slide)} media slot${requiredMediaSlots(slide) === 1 ? '' : 's'}</small>
        <span class="status-pill ${readiness}">${readinessLabel(readiness)}</span>
        ${issues.length ? `<small>${escapeHTML(issues[0].message)}</small>` : ''}
      </div>
      <div class="slide-card-actions">
        <button data-slide-action="edit" type="button">Edit</button>
        <button data-slide-action="curate" type="button">Curate</button>
        <button data-slide-action="skip" type="button">${slide.lifecycle === 'skipped' ? 'Restore' : 'Skip'}</button>
        <button data-slide-action="up" type="button" ${index === 0 ? 'disabled' : ''}>Up</button>
        <button data-slide-action="down" type="button" ${index === state.slides.length - 1 ? 'disabled' : ''}>Down</button>
      </div>
    </div>
  </article>`
}

function toggleSlideSkip(slideId) {
  commit('Slide lifecycle changed', (draft) => {
    const slide = draft.slides.find((candidate) => candidate.id === slideId)
    slide.lifecycle = slide.lifecycle === 'skipped' ? 'included' : 'skipped'
  })
}

function reorderSlide(slideId, direction) {
  const index = state.slides.findIndex((slide) => slide.id === slideId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= state.slides.length) return
  commit('Slide reordered', (draft) => {
    draft.slides = [...moveIncludedSlide(draft.slides, slideId, target)]
  })
}
