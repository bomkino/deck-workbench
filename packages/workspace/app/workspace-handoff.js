function bindHandoffEvents() {
  elements.handoffList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-handoff-slide-id]')
    if (!row) return
    selectedSlideId = row.dataset.handoffSlideId
    activePhase = 'plan'
    void refreshWorkspace(selectedSlideId)
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
      <span><strong>${escapeHTML(record.metadata.internalTitle || 'Untitled Slide')}</strong><small>${escapeHTML(record.metadata.purpose || readiness.issues[0]?.message || 'Purpose not written.')}</small></span>
      <span class="readiness-pill ${readiness.state}">${readiness.state}</span>
    </button>`
  }).join('')
}
