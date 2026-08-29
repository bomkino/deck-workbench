function bindHandoffEvents() {
  elements.handoffList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-handoff-slide-id]')
    if (!row) return
    selectedSlideId = row.dataset.handoffSlideId
    activePhase = 'plan'
    void refreshWorkspace(selectedSlideId).then((next) => {
      if (next?.slide?.id === selectedSlideId) elements.internalTitle.focus({ preventScroll: true })
    })
  })
  elements.exportPDF.addEventListener('click', async () => {
    if (!projection) return
    setBusy('Preparing PDF export…')
    try {
      await window.deckBridge.exportPDF()
      renderAll()
      setStatus('PDF exported')
    } catch (error) {
      renderAll()
      setStatus(`${error.name ?? 'Error'}: ${error.message}`)
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
