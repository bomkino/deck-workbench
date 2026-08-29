function renderAssembly() {
  renderAssemblySlideList()
  elements.assemblyToolbarTools.forEach((button) => button.classList.toggle('is-active', button.dataset.tool === state.assemble.tool))
  elements.toggleGrid.classList.toggle('is-active', state.assemble.showGrid)
  elements.toggleSnap.classList.toggle('is-active', state.assemble.snap)
  elements.toggleGuides.classList.toggle('is-active', state.assemble.smartGuides)
  elements.toggleCleanPreview.classList.toggle('is-active', state.assemble.cleanPreview)
  renderAssemblyInspector()
  renderAssemblyTray()
  renderArtboard()
}

function renderAssemblySlideList() {
  elements.assemblySlideList.innerHTML = state.slides.filter((slide) => slide.lifecycle !== 'cut').map((slide) => {
    const readiness = slideReadiness(slide, getDecisions(slide.id)).assemble
    return `<button class="assembly-slide-button ${state.selectedSlideId === slide.id ? 'is-active' : ''}" data-slide-id="${escapeAttribute(slide.id)}" type="button">
      <strong>${slide.lifecycle === 'included' ? String(pageNumberForSlide(slide.id)).padStart(2, '0') : '—'}</strong>
      <span><strong>${escapeHTML(slide.internalTitle)}</strong><small>${escapeHTML(VISUAL_STYLE_DEFINITIONS[slide.visualStyle]?.label ?? slide.visualStyle)}</small></span>
      <span class="queue-status ${readiness}"><small>${readinessLabel(readiness)}</small></span>
    </button>`
  }).join('')
}

function renderAssemblyInspector() {
  const slide = getSlide()
  const assembly = getAssembly(slide)
  if (!slide || !assembly) return
  elements.assemblyTitle.textContent = slide.internalTitle
  elements.assemblyPurpose.textContent = slide.purpose
  elements.selectionSummary.innerHTML = `<strong>${state.assemble.selection ? titleCase(state.assemble.selection) : 'Slide'}</strong><span>${state.assemble.tool === 'crop' ? 'Crop mode' : state.assemble.tool === 'gradient' ? 'Gradient mode' : 'Select mode'}</span>`
  elements.typeScaleTokens.innerHTML = TYPE_SCALE_TOKENS.map((token) => `<button type="button" data-type-token="${token}" class="${assembly.text.scaleToken === token ? 'is-active' : ''}">${token}</button>`).join('')
  elements.bodyColumns.value = String(assembly.text.columns)
  elements.columnGap.value = String(assembly.text.columnGap)
  elements.imageScale.value = String(assembly.image.scale)
  elements.sourceTreatment.value = slide.sourceTreatment ?? assembly.image.sourceTreatment ?? 'crop-provisional'
  elements.gradientPresets.innerHTML = Object.entries(gradientPresets).map(([key, preset]) => `<button type="button" data-gradient-preset="${escapeAttribute(key)}" class="${assembly.gradient.preset === key ? 'is-active' : ''}">${escapeHTML(preset.label)}</button>`).join('')
  elements.gradientFeather.value = String(assembly.gradient.feather)
  elements.gradientOpacity.value = String(assembly.gradient.opacity)
  elements.gradientEnabled.checked = Boolean(assembly.gradient.enabled)
  elements.designerNotes.value = assembly.designerNotes ?? ''
  elements.findMoreState.value = slide.findMoreMedia?.state ?? 'not-needed'
  elements.findMoreBrief.value = slide.findMoreMedia?.brief ?? ''
  const hasPrimary = getPrimaryAssets(slide).some((entry) => entry.asset)
  elements.demotePrimaryShortlist.disabled = !hasPrimary
  elements.demotePrimaryAlternate.disabled = !hasPrimary
}

function renderAssemblyTray() {
  const slide = getSlide()
  if (!slide) return
  const primary = getPrimaryAssets(slide)
  const alternates = getDecisionAssetEntries(slide, 'alternate')
  const shortlist = getDecisionAssetEntries(slide, 'shortlisted')
  const picks = mediaAssets.filter((asset) => state.projectAssetJudgments[asset.id]?.projectPick).slice(0, 24)
  elements.assemblyPrimaryTray.innerHTML = primary.length
    ? primary.map(({ slotKey, asset }) => asset
      ? trayCard(asset, { action: 'demote-shortlist', label: slotLabelForSlide(slotKey, slide), slotKey })
      : `<div class="empty-slot-card">${escapeHTML(slotLabelForSlide(slotKey, slide))}<br>Empty</div>`).join('')
    : '<div class="empty-slot-card">No media required</div>'
  elements.assemblyAlternateTray.innerHTML = alternates.length ? alternates.map(({ asset }) => trayCard(asset, { action: 'promote', label: 'Alternate' })).join('') : '<div class="empty-slot-card">No alternates</div>'
  elements.assemblyShortlistTray.innerHTML = shortlist.length ? shortlist.map(({ asset }) => trayCard(asset, { action: 'promote', label: 'Shortlist' })).join('') : '<div class="empty-slot-card">No shortlist</div>'
  elements.projectPicksTray.innerHTML = picks.length ? picks.map((asset) => trayCard(asset, { action: 'promote', label: 'Project Pick' })).join('') : '<div class="empty-slot-card">No Project Picks</div>'
}

function renderArtboard() {
  const slide = getSlide()
  const assembly = getAssembly(slide)
  if (!slide || !assembly) return
  state.assemble.panX ??= 0
  state.assemble.panY ??= 0
  const scaledWidth = state.project.canvas.width * state.artboardZoom
  const scaledHeight = state.project.canvas.height * state.artboardZoom
  elements.stagePan.style.width = `${scaledWidth}px`
  elements.stagePan.style.height = `${scaledHeight}px`
  elements.stagePan.style.left = `calc(50% + ${state.assemble.panX}px)`
  elements.stagePan.style.top = `calc(50% + ${state.assemble.panY}px)`
  elements.stagePan.style.transform = 'translate(-50%, -50%)'
  elements.artboard.style.transform = `scale(${state.artboardZoom})`
  elements.zoomLabel.textContent = `${Math.round(state.artboardZoom * 100)}%`
  elements.artboard.classList.toggle('clean-preview', state.assemble.cleanPreview)
  elements.textStack.classList.toggle('is-selected', state.assemble.selection === 'text')
  renderArtboardImages(slide, assembly)
  renderArtboardText(slide, assembly)
  renderArtboardGradient(assembly)
  renderPitchGrid()
  renderInteractionOverlay(assembly)
  renderSlideAnnotations(slide)
}

function renderArtboardImages(slide, assembly) {
  const primary = getPrimaryAssets(slide)
  const style = slide.visualStyle
  elements.imageLayer.innerHTML = ''
  elements.imageLayer.style.transform = `translate(${assembly.image.panX}px, ${assembly.image.panY}px) scale(${assembly.image.scale})`
  if (style === 'text-only' || primary.length === 0) {
    elements.imageLayer.style.background = '#111'
    return
  }
  elements.imageLayer.style.background = '#111'
  const columns = style === 'triptych' ? 3 : style === 'diptych' ? 2 : style === 'gallery' ? Math.min(4, Math.max(2, Math.ceil(Math.sqrt(primary.length)))) : 1
  elements.imageLayer.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
  elements.imageLayer.style.display = 'grid'
  primary.forEach(({ slotKey, asset }, index) => {
    const slot = document.createElement('div')
    slot.className = 'assembly-image-slot'
    slot.dataset.slotKey = slotKey
    slot.style.backgroundImage = assetBackground(asset)
    slot.innerHTML = asset ? `<span>${escapeHTML(slotLabelForSlide(slotKey, slide))}</span>` : `<span>${escapeHTML(slotLabelForSlide(slotKey, slide))} · Empty</span>`
    if ((style === 'full-bleed' || style === 'full-bleed-overlay' || style === 'image-text') && index > 0) slot.hidden = true
    elements.imageLayer.append(slot)
  })
}

function renderArtboardText(slide, assembly) {
  const text = assembly.text
  elements.textStack.hidden = slide.textPresence === 'no-on-slide-text'
  elements.textStack.style.left = `${text.x}px`
  elements.textStack.style.top = `${text.y}px`
  elements.textStack.style.width = `${text.width}px`
  elements.textStack.style.minHeight = `${text.height}px`
  const scale = typeScales[text.scaleToken] ?? typeScales.M
  const multiplier = Number(text.opticalMultiplier ?? 1)
  elements.textHeadline.style.fontSize = `${scale.headline * multiplier}px`
  elements.textSubheadline.style.fontSize = `${scale.subheadline * multiplier}px`
  elements.textBody.style.fontSize = `${scale.body * multiplier}px`
  elements.textBody.style.columnCount = String(text.columns)
  elements.textBody.style.columnGap = `${text.columnGap}px`
  const headline = copyFieldText(slide.copy?.headline)
  const subheadline = copyFieldText(slide.copy?.subheadline)
  const body = copyFieldText(slide.copy?.body)
  elements.textHeadline.hidden = !headline
  elements.textSubheadline.hidden = !subheadline
  elements.textBody.hidden = !body
  elements.textHeadline.innerHTML = renderInlineMarkdown(headline)
  elements.textSubheadline.innerHTML = renderInlineMarkdown(subheadline)
  elements.textBody.innerHTML = renderMarkdown(body)
}

function renderArtboardGradient(assembly) {
  const gradient = assembly.gradient
  if (!gradient.enabled) {
    elements.gradientLayer.innerHTML = ''
    return
  }
  const start = { x: gradient.start.x * 2576, y: gradient.start.y * 1080 }
  const end = { x: gradient.end.x * 2576, y: gradient.end.y * 1080 }
  const stops = gradientStopsForFeather({ opacity: gradient.opacity, feather: gradient.feather, reverse: gradient.reverse })
  if (gradient.type === 'radial') {
    const radius = Math.max(40, Math.hypot(end.x - start.x, end.y - start.y))
    elements.gradientLayer.innerHTML = `<defs><radialGradient id="active-gradient" gradientUnits="userSpaceOnUse" cx="${start.x}" cy="${start.y}" r="${radius}">${stops.map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="#000" stop-opacity="${stop.opacity}" />`).join('')}</radialGradient></defs><rect width="2576" height="1080" fill="url(#active-gradient)" />`
  } else {
    elements.gradientLayer.innerHTML = `<defs><linearGradient id="active-gradient" gradientUnits="userSpaceOnUse" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}">${stops.map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="#000" stop-opacity="${stop.opacity}" />`).join('')}</linearGradient></defs><rect width="2576" height="1080" fill="url(#active-gradient)" />`
  }
}

function renderPitchGrid() {
  elements.pitchGrid.hidden = !state.assemble.showGrid
  if (!state.assemble.showGrid) return
  elements.pitchGrid.innerHTML = pitchGrid.cells.map((cell) => `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="rgba(255,79,135,.10)" stroke="rgba(255,79,135,.38)" stroke-width="2" />`).join('')
}

function renderInteractionOverlay(assembly) {
  if (state.assemble.cleanPreview || state.assemble.tool !== 'gradient' || !assembly.gradient.enabled) {
    elements.interactionOverlay.innerHTML = ''
    return
  }
  const start = { x: assembly.gradient.start.x * 2576, y: assembly.gradient.start.y * 1080 }
  const end = { x: assembly.gradient.end.x * 2576, y: assembly.gradient.end.y * 1080 }
  elements.interactionOverlay.innerHTML = `<line class="gradient-line" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />
    <circle class="gradient-handle" data-gradient-handle="start" cx="${start.x}" cy="${start.y}" r="18" />
    <circle class="gradient-handle" data-gradient-handle="end" cx="${end.x}" cy="${end.y}" r="18" />`
}

function renderSlideAnnotations(slide) {
  const labels = []
  if (['full-bleed', 'full-bleed-overlay'].includes(slide.visualStyle)) labels.push('Full Bleed')
  if (slide.sourceTreatment && slide.sourceTreatment !== 'ready') labels.push(sourceTreatmentLabel(slide.sourceTreatment))
  if (slide.findMoreMedia?.state === 'needed') labels.push('Find More')
  if (slide.copyReviewState === 'changed-after-assembly') labels.push('Copy Changed')
  elements.slideAnnotations.innerHTML = labels.map((label) => `<span class="annotation-pill">${escapeHTML(label)}</span>`).join('')
}
