function bindVisualEvents() {
  elements.assetLabel.addEventListener('input', () => {
    elements.addAssetReference.disabled = !projection || elements.assetLabel.value.trim().length === 0
  })
  elements.addAssetReference.addEventListener('click', addNeutralAssetReference)
  elements.assignPrimaryAsset.addEventListener('click', assignPrimaryAsset)
  elements.assetCatalog.addEventListener('click', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (!card) return
    elements.assetReference.value = card.dataset.assetId
    elements.assignPrimaryAsset.disabled = false
    renderAssetCatalog(assetCatalog)
  })
  elements.patternChoice.addEventListener('change', () => {
    if (projection) syncVisualControls(projection)
  })
  elements.applyPattern.addEventListener('click', applySelectedPattern)
  elements.visualElement.addEventListener('change', () => {
    if (projection) syncVisualControls(projection)
  })
  elements.alignActions.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => alignSelectedElement(button.dataset.align))
  })
  elements.applyCrop.addEventListener('click', applySelectedCrop)
  elements.artboardZoom.addEventListener('input', () => setArtboardZoom(Number(elements.artboardZoom.value)))
  elements.fitArtboard.addEventListener('click', () => setArtboardZoom(fittedArtboardZoom()))
}

async function refreshAssetCatalog() {
  if (!projection) {
    assetCatalog = []
    return
  }
  try {
    const result = await window.deckBridge.query({ name: 'asset.catalog', params: {} })
    assetCatalog = result.assets ?? []
  } catch {
    assetCatalog = []
  }
}

function renderCurate() {
  const record = selectedPlanRecord()
  if (!record || !projection) {
    elements.curateSlideTitle.textContent = 'No Slide selected'
    elements.curateSlidePurpose.textContent = 'Create or open a Deck.'
    elements.curateCopyPreview.replaceChildren()
    elements.assetLabel.disabled = true
    elements.addAssetReference.disabled = true
    elements.assetReference.disabled = true
    elements.assignPrimaryAsset.disabled = true
    elements.assetCatalog.innerHTML = '<div class="empty-workspace"><strong>No Asset catalogue.</strong><p>Create or open a Deck.</p></div>'
    return
  }
  elements.curateSlideTitle.textContent = record.metadata.internalTitle
  elements.curateSlidePurpose.textContent = record.metadata.purpose || 'Purpose not written.'
  const copy = [
    record.headline?.plainText ? `<strong>${escapeHTML(record.headline.plainText)}</strong>` : '',
    record.subheadline?.plainText ? `<p>${escapeHTML(record.subheadline.plainText)}</p>` : '',
    record.body?.plainText ? `<p>${escapeHTML(record.body.plainText)}</p>` : '',
  ].filter(Boolean)
  elements.curateCopyPreview.innerHTML = record.metadata.textPresence === 'no-on-slide-text'
    ? '<p>No on-Slide text — intentional.</p>'
    : copy.join('') || '<p>Copy remains unreviewed.</p>'
  elements.assetLabel.disabled = false
  elements.addAssetReference.disabled = elements.assetLabel.value.trim().length === 0
  renderAssetCatalog(assetCatalog)
}

function renderAssetCatalog(assets) {
  const assignedAssetId = projection?.mediaAssignments?.find((assignment) => assignment.role === 'primary')?.assetReference?.id
  const priorSelection = elements.assetReference.value
  elements.assetReference.replaceChildren()
  for (const asset of assets) {
    const option = document.createElement('option')
    option.value = asset.id
    option.textContent = `${asset.label} · ${asset.mediaKind}`
    elements.assetReference.append(option)
  }
  const requestedSelection = assignedAssetId ?? priorSelection
  if ([...elements.assetReference.options].some((option) => option.value === requestedSelection)) {
    elements.assetReference.value = requestedSelection
  }
  const hasAssets = Boolean(projection) && elements.assetReference.options.length > 0
  elements.assetReference.disabled = !hasAssets
  elements.assignPrimaryAsset.disabled = !hasAssets
  elements.assetCatalog.innerHTML = assets.length
    ? assets.map((asset) => `<button class="asset-card ${assignedAssetId === asset.id ? 'is-assigned' : ''}" data-asset-id="${escapeAttribute(asset.id)}" type="button">
        <strong>${escapeHTML(asset.label)}</strong>
        <small>${escapeHTML(asset.mediaKind)} · ${escapeHTML(asset.availability)}</small>
      </button>`).join('')
    : '<div class="empty-workspace"><strong>No Asset references.</strong><p>Add a neutral reference now. Real media discovery arrives with the shared media-core gate.</p></div>'
}

async function addNeutralAssetReference() {
  if (!projection) return
  const label = elements.assetLabel.value.trim()
  if (!label) return
  const result = await executeStructural('asset.reference.add', {
    assetReferenceId: crypto.randomUUID(),
    label,
    mediaKind: 'image',
  }, projection.slide.id, { sourceLabel: 'Add neutral Asset Reference' })
  if (result) {
    elements.assetLabel.value = ''
    elements.addAssetReference.disabled = true
  }
}

async function assignPrimaryAsset() {
  if (!projection) return
  const payload = assetAssignmentPlan(projection, elements.assetReference.value, crypto.randomUUID())
  if (!payload) return
  await executeStructural('asset.assign', payload, projection.slide.id, { sourceLabel: 'Assign Primary Asset' })
}

function renderAssemble() {
  if (!projection) {
    elements.artboardHeadline.textContent = 'No Deck open'
    elements.artboardIntent.textContent = '—'
    elements.compositionLayer.replaceChildren()
    elements.semanticFallback.hidden = false
    syncVisualControls(null)
    applyScales()
    return
  }
  elements.artboardHeadline.textContent = projection.headline.plainText
  elements.artboardIntent.textContent = visualStyleLabel(visualStyleFromIntent(projection.slide.intent))
  renderComposition(projection)
  syncVisualControls(projection)
  applyScales()
}

function compositionElementLabel(element) {
  return element.patternElementKey
    ? `${element.patternElementKey} · ${element.kind}`
    : `${element.kind} · ${element.id.slice(0, 8)}`
}

function renderComposition(next) {
  elements.compositionLayer.replaceChildren()
  const composition = next.composition
  elements.semanticFallback.hidden = Boolean(composition)
  if (!composition) return
  composition.elements.forEach((element, index) => {
    const node = document.createElement('div')
    node.className = `composition-element composition-${element.kind === 'image' ? 'image-placeholder' : element.kind}`
    node.dataset.elementId = element.id
    node.style.left = `${(element.frame.x / next.canvas.width) * 100}%`
    node.style.top = `${(element.frame.y / next.canvas.height) * 100}%`
    node.style.width = `${(element.frame.width / next.canvas.width) * 100}%`
    node.style.height = `${(element.frame.height / next.canvas.height) * 100}%`
    node.style.zIndex = String(index + 1)
    if (element.kind === 'text') {
      const content = next.contentBlocks.find((block) => block.id === element.contentBlockId)
      node.textContent = content?.plainText ?? `Missing Content Block · ${element.contentBlockId ?? 'unbound'}`
      node.setAttribute('aria-label', `${compositionElementLabel(element)} from canonical Story`)
    } else if (element.kind === 'image') {
      const assignment = next.mediaAssignments?.find((candidate) => candidate.role === element.mediaRole)
      const assetLabel = assignment?.assetReference?.label ?? 'unassigned Asset'
      const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
      node.textContent = `${element.mediaRole ?? 'Image'} · ${assetLabel}\nCrop ${Math.round(crop.x * 100)}%, ${Math.round(crop.y * 100)}% · ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`
      node.setAttribute('aria-label', `${element.mediaRole ?? 'Image'} placeholder: ${assetLabel}`)
    } else {
      node.textContent = compositionElementLabel(element)
      node.setAttribute('aria-label', compositionElementLabel(element))
    }
    elements.compositionLayer.append(node)
  })
}

function syncVisualControls(next) {
  const enabled = Boolean(next)
  elements.patternChoice.disabled = !enabled
  const previousBodyId = elements.patternBodyBlock.value
  elements.patternBodyBlock.replaceChildren()
  for (const block of next?.contentBlocks?.filter((candidate) => candidate.role === 'body') ?? []) {
    const option = document.createElement('option')
    option.value = block.id
    option.textContent = block.semanticKey
    elements.patternBodyBlock.append(option)
  }
  if ([...elements.patternBodyBlock.options].some((option) => option.value === previousBodyId)) {
    elements.patternBodyBlock.value = previousBodyId
  }
  const needsBody = elements.patternChoice.value === 'editorial-body'
  elements.patternBodyBlock.disabled = !enabled || !needsBody || elements.patternBodyBlock.options.length === 0
  elements.applyPattern.disabled = !enabled || (needsBody && elements.patternBodyBlock.options.length === 0)

  const previousElementId = elements.visualElement.value
  elements.visualElement.replaceChildren()
  for (const element of next?.composition?.elements ?? []) {
    const option = document.createElement('option')
    option.value = element.id
    option.textContent = compositionElementLabel(element)
    elements.visualElement.append(option)
  }
  if ([...elements.visualElement.options].some((option) => option.value === previousElementId)) {
    elements.visualElement.value = previousElementId
  }
  const selected = next?.composition?.elements.find((element) => element.id === elements.visualElement.value)
  elements.visualElement.disabled = !selected
  elements.alignActions.querySelectorAll('button').forEach((button) => { button.disabled = !selected })
  const assignment = selected?.mediaRole
    ? next?.mediaAssignments?.find((candidate) => candidate.role === selected.mediaRole)
    : null
  const canCrop = selected?.kind === 'image' && Boolean(assignment)
  elements.cropControls.disabled = !canCrop
  const crop = selected?.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  elements.cropX.value = String(crop.x)
  elements.cropY.value = String(crop.y)
  elements.cropWidth.value = String(crop.width)
  elements.cropHeight.value = String(crop.height)
}

async function applySelectedPattern() {
  if (!projection) return
  const payload = patternApplyPlan(
    projection,
    elements.patternChoice.value,
    crypto.randomUUID(),
    elements.patternBodyBlock.value || null,
  )
  if (!payload) {
    setStatus('InvalidCommand: Select the canonical Body Content Block for Editorial Body')
    return
  }
  await executeStructural('designOption.applyPattern', payload, projection.slide.id, { sourceLabel: 'Apply authored Pattern' })
}

async function alignSelectedElement(alignment) {
  if (!projection) return
  const payload = elementAlignPlan(projection, elements.visualElement.value, alignment)
  if (!payload) return
  await executeStructural('element.frame.update', payload, projection.slide.id, { sourceLabel: `Align Element ${alignment}` })
}

async function applySelectedCrop() {
  if (!projection) return
  const payload = imageCropPlan(projection, elements.visualElement.value, {
    x: elements.cropX.value,
    y: elements.cropY.value,
    width: elements.cropWidth.value,
    height: elements.cropHeight.value,
  })
  if (!payload) {
    setStatus('InvalidCommand: Crop must stay inside normalised source bounds')
    return
  }
  await executeStructural('element.crop.update', payload, projection.slide.id, { sourceLabel: 'Adjust Image crop' })
}

function applyScales() {
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const transforms = workspaceTransforms({ interfaceScale, artboardZoom, canvas })
  document.documentElement.style.setProperty('--interface-scale', String(transforms.interfaceScale))
  document.documentElement.style.setProperty('--artboard-zoom', String(artboardZoom))
  elements.artboardShell.style.width = `${transforms.artboardViewport.width}px`
  elements.artboardShell.style.height = `${transforms.artboardViewport.height}px`
  document.documentElement.dataset.workspaceLayout = workspaceLayoutMode({ viewportWidth: window.innerWidth, interfaceScale })
  elements.interfaceScale.value = String(interfaceScale)
  elements.artboardZoom.value = String(artboardZoom)
  elements.zoomLabel.textContent = `${Math.round(artboardZoom * 100)}%`
}

async function setArtboardZoom(requested) {
  try {
    const result = await window.deckBridge.setArtboardZoom({ value: requested })
    artboardZoom = result.artboardZoom
    applyScales()
  } catch (error) {
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
  }
}

function fittedArtboardZoom() {
  const style = getComputedStyle(elements.stageScroll)
  const availableWidth = elements.stageScroll.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  const availableHeight = elements.stageScroll.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const baseHeight = ARTBOARD_BASE_WIDTH * canvas.height / canvas.width
  const raw = Math.min(availableWidth / ARTBOARD_BASE_WIDTH, availableHeight / baseHeight)
  const step = Number(elements.artboardZoom.step)
  const minimum = Number(elements.artboardZoom.min)
  const maximum = Number(elements.artboardZoom.max)
  return Math.min(maximum, Math.max(minimum, Math.floor(raw / step) * step))
}
