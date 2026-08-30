function bindHandoffEvents() {
  elements.handoffList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-handoff-slide-id]')
    if (!row) return
    selectedSlideId = row.dataset.handoffSlideId
    activePhase = 'plan'
    void refreshWorkspace(selectedSlideId).then((next) => {
      if (next?.slide?.id === selectedSlideId) focusPlanControl(elements.internalTitle)
    })
  })
  elements.exportPDF.addEventListener('click', async () => {
    if (!projection || elements.exportPDF.dataset.exporting === 'true') return
    const overflowCount = compositionOverflowCountForProjection(projection)
    if (overflowCount > 0) {
      renderHandoff()
      setStatus('CompositionOverflow: Fix the active Slide before PDF export')
      return
    }
    elements.exportPDF.dataset.exporting = 'true'
    elements.exportPDF.disabled = true
    setBusy('Preparing PDF export…')
    let finalStatus = ''
    try {
      await window.deckBridge.exportPDF()
      finalStatus = 'PDF exported'
    } catch (error) {
      finalStatus = `${error.name ?? 'Error'}: ${error.message}`
    } finally {
      delete elements.exportPDF.dataset.exporting
      renderAll()
      setStatus(finalStatus)
    }
  })
}

function renderHandoff() {
  const records = planRecords()
  const included = records.filter((record) => record.metadata.lifecycle === 'included')
  const counts = { ready: 0, review: 0, blocked: 0 }
  for (const record of included) counts[planReadiness(record).state] += 1
  elements.exportPDF.textContent = projection
    ? `Export ${projection.slide?.internalTitle ?? projection.headline?.plainText ?? 'active Slide'} PDF`
    : 'Export active Slide PDF'
  const overflowCount = compositionOverflowCountForProjection(projection)
  elements.handoffExportState.hidden = overflowCount === 0
  elements.handoffExportState.textContent = overflowCount
    ? `${overflowCount} active-Slide element${overflowCount === 1 ? '' : 's'} exceed the authored frame. Shorten the copy or choose another Pattern before export.`
    : ''
  elements.exportPDF.disabled = !projection || overflowCount > 0 || elements.exportPDF.dataset.exporting === 'true'
  elements.exportPDF.title = overflowCount ? 'Fix active-Slide composition overflow before export' : ''
  elements.handoffSummary.innerHTML = [
    summaryChip(included.length, 'Included'),
    summaryChip(counts.ready, 'Ready'),
    summaryChip(counts.review, 'Review'),
    summaryChip(counts.blocked, 'Blocked'),
  ].join('')
  if (!records.length) {
    elements.handoffList.innerHTML = '<div class="empty-workspace"><strong>No Deck open.</strong><p>Create or open a Deck.</p></div>'
    return
  }
  let page = 1
  elements.handoffList.innerHTML = records.filter((record) => record.metadata.lifecycle !== 'cut').map((record) => {
    const readiness = planReadiness(record)
    const number = record.metadata.lifecycle === 'included' ? String(page++).padStart(2, '0') : '—'
    return `<button class="handoff-row" data-handoff-slide-id="${escapeAttribute(record.slide.id)}" type="button">
      <strong>${number}</strong>
      <span><strong>${escapeHTML(record.metadata.internalTitle || 'Untitled Slide')}</strong><small>${escapeHTML(readiness.issues[0]?.message || record.metadata.purpose || 'No current blocker.')}</small></span>
      <span class="readiness-pill ${readiness.state}">${readiness.state}</span>
    </button>`
  }).join('')
}
