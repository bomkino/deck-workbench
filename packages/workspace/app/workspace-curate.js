const CURATE_MEDIA_PAGE_SIZE = 250
const CURATE_MEDIA_GAP = 12
const CURATE_MEDIA_OVERSCAN_ROWS = 2
const CURATE_COMPARE_LIMIT = 4

function calculateCurateVirtualWindow({ total, scrollTop, viewportHeight, rowHeight, columns, overscanRows = 2 }) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0))
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1))
  const safeRowHeight = Math.max(1, Number(rowHeight) || 1)
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0)
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0)
  const safeOverscan = Math.max(0, Math.floor(Number(overscanRows) || 0))
  const rowCount = Math.ceil(safeTotal / safeColumns)
  const startRow = Math.max(0, Math.floor(safeScrollTop / safeRowHeight) - safeOverscan)
  const endRow = Math.min(
    rowCount,
    Math.ceil((safeScrollTop + safeViewportHeight) / safeRowHeight) + safeOverscan,
  )
  return Object.freeze({
    rowCount,
    startRow,
    endRow,
    startIndex: Math.min(safeTotal, startRow * safeColumns),
    endIndex: Math.min(safeTotal, endRow * safeColumns),
  })
}

function curateDomToken(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '-')
}

function curateMediaCardId(assetId) {
  return `curate-media-${curateDomToken(assetId)}`
}

function normalizeCurateRoot(root) {
  const rawAvailability = root?.availability ?? root?.state ?? 'error'
  const availability = rawAvailability === 'offline_volume' ? 'offline' : rawAvailability
  return Object.freeze({
    id: String(root?.id ?? ''),
    label: String(root?.label ?? root?.displayName ?? 'Untitled Root'),
    availability,
    assetCount: Number(root?.assetCount ?? 0),
    missingCount: Number(root?.missingCount ?? 0),
    lastScanAt: root?.lastScanAt ?? null,
  })
}

function normalizeCurateAsset(asset) {
  const filename = String(asset?.filename ?? asset?.label ?? asset?.title ?? asset?.id ?? 'Untitled Asset')
  const folder = String(asset?.folder ?? '')
  const displayPath = String(
    asset?.displayPath
      ?? asset?.relativeDisplayPath
      ?? [folder, filename].filter(Boolean).join('/'),
  )
  const rawAvailability = String(asset?.availability ?? 'missing')
  const availability = rawAvailability === 'offline_volume' ? 'offline' : rawAvailability
  return Object.freeze({
    id: String(asset?.id ?? ''),
    rootId: String(asset?.rootId ?? ''),
    label: String(asset?.title || filename),
    filename,
    folder,
    displayPath,
    note: String(asset?.note ?? ''),
    mediaKind: ['image', 'gif', 'video'].includes(asset?.mediaKind) ? asset.mediaKind : 'image',
    width: Number.isFinite(asset?.width) ? Number(asset.width) : null,
    height: Number.isFinite(asset?.height) ? Number(asset.height) : null,
    byteSize: Number.isFinite(asset?.byteSize ?? asset?.byteLength)
      ? Number(asset.byteSize ?? asset.byteLength)
      : null,
    availability,
    previewCapability: asset?.previewCapability === 'grid' ? 'grid' : 'catalog_only',
    renditions: Object.freeze({ gridStandard: asset?.renditions?.gridStandard ?? null }),
  })
}

let curateSlideProjection = null
let curateQueueProjection = []
let curateRoots = []
let curateCatalogRevision = null
let curateAvailabilityRevision = null
let curateSnapshotErrors = []
let curateAssets = []
let curateMediaTotal = 0
let curateMediaNextOffset = null
let curateMediaLoading = false
let curateMediaLoadGeneration = 0
let curateMediaInitialAttemptGeneration = -1
let curateMediaError = ''
let curateFocusedMediaId = null
let curateQueueFilter = 'all'
let curateTargetSlotKey = null
let curateCompareIds = []
let curateFindMoreDirty = false
let curateFindMoreSlideId = null
let curateVirtualFrame = 0
let curateResizeObserver = null
let curateSearchTimer = 0
let curateAssetStateSlideId = null
let curateAssetStateRevision = null
let curateAssetStateGeneration = 0
let curateAssetStates = new Map()
let curateQueueUnplacedRevision = null
let curateQueueUnplacedCounts = new Map()
let curateDocumentDeckId = null
let curateRenderedWindowKey = ''
const curateLastFocusBySlide = new Map()

function defaultCurateJudgment() {
  return { rating: 0, review: 'unreviewed', projectPick: false }
}

function emptyCurateSlideProjection(slideId = selectedSlideId) {
  return {
    revision: projection?.revision ?? 0,
    slide: slideId ? { id: slideId, intent: projection?.slide?.intent ?? 'undecided' } : null,
    slots: [],
    decisions: [],
    findMoreMedia: { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' },
    needsReconciliation: false,
  }
}

function curateNamedError(name, message) {
  return Object.assign(new Error(message), { name })
}

async function queryCurateAssetStateMap(slideId, assetReferenceIds, expectedRevision = null) {
  const ids = [...new Set(assetReferenceIds.filter(Boolean))]
  const chunks = []
  for (let index = 0; index < ids.length; index += 500) chunks.push(ids.slice(index, index + 500))
  const results = await Promise.all(chunks.map((assetIds) => window.deckBridge.query({
    name: 'curate.assetStates',
    params: { slideId, assetReferenceIds: assetIds },
  })))
  const states = new Map()
  let revision = expectedRevision
  for (const result of results) {
    if (revision === null) revision = result?.revision ?? null
    if (revision !== null && result?.revision !== revision) {
      throw curateNamedError('CurateSnapshotChanged', 'Curate Asset states changed while the snapshot was loading')
    }
    for (const state of result?.assets ?? []) states.set(state.assetReferenceId, state)
  }
  return { revision, states }
}

async function prepareCurateAssetStateSnapshot(slideId, expectedRevision) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mediaGeneration = curateMediaLoadGeneration
    const assetIds = curateAssets.map((asset) => asset.id)
    const hydrated = await queryCurateAssetStateMap(slideId, assetIds, expectedRevision)
    if (mediaGeneration !== curateMediaLoadGeneration) continue
    const missingIds = curateAssets.map((asset) => asset.id).filter((assetId) => !hydrated.states.has(assetId))
    if (missingIds.length) {
      const appended = await queryCurateAssetStateMap(slideId, missingIds, expectedRevision)
      if (mediaGeneration !== curateMediaLoadGeneration) continue
      for (const [assetId, state] of appended.states) hydrated.states.set(assetId, state)
    }
    return { ...hydrated, mediaGeneration }
  }
  throw curateNamedError('CurateMediaGenerationChanged', 'Media changed while Curate decisions were loading')
}

async function prepareCurateUnplacedCounts(queueResult, selectedSlide) {
  const items = Array.isArray(queueResult?.slides) ? queueResult.slides : []
  if (
    curateQueueUnplacedRevision === queueResult?.revision
    && items.every((item) => curateQueueUnplacedCounts.has(item.slideId))
  ) {
    return { counts: new Map(curateQueueUnplacedCounts), errors: [] }
  }
  const counts = new Map()
  for (const item of items) {
    if (Number.isSafeInteger(item.unplacedCount)) {
      counts.set(item.slideId, item.unplacedCount)
    } else if (typeof item.hasUnplaced === 'boolean') {
      counts.set(item.slideId, item.hasUnplaced ? 1 : 0)
    } else if (selectedSlide?.slide?.id === item.slideId) {
      counts.set(item.slideId, (selectedSlide.decisions ?? []).filter((entry) => normalizedSlideDecision(entry)?.state === 'unplaced').length)
    } else {
      counts.set(item.slideId, null)
    }
  }
  return { counts, errors: [] }
}

async function queryCurateRootSnapshot() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let offset = 0
    let catalogRevision = null
    let availabilityRevision = null
    const roots = []
    try {
      while (offset !== null) {
        const params = { offset, limit: 250 }
        if (offset > 0) {
          params.expectedCatalogRevision = catalogRevision
          params.expectedAvailabilityRevision = availabilityRevision
        }
        const page = await window.deckBridge.query({ name: 'media.roots', params })
        const pageCatalogRevision = page?.catalogRevision ?? null
        const pageAvailabilityRevision = page?.availabilityRevision ?? null
        if (offset === 0) {
          catalogRevision = pageCatalogRevision
          availabilityRevision = pageAvailabilityRevision
        } else if (
          pageCatalogRevision !== catalogRevision
          || pageAvailabilityRevision !== availabilityRevision
        ) {
          throw curateNamedError('QuerySnapshotChanged', 'Media Roots changed while the snapshot was loading')
        }
        const items = Array.isArray(page?.items) ? page.items : Array.isArray(page?.roots) ? page.roots : []
        roots.push(...items)
        const nextOffset = Number.isSafeInteger(page?.nextOffset) ? page.nextOffset : null
        if (nextOffset !== null && nextOffset <= offset) {
          throw curateNamedError('InvalidMediaPage', 'Media Roots returned a non-advancing page')
        }
        offset = nextOffset
      }
      return { catalogRevision, availabilityRevision, roots }
    } catch (error) {
      if (error?.name === 'QuerySnapshotChanged' && attempt === 0) continue
      throw error
    }
  }
  throw curateNamedError('QuerySnapshotChanged', 'Media Roots kept changing while the snapshot was loading')
}

async function prepareCuratePhaseSnapshot(slideId) {
  const requests = [
    window.deckBridge.query({ name: 'curate.queue', params: {} }),
    queryCurateRootSnapshot(),
  ]
  if (slideId) requests.unshift(window.deckBridge.query({ name: 'curate.slide', params: { slideId } }))
  const results = await Promise.allSettled(requests)
  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message ?? String(result.reason ?? 'Curate query failed'))
  let resultIndex = 0
  const slideResult = slideId ? results[resultIndex++] : null
  if (slideResult?.status === 'rejected') throw slideResult.reason
  const slide = slideResult?.value ?? emptyCurateSlideProjection(null)
  const queueSettled = results[resultIndex++]
  const rootSettled = results[resultIndex]
  if (rootSettled.status === 'rejected' && rootSettled.reason?.name === 'QuerySnapshotChanged') {
    throw rootSettled.reason
  }
  const queueResult = queueSettled.status === 'fulfilled' ? queueSettled.value : { slides: [] }
  const rootResult = rootSettled.status === 'fulfilled' ? rootSettled.value : { roots: [] }
  const hydrated = slideId
    ? await prepareCurateAssetStateSnapshot(slideId, slide?.revision ?? null)
    : { revision: null, states: new Map(), mediaGeneration: curateMediaLoadGeneration }
  const unplaced = await prepareCurateUnplacedCounts(queueResult, slide)
  return Object.freeze({
    slide,
    queue: Array.isArray(queueResult?.slides) ? queueResult.slides : [],
    queueRevision: queueResult?.revision ?? slide?.revision ?? null,
    unplacedCounts: unplaced.counts,
    roots: Array.isArray(rootResult?.roots) ? rootResult.roots.map(normalizeCurateRoot).filter((root) => root.id) : [],
    catalogRevision: rootResult?.catalogRevision ?? null,
    availabilityRevision: rootResult?.availabilityRevision ?? null,
    assetStates: hydrated.states,
    assetStateRevision: hydrated.revision,
    assetStateMediaGeneration: hydrated.mediaGeneration,
    errors: [...errors, ...unplaced.errors],
  })
}

function commitCuratePhaseSnapshot(snapshot) {
  if (
    snapshot?.assetStateMediaGeneration !== undefined
    && snapshot.assetStateMediaGeneration !== curateMediaLoadGeneration
  ) {
    throw curateNamedError('CurateMediaGenerationChanged', 'Media changed before the Curate snapshot could be published')
  }
  const priorSlideId = curateSlideProjection?.slide?.id ?? null
  const priorCatalogRevision = curateCatalogRevision
  const priorAvailabilityRevision = curateAvailabilityRevision
  curateSlideProjection = snapshot?.slide ?? emptyCurateSlideProjection()
  curateQueueProjection = snapshot?.queue ?? []
  curateQueueUnplacedRevision = snapshot?.queueRevision ?? null
  curateQueueUnplacedCounts = new Map(snapshot?.unplacedCounts ?? [])
  curateRoots = snapshot?.roots ?? []
  curateCatalogRevision = snapshot?.catalogRevision ?? null
  curateAvailabilityRevision = snapshot?.availabilityRevision ?? null
  curateSnapshotErrors = snapshot?.errors ?? []

  const nextSlideId = curateSlideProjection?.slide?.id ?? null
  curateAssetStateGeneration += 1
  curateAssetStates = new Map(snapshot?.assetStates ?? [])
  curateAssetStateSlideId = nextSlideId
  curateAssetStateRevision = snapshot?.assetStateRevision ?? curateSlideProjection?.revision ?? null
  curateDocumentDeckId = projection?.deckId ?? curateDocumentDeckId
  if (priorSlideId !== nextSlideId) {
    curateFocusedMediaId = curateLastFocusBySlide.get(nextSlideId) ?? curateFocusedMediaId
    curateTargetSlotKey = null
    curateFindMoreDirty = false
    curateFindMoreSlideId = null
  }
  if (
    (priorCatalogRevision !== null && curateCatalogRevision !== priorCatalogRevision)
    || (priorAvailabilityRevision !== null && curateAvailabilityRevision !== priorAvailabilityRevision)
  ) {
    resetCurateMediaCatalog('Media sources changed. Reloading…')
  }
}

function clearCurateState() {
  clearTimeout(curateSearchTimer)
  curateSearchTimer = 0
  curateMediaLoadGeneration += 1
  curateMediaInitialAttemptGeneration = -1
  curateAssetStateGeneration += 1
  curateMediaLoading = false
  if (curateVirtualFrame) cancelAnimationFrame(curateVirtualFrame)
  curateVirtualFrame = 0
  curateSlideProjection = null
  curateQueueProjection = []
  curateRoots = []
  curateCatalogRevision = null
  curateAvailabilityRevision = null
  curateSnapshotErrors = []
  curateAssets = []
  curateMediaTotal = 0
  curateMediaNextOffset = null
  curateMediaError = ''
  curateFocusedMediaId = null
  curateTargetSlotKey = null
  curateCompareIds = []
  curateAssetStates = new Map()
  curateAssetStateSlideId = null
  curateAssetStateRevision = null
  curateQueueUnplacedRevision = null
  curateQueueUnplacedCounts = new Map()
  curateDocumentDeckId = null
  curateRenderedWindowKey = ''
  closeCurateOverlays()
}

function resetCurateMediaCatalog(message = '') {
  curateMediaLoadGeneration += 1
  curateMediaInitialAttemptGeneration = -1
  curateAssetStateGeneration += 1
  curateAssets = []
  curateMediaTotal = 0
  curateMediaNextOffset = 0
  curateMediaLoading = false
  curateMediaError = message
  curateFocusedMediaId = null
  curateCompareIds = []
  curateAssetStates = new Map()
  curateRenderedWindowKey = ''
  elements.mediaScroll.scrollTop = 0
  return curateMediaLoadGeneration
}

function selectedCurateRoot() {
  const rootId = elements.mediaRootFilter.value
  return curateRoots.find((root) => root.id === rootId) ?? null
}

function curateRenditionUrl(asset) {
  const candidate = asset?.renditions?.gridStandard
  return asset?.previewCapability === 'grid'
    && typeof candidate === 'string'
    && candidate.startsWith('pitchdog-asset:')
    ? candidate
    : null
}

function neutralAssetReferenceSnapshot(asset) {
  const availability = asset.availability === 'available'
    ? 'available'
    : ['missing', 'offline'].includes(asset.availability)
      ? 'missing'
      : 'unknown'
  return {
    id: asset.id,
    label: asset.label,
    mediaKind: asset.mediaKind,
    availability,
  }
}

function curateAssetById(assetId) {
  return curateAssets.find((asset) => asset.id === assetId) ?? null
}

function normalizedSlideDecision(entry) {
  if (!entry) return null
  if (entry.slideDecision) return entry.slideDecision
  if (entry.disposition) return entry.disposition
  if (typeof entry.state === 'string') {
    const { assetReferenceId: _assetReferenceId, ...decision } = entry
    return decision
  }
  return null
}

function curateDecisionForAsset(assetId) {
  const cached = curateAssetStates.get(assetId)?.slideDecision
  if (cached) return cached
  const entry = curateSlideProjection?.decisions?.find((decision) => decision.assetReferenceId === assetId)
  return normalizedSlideDecision(entry)
}

function curateJudgmentForAsset(assetId) {
  return curateAssetStates.get(assetId)?.projectJudgment ?? defaultCurateJudgment()
}

function curateAttachedReference(assetId) {
  const cached = curateAssetStates.get(assetId)?.assetReference
  if (cached) return cached
  for (const slot of curateSlideProjection?.slots ?? []) {
    if (slot.selected?.assetReferenceId === assetId && slot.selected.assetReference) return slot.selected.assetReference
  }
  return null
}

function selectedCurateAsset() {
  return curateAssetById(curateFocusedMediaId)
}

function curateFocusedAssetId() {
  return curateFocusedMediaId
}

function filteredCurateAssets() {
  const type = elements.mediaTypeFilter.value
  const availability = elements.mediaAvailabilityFilter.value
  const decisionFilter = elements.mediaDecisionFilter.value
  return curateAssets.filter((asset) => {
    if (type !== 'all' && asset.mediaKind !== type) return false
    if (availability !== 'all' && asset.availability !== availability) return false
    const decision = curateDecisionForAsset(asset.id)
    const judgment = curateJudgmentForAsset(asset.id)
    if (decisionFilter === 'project-picks' && !judgment.projectPick) return false
    if (decisionFilter === 'slide-shortlist' && decision?.state !== 'shortlisted') return false
    if (decisionFilter === 'selected' && decision?.state !== 'selected') return false
    if (decisionFilter === 'alternates' && decision?.state !== 'alternate') return false
    if (decisionFilter === 'unused' && decision && decision.state !== 'considered') return false
    return true
  })
}

async function refreshCurateAssetStates(assetIds) {
  const slideId = selectedSlideId
  const uniqueIds = [...new Set(assetIds.filter(Boolean))]
  if (!slideId || uniqueIds.length === 0) return
  const requestGeneration = curateAssetStateGeneration
  const mediaGeneration = curateMediaLoadGeneration
  const expectedRevision = projection?.revision ?? null
  try {
    const hydrated = await queryCurateAssetStateMap(slideId, uniqueIds, expectedRevision)
    if (
      requestGeneration !== curateAssetStateGeneration
      || mediaGeneration !== curateMediaLoadGeneration
      || selectedSlideId !== slideId
      || projection?.revision !== expectedRevision
    ) return false
    curateAssetStateSlideId = slideId
    curateAssetStateRevision = hydrated.revision
    for (const [assetId, state] of hydrated.states) curateAssetStates.set(assetId, state)
    return true
  } catch (error) {
    if (requestGeneration === curateAssetStateGeneration && selectedSlideId === slideId) {
      curateMediaError = `Curate decisions unavailable: ${error.message}`
    }
    return false
  }
}

function scheduleCurateMediaReset({ delay = 0, message = '' } = {}) {
  clearTimeout(curateSearchTimer)
  curateSearchTimer = 0
  const generation = resetCurateMediaCatalog(message)
  curateMediaLoading = true
  renderCurateMediaWall()
  const launch = () => {
    if (generation === curateMediaLoadGeneration) void loadCurateMediaPage({ reset: true, resetGeneration: generation })
  }
  if (delay > 0) curateSearchTimer = setTimeout(launch, delay)
  else queueMicrotask(launch)
  return generation
}

async function loadCurateMediaPage({ reset = false, resetGeneration = null } = {}) {
  let generation = curateMediaLoadGeneration
  if (reset) {
    generation = resetGeneration ?? resetCurateMediaCatalog()
    if (generation !== curateMediaLoadGeneration) return
    curateMediaInitialAttemptGeneration = generation
  } else {
    if (curateMediaLoading || curateMediaNextOffset === null) return
  }
  curateMediaLoading = true
  curateMediaError = ''
  renderCurateMediaWall()
  const offset = reset ? 0 : Math.max(0, Number(curateMediaNextOffset) || 0)
  const params = { offset, limit: CURATE_MEDIA_PAGE_SIZE }
  const rootId = elements.mediaRootFilter.value
  const search = elements.mediaSearch.value.trim()
  if (rootId && rootId !== 'all') params.rootId = rootId
  if (search) params.search = search
  if (!reset && curateCatalogRevision !== null) params.expectedCatalogRevision = curateCatalogRevision
  if (!reset && curateAvailabilityRevision !== null) {
    params.expectedAvailabilityRevision = curateAvailabilityRevision
  }
  try {
    const result = await window.deckBridge.query({ name: 'media.assets', params })
    if (generation !== curateMediaLoadGeneration) return
    const resultRevision = result?.catalogRevision ?? curateCatalogRevision
    if (!reset && curateCatalogRevision !== null && resultRevision !== curateCatalogRevision) {
      curateMediaLoading = false
      curateCatalogRevision = resultRevision
      const restartGeneration = resetCurateMediaCatalog('Media catalogue changed. Restarting from page one…')
      await loadCurateMediaPage({ reset: true, resetGeneration: restartGeneration })
      return
    }
    curateCatalogRevision = resultRevision
    const resultAvailabilityRevision = result?.availabilityRevision ?? curateAvailabilityRevision
    if (
      !reset
      && curateAvailabilityRevision !== null
      && resultAvailabilityRevision !== curateAvailabilityRevision
    ) {
      curateMediaLoading = false
      const restartGeneration = resetCurateMediaCatalog('Media availability changed. Restarting from page one…')
      await loadCurateMediaPage({ reset: true, resetGeneration: restartGeneration })
      return
    }
    curateAvailabilityRevision = resultAvailabilityRevision
    const rawItems = Array.isArray(result?.items) ? result.items : Array.isArray(result?.assets) ? result.assets : []
    const nextItems = rawItems.map(normalizeCurateAsset).filter((asset) => asset.id)
    const byId = new Map(curateAssets.map((asset) => [asset.id, asset]))
    for (const asset of nextItems) byId.set(asset.id, asset)
    curateAssets = [...byId.values()]
    curateMediaTotal = Math.max(curateAssets.length, Number(result?.total ?? curateAssets.length))
    curateMediaNextOffset = Number.isSafeInteger(result?.nextOffset)
      ? result.nextOffset
      : curateAssets.length < curateMediaTotal
        ? offset + nextItems.length
        : null
    await refreshCurateAssetStates(nextItems.map((asset) => asset.id))
    if (!curateFocusedMediaId) curateFocusedMediaId = filteredCurateAssets()[0]?.id ?? null
  } catch (error) {
    if (generation === curateMediaLoadGeneration && error.name === 'QuerySnapshotChanged' && !reset) {
      curateMediaLoading = false
      const restartGeneration = resetCurateMediaCatalog('Media sources changed. Restarting from page one…')
      await loadCurateMediaPage({ reset: true, resetGeneration: restartGeneration })
      return
    }
    if (generation === curateMediaLoadGeneration) curateMediaError = `${error.name ?? 'Error'}: ${error.message}`
  } finally {
    if (generation === curateMediaLoadGeneration) {
      curateMediaLoading = false
      renderCurate()
    }
  }
}

function curateQueueState(item, unplacedCount = curateQueueUnplacedCounts.get(item?.slideId)) {
  if (item?.needsReconciliation) return 'needs'
  if (!Number.isSafeInteger(unplacedCount) || unplacedCount > 0) return 'needs'
  if (item?.findMoreState === 'needed') return 'find-more'
  if (Number(item?.filledSlotCount ?? 0) < Number(item?.requiredSlotCount ?? 0)) return 'needs'
  return 'ready'
}

function curateQueueLabel(state, unplacedCount = 0) {
  if (Number(unplacedCount) > 0) return 'Unplaced'
  return state === 'find-more' ? 'Find more' : state === 'needs' ? 'Needs media' : 'Ready'
}

function renderCurateQueue() {
  const stateBySlideId = new Map(curateQueueProjection.map((item) => [item.slideId, item]))
  const records = []
  const includedRecords = recordsFromStory().filter((record) => record.metadata.lifecycle === 'included')
  let sequenceNumber = 1
  for (const record of includedRecords) {
      const queueItem = stateBySlideId.get(record.slide.id)
      const unplacedCount = curateQueueUnplacedCounts.get(record.slide.id)
      const state = curateQueueState(queueItem, unplacedCount)
      if (curateQueueFilter !== 'all' && state !== curateQueueFilter) {
        sequenceNumber += 1
        continue
      }
      records.push({ record, state, unplacedCount, sequenceNumber })
      sequenceNumber += 1
  }
  elements.curateQueueFilters.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.curateQueueFilter === curateQueueFilter))
  })
  elements.curateSlideQueue.innerHTML = records.length
    ? records.map(({ record, state, unplacedCount, sequenceNumber: number }) => `
      <div role="listitem">
        <button class="curate-queue-row" type="button" data-curate-slide-id="${escapeAttribute(record.slide.id)}" aria-current="${record.slide.id === selectedSlideId ? 'true' : 'false'}">
          <span>${number}</span>
          <strong>${escapeHTML(record.metadata.internalTitle)}</strong>
          <span class="curate-queue-state ${state}">${curateQueueLabel(state, unplacedCount)}</span>
        </button>
      </div>`).join('')
    : '<div class="empty-workspace"><strong>No matching Slides.</strong><p>Choose another queue filter.</p></div>'
  const issueCount = includedRecords.filter((record) => curateQueueState(stateBySlideId.get(record.slide.id)) !== 'ready').length
  elements.nextCurateIssue.disabled = issueCount === 0
}

function renderCurateBrief() {
  const record = selectedPlanRecord()
  if (!record) {
    elements.curateBriefHeading.textContent = 'No Slide selected'
    elements.curateBriefContent.innerHTML = '<div class="empty-workspace"><strong>No Slide brief.</strong><p>Create or open a Deck.</p></div>'
    syncFindMoreControls(null)
    return
  }
  const includedRecords = recordsFromStory().filter((candidate) => candidate.metadata.lifecycle === 'included')
  const selectedIndex = includedRecords.findIndex((candidate) => candidate.slide.id === record.slide.id)
  const selectedNumber = selectedIndex >= 0 ? selectedIndex + 1 : 0
  const copy = [record.headline, record.subheadline, record.body]
    .filter((block) => block?.plainText)
    .map((block) => `<p><strong>${escapeHTML(block.role)}</strong><br>${escapeHTML(block.plainText)}</p>`)
    .join('')
  const supporting = record.metadata.supportingItems.length
    ? `<div class="curate-brief-meta"><strong>Supporting Items</strong>${record.metadata.supportingItems.map((item, index) => `<p>${index + 1}. ${escapeHTML(item.title || 'Untitled item')}</p>`).join('')}</div>`
    : ''
  elements.curateBriefHeading.textContent = record.metadata.internalTitle
  elements.curateBriefContent.innerHTML = `
    <p>${escapeHTML(record.section.title)} · Slide ${selectedNumber || '—'}</p>
    <h3>${escapeHTML(record.metadata.purpose || 'Purpose not written.')}</h3>
    <div class="curate-brief-meta"><strong>Visual Style</strong><p>${escapeHTML(visualStyleLabel(record.visualStyle))}</p></div>
    <div class="curate-brief-meta"><strong>On-Slide Copy</strong>${copy || '<p>No reviewed copy.</p>'}</div>
    ${supporting}`
  syncFindMoreControls(curateSlideProjection?.findMoreMedia ?? null)
}

function syncFindMoreControls(findMore) {
  const enabled = Boolean(projection && selectedSlideId && findMore)
  for (const control of [elements.findMoreState, elements.findMorePrimaryStatus, elements.findMoreBrief]) {
    control.disabled = !enabled
  }
  elements.saveFindMore.disabled = !enabled
  if (!enabled) {
    elements.findMoreState.value = 'not-needed'
    elements.findMorePrimaryStatus.value = 'none'
    elements.findMoreBrief.value = ''
    curateFindMoreDirty = false
    curateFindMoreSlideId = null
    return
  }
  if (!curateFindMoreDirty || curateFindMoreSlideId !== selectedSlideId) {
    elements.findMoreState.value = findMore.state
    elements.findMorePrimaryStatus.value = findMore.existingPrimaryStatus
    elements.findMoreBrief.value = findMore.brief
    curateFindMoreSlideId = selectedSlideId
    curateFindMoreDirty = false
  }
}

function slotDisplayName(slot) {
  if (slot.kind === 'supporting-item') {
    const record = selectedPlanRecord()
    const item = record?.metadata.supportingItems.find((candidate) => candidate.id === slot.supportingItemId)
    return item?.title ? `Media · ${item.title}` : `Supporting item ${slot.ordinal + 1}`
  }
  return `Primary ${slot.ordinal + 1}`
}

function durableAssetLabel(assetId, fallback = null) {
  return curateAssetById(assetId)?.label ?? fallback?.label ?? `Asset ${String(assetId).slice(0, 8)}`
}

function renderCurateTrays() {
  const slots = curateSlideProjection?.slots ?? []
  const filled = slots.filter((slot) => slot.selected).length
  elements.slotProgress.textContent = `${filled}/${slots.length}`
  elements.primaryTray.innerHTML = slots.length
    ? slots.map((slot) => {
      const selected = slot.selected
      const label = selected ? durableAssetLabel(selected.assetReferenceId, selected.assetReference) : 'Open slot'
      return `<button class="tray-item ${selected ? '' : 'is-empty'}" type="button" data-slot-key="${escapeAttribute(slot.key)}"${selected ? ` data-tray-asset-id="${escapeAttribute(selected.assetReferenceId)}"` : ''} aria-pressed="${slot.key === curateTargetSlotKey}">
        <strong>${escapeHTML(slotDisplayName(slot))}</strong>
        <small>${escapeHTML(label)}</small>
      </button>`
    }).join('')
    : '<div class="tray-item is-empty"><strong>No primary slots</strong><small>The current Visual Style does not request media.</small></div>'

  const decisions = curateSlideProjection?.decisions ?? []
  const renderDecisionTray = (state, target) => {
    const matches = decisions.filter((entry) => normalizedSlideDecision(entry)?.state === state)
    target.innerHTML = matches.length
      ? matches.map((entry) => {
        const decision = normalizedSlideDecision(entry)
        const detail = state === 'unplaced'
          ? `${String(decision.reason ?? 'slot changed').replaceAll('-', ' ')} · from ${decision.previousSlotKey ?? decision.previousAssignmentRole ?? 'prior slot'}`
          : state
        return `<button class="tray-item" type="button" data-tray-asset-id="${escapeAttribute(entry.assetReferenceId)}"><strong>${escapeHTML(durableAssetLabel(entry.assetReferenceId, entry.assetReference))}</strong><small>${escapeHTML(detail)}</small></button>`
      }).join('')
      : `<div class="tray-item is-empty"><strong>No ${escapeHTML(state === 'shortlisted' ? 'shortlisted media' : state === 'alternate' ? 'Alternates' : 'unplaced media')}</strong><small>Decisions for this Slide appear here.</small></div>`
  }
  renderDecisionTray('alternate', elements.alternateTray)
  renderDecisionTray('shortlisted', elements.shortlistTray)
  renderDecisionTray('unplaced', elements.unplacedTray)
}

function renderCurateRootControls() {
  const prior = elements.mediaRootFilter.value || 'all'
  elements.mediaRootFilter.replaceChildren()
  const allOption = document.createElement('option')
  allOption.value = 'all'
  allOption.textContent = curateRoots.length ? 'All Roots' : 'No Roots'
  elements.mediaRootFilter.append(allOption)
  for (const root of curateRoots) {
    const option = document.createElement('option')
    option.value = root.id
    option.textContent = `${root.label} · ${String(root.availability).replaceAll('_', ' ')}`
    elements.mediaRootFilter.append(option)
  }
  elements.mediaRootFilter.value = [...elements.mediaRootFilter.options].some((option) => option.value === prior) ? prior : 'all'
  elements.mediaRootFilter.disabled = curateRoots.length === 0
  const root = selectedCurateRoot()
  elements.authoriseMediaRoot.disabled = !projection
  elements.reconnectMediaRoot.disabled = !projection || !root || !['offline', 'needs_permission', 'error'].includes(root.availability)
  elements.scanMediaRoot.disabled = !projection || !root || root.availability !== 'available'
  elements.revealMediaSource.disabled = true
  elements.revealMediaSource.title = 'Source reveal is not exposed to the renderer in this gate.'
  if (root) {
    elements.mediaRootStatus.textContent = `${root.label} · ${String(root.availability).replaceAll('_', ' ')} · ${root.assetCount} Assets${root.missingCount ? ` · ${root.missingCount} missing` : ''}`
  } else if (curateRoots.length) {
    const available = curateRoots.filter((candidate) => candidate.availability === 'available').length
    elements.mediaRootStatus.textContent = `${curateRoots.length} Roots · ${available} available`
  } else {
    elements.mediaRootStatus.textContent = curateSnapshotErrors.length
      ? `Media Roots unavailable: ${curateSnapshotErrors.join('; ')}`
      : 'No media Root authorised.'
  }
}

function renderCurateActions() {
  const asset = selectedCurateAsset()
  const enabled = Boolean(asset && projection)
  const judgment = asset ? curateJudgmentForAsset(asset.id) : defaultCurateJudgment()
  const decision = asset ? curateDecisionForAsset(asset.id) : null
  const slots = curateSlideProjection?.slots ?? []
  const hasAssignableSlot = slots.length > 0
  elements.focusedAssetSummary.textContent = asset
    ? `${asset.label} · Project judgment / current-Slide decision`
    : 'No Asset focused'
  elements.toggleProjectPick.disabled = !enabled
  elements.toggleProjectPick.setAttribute('aria-pressed', String(Boolean(judgment.projectPick)))
  elements.toggleProjectPick.textContent = judgment.projectPick ? 'Project Picked' : 'Project Pick'
  elements.projectRating.disabled = !enabled
  elements.projectRating.value = String(judgment.rating)
  elements.projectReview.disabled = !enabled
  elements.projectReview.value = judgment.review
  elements.previewMedia.disabled = !enabled
  elements.shortlistMedia.disabled = !enabled
  elements.assignPrimaryMedia.disabled = !enabled || !hasAssignableSlot
  elements.assignPrimaryMedia.title = hasAssignableSlot ? 'Assign to the next open or activated named slot' : 'This Slide has no media slots'
  elements.alternateMedia.disabled = !enabled
  elements.rejectSlideMedia.disabled = !enabled
  elements.clearSlideMedia.disabled = !enabled || !decision || decision.state === 'considered'
  elements.shortlistMedia.setAttribute('aria-pressed', String(decision?.state === 'shortlisted'))
  elements.alternateMedia.setAttribute('aria-pressed', String(decision?.state === 'alternate'))
  elements.rejectSlideMedia.setAttribute('aria-pressed', String(decision?.state === 'rejected-for-slide'))
  const compared = asset ? curateCompareIds.includes(asset.id) : false
  elements.toggleCompareMedia.disabled = !enabled || (!compared && curateCompareIds.length >= CURATE_COMPARE_LIMIT)
  elements.toggleCompareMedia.setAttribute('aria-pressed', String(compared))
  elements.toggleCompareMedia.textContent = compared ? 'Remove from Compare' : 'Add to Compare'
  elements.compareCount.textContent = String(curateCompareIds.length)
  elements.openMediaCompare.disabled = curateCompareIds.length < 2
}

function shouldAutoLoadCurateMedia({
  phase,
  hasProjection,
  rootCount,
  assetCount,
  loading,
  initialAttemptGeneration,
  loadGeneration,
}) {
  return phase === 'curate'
    && hasProjection
    && rootCount > 0
    && assetCount === 0
    && !loading
    && initialAttemptGeneration !== loadGeneration
}

function renderCurate() {
  renderCurateQueue()
  renderCurateBrief()
  renderCurateTrays()
  renderCurateRootControls()
  renderCurateActions()
  renderCurateMediaWall()
  if (shouldAutoLoadCurateMedia({
    phase: activePhase,
    hasProjection: Boolean(projection),
    rootCount: curateRoots.length,
    assetCount: curateAssets.length,
    loading: curateMediaLoading,
    initialAttemptGeneration: curateMediaInitialAttemptGeneration,
    loadGeneration: curateMediaLoadGeneration,
  })) {
    scheduleCurateMediaReset({ message: 'Loading media catalogue…' })
  }
}

function curateVirtualMetrics(assetCount = filteredCurateAssets().length) {
  const viewportWidth = Math.max(1, elements.mediaScroll.clientWidth)
  const density = Math.max(150, Math.min(340, Number(elements.thumbnailDensity.value) || 220))
  const columns = Math.max(1, Math.floor((viewportWidth - CURATE_MEDIA_GAP) / (density + CURATE_MEDIA_GAP)))
  const cardWidth = Math.max(120, Math.floor((viewportWidth - CURATE_MEDIA_GAP * (columns + 1)) / columns))
  const cardHeight = Math.round(density * 0.7) + 68
  const rowHeight = cardHeight + CURATE_MEDIA_GAP
  const window = calculateCurateVirtualWindow({
    total: assetCount,
    scrollTop: elements.mediaScroll.scrollTop,
    viewportHeight: elements.mediaScroll.clientHeight,
    rowHeight,
    columns,
    overscanRows: CURATE_MEDIA_OVERSCAN_ROWS,
  })
  return Object.freeze({ viewportWidth, density, columns, cardWidth, cardHeight, rowHeight, ...window })
}

function mediaAssetStateText(asset) {
  if (asset.availability !== 'available') return String(asset.availability).replaceAll('_', ' ')
  if (asset.previewCapability !== 'grid') return 'Catalogue only'
  if (!curateRenditionUrl(asset)) return 'Preview failed'
  return ''
}

function appendCurateThumbnail(container, asset, alt = '') {
  const url = curateRenditionUrl(asset)
  if (!url) {
    const state = document.createElement('span')
    state.className = 'media-thumb-state'
    state.textContent = mediaAssetStateText(asset) || 'Preview unavailable'
    container.append(state)
    return false
  }
  const image = document.createElement('img')
  image.alt = alt
  image.src = url
  image.loading = 'eager'
  image.decoding = 'async'
  image.draggable = false
  image.addEventListener('error', () => {
    image.remove()
    const state = document.createElement('span')
    state.className = 'media-thumb-state'
    state.textContent = 'Preview failed'
    container.append(state)
  }, { once: true })
  container.append(image)
  return true
}

function curateMediaCardRenderSignature(asset) {
  const decision = curateDecisionForAsset(asset.id)
  const judgment = curateJudgmentForAsset(asset.id)
  return JSON.stringify([
    asset.label,
    asset.displayPath,
    asset.mediaKind,
    asset.availability,
    asset.previewCapability,
    curateRenditionUrl(asset),
    judgment.rating,
    judgment.review,
    judgment.projectPick,
    decision,
  ])
}

function positionCurateMediaCard(card, index, metrics) {
  const row = Math.floor(index / metrics.columns)
  const column = index % metrics.columns
  card.setAttribute('aria-rowindex', String(row + 1))
  card.setAttribute('aria-colindex', String(column + 1))
  card.style.setProperty('--card-left', `${CURATE_MEDIA_GAP + column * (metrics.cardWidth + CURATE_MEDIA_GAP)}px`)
  card.style.setProperty('--card-top', `${CURATE_MEDIA_GAP + row * metrics.rowHeight}px`)
  card.style.setProperty('--card-width', `${metrics.cardWidth}px`)
  card.style.setProperty('--card-height', `${metrics.cardHeight}px`)
}

function updateCurateMediaCard(card, asset, index, metrics) {
  positionCurateMediaCard(card, index, metrics)
  card.id = curateMediaCardId(asset.id)
  card.className = 'media-card'
  card.dataset.assetId = asset.id
  card.setAttribute('role', 'gridcell')
  const signature = curateMediaCardRenderSignature(asset)
  if (card.dataset.renderSignature === signature) return card
  card.dataset.renderSignature = signature
  const decision = curateDecisionForAsset(asset.id)
  const judgment = curateJudgmentForAsset(asset.id)
  const stateText = mediaAssetStateText(asset)
  const descriptors = [asset.mediaKind, asset.availability, judgment.projectPick ? 'Project Pick' : '', decision?.state ?? '']
    .filter(Boolean)
    .join(', ')
  card.setAttribute('aria-label', `${asset.label}. ${descriptors}`)
  const thumb = document.createElement('div')
  thumb.className = 'media-thumb'
  appendCurateThumbnail(thumb, asset)
  const copy = document.createElement('div')
  copy.className = 'media-card-copy'
  const title = document.createElement('strong')
  title.textContent = asset.label
  const badges = document.createElement('span')
  badges.className = 'media-badges'
  if (judgment.projectPick) badges.append(curateMediaBadge('Pick', 'project'))
  if (decision?.state) badges.append(curateMediaBadge(decision.state === 'selected' ? 'Selected' : decision.state, decision.state === 'selected' ? 'selected' : 'slide'))
  const path = document.createElement('small')
  path.textContent = stateText ? `${asset.displayPath} · ${stateText}` : asset.displayPath
  copy.append(title, badges, path)
  card.replaceChildren(thumb, copy)
  return card
}

function createCurateMediaCard(asset, index, metrics) {
  const card = document.createElement('div')
  updateCurateMediaCard(card, asset, index, metrics)
  return card
}

function curateMediaWindowKey(assets, metrics, generation = curateMediaLoadGeneration) {
  const mountedIds = assets
    .slice(metrics.startIndex, metrics.endIndex)
    .map((asset) => asset.id)
    .join('\u001f')
  return [
    generation,
    metrics.startIndex,
    metrics.endIndex,
    metrics.columns,
    metrics.cardWidth,
    metrics.cardHeight,
    metrics.rowHeight,
    mountedIds,
  ].join('|')
}

function reconcileCurateMediaCards(assets, metrics) {
  const existing = new Map(
    [...elements.mediaCanvas.querySelectorAll(':scope > [data-asset-id]')]
      .map((card) => [card.dataset.assetId, card]),
  )
  let cursor = elements.mediaCanvas.firstElementChild
  for (let index = metrics.startIndex; index < metrics.endIndex; index += 1) {
    const asset = assets[index]
    const card = existing.get(asset.id) ?? createCurateMediaCard(asset, index, metrics)
    existing.delete(asset.id)
    updateCurateMediaCard(card, asset, index, metrics)
    if (card !== cursor) elements.mediaCanvas.insertBefore(card, cursor)
    cursor = card.nextElementSibling
  }
  for (const staleCard of existing.values()) staleCard.remove()
}

function updateCurateMediaActivePresentation() {
  const mountedCards = [...elements.mediaCanvas.querySelectorAll(':scope > [data-asset-id]')]
  for (const card of mountedCards) {
    card.dataset.active = String(card.dataset.assetId === curateFocusedMediaId)
    card.setAttribute('aria-selected', String(curateCompareIds.includes(card.dataset.assetId)))
  }
  const mountedIds = mountedCards.map((card) => card.id)
  if (mountedIds.length) elements.mediaFocusOwner.setAttribute('aria-owns', mountedIds.join(' '))
  else elements.mediaFocusOwner.removeAttribute('aria-owns')
  const activeCard = curateFocusedMediaId ? document.getElementById(curateMediaCardId(curateFocusedMediaId)) : null
  if (activeCard) elements.mediaFocusOwner.setAttribute('aria-activedescendant', activeCard.id)
  else elements.mediaFocusOwner.removeAttribute('aria-activedescendant')
}

function curateMediaBadge(label, kind) {
  const badge = document.createElement('span')
  badge.className = `media-badge ${kind}`
  badge.textContent = label
  return badge
}

function renderMediaWallState(assets) {
  const hasClientFilter = elements.mediaTypeFilter.value !== 'all'
    || elements.mediaAvailabilityFilter.value !== 'all'
    || elements.mediaDecisionFilter.value !== 'all'
  let message = ''
  if (!projection) message = 'Create or open a Deck to curate media.'
  else if (curateMediaLoading) message = `Loading media… ${curateAssets.length} descriptors available.`
  else if (curateMediaError) message = curateMediaError
  else if (!curateRoots.length) message = 'Authorise a project media Root to begin.'
  else if (!assets.length && curateAssets.length) message = 'No matching media in the loaded catalogue pages.'
  else if (!assets.length) message = 'No media is available from the selected Root.'
  else if (curateMediaNextOffset !== null) {
    message = `${assets.length} matching in ${curateAssets.length} loaded of ${curateMediaTotal} total${hasClientFilter ? ' · filters apply to loaded pages' : ''}.`
  } else message = `${assets.length} matching Assets.`
  elements.mediaWallState.replaceChildren(document.createTextNode(message))
  if (!curateMediaLoading && curateMediaError) {
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => scheduleCurateMediaReset({ message: 'Retrying media catalogue…' }))
    elements.mediaWallState.append(document.createTextNode(' '), retry)
    return
  }
  if (!curateMediaLoading && curateMediaNextOffset !== null) {
    const loadMore = document.createElement('button')
    loadMore.type = 'button'
    loadMore.textContent = 'Load next page'
    loadMore.addEventListener('click', () => void loadCurateMediaPage())
    elements.mediaWallState.append(document.createTextNode(' '), loadMore)
  }
}

function renderCurateMediaWall() {
  const assets = filteredCurateAssets()
  if (curateFocusedMediaId && !assets.some((asset) => asset.id === curateFocusedMediaId)) {
    curateFocusedMediaId = assets[0]?.id ?? null
  }
  if (!curateFocusedMediaId && assets.length) curateFocusedMediaId = assets[0].id
  const metrics = curateVirtualMetrics(assets.length)
  elements.mediaCanvas.style.height = `${Math.max(elements.mediaScroll.clientHeight, metrics.rowCount * metrics.rowHeight + CURATE_MEDIA_GAP)}px`
  elements.mediaFocusOwner.setAttribute('aria-rowcount', String(metrics.rowCount))
  elements.mediaFocusOwner.setAttribute('aria-colcount', String(metrics.columns))
  const windowKey = curateMediaWindowKey(assets, metrics)
  if (windowKey !== curateRenderedWindowKey) {
    reconcileCurateMediaCards(assets, metrics)
    curateRenderedWindowKey = windowKey
  } else {
    for (let index = metrics.startIndex; index < metrics.endIndex; index += 1) {
      const asset = assets[index]
      const card = elements.mediaCanvas.querySelector(`[data-asset-id="${CSS.escape(asset.id)}"]`)
      if (card) updateCurateMediaCard(card, asset, index, metrics)
    }
  }
  updateCurateMediaActivePresentation()
  const focusedAsset = selectedCurateAsset()
  elements.mediaFocusOwner.value = focusedAsset
    ? `${focusedAsset.label}. Arrow keys navigate; Space previews; S shortlists; M assigns.`
    : 'No media loaded'
  elements.mediaFocusOwner.setSelectionRange(0, 0)
  elements.mediaCount.textContent = curateMediaNextOffset === null
    ? `${assets.length} Assets`
    : `${assets.length} shown · ${curateAssets.length}/${curateMediaTotal} loaded`
  renderMediaWallState(assets)
  renderCurateActions()
  if (
    !curateMediaLoading
    && curateMediaNextOffset !== null
    && assets.length > 0
    && metrics.endIndex >= Math.max(0, assets.length - metrics.columns * 2)
    && elements.mediaScroll.scrollTop > 0
  ) {
    queueMicrotask(() => void loadCurateMediaPage())
  }
}

function scheduleCurateVirtualRender() {
  if (curateVirtualFrame) cancelAnimationFrame(curateVirtualFrame)
  curateVirtualFrame = requestAnimationFrame(() => {
    curateVirtualFrame = 0
    renderCurateMediaWall()
  })
}

function ensureCurateAssetVisible(assetId) {
  const assets = filteredCurateAssets()
  const index = assets.findIndex((asset) => asset.id === assetId)
  if (index < 0) return false
  const metrics = curateVirtualMetrics(assets.length)
  const row = Math.floor(index / metrics.columns)
  const top = row * metrics.rowHeight
  const bottom = top + metrics.cardHeight + CURATE_MEDIA_GAP
  if (top < elements.mediaScroll.scrollTop) elements.mediaScroll.scrollTop = top
  else if (bottom > elements.mediaScroll.scrollTop + elements.mediaScroll.clientHeight) {
    elements.mediaScroll.scrollTop = Math.max(0, bottom - elements.mediaScroll.clientHeight)
  }
  return true
}

function focusCurateAsset(assetId, options = {}) {
  const asset = curateAssetById(assetId)
  if (!asset || !filteredCurateAssets().some((candidate) => candidate.id === assetId)) return false
  curateFocusedMediaId = assetId
  if (selectedSlideId) curateLastFocusBySlide.set(selectedSlideId, assetId)
  if (options.scroll !== false) ensureCurateAssetVisible(assetId)
  renderCurateMediaWall()
  if (options.focus !== false) {
    try {
      elements.mediaFocusOwner.focus({ preventScroll: true })
    } catch {
      elements.mediaFocusOwner.focus()
    }
  }
  return elements.mediaFocusOwner === document.activeElement || options.focus === false
}

function moveCurateFocus(delta) {
  const assets = filteredCurateAssets()
  if (!assets.length) return false
  const currentIndex = Math.max(0, assets.findIndex((asset) => asset.id === curateFocusedMediaId))
  const nextIndex = Math.max(0, Math.min(assets.length - 1, currentIndex + delta))
  return focusCurateAsset(assets[nextIndex].id)
}

function applyCurateClientFilter() {
  const priorId = curateFocusedMediaId
  const assets = filteredCurateAssets()
  if (priorId && assets.some((asset) => asset.id === priorId)) curateFocusedMediaId = priorId
  else curateFocusedMediaId = assets[0]?.id ?? null
  if (curateFocusedMediaId) ensureCurateAssetVisible(curateFocusedMediaId)
  else elements.mediaScroll.scrollTop = 0
  renderCurateMediaWall()
}

function changeCurateDensity(delta) {
  const next = Math.max(
    Number(elements.thumbnailDensity.min),
    Math.min(Number(elements.thumbnailDensity.max), Number(elements.thumbnailDensity.value) + delta),
  )
  elements.thumbnailDensity.value = String(next)
  elements.thumbnailDensity.setAttribute('aria-valuetext', `${next} pixels`)
  if (curateFocusedMediaId) ensureCurateAssetVisible(curateFocusedMediaId)
  scheduleCurateVirtualRender()
}

function setCurateLiveStatus(message) {
  elements.curateStatus.textContent = message
  setStatus(message)
}

async function executeCurateCommand(type, payload, sourceLabel, assetIds = []) {
  const next = await executeStructural(type, payload, selectedSlideId, {
    sourceLabel,
    preserveCurrentSelection: true,
  })
  if (!next) return null
  await refreshCurateAssetStates(assetIds)
  renderCurate()
  return next
}

function payloadAssetReference(asset) {
  return curateAttachedReference(asset.id) ? {} : { assetReference: neutralAssetReferenceSnapshot(asset) }
}

async function setFocusedProjectJudgment(patch, sourceLabel = 'Set project Asset judgment') {
  const asset = selectedCurateAsset()
  if (!asset || !projection) return
  const judgment = { ...curateJudgmentForAsset(asset.id), ...patch }
  await executeCurateCommand('curate.projectJudgment.set', {
    assetReferenceId: asset.id,
    ...payloadAssetReference(asset),
    judgment,
  }, sourceLabel, [asset.id])
}

async function setFocusedSlideDecision(decision, sourceLabel) {
  const asset = selectedCurateAsset()
  if (!asset || !projection || !selectedSlideId) return
  await executeCurateCommand('curate.slideDecision.set', {
    slideId: selectedSlideId,
    assetReferenceId: asset.id,
    ...payloadAssetReference(asset),
    decision,
  }, sourceLabel, [asset.id])
}

async function assignFocusedAsset() {
  const slots = curateSlideProjection?.slots ?? []
  let slot = curateTargetSlotKey ? slots.find((candidate) => candidate.key === curateTargetSlotKey) : null
  if (!slot) slot = slots.find((candidate) => !candidate.selected) ?? null
  if (!slot) {
    setCurateLiveStatus('All named slots are filled. Activate a slot in the tray to replace it.')
    return false
  }
  const decision = { state: 'selected', slotKey: slot.key }
  if (!slot.selected) decision.mediaAssignmentId = crypto.randomUUID()
  await setFocusedSlideDecision(decision, `Assign Asset to ${slotDisplayName(slot)}`)
  return true
}

function toggleFocusedCompare() {
  const asset = selectedCurateAsset()
  if (!asset) return
  if (curateCompareIds.includes(asset.id)) {
    curateCompareIds = curateCompareIds.filter((id) => id !== asset.id)
  } else if (curateCompareIds.length < CURATE_COMPARE_LIMIT) {
    curateCompareIds = [...curateCompareIds, asset.id]
  } else {
    setCurateLiveStatus('Compare holds at most four Assets.')
  }
  renderCurateMediaWall()
}

function formatCurateBytes(value) {
  if (!Number.isFinite(value)) return 'Size unavailable'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function curateAssetDetailsMarkup(asset) {
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Dimensions unavailable'
  return `
    <h3>${escapeHTML(asset.label)}</h3>
    <p>${escapeHTML(asset.displayPath)}</p>
    <p>${escapeHTML(asset.mediaKind)} · ${escapeHTML(asset.availability)}</p>
    <p>${escapeHTML(dimensions)} · ${escapeHTML(formatCurateBytes(asset.byteSize))}</p>
    ${asset.note ? `<p>${escapeHTML(asset.note)}</p>` : ''}`
}

function openFocusedPreview() {
  const asset = selectedCurateAsset()
  if (!asset) return
  elements.previewMediaTitle.textContent = asset.label
  elements.previewMediaDetails.innerHTML = curateAssetDetailsMarkup(asset)
  elements.previewMediaImage.hidden = true
  elements.previewMediaImage.removeAttribute('src')
  const url = curateRenditionUrl(asset)
  if (url) {
    elements.previewMediaImage.alt = `Preview of ${asset.label}`
    elements.previewMediaImage.src = url
    elements.previewMediaImage.hidden = false
    elements.previewCapabilityState.textContent = 'Bounded grid rendition. Full Preview is not available in this gate.'
  } else {
    elements.previewCapabilityState.textContent = `${mediaAssetStateText(asset) || 'Preview unavailable'}. The catalogue descriptor remains usable.`
  }
  elements.previewCapabilityState.hidden = false
  if (!elements.mediaPreview.open) elements.mediaPreview.showModal()
}

function renderCurateCompare() {
  elements.compareMediaGrid.replaceChildren()
  for (const assetId of curateCompareIds) {
    const asset = curateAssetById(assetId)
    if (!asset) continue
    const card = document.createElement('article')
    card.className = 'compare-card'
    const thumb = document.createElement('div')
    thumb.className = 'media-thumb'
    appendCurateThumbnail(thumb, asset, `Preview of ${asset.label}`)
    const footer = document.createElement('footer')
    const title = document.createElement('strong')
    title.textContent = asset.label
    const detail = document.createElement('small')
    detail.textContent = `${asset.mediaKind} · ${asset.availability} · ${asset.displayPath}`
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.dataset.removeCompareId = asset.id
    remove.textContent = 'Remove from Compare'
    footer.append(title, detail, remove)
    card.append(thumb, footer)
    elements.compareMediaGrid.append(card)
  }
}

function openCurateCompare() {
  if (curateCompareIds.length < 2) {
    setCurateLiveStatus('Add at least two Assets to Compare.')
    return
  }
  renderCurateCompare()
  if (!elements.mediaCompare.open) elements.mediaCompare.showModal()
}

function closeCurateOverlays() {
  if (elements?.mediaPreview?.open) elements.mediaPreview.close()
  if (elements?.mediaCompare?.open) elements.mediaCompare.close()
  if (elements?.mediaContextMenu) elements.mediaContextMenu.hidden = true
}

function restoreCurateMediaFocus() {
  if (activePhase === 'curate' && curateFocusedMediaId) focusCurateAsset(curateFocusedMediaId)
}

async function executeMediaRootCommand(type, payload, sourceLabel) {
  if (!projection) return
  const operationDeckId = projection.deckId
  const operationRefreshGeneration = refreshGeneration
  setBusy(`${sourceLabel}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: 'ui', label: sourceLabel },
        issuedAt: new Date().toISOString(),
      },
    })
    if (!projection || projection.deckId !== operationDeckId) return
    const targetSlideId = pendingWorkspaceSlideId ?? selectedSlideId
    const viewChangedDuringOperation = refreshGeneration !== operationRefreshGeneration
    const refreshed = await refreshWorkspace(targetSlideId)
    if (!refreshed || projection?.deckId !== operationDeckId) return
    if (!viewChangedDuringOperation) setCurateLiveStatus(`${sourceLabel} complete.`)
  } catch (error) {
    if (!projection || projection.deckId !== operationDeckId) return
    renderAll()
    setCurateLiveStatus(`${error.name ?? 'Error'}: ${error.message}`)
  }
}

async function saveCurateFindMore() {
  if (!projection || !selectedSlideId) return
  const value = {
    state: elements.findMoreState.value,
    existingPrimaryStatus: elements.findMorePrimaryStatus.value,
    brief: elements.findMoreBrief.value,
  }
  const result = await executeCurateCommand('curate.findMore.set', {
    slideId: selectedSlideId,
    value,
  }, 'Save Find More Media')
  if (result) {
    curateFindMoreDirty = false
    curateFindMoreSlideId = selectedSlideId
  }
}

function unresolvedCurateSlideIds() {
  const stateBySlideId = new Map(curateQueueProjection.map((item) => [item.slideId, item]))
  return recordsFromStory()
    .filter((record) => record.metadata.lifecycle === 'included')
    .filter((record) => curateQueueState(stateBySlideId.get(record.slide.id)) !== 'ready')
    .map((record) => record.slide.id)
}

async function moveToNextCurateIssue() {
  const ids = unresolvedCurateSlideIds()
  if (!ids.length) {
    setCurateLiveStatus('All Slides have their required media decisions.')
    return
  }
  const current = ids.indexOf(selectedSlideId)
  const nextId = ids[(current + 1 + ids.length) % ids.length]
  await enterPhaseForSlide('curate', nextId)
  restoreCurateMediaFocus()
}

async function moveToPreviousCurateSlide() {
  const ids = recordsFromStory()
    .filter((record) => record.metadata.lifecycle === 'included')
    .map((record) => record.slide.id)
  if (!ids.length) return
  const current = Math.max(0, ids.indexOf(selectedSlideId))
  const priorId = ids[(current - 1 + ids.length) % ids.length]
  await enterPhaseForSlide('curate', priorId)
  restoreCurateMediaFocus()
}

function handleCurateMediaKeydown(event) {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  const metrics = curateVirtualMetrics()
  let handled = true
  if (event.key === 'ArrowLeft') moveCurateFocus(-1)
  else if (event.key === 'ArrowRight') moveCurateFocus(1)
  else if (event.key === 'ArrowUp') moveCurateFocus(-metrics.columns)
  else if (event.key === 'ArrowDown') moveCurateFocus(metrics.columns)
  else if (event.key === 'Home') {
    const first = filteredCurateAssets()[0]
    if (first) focusCurateAsset(first.id)
  } else if (event.key === 'End') {
    const last = filteredCurateAssets().at(-1)
    if (last) focusCurateAsset(last.id)
  } else if (event.key === ' ') openFocusedPreview()
  else if (event.key.toLowerCase() === 's') void setFocusedSlideDecision({ state: 'shortlisted' }, 'Shortlist Asset for Slide')
  else if (event.key.toLowerCase() === 'm') assignFocusedAsset()
  else if (event.key.toLowerCase() === 'a') void setFocusedSlideDecision({ state: 'alternate' }, 'Add Slide Alternate')
  else if (event.key.toLowerCase() === 'x' && event.shiftKey) void setFocusedSlideDecision({ state: 'considered' }, 'Clear current-Slide Asset decision')
  else if (event.key.toLowerCase() === 'x') void setFocusedSlideDecision({ state: 'rejected-for-slide' }, 'Reject Asset for current Slide')
  else if (/^[0-5]$/.test(event.key)) void setFocusedProjectJudgment({ rating: Number(event.key) }, 'Set project Asset rating')
  else if (event.key.toLowerCase() === 'n') void moveToNextCurateIssue()
  else if (event.key.toLowerCase() === 'p') void moveToPreviousCurateSlide()
  else if (event.key === '+' || event.key === '=') changeCurateDensity(10)
  else if (event.key === '-' || event.key === '_') changeCurateDensity(-10)
  else if (event.key.toLowerCase() === 'c') openCurateCompare()
  else handled = false
  if (handled) event.preventDefault()
}

function showCurateContextMenu(event, assetId) {
  event.preventDefault()
  focusCurateAsset(assetId)
  const menu = elements.mediaContextMenu
  menu.hidden = false
  const maxLeft = Math.max(8, window.innerWidth - menu.offsetWidth - 8)
  const maxTop = Math.max(8, window.innerHeight - menu.offsetHeight - 8)
  menu.style.left = `${Math.min(maxLeft, Math.max(8, event.clientX))}px`
  menu.style.top = `${Math.min(maxTop, Math.max(8, event.clientY))}px`
  for (const button of menu.querySelectorAll('button')) {
    const action = button.dataset.mediaContextAction
    button.disabled = action === 'reveal'
      || (action === 'primary' && (curateSlideProjection?.slots?.length ?? 0) === 0)
      || (action === 'compare' && !curateCompareIds.includes(assetId) && curateCompareIds.length >= CURATE_COMPARE_LIMIT)
  }
  menu.querySelector('button:not(:disabled)')?.focus()
}

async function runCurateContextAction(action) {
  elements.mediaContextMenu.hidden = true
  if (action === 'preview') {
    openFocusedPreview()
    return
  }
  try {
    if (action === 'shortlist') await setFocusedSlideDecision({ state: 'shortlisted' }, 'Shortlist Asset for Slide')
    else if (action === 'primary') await assignFocusedAsset()
    else if (action === 'alternate') await setFocusedSlideDecision({ state: 'alternate' }, 'Add Slide Alternate')
    else if (action === 'reject') await setFocusedSlideDecision({ state: 'rejected-for-slide' }, 'Reject Asset for current Slide')
    else if (action === 'clear') await setFocusedSlideDecision({ state: 'considered' }, 'Clear current-Slide Asset decision')
    else if (action === 'project-pick') await setFocusedProjectJudgment({ projectPick: !curateJudgmentForAsset(curateFocusedMediaId).projectPick }, 'Toggle Project Pick')
    else if (action === 'compare') toggleFocusedCompare()
    else if (action === 'reveal') setCurateLiveStatus('Source reveal is not exposed to the renderer in this gate.')
  } finally {
    restoreCurateMediaFocus()
  }
}

function handleCurateContextMenuKeydown(event) {
  const menu = elements.mediaContextMenu
  const buttons = [...menu.querySelectorAll('button:not(:disabled)')]
  const index = buttons.indexOf(document.activeElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    menu.hidden = true
    restoreCurateMediaFocus()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) return
  event.preventDefault()
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[nextIndex].focus()
}

function bindCurateEvents() {
  elements.curateQueueFilters.forEach((button) => button.addEventListener('click', () => {
    curateQueueFilter = button.dataset.curateQueueFilter
    renderCurateQueue()
  }))
  elements.nextCurateIssue.addEventListener('click', () => void moveToNextCurateIssue())
  elements.curateSlideQueue.addEventListener('click', (event) => {
    const button = event.target.closest('[data-curate-slide-id]')
    if (button) void enterPhaseForSlide('curate', button.dataset.curateSlideId)
  })

  elements.mediaSearch.addEventListener('input', () => {
    scheduleCurateMediaReset({ delay: 180, message: 'Search changed. Loading matching media…' })
  })
  elements.mediaRootFilter.addEventListener('change', () => {
    scheduleCurateMediaReset({ message: 'Media Root changed. Loading catalogue…' })
  })
  for (const control of [elements.mediaTypeFilter, elements.mediaAvailabilityFilter]) {
    control.addEventListener('change', applyCurateClientFilter)
  }
  elements.mediaDecisionFilter.addEventListener('change', async () => {
    await refreshCurateAssetStates(curateAssets.map((asset) => asset.id))
    applyCurateClientFilter()
  })
  elements.thumbnailDensity.addEventListener('input', () => {
    const value = Number(elements.thumbnailDensity.value)
    elements.thumbnailDensity.setAttribute('aria-valuetext', `${value} pixels`)
    if (curateFocusedMediaId) ensureCurateAssetVisible(curateFocusedMediaId)
    scheduleCurateVirtualRender()
  })
  elements.mediaScroll.addEventListener('scroll', scheduleCurateVirtualRender, { passive: true })
  elements.mediaCanvas.addEventListener('click', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (card) focusCurateAsset(card.dataset.assetId)
  })
  elements.mediaCanvas.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (!card) return
    focusCurateAsset(card.dataset.assetId)
    openFocusedPreview()
  })
  elements.mediaCanvas.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('[data-asset-id]')
    if (card) showCurateContextMenu(event, card.dataset.assetId)
  })
  elements.mediaFocusOwner.addEventListener('beforeinput', (event) => event.preventDefault())
  elements.mediaFocusOwner.addEventListener('paste', (event) => event.preventDefault())
  elements.mediaFocusOwner.addEventListener('drop', (event) => event.preventDefault())
  elements.mediaFocusOwner.addEventListener('keydown', handleCurateMediaKeydown)

  elements.toggleProjectPick.addEventListener('click', () => void setFocusedProjectJudgment({ projectPick: !curateJudgmentForAsset(curateFocusedMediaId).projectPick }, 'Toggle Project Pick'))
  elements.projectRating.addEventListener('change', () => void setFocusedProjectJudgment({ rating: Number(elements.projectRating.value) }, 'Set project Asset rating'))
  elements.projectReview.addEventListener('change', () => void setFocusedProjectJudgment({ review: elements.projectReview.value }, 'Set project Asset review'))
  elements.previewMedia.addEventListener('click', openFocusedPreview)
  elements.shortlistMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'shortlisted' }, 'Shortlist Asset for Slide'))
  elements.assignPrimaryMedia.addEventListener('click', assignFocusedAsset)
  elements.alternateMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'alternate' }, 'Add Slide Alternate'))
  elements.rejectSlideMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'rejected-for-slide' }, 'Reject Asset for current Slide'))
  elements.clearSlideMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'considered' }, 'Clear current-Slide Asset decision'))
  elements.toggleCompareMedia.addEventListener('click', toggleFocusedCompare)
  elements.openMediaCompare.addEventListener('click', openCurateCompare)

  elements.authoriseMediaRoot.addEventListener('click', () => void executeMediaRootCommand('media.root.authorize', {}, 'Authorise Media Root'))
  elements.reconnectMediaRoot.addEventListener('click', () => {
    const root = selectedCurateRoot()
    if (root) void executeMediaRootCommand('media.root.reconnect', { rootId: root.id }, 'Reconnect Media Root')
  })
  elements.scanMediaRoot.addEventListener('click', () => {
    const root = selectedCurateRoot()
    if (root) void executeMediaRootCommand('media.root.scan', { rootId: root.id }, 'Scan Media Root')
  })
  elements.revealMediaSource.addEventListener('click', () => setCurateLiveStatus('Source reveal is not exposed to the renderer in this gate.'))

  for (const control of [elements.findMoreState, elements.findMorePrimaryStatus, elements.findMoreBrief]) {
    control.addEventListener('input', () => {
      curateFindMoreDirty = true
      curateFindMoreSlideId = selectedSlideId
    })
  }
  elements.findMoreForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveCurateFindMore()
  })
  for (const tray of [elements.primaryTray, elements.alternateTray, elements.shortlistTray, elements.unplacedTray]) {
    tray.addEventListener('click', (event) => {
      const slot = event.target.closest('[data-slot-key]')
      if (slot) {
        curateTargetSlotKey = slot.dataset.slotKey
        renderCurateTrays()
      }
      const assetButton = event.target.closest('[data-tray-asset-id]')
      if (assetButton && !focusCurateAsset(assetButton.dataset.trayAssetId)) {
        setCurateLiveStatus('That durable Asset is not in the currently loaded catalogue page.')
      }
    })
  }

  elements.previewMediaImage.addEventListener('error', () => {
    elements.previewMediaImage.hidden = true
    elements.previewMediaImage.removeAttribute('src')
    elements.previewCapabilityState.textContent = 'Preview failed. The catalogue descriptor remains usable.'
  })
  elements.mediaPreview.addEventListener('close', restoreCurateMediaFocus)
  elements.mediaCompare.addEventListener('close', restoreCurateMediaFocus)
  elements.compareMediaGrid.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-compare-id]')
    if (!remove) return
    curateCompareIds = curateCompareIds.filter((id) => id !== remove.dataset.removeCompareId)
    renderCurateCompare()
    renderCurateActions()
    if (curateCompareIds.length < 2 && elements.mediaCompare.open) elements.mediaCompare.close()
  })
  elements.mediaContextMenu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-media-context-action]')?.dataset.mediaContextAction
    if (action) void runCurateContextAction(action)
  })
  elements.mediaContextMenu.addEventListener('keydown', handleCurateContextMenuKeydown)
  document.addEventListener('pointerdown', (event) => {
    if (!elements.mediaContextMenu.hidden && !elements.mediaContextMenu.contains(event.target)) {
      elements.mediaContextMenu.hidden = true
    }
  }, true)
  window.addEventListener('blur', () => { elements.mediaContextMenu.hidden = true })

  if ('ResizeObserver' in window) {
    curateResizeObserver = new ResizeObserver(scheduleCurateVirtualRender)
    curateResizeObserver.observe(elements.mediaScroll)
  }
}
