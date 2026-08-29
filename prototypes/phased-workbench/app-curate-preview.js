function openMediaPreview(assetId) {
  state.curate.selectedAssetId = assetId
  saveState()
  renderMediaPreview()
  elements.mediaPreview.showModal()
}

function renderMediaPreview() {
  const asset = getAsset(state.curate.selectedAssetId)
  const slide = getSlide()
  if (!asset || !slide) return
  const decision = getDecisions(slide.id)[asset.id]
  const judgment = state.projectAssetJudgments[asset.id] ?? { rating: 0, review: 'unreviewed', projectPick: false }
  elements.previewMediaTitle.textContent = asset.filename
  elements.previewMediaImage.style.backgroundImage = assetBackground(asset)
  elements.previewMediaActions.innerHTML = `
    <p class="panel-label">Slide ${String(pageNumberForSlide(slide.id)).padStart(2, '0')}</p>
    <h3>${escapeHTML(slide.internalTitle)}</h3>
    <p>${escapeHTML(slide.purpose)}</p>
    <hr>
    <strong>${escapeHTML(asset.folder)} · ${asset.type.toUpperCase()}</strong>
    <span>${asset.width} × ${asset.height}</span>
    <span>Current Slide state: ${escapeHTML(decision?.state ?? 'Unreviewed')}</span>
    <span>Project rating: ${judgment.rating || '—'}</span>
    <button data-preview-action="select" type="button">Assign to next open slot</button>
    <button data-preview-action="alternate" type="button">Add as alternate</button>
    <button data-preview-action="shortlist" type="button">Shortlist for this Slide</button>
    <button data-preview-action="reject" type="button">Reject for this Slide</button>
    <button data-preview-action="project-pick" type="button">${judgment.projectPick ? 'Remove Project Pick' : 'Mark Project Pick'}</button>
    <div class="two-button-row"><button data-preview-action="previous" type="button">Previous</button><button data-preview-action="next" type="button">Next</button></div>
  `
}

function navigatePreview(direction) {
  const list = virtualMedia.length ? virtualMedia : filteredMediaAssets()
  const index = list.findIndex((asset) => asset.id === state.curate.selectedAssetId)
  const next = list[Math.max(0, Math.min(list.length - 1, index + direction))]
  if (!next) return
  state.curate.selectedAssetId = next.id
  saveState()
  renderMediaPreview()
}

function openContextMenu(clientX, clientY) {
  const width = 240
  const height = 330
  elements.contextMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - width - 8))}px`
  elements.contextMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - height - 8))}px`
  elements.contextMenu.classList.add('is-open')
  elements.contextMenu.setAttribute('aria-hidden', 'false')
}

function closeContextMenu() {
  elements.contextMenu.classList.remove('is-open')
  elements.contextMenu.setAttribute('aria-hidden', 'true')
}

function handleCurateKeyboard(event) {
  if (elements.mediaPreview.open) {
    if (event.key === 'ArrowRight') { event.preventDefault(); navigatePreview(1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigatePreview(-1) }
    if (event.key.toLowerCase() === 's') setSlideMediaDecision(state.curate.selectedAssetId, 'shortlist')
    if (event.key.toLowerCase() === 'm') setSlideMediaDecision(state.curate.selectedAssetId, 'select')
    if (event.key.toLowerCase() === 'a') setSlideMediaDecision(state.curate.selectedAssetId, 'alternate')
    if (event.key.toLowerCase() === 'x') setSlideMediaDecision(state.curate.selectedAssetId, 'reject')
    return
  }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); selectNextMediaIssue(); return }
  if (event.key === ' ' && state.curate.selectedAssetId) { event.preventDefault(); openMediaPreview(state.curate.selectedAssetId); return }
  if (event.key.toLowerCase() === 's' && state.curate.selectedAssetId) setSlideMediaDecision(state.curate.selectedAssetId, 'shortlist')
  if (event.key.toLowerCase() === 'm' && state.curate.selectedAssetId) setSlideMediaDecision(state.curate.selectedAssetId, 'select')
  if (event.key.toLowerCase() === 'a' && state.curate.selectedAssetId) setSlideMediaDecision(state.curate.selectedAssetId, 'alternate')
  if (event.key.toLowerCase() === 'x' && state.curate.selectedAssetId) setSlideMediaDecision(state.curate.selectedAssetId, 'reject')
  if (/^[0-5]$/.test(event.key) && state.curate.selectedAssetId) {
    const rating = Number(event.key)
    commit(`Project rating ${rating}`, (draft) => {
      const judgment = draft.projectAssetJudgments[state.curate.selectedAssetId] ??= { rating: 0, review: 'unreviewed', projectPick: false }
      judgment.rating = rating
    }, { preserveMediaScroll: true })
  }
}

/* Assemble */
