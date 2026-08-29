function bindWorkspaceEvents() {
  elements.phaseButtons.forEach((button) => button.addEventListener('click', () => setPhase(button.dataset.phase)))
  elements.undo.addEventListener('click', () => historyAction('undo'))
  elements.redo.addEventListener('click', () => historyAction('redo'))
  elements.interfaceScale.addEventListener('change', async () => {
    try {
      const result = await window.deckBridge.setInterfaceScale({ value: Number(elements.interfaceScale.value) })
      interfaceScale = result.interfaceScale
      applyScales()
    } catch (error) {
      setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    }
  })
  bindPlanEvents()
  elements.cutSlide.addEventListener('click', (event) => {
    event.stopImmediatePropagation()
    const record = selectedPlanRecord()
    if (record) void setSlideLifecycle(record.slide.id, record.metadata.lifecycle === 'cut' ? 'included' : 'cut')
  }, { capture: true })
  bindVisualEvents()
  elements.fitArtboard.textContent = 'Fit Artboard'
  bindHandoffEvents()
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    if (['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault()
      setPhase(['plan', 'curate', 'assemble', 'handoff'][Number(event.key) - 1])
    }
  })
  window.addEventListener('resize', applyScales)
}

async function boot() {
  bindWorkspaceEvents()
  try {
    const preferences = await window.deckBridge.getPreferences()
    interfaceScale = preferences.interfaceScale
    artboardZoom = preferences.artboardZoom
    applyScales()
    const next = await window.deckBridge.query({ name: 'slide.activeProjection', params: {} })
    projection = next
    selectedSlideId = next.slide.id
    await refreshWorkspace(selectedSlideId)
  } catch {
    applyScales()
    renderAll()
  }
}

window.deckWorkbench = Object.freeze({
  renderProjection,
  clearProjection,
  exportFrame() {
    activePhase = 'assemble'
    renderAll()
    const rect = elements.artboard.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  },
  async tracerEditHeadline(text) {
    elements.headline.value = text
    await commitHeadline()
    return projection
  },
  projection() {
    return projection
  },
  phase() {
    return activePhase
  },
})

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true })
else void boot()
