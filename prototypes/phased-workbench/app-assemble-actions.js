function applyGradientPreset(name) {
  const preset = gradientPresets[name]
  if (!preset) return
  commit(`Gradient preset: ${preset.label}`, (draft) => {
    const gradient = activeDraftAssembly(draft).gradient
    gradient.enabled = preset.enabled ?? true
    gradient.type = preset.type ?? 'linear'
    gradient.preset = name
    gradient.start = { ...preset.start }
    gradient.end = { ...preset.end }
    gradient.feather = preset.feather
    gradient.opacity = preset.opacity
    gradient.reverse = Boolean(preset.reverse)
  })
  state.assemble.tool = 'gradient'
  state.assemble.selection = 'gradient'
  saveState()
  renderAssembly()
}

function demoteFirstPrimary(action) {
  const slide = getSlide()
  const first = getPrimaryAssets(slide).find((entry) => entry.asset)
  if (!first) return
  setSlideMediaDecision(first.asset.id, action)
}

function handleAssemblyTrayClick(event) {
  const card = event.target.closest('[data-asset-id]')
  if (!card) return
  const action = card.dataset.trayAction
  if (action === 'demote-shortlist') setSlideMediaDecision(card.dataset.assetId, 'demote-to-shortlist')
  else if (action === 'promote') setSlideMediaDecision(card.dataset.assetId, 'select')
  renderAssembly()
}

function handleAssemblyKeyboard(event) {
  const key = event.key.toLowerCase()
  if (['v', 'h', 'c', 'g'].includes(key)) {
    const map = { v: 'select', h: 'hand', c: 'crop', g: 'gradient' }
    state.assemble.tool = map[key]
    if (key === 'g') state.assemble.selection = 'gradient'
    if (key === 'c') state.assemble.selection = 'image'
    saveState()
    renderAssembly()
    return
  }
  if (event.key === '\\') {
    event.preventDefault()
    toggleAssemblyView('cleanPreview')
    return
  }
  if (event.key === ';') {
    event.preventDefault()
    toggleAssemblyView(event.shiftKey ? 'snap' : 'showGrid')
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const increment = event.shiftKey ? 8 : 1
  const delta = {
    ArrowLeft: { x: -increment, y: 0 },
    ArrowRight: { x: increment, y: 0 },
    ArrowUp: { x: 0, y: -increment },
    ArrowDown: { x: 0, y: increment },
  }[event.key]
  commit(`${titleCase(state.assemble.selection ?? 'Selection')} nudged`, (draft) => {
    const assembly = activeDraftAssembly(draft)
    if (draft.assemble.selection === 'image') {
      assembly.image.panX += delta.x
      assembly.image.panY += delta.y
    } else if (draft.assemble.selection === 'gradient') {
      assembly.gradient.start.x = Math.max(0, Math.min(1, assembly.gradient.start.x + delta.x / 2576))
      assembly.gradient.start.y = Math.max(0, Math.min(1, assembly.gradient.start.y + delta.y / 1080))
      assembly.gradient.end.x = Math.max(0, Math.min(1, assembly.gradient.end.x + delta.x / 2576))
      assembly.gradient.end.y = Math.max(0, Math.min(1, assembly.gradient.end.y + delta.y / 1080))
    } else {
      assembly.text.x += delta.x
      assembly.text.y += delta.y
    }
  })
}

/* Handoff */
