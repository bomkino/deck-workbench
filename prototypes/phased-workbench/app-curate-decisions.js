function renderMediaVirtualWindow() {
  if (state.phase !== 'curate') return
  const width = Math.max(1, elements.mediaScroll.clientWidth)
  const density = Number(state.curate.density)
  const gap = 12
  const columns = Math.max(1, Math.floor((width - gap) / (density + gap)))
  const cardWidth = (width - gap * (columns + 1)) / columns
  const cardHeight = Math.round(cardWidth * 0.72 + 48)
  const rowHeight = cardHeight + gap
  const rowCount = Math.ceil(virtualMedia.length / columns)
  const viewportHeight = elements.mediaScroll.clientHeight
  const scrollTop = elements.mediaScroll.scrollTop
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 3)
  const lastRow = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + 3)
  const startIndex = firstRow * columns
  const endIndex = Math.min(virtualMedia.length, lastRow * columns)
  const slide = getSlide()
  const decisions = getDecisions(slide?.id)
  elements.mediaCanvas.style.height = `${Math.max(viewportHeight, rowCount * rowHeight + gap)}px`
  elements.mediaCanvas.innerHTML = virtualMedia.slice(startIndex, endIndex).map((asset, localIndex) => {
    const index = startIndex + localIndex
    const row = Math.floor(index / columns)
    const column = index % columns
    const left = gap + column * (cardWidth + gap)
    const top = gap + row * rowHeight
    const decision = decisions[asset.id]
    const project = state.projectAssetJudgments[asset.id]
    const badges = []
    if (decision?.state === 'selected') badges.push(`Selected · ${slotLabelForSlide(decision.slotKey, slide)}`)
    if (decision?.state === 'alternate') badges.push('Alternate')
    if (decision?.state === 'shortlisted') badges.push('Shortlist')
    if (decision?.state === 'rejected-for-slide') badges.push('Rejected here')
    if (project?.projectPick) badges.push('Project Pick')
    if (project?.rating) badges.push(`${project.rating}★`)
    return `<button class="media-card ${state.curate.selectedAssetId === asset.id ? 'is-focused' : ''} ${decision?.state === 'selected' ? 'is-selected-for-slide' : ''}" data-asset-id="${escapeAttribute(asset.id)}" type="button" role="gridcell" aria-label="${escapeAttribute(asset.filename)}" style="left:${left}px;top:${top}px;width:${cardWidth}px;height:${cardHeight}px">
      <span class="media-card-image" style="background-image:${assetBackground(asset)}">
        ${asset.type !== 'image' ? `<span class="media-type-badge">${asset.type.toUpperCase()}</span>` : ''}
        <span class="media-state-badges">${badges.map((badge) => `<span>${escapeHTML(badge)}</span>`).join('')}</span>
      </span>
      <span class="media-card-copy"><strong>${escapeHTML(asset.filename)}</strong><small>${escapeHTML(asset.folder)} · ${asset.width}×${asset.height}</small></span>
    </button>`
  }).join('')
}

function renderCurateTray() {
  const slide = getSlide()
  if (!slide) return
  const slots = primarySlotKeys(slide)
  const primary = slots.map((slotKey) => ({ slotKey, asset: getSelectedAssetForSlot(slide, slotKey) }))
  const alternates = getDecisionAssetEntries(slide, 'alternate')
  const shortlist = getDecisionAssetEntries(slide, 'shortlisted')
  const filled = primary.filter((entry) => entry.asset).length
  elements.slotProgress.textContent = `${filled}/${slots.length}`
  elements.primaryTray.innerHTML = primary.length === 0
    ? '<div class="empty-slot-card">No media required</div>'
    : primary.map(({ slotKey, asset }) => asset
      ? trayCard(asset, { action: 'demote-shortlist', label: slotLabelForSlide(slotKey, slide), slotKey })
      : `<button class="empty-slot-card" data-empty-slot="${escapeAttribute(slotKey)}" type="button">${escapeHTML(slotLabelForSlide(slotKey, slide))}<br>Empty</button>`).join('')
  elements.alternateTray.innerHTML = alternates.length ? alternates.map(({ asset }) => trayCard(asset, { action: 'promote', label: 'Alternate' })).join('') : '<div class="empty-slot-card">No alternates</div>'
  elements.shortlistTray.innerHTML = shortlist.length ? shortlist.map(({ asset }) => trayCard(asset, { action: 'promote', label: 'Shortlist' })).join('') : '<div class="empty-slot-card">No shortlist</div>'
}

function handleTrayClick(event) {
  const card = event.target.closest('[data-asset-id]')
  const empty = event.target.closest('[data-empty-slot]')
  if (empty) {
    showToast(`Choose media, then assign to ${slotLabelForSlide(empty.dataset.emptySlot, getSlide())}`)
    return
  }
  if (!card) return
  state.curate.selectedAssetId = card.dataset.assetId
  const action = card.dataset.trayAction
  if (action === 'demote-shortlist') setSlideMediaDecision(card.dataset.assetId, 'demote-to-shortlist')
  else if (action === 'promote') setSlideMediaDecision(card.dataset.assetId, 'select')
  else openMediaPreview(card.dataset.assetId)
}

function setSlideMediaDecision(assetId, action, explicitSlotKey = null) {
  const slide = getSlide()
  if (!slide || !assetId) return
  const decisions = getDecisions(slide.id)
  let slotKey = explicitSlotKey
  if (action === 'select' && !slotKey) {
    slotKey = primarySlotKeys(slide).find((slot) => !Object.values(decisions).some((decision) => decision.state === 'selected' && decision.slotKey === slot))
      ?? primarySlotKeys(slide)[0]
    if (!slotKey) {
      showToast('This Slide has no primary media slots')
      return
    }
  }
  commit(`Media ${mediaActionLabel(action)}`, (draft) => {
    const draftDecisions = draft.slideMediaDecisions[slide.id] ??= {}
    if (action === 'select') {
      for (const [otherId, decision] of Object.entries(draftDecisions)) {
        if (decision.state === 'selected' && decision.slotKey === slotKey && otherId !== assetId) {
          draftDecisions[otherId] = { ...decision, state: 'shortlisted', slotKey: null }
        }
      }
    }
    draftDecisions[assetId] = {
      ...transitionMediaDecision(draftDecisions[assetId], action, slotKey),
      availability: getAsset(assetId)?.availability ?? 'unknown',
    }
  }, { preserveMediaScroll: true })
  if (elements.mediaPreview.open) renderMediaPreview()
}

function toggleProjectPick(assetId) {
  commit('Project Pick changed', (draft) => {
    const judgment = draft.projectAssetJudgments[assetId] ??= { rating: 0, review: 'unreviewed', projectPick: false }
    judgment.projectPick = !judgment.projectPick
  }, { preserveMediaScroll: true })
}

function selectSlide(slideId) {
  if (!getSlide(slideId)) return
  state.selectedSlideId = slideId
  state.curate.selectedAssetId = null
  saveState()
}

function selectNextMediaIssue() {
  const included = state.slides.filter((slide) => slide.lifecycle === 'included')
  const start = Math.max(0, included.findIndex((slide) => slide.id === state.selectedSlideId))
  const ordered = [...included.slice(start + 1), ...included.slice(0, start + 1)]
  const next = ordered.find((slide) => slideReadiness(slide, getDecisions(slide.id)).curate !== 'ready' || slide.findMoreMedia?.state === 'needed')
  if (!next) {
    showToast('No unresolved media Slides')
    return
  }
  selectSlide(next.id)
  renderCurate({ preserveMediaScroll: true })
}
