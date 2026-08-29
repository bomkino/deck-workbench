function bindHandoffEvents() {
  elements.handoffFilterButtons.forEach((button) => button.addEventListener('click', () => {
    handoffFilter = button.dataset.handoffFilter
    renderHandoff()
  }))
  elements.handoffContactSheet.addEventListener('click', (event) => {
    const card = event.target.closest('[data-slide-id]')
    if (!card) return
    selectSlide(card.dataset.slideId)
    setPhase('assemble')
  })
  elements.issueList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-slide-id]')
    if (!item) return
    selectSlide(item.dataset.slideId)
    setPhase(item.dataset.phase)
  })
  elements.downloadHandoffJson.addEventListener('click', () => {
    downloadText(`${slug(state.project.title)}-${state.project.version}-handoff.json`, JSON.stringify(buildHandoffManifest(), null, 2), 'application/json')
    showToast('Tracer manifest downloaded')
  })
  elements.downloadCopyMarkdown.addEventListener('click', () => {
    downloadText(`${slug(state.project.title)}-${state.project.version}-deck-copy.md`, buildDeckMarkdown(), 'text/markdown')
    showToast('Deck Markdown downloaded')
  })
}

function renderHandoff() {
  const all = buildHandoffRows()
  const counts = {
    all: all.filter((row) => row.slide.lifecycle === 'included').length,
    blocked: all.filter((row) => row.readiness.handoff === 'blocked').length,
    review: all.filter((row) => row.readiness.handoff === 'review').length,
    'find-more': all.filter((row) => row.slide.findMoreMedia?.state === 'needed').length,
    ready: all.filter((row) => row.readiness.handoff === 'ready').length,
    skipped: all.filter((row) => row.slide.lifecycle === 'skipped').length,
  }
  elements.handoffFilterButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.handoffFilter === handoffFilter)
    const count = button.querySelector('span')
    if (count) count.textContent = String(counts[button.dataset.handoffFilter] ?? 0)
  })
  elements.handoffSummary.innerHTML = [
    summaryChip(counts.all, 'Included'),
    summaryChip(counts.ready, 'Ready'),
    summaryChip(counts.review, 'Review'),
    summaryChip(counts.blocked, 'Blocked'),
  ].join('')
  const filtered = all.filter((row) => {
    if (handoffFilter === 'all') return row.slide.lifecycle === 'included'
    if (handoffFilter === 'blocked') return row.readiness.handoff === 'blocked'
    if (handoffFilter === 'review') return row.readiness.handoff === 'review'
    if (handoffFilter === 'find-more') return row.slide.findMoreMedia?.state === 'needed'
    if (handoffFilter === 'ready') return row.readiness.handoff === 'ready'
    if (handoffFilter === 'skipped') return row.slide.lifecycle === 'skipped'
    return true
  })
  elements.handoffContactSheet.innerHTML = filtered.length
    ? filtered.map(renderHandoffCard).join('')
    : '<div class="blank-copy-state">No Slides match this filter.</div>'
  renderIssueLedger(all)
}

function buildHandoffRows() {
  return state.slides.filter((slide) => slide.lifecycle !== 'cut').map((slide) => ({
    slide,
    readiness: slideReadiness(slide, getDecisions(slide.id)),
    issues: expandedHandoffIssues(slide),
  }))
}

function expandedHandoffIssues(slide) {
  const issues = [...handoffIssues(slide, getDecisions(slide.id))]
  if (slide.lifecycle === 'included' && slide.findMoreMedia?.state === 'needed') {
    issues.push({ code: 'curate.find-more', message: 'Find More Media remains open', severity: 'warning' })
  }
  if (slide.lifecycle === 'included' && slide.sourceTreatment && !['ready', 'crop-provisional'].includes(slide.sourceTreatment)) {
    issues.push({ code: 'assemble.source-treatment', message: sourceTreatmentLabel(slide.sourceTreatment), severity: 'warning' })
  }
  const assembly = getAssembly(slide)
  if (assembly?.text?.layoutSnapshotState === 'stale') {
    issues.push({ code: 'assemble.text-layout', message: 'Text layout needs export review', severity: 'warning' })
  }
  return deduplicateIssues(issues)
}

function renderHandoffCard({ slide, readiness }) {
  const assembly = getAssembly(slide)
  const primary = getPrimaryAssets(slide).find((entry) => entry.asset)?.asset
  const headline = copyFieldText(slide.copy?.headline)
  const gradientCss = gradientCssForPreview(assembly?.gradient)
  return `<button class="handoff-card" data-slide-id="${escapeAttribute(slide.id)}" type="button">
    <span class="handoff-thumb">
      <span class="handoff-thumb-image" style="background-image:${assetBackground(primary)}"></span>
      <span class="handoff-thumb-gradient" style="background:${gradientCss}"></span>
      ${slide.textPresence !== 'no-on-slide-text' ? `<span class="handoff-thumb-copy"><strong>${escapeHTML(markdownToPlain(headline || slide.internalTitle))}</strong></span>` : ''}
    </span>
    <span class="handoff-card-info">
      <span class="handoff-card-title"><strong>${escapeHTML(slide.internalTitle)}</strong><span>${slide.lifecycle === 'included' ? String(pageNumberForSlide(slide.id)).padStart(2, '0') : slide.lifecycle}</span></span>
      <span>${escapeHTML(VISUAL_STYLE_DEFINITIONS[slide.visualStyle]?.label ?? slide.visualStyle)}</span>
      <span class="handoff-status-grid">
        <span class="${readiness.plan}">Plan ${readiness.plan}</span>
        <span class="${readiness.curate}">Media ${readiness.curate}</span>
        <span class="${readiness.assemble}">Rough ${readiness.assemble}</span>
        <span class="${readiness.handoff}">Hand ${readiness.handoff}</span>
      </span>
    </span>
  </button>`
}

function renderIssueLedger(rows) {
  const issues = rows
    .filter(({ slide }) => slide.lifecycle === 'included')
    .flatMap(({ slide, issues }) => issues.map((item) => ({ slide, ...item })))
  elements.issueList.innerHTML = issues.length
    ? issues.map((item) => {
      const phase = item.code.startsWith('plan.') ? 'plan' : item.code.startsWith('curate.') ? 'curate' : 'assemble'
      return `<button class="issue-item ${item.severity}" data-slide-id="${escapeAttribute(item.slide.id)}" data-phase="${phase}" type="button">
        <span class="issue-severity" aria-hidden="true"></span>
        <span><strong>Slide ${String(pageNumberForSlide(item.slide.id)).padStart(2, '0')} · ${escapeHTML(item.slide.internalTitle)}</strong><small>${escapeHTML(item.message)}</small></span>
        <span>→</span>
      </button>`
    }).join('')
    : '<p class="blank-copy-state">No unresolved issues.</p>'
}

function buildHandoffManifest() {
  return {
    format: 'pitchdog.workbench-handoff-tracer',
    generatedAt: new Date().toISOString(),
    project: state.project,
    phase: state.phase,
    slides: state.slides.filter((slide) => slide.lifecycle === 'included').map((slide) => {
      const assembly = getAssembly(slide)
      return {
        id: slide.id,
        pageNumber: pageNumberForSlide(slide.id),
        part: getPart(slide.partId)?.title ?? null,
        internalTitle: slide.internalTitle,
        purpose: slide.purpose,
        textPresence: slide.textPresence,
        contentPattern: slide.contentPattern,
        visualStyle: slide.visualStyle,
        copy: {
          headline: slide.copy?.headline ?? null,
          subheadline: slide.copy?.subheadline ?? null,
          body: slide.copy?.body ?? null,
        },
        supportingItems: slide.supportingItems ?? [],
        selectedMedia: getPrimaryAssets(slide).map(({ slotKey, asset }) => ({ slotKey, assetId: asset?.id ?? null, filename: asset?.filename ?? null })),
        alternates: getDecisionAssetEntries(slide, 'alternate').map(({ asset }) => ({ assetId: asset.id, filename: asset.filename })),
        shortlist: getDecisionAssetEntries(slide, 'shortlisted').map(({ asset }) => ({ assetId: asset.id, filename: asset.filename })),
        findMoreMedia: slide.findMoreMedia,
        sourceTreatment: slide.sourceTreatment,
        assembly,
        issues: expandedHandoffIssues(slide),
      }
    }),
  }
}

function buildDeckMarkdown() {
  const lines = [
    '---',
    'workbench-format: 2',
    `deck-id: ${state.project.id}`,
    `title: ${state.project.title}`,
    `version: ${state.project.version}`,
    `canvas: ${state.project.canvas.width}x${state.project.canvas.height}`,
    '---',
    '',
  ]
  for (const part of state.parts) {
    const slides = state.slides.filter((slide) => slide.partId === part.id && slide.lifecycle !== 'cut')
    if (slides.length === 0) continue
    lines.push(`## Part: ${part.title}`, `<!-- part-id: ${part.id} -->`, '')
    for (const slide of slides) {
      lines.push(`### Slide: ${slide.internalTitle}`, `<!-- slide-id: ${slide.id} -->`, '')
      lines.push(`Lifecycle: ${slide.lifecycle}`)
      lines.push(`Purpose: ${slide.purpose}`)
      lines.push(`Text-Presence: ${slide.textPresence}`)
      lines.push(`Content-Pattern: ${slide.contentPattern}`)
      lines.push(`Visual-Style: ${slide.visualStyle}`, '')
      for (const [role, heading] of [['headline', 'Headline'], ['subheadline', 'Subheadline'], ['body', 'Body']]) {
        const field = slide.copy?.[role] ?? copyField('unreviewed')
        lines.push(`#### ${heading}`)
        if (field.state === 'present') lines.push(field.markdown)
        else lines.push(`<!-- ${field.state} -->`)
        lines.push('')
      }
      if (slide.supportingItems?.length) {
        lines.push('#### Items', '')
        for (const item of slide.supportingItems) {
          lines.push(`##### Item: ${item.title}`, `<!-- item-id: ${item.id} -->`, '')
          if (item.caption) lines.push('Caption:', item.caption, '')
          if (item.link) lines.push('Link:', item.link, '')
        }
      }
      if (slide.findMoreMedia?.state === 'needed') lines.push('#### Find More Media', slide.findMoreMedia.brief || '', '')
      const notes = getAssembly(slide)?.designerNotes
      if (notes) lines.push('#### Designer Notes', notes, '')
    }
  }
  return lines.join('\n')
}

/* Helpers */
