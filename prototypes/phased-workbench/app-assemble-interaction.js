function activeDraftAssembly(draft) {
  const slide = draft.slides.find((candidate) => candidate.id === draft.selectedSlideId)
  return slide.assemblies.find((assembly) => assembly.id === slide.activeAssemblyId) ?? slide.assemblies[0]
}

function bindRange(input, key, label, mutate) {
  input.addEventListener('pointerdown', () => {
    if (!rangeSnapshots.has(key)) rangeSnapshots.set(key, snapshot())
  })
  input.addEventListener('keydown', () => {
    if (!rangeSnapshots.has(key)) rangeSnapshots.set(key, snapshot())
  })
  input.addEventListener('input', () => {
    if (!rangeSnapshots.has(key)) rangeSnapshots.set(key, snapshot())
    mutate(state, Number(input.value))
    setSaveState('Previewing')
    renderArtboard()
    renderAssemblyInspector()
  })
  input.addEventListener('change', () => {
    const before = rangeSnapshots.get(key)
    if (!before) return
    rangeSnapshots.delete(key)
    commitTransient(before, label)
  })
}

function toggleAssemblyView(key) {
  state.assemble[key] = !state.assemble[key]
  saveState()
  renderAssembly()
}

function setZoom(next) {
  state.artboardZoom = Math.max(0.1, Math.min(1.3, Number(next)))
  saveState()
  renderArtboard()
}

function fitArtboard(announce = true) {
  const width = Math.max(320, elements.stageViewport.clientWidth - 80)
  const height = Math.max(220, elements.stageViewport.clientHeight - 80)
  state.artboardZoom = Math.max(0.1, Math.min(1, Math.min(width / 2576, height / 1080)))
  state.assemble.panX = 0
  state.assemble.panY = 0
  saveState()
  renderArtboard()
  if (announce) showToast('Artboard fitted')
}

function startAssemblyDrag(kind, event) {
  event.preventDefault()
  const slide = getSlide()
  const assembly = getAssembly(slide)
  if (!slide || !assembly) return
  dragState = {
    kind,
    before: snapshot(),
    startClient: { x: event.clientX, y: event.clientY },
    startText: { ...assembly.text },
    startImage: { ...assembly.image },
    startGradient: structuredClone(assembly.gradient),
    startPan: { x: state.assemble.panX ?? 0, y: state.assemble.panY ?? 0 },
    moved: false,
  }
  setSaveState('Previewing')
}

function handleAssemblyPointerMove(event) {
  if (!dragState) return
  const slide = getSlide()
  const assembly = getAssembly(slide)
  if (!slide || !assembly) return
  const screenDx = event.clientX - dragState.startClient.x
  const screenDy = event.clientY - dragState.startClient.y
  const dx = screenDx / state.artboardZoom
  const dy = screenDy / state.artboardZoom
  dragState.moved ||= Math.abs(screenDx) + Math.abs(screenDy) > 1

  if (dragState.kind === 'text-move') {
    let x = dragState.startText.x + dx
    let y = dragState.startText.y + dy
    if (state.assemble.snap) {
      const threshold = 12 / state.artboardZoom
      x = snapValue(x, pitchGrid.xLines, threshold).value
      y = snapValue(y, pitchGrid.yLines, threshold).value
    }
    assembly.text.x = x
    assembly.text.y = y
  }
  if (dragState.kind === 'text-resize') {
    assembly.text.width = Math.max(260, dragState.startText.width + dx)
    assembly.text.height = Math.max(120, dragState.startText.height + dy)
    assembly.text.layoutSnapshotState = 'stale'
  }
  if (dragState.kind === 'image-pan') {
    assembly.image.panX = dragState.startImage.panX + dx
    assembly.image.panY = dragState.startImage.panY + dy
  }
  if (dragState.kind === 'stage-pan') {
    state.assemble.panX = dragState.startPan.x + screenDx
    state.assemble.panY = dragState.startPan.y + screenDy
  }
  if (dragState.kind.startsWith('gradient-')) {
    const point = pointFromArtboardClient(event.clientX, event.clientY)
    const handle = dragState.kind.replace('gradient-', '')
    assembly.gradient[handle] = point
    assembly.gradient.preset = 'custom'
  }
  renderArtboard()
  if (dragState.kind !== 'stage-pan') renderAssemblyInspector()
}

function finishAssemblyDrag() {
  if (!dragState) return
  const finished = dragState
  dragState = null
  if (!finished.moved) {
    setSaveState('Saved')
    renderAssembly()
    return
  }
  const label = finished.kind === 'text-move'
    ? 'Text Stack moved'
    : finished.kind === 'text-resize'
      ? 'Text Stack resized'
      : finished.kind === 'image-pan'
        ? 'Image crop moved'
        : finished.kind === 'stage-pan'
          ? 'Stage panned'
          : 'Gradient handle moved'
  if (finished.kind === 'stage-pan') {
    saveState()
    renderAssembly()
    return
  }
  commitTransient(finished.before, label)
}

function pointFromArtboardClient(clientX, clientY) {
  const rect = elements.artboard.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  }
}
