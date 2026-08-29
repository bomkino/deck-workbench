function loadState() {
  try {
    const stored = localStorage.getItem(STORE_KEY)
    return stored ? JSON.parse(stored) : structuredClone(fixture)
  } catch {
    return structuredClone(fixture)
  }
}

function ensureStateShape() {
  state.projectAssetJudgments ??= {}
  state.slideMediaDecisions ??= {}
  state.curate ??= structuredClone(fixture.curate)
  state.assemble ??= structuredClone(fixture.assemble)
  state.phase = ['plan', 'curate', 'assemble', 'handoff'].includes(state.phase) ? state.phase : 'plan'
  for (const slide of state.slides) {
    slide.lifecycle ??= 'included'
    slide.findMoreMedia ??= { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' }
    slide.assemblies ??= []
    if (slide.assemblies.length === 0) slide.assemblies.push(createAssembly())
    slide.activeAssemblyId ??= slide.assemblies[0].id
    slide.copyReviewState ??= 'clean'
    slide.layoutReviewState ??= 'clean'
  }
  if (!getSlide(state.selectedSlideId)) state.selectedSlideId = state.slides[0]?.id ?? null
}

function createAssembly() {
  return {
    id: crypto.randomUUID(),
    name: 'Primary Assembly',
    image: { panX: 0, panY: 0, scale: 1, sourceTreatment: 'crop-provisional' },
    text: { x: 260, y: 600, width: 1650, height: 330, scaleToken: 'M', opticalMultiplier: 1, columns: 1, columnGap: 64, overflow: false, layoutSnapshotState: 'current' },
    gradient: { enabled: true, type: 'linear', preset: 'left', start: { x: 0.03, y: 0.5 }, end: { x: 0.76, y: 0.5 }, feather: 0.68, opacity: 0.82, reverse: false },
    designerNotes: '',
    unplacedAssetIds: [],
  }
}

function seedMediaDecisions() {
  if (Object.keys(state.slideMediaDecisions).length > 0) return
  let cursor = 3
  for (const slide of state.slides) {
    const decisions = {}
    const slots = primarySlotKeys(slide)
    slots.forEach((slotKey, index) => {
      const asset = mediaAssets[(cursor + index * 17) % mediaAssets.length]
      decisions[asset.id] = { state: index === slots.length - 1 && slide.id === 'slide-world' ? 'shortlisted' : 'selected', slotKey: index === slots.length - 1 && slide.id === 'slide-world' ? null : slotKey, availability: 'available' }
    })
    for (let index = 0; index < Math.min(3, Math.max(1, slots.length)); index += 1) {
      const alternate = mediaAssets[(cursor + 101 + index * 13) % mediaAssets.length]
      decisions[alternate.id] = { state: index === 0 ? 'alternate' : 'shortlisted', slotKey: null, availability: 'available' }
    }
    state.slideMediaDecisions[slide.id] = decisions
    cursor += 47
  }
  saveState()
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
  setSaveState('Saved')
}

function setSaveState(label) {
  elements.saveState.textContent = label
}

function snapshot() {
  return structuredClone(state)
}

function commit(label, mutate, options = {}) {
  history.push(snapshot())
  if (history.length > 80) history.shift()
  future = []
  mutate(state)
  ensureStateShape()
  saveState()
  renderAll(options)
  showToast(label)
}

function commitTransient(before, label) {
  history.push(before)
  if (history.length > 80) history.shift()
  future = []
  saveState()
  renderAll({ preserveMediaScroll: true })
  showToast(label)
}

function undo() {
  const previous = history.pop()
  if (!previous) return
  future.push(snapshot())
  state = previous
  ensureStateShape()
  saveState()
  renderAll({ preserveMediaScroll: true })
  showToast('Undo')
}

function redo() {
  const next = future.pop()
  if (!next) return
  history.push(snapshot())
  state = next
  ensureStateShape()
  saveState()
  renderAll({ preserveMediaScroll: true })
  showToast('Redo')
}

function showToast(message) {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.add('is-visible')
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 1500)
}

function renderAll(options = {}) {
  elements.projectTitle.textContent = state.project.title
  elements.projectVersion.textContent = state.project.version
  elements.phaseButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.phase === state.phase))
  elements.phaseViews.forEach((view) => view.classList.toggle('is-active', view.dataset.view === state.phase))
  elements.undo.disabled = history.length === 0
  elements.redo.disabled = future.length === 0
  if (state.phase === 'plan') renderPlan()
  if (state.phase === 'curate') renderCurate(options)
  if (state.phase === 'assemble') renderAssembly()
  if (state.phase === 'handoff') renderHandoff()
}

function setPhase(phase) {
  if (state.phase === phase) return
  state.phase = phase
  saveState()
  renderAll({ preserveMediaScroll: true })
  requestAnimationFrame(() => elements.phaseRoot.focus({ preventScroll: true }))
}

function getSlide(id = state.selectedSlideId) {
  return state.slides.find((slide) => slide.id === id) ?? null
}

function getPart(id) {
  return state.parts.find((part) => part.id === id) ?? null
}

function getAssembly(slide = getSlide()) {
  return slide?.assemblies?.find((assembly) => assembly.id === slide.activeAssemblyId) ?? slide?.assemblies?.[0] ?? null
}

function getDecisions(slideId = state.selectedSlideId) {
  state.slideMediaDecisions[slideId] ??= {}
  return state.slideMediaDecisions[slideId]
}

function getAsset(assetId) {
  return mediaAssets.find((asset) => asset.id === assetId) ?? null
}

function getSelectedAssetForSlot(slide, slotKey) {
  const entry = Object.entries(getDecisions(slide.id)).find(([, decision]) => decision.state === 'selected' && decision.slotKey === slotKey)
  return entry ? getAsset(entry[0]) : null
}

function getPrimaryAssets(slide = getSlide()) {
  if (!slide) return []
  return primarySlotKeys(slide).map((slotKey) => ({ slotKey, asset: getSelectedAssetForSlot(slide, slotKey) }))
}

function getDecisionAssetEntries(slide, stateName) {
  return Object.entries(getDecisions(slide.id))
    .filter(([, decision]) => decision.state === stateName)
    .map(([assetId, decision]) => ({ asset: getAsset(assetId), decision }))
    .filter((entry) => entry.asset)
}

function createMediaAssets(count) {
  const folders = ['Characters', 'World', 'Christmas', 'Locations', 'Textures', 'Comps', 'Production', 'Archive']
  const types = ['image', 'image', 'image', 'image', 'image', 'gif', 'video']
  const orientations = ['landscape', 'portrait', 'square', 'landscape', 'landscape']
  return Array.from({ length: count }, (_, index) => {
    const folder = folders[index % folders.length]
    const type = types[index % types.length]
    const orientation = orientations[index % orientations.length]
    const width = orientation === 'portrait' ? 2400 : orientation === 'square' ? 3000 : 4096
    const height = orientation === 'portrait' ? 3600 : orientation === 'square' ? 3000 : 2304
    return Object.freeze({
      id: `asset-${String(index + 1).padStart(5, '0')}`,
      filename: `${folder.toLowerCase().replaceAll(' ', '-')}-${String(index + 1).padStart(4, '0')}.${type === 'video' ? 'mov' : type === 'gif' ? 'gif' : index % 3 === 0 ? 'png' : 'jpg'}`,
      folder,
      type,
      orientation,
      width,
      height,
      hue: (index * 37 + 192) % 360,
      tone: 24 + (index * 13) % 28,
      pattern: index % 7,
      availability: index % 311 === 0 ? 'missing' : 'available',
    })
  })
}

function assetBackground(asset) {
  if (!asset) return 'linear-gradient(135deg, #2b3033, #151719)'
  const secondHue = (asset.hue + 48 + asset.pattern * 11) % 360
  const thirdHue = (asset.hue + 190) % 360
  return `
    radial-gradient(circle at ${18 + asset.pattern * 9}% ${22 + (asset.pattern % 4) * 15}%, hsla(${secondHue} 38% 74% / .45), transparent 28%),
    linear-gradient(${112 + asset.pattern * 17}deg, hsl(${asset.hue} 24% ${asset.tone + 18}%), hsl(${secondHue} 30% ${asset.tone}%) 54%, hsl(${thirdHue} 18% 12%))`
}

function bindGlobalEvents() {
  elements.phaseButtons.forEach((button) => button.addEventListener('click', () => setPhase(button.dataset.phase)))
  elements.undo.addEventListener('click', undo)
  elements.redo.addEventListener('click', redo)
  elements.reset.addEventListener('click', () => {
    if (!window.confirm('Reset the phased tracer to its original fixture?')) return
    localStorage.removeItem(STORE_KEY)
    state = structuredClone(fixture)
    history = []
    future = []
    ensureStateShape()
    showToast('Tracer reset')
  })

  bindPlanEvents()
  bindCurateEvents()
  bindAssemblyEvents()
  bindHandoffEvents()

  document.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('pointerdown', (event) => {
    if (!elements.contextMenu.contains(event.target)) closeContextMenu()
  })
}

function handleGlobalKeydown(event) {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)
  const primary = event.metaKey || event.ctrlKey
  if (primary && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault()
    setPhase(['plan', 'curate', 'assemble', 'handoff'][Number(event.key) - 1])
    return
  }
  if (primary && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
    return
  }
  if (editing) return
  if (state.phase === 'curate') handleCurateKeyboard(event)
  if (state.phase === 'assemble') handleAssemblyKeyboard(event)
}

/* Plan */
