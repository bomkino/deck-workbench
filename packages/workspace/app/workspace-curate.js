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
    renditions: Object.freeze({
      gridStandard: asset?.renditions?.gridStandard ?? null,
      previewStandard: asset?.renditions?.previewStandard ?? null,
    }),
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
const curateFindMoreDrafts = new Map()
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
let curateProjectPicksProjection = []
let curateTrayAssets = new Map()
let curateTrayAssetLoadKey = ''
let curateTrayAssetLoadGeneration = 0
let curateTrayAssetLoadPromise = null
let curatePreviewMediaId = null
let curateAssignmentAssetId = null
let curateAssignmentTargets = []
let curateAssignmentTargetGeneration = 0
let curateAssignmentPending = false
let curatePreviewActionPending = false

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

async function prepareCurateAssetStateSnapshot(slideId, expectedRevision, additionalAssetIds = []) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mediaGeneration = curateMediaLoadGeneration
    const assetIds = [...new Set([
      ...curateAssets.map((asset) => asset.id),
      ...additionalAssetIds.filter(Boolean),
    ])]
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
    window.deckBridge.query({ name: 'asset.catalog', params: {} }),
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
  const rootSettled = results[resultIndex++]
  const assetCatalogSettled = results[resultIndex]
  if (rootSettled.status === 'rejected' && rootSettled.reason?.name === 'QuerySnapshotChanged') {
    throw rootSettled.reason
  }
  const queueResult = queueSettled.status === 'fulfilled' ? queueSettled.value : { slides: [] }
  const rootResult = rootSettled.status === 'fulfilled' ? rootSettled.value : { roots: [] }
  const assetReferences = assetCatalogSettled.status === 'fulfilled' && Array.isArray(assetCatalogSettled.value?.assets)
    ? assetCatalogSettled.value.assets
    : []
  const hydrated = slideId
    ? await prepareCurateAssetStateSnapshot(
        slideId,
        slide?.revision ?? null,
        assetReferences.map((asset) => asset?.id),
      )
    : { revision: null, states: new Map(), mediaGeneration: curateMediaLoadGeneration }
  const unplaced = await prepareCurateUnplacedCounts(queueResult, slide)
  const referenceById = new Map(assetReferences.map((asset) => [asset.id, asset]))
  const enrichedSlide = {
    ...slide,
    decisions: (slide?.decisions ?? []).map((decision) => ({
      ...decision,
      assetReference: decision.assetReference ?? referenceById.get(decision.assetReferenceId) ?? null,
    })),
  }
  const projectPicks = assetReferences
    .filter((asset) => hydrated.states.get(asset.id)?.projectJudgment?.projectPick)
    .map((asset) => ({
      assetReferenceId: asset.id,
      assetReference: asset,
      projectJudgment: hydrated.states.get(asset.id).projectJudgment,
    }))
  return Object.freeze({
    slide: enrichedSlide,
    queue: Array.isArray(queueResult?.slides) ? queueResult.slides : [],
    queueRevision: queueResult?.revision ?? slide?.revision ?? null,
    unplacedCounts: unplaced.counts,
    roots: Array.isArray(rootResult?.roots) ? rootResult.roots.map(normalizeCurateRoot).filter((root) => root.id) : [],
    catalogRevision: rootResult?.catalogRevision ?? null,
    availabilityRevision: rootResult?.availabilityRevision ?? null,
    assetStates: hydrated.states,
    assetStateRevision: hydrated.revision,
    assetStateMediaGeneration: hydrated.mediaGeneration,
    projectPicks,
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
  curateProjectPicksProjection = snapshot?.projectPicks ?? []
  curateDocumentDeckId = projection?.deckId ?? curateDocumentDeckId
  if (priorSlideId !== nextSlideId) {
    curateFocusedMediaId = curateLastFocusBySlide.get(nextSlideId) ?? curateFocusedMediaId
    curateTargetSlotKey = null
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
  curateProjectPicksProjection = []
  curateTrayAssets = new Map()
  curateTrayAssetLoadKey = ''
  curateTrayAssetLoadGeneration += 1
  curateTrayAssetLoadPromise = null
  curatePreviewMediaId = null
  curateAssignmentAssetId = null
  curateAssignmentTargets = []
  curateAssignmentTargetGeneration += 1
  curateAssignmentPending = false
  curatePreviewActionPending = false
  curateFindMoreDrafts.clear()
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
  curateTrayAssets = new Map()
  curateTrayAssetLoadKey = ''
  curateTrayAssetLoadGeneration += 1
  curateTrayAssetLoadPromise = null
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

function curatePreviewRenditionUrl(asset) {
  const candidate = asset?.renditions?.previewStandard ?? asset?.renditions?.gridStandard
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
  const loaded = curateAssets.find((asset) => asset.id === assetId) ?? curateTrayAssets.get(assetId)
  if (loaded) return loaded
  const primary = (curateSlideProjection?.slots ?? [])
    .map((slot) => slot.selected)
    .find((selected) => selected?.assetReferenceId === assetId)
  const decision = (curateSlideProjection?.decisions ?? [])
    .find((entry) => entry.assetReferenceId === assetId)
  const pick = curateProjectPicksProjection.find((entry) => entry.assetReferenceId === assetId)
  const reference = primary?.assetReference ?? decision?.assetReference ?? pick?.assetReference
  return reference ? normalizeCurateAsset(reference) : null
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
  const includedRecords = planRecords().filter((record) => record.metadata.lifecycle === 'included')
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
  const includedRecords = planRecords().filter((candidate) => candidate.metadata.lifecycle === 'included')
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
  elements.saveFindMore.disabled = !enabled || !curateFindMoreDrafts.has(selectedSlideId)
  if (!enabled) {
    elements.findMoreState.value = 'not-needed'
    elements.findMorePrimaryStatus.value = 'none'
    elements.findMoreBrief.value = ''
    elements.findMoreSummary.textContent = 'Not needed'
    return
  }
  const draft = curateFindMoreDrafts.get(selectedSlideId) ?? findMore
  elements.findMoreState.value = draft.state
  elements.findMorePrimaryStatus.value = draft.existingPrimaryStatus
  elements.findMoreBrief.value = draft.brief
  elements.findMoreSummary.textContent = String(elements.findMoreState.value).replaceAll('-', ' ')
}

function normalizedFindMoreValue(value) {
  return {
    state: String(value?.state ?? 'not-needed'),
    existingPrimaryStatus: String(value?.existingPrimaryStatus ?? 'none'),
    brief: String(value?.brief ?? ''),
  }
}

function findMoreValuesEqual(left, right) {
  const normalizedLeft = normalizedFindMoreValue(left)
  const normalizedRight = normalizedFindMoreValue(right)
  return normalizedLeft.state === normalizedRight.state
    && normalizedLeft.existingPrimaryStatus === normalizedRight.existingPrimaryStatus
    && normalizedLeft.brief === normalizedRight.brief
}

function slotDisplayName(slot, record = selectedPlanRecord()) {
  if (slot.kind === 'supporting-item') {
    const item = record?.metadata.supportingItems.find((candidate) => candidate.id === slot.supportingItemId)
    return item?.title ? `Media · ${item.title}` : `Supporting item ${slot.ordinal + 1}`
  }
  return `Primary ${slot.ordinal + 1}`
}

function curateAssignmentTargetSlot() {
  const slots = curateSlideProjection?.slots ?? []
  return slots.find((slot) => slot.key === curateTargetSlotKey)
    ?? slots.find((slot) => !slot.selected)
    ?? slots[0]
    ?? null
}

function durableAssetLabel(assetId, fallback = null) {
  return curateAssetById(assetId)?.label ?? fallback?.label ?? `Asset ${String(assetId).slice(0, 8)}`
}

function curateTrayAssetIds() {
  return [...new Set([
    ...(curateSlideProjection?.slots ?? []).map((slot) => slot.selected?.assetReferenceId),
    ...(curateSlideProjection?.decisions ?? []).map((entry) => entry.assetReferenceId),
    ...curateProjectPicksProjection.map((entry) => entry.assetReferenceId),
  ].filter(Boolean))]
}

function scheduleCurateTrayAssetHydration() {
  const assetIds = curateTrayAssetIds()
  const key = [
    projection?.deckId ?? '',
    projection?.revision ?? '',
    curateCatalogRevision ?? '',
    curateAvailabilityRevision ?? '',
    assetIds.slice().sort().join('\u001f'),
  ].join('|')
  if (key === curateTrayAssetLoadKey) return curateTrayAssetLoadPromise
  curateTrayAssetLoadKey = key
  const generation = ++curateTrayAssetLoadGeneration
  const expectedDeckId = projection?.deckId ?? null
  const expectedRevision = projection?.revision ?? null
  const load = (async () => {
    const hydrated = new Map()
    for (let index = 0; index < assetIds.length; index += 250) {
      const params = { assetIds: assetIds.slice(index, index + 250) }
      if (curateCatalogRevision !== null) params.expectedCatalogRevision = curateCatalogRevision
      if (curateAvailabilityRevision !== null) params.expectedAvailabilityRevision = curateAvailabilityRevision
      const result = await window.deckBridge.query({ name: 'media.assets', params })
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result?.assets) ? result.assets : []
      for (const item of items) {
        const asset = normalizeCurateAsset(item)
        if (asset.id) hydrated.set(asset.id, asset)
      }
    }
    if (
      generation !== curateTrayAssetLoadGeneration
      || projection?.deckId !== expectedDeckId
      || projection?.revision !== expectedRevision
    ) return null
    curateTrayAssets = hydrated
    renderCurateTrays()
    if (elements.mediaPreview?.open) renderCuratePreview()
    return hydrated
  })().catch(() => {
    if (generation === curateTrayAssetLoadGeneration) curateTrayAssets = new Map()
    return null
  })
  curateTrayAssetLoadPromise = load
  void load.finally(() => {
    if (curateTrayAssetLoadPromise === load) curateTrayAssetLoadPromise = null
  })
  return load
}

function createCurateTrayEmpty(title, detail) {
  const empty = document.createElement('div')
  empty.className = 'tray-item is-empty'
  const heading = document.createElement('strong')
  heading.textContent = title
  const copy = document.createElement('small')
  copy.textContent = detail
  empty.append(heading, copy)
  return empty
}

function createCurateTrayItem({
  assetId = null,
  assetReference = null,
  title,
  detail,
  slotKey = null,
  pressed = false,
  empty = false,
}) {
  const button = document.createElement('button')
  button.className = `tray-item${empty ? ' is-empty' : ''}`
  button.type = 'button'
  if (slotKey) button.dataset.slotKey = slotKey
  if (assetId) button.dataset.trayAssetId = assetId
  if (slotKey) button.setAttribute('aria-pressed', String(pressed))

  const thumb = document.createElement('span')
  thumb.className = 'tray-thumb'
  const asset = assetId ? curateAssetById(assetId) ?? (assetReference ? normalizeCurateAsset(assetReference) : null) : null
  if (asset) appendCurateThumbnail(thumb, asset, '')
  else {
    const state = document.createElement('span')
    state.className = 'media-thumb-state'
    state.textContent = empty ? 'Open' : 'Preview unavailable'
    thumb.append(state)
  }

  const copy = document.createElement('span')
  copy.className = 'tray-copy'
  const heading = document.createElement('strong')
  heading.textContent = title
  const description = document.createElement('small')
  description.textContent = detail
  copy.append(heading, description)
  button.append(thumb, copy)
  button.setAttribute('aria-label', `${title}. ${detail}`)
  return button
}

function renderCurateTrays() {
  const slots = curateSlideProjection?.slots ?? []
  const filled = slots.filter((slot) => slot.selected).length
  elements.slotProgress.textContent = `${filled}/${slots.length}`
  elements.primaryTray.replaceChildren(...(slots.length
    ? slots.map((slot) => {
        const selected = slot.selected
        return createCurateTrayItem({
          assetId: selected?.assetReferenceId ?? null,
          assetReference: selected?.assetReference ?? null,
          title: slotDisplayName(slot),
          detail: selected ? durableAssetLabel(selected.assetReferenceId, selected.assetReference) : 'Open slot',
          slotKey: slot.key,
          pressed: slot.key === curateTargetSlotKey,
          empty: !selected,
        })
      })
    : [createCurateTrayEmpty('No primary slots', 'The current Visual Style does not request media.')]))

  const decisions = curateSlideProjection?.decisions ?? []
  const renderDecisionTray = (state, target) => {
    const matches = decisions.filter((entry) => normalizedSlideDecision(entry)?.state === state)
    const emptyLabel = { alternate: 'No alternates', shortlisted: 'No shortlist', unplaced: 'No unplaced media' }[state]
    target.replaceChildren(...(matches.length
      ? matches.map((entry) => {
        const decision = normalizedSlideDecision(entry)
        const detail = state === 'unplaced'
          ? `${String(decision.reason ?? 'slot changed').replaceAll('-', ' ')} · from ${decision.previousSlotKey ?? decision.previousAssignmentRole ?? 'prior slot'}`
          : state
        return createCurateTrayItem({
          assetId: entry.assetReferenceId,
          assetReference: entry.assetReference,
          title: durableAssetLabel(entry.assetReferenceId, entry.assetReference),
          detail,
        })
      })
      : [createCurateTrayEmpty(emptyLabel, 'None for this Slide.')]))
  }
  renderDecisionTray('alternate', elements.alternateTray)
  renderDecisionTray('shortlisted', elements.shortlistTray)
  renderDecisionTray('unplaced', elements.unplacedTray)

  const picks = curateProjectPicksProjection
  elements.projectPickTray.replaceChildren(...(picks.length
    ? picks.map((entry) => createCurateTrayItem({
        assetId: entry.assetReferenceId,
        assetReference: entry.assetReference,
        title: durableAssetLabel(entry.assetReferenceId, entry.assetReference),
        detail: entry.projectJudgment?.rating ? `${entry.projectJudgment.rating} stars · Project Pick` : 'Project Pick',
      }))
    : [createCurateTrayEmpty('No Project Picks', 'Star or mark an image as a Project Pick.')]))

  void scheduleCurateTrayAssetHydration()
}

function renderCurateRootControls() {
  const prior = elements.mediaRootFilter.value || 'all'
  elements.mediaRootFilter.replaceChildren()
  const allOption = document.createElement('option')
  allOption.value = 'all'
  allOption.textContent = curateRoots.length ? 'All folders' : 'No folders'
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
    elements.mediaRootStatus.textContent = `${curateRoots.length} folders · ${available} available`
  } else {
    elements.mediaRootStatus.textContent = curateSnapshotErrors.length
      ? `Media folders unavailable: ${curateSnapshotErrors.join('; ')}`
      : 'No media folder connected.'
  }
}

function renderCurateActions() {
  const asset = selectedCurateAsset()
  const enabled = Boolean(asset && projection)
  const judgment = asset ? curateJudgmentForAsset(asset.id) : defaultCurateJudgment()
  const decision = asset ? curateDecisionForAsset(asset.id) : null
  const slots = curateSlideProjection?.slots ?? []
  const hasAssignableSlot = slots.length > 0
  const targetSlot = curateAssignmentTargetSlot()
  const targetLabel = targetSlot ? slotDisplayName(targetSlot) : 'No open slot'
  const alreadyAssigned = Boolean(asset && targetSlot?.selected?.assetReferenceId === asset.id)
  elements.focusedAssetSummary.textContent = asset ? `${asset.label} · Target: ${targetLabel}` : 'No Asset selected'
  elements.focusedAssetSummary.title = elements.focusedAssetSummary.textContent
  elements.toggleProjectPick.disabled = !enabled
  elements.toggleProjectPick.setAttribute('aria-pressed', String(Boolean(judgment.projectPick)))
  elements.toggleProjectPick.textContent = 'Project Pick'
  elements.toggleProjectPick.title = judgment.projectPick ? 'Remove Project Pick' : 'Mark as Project Pick'
  elements.toggleProjectPick.setAttribute('aria-label', elements.toggleProjectPick.title)
  elements.projectRating.disabled = !enabled
  elements.projectRating.value = String(judgment.rating)
  elements.projectReview.disabled = !enabled
  elements.projectReview.value = judgment.review
  elements.previewMedia.disabled = !enabled
  elements.shortlistMedia.disabled = !enabled
  elements.assignPrimaryMedia.disabled = !enabled || !hasAssignableSlot || alreadyAssigned
  elements.assignPrimaryMedia.textContent = targetSlot
    ? alreadyAssigned
      ? `${targetLabel} selected`
      : `${targetSlot.selected ? 'Replace' : 'Use as'} ${targetLabel}`
    : 'No Primary requested'
  elements.assignPrimaryMedia.title = targetSlot
    ? `${targetSlot.selected ? 'Replace' : 'Assign to'} ${slotDisplayName(targetSlot)}`
    : 'This Slide has no media slots'
  elements.assignPrimaryMedia.setAttribute('aria-label', elements.assignPrimaryMedia.title)
  elements.alternateMedia.disabled = !enabled
  elements.rejectSlideMedia.disabled = !enabled
  elements.clearSlideMedia.disabled = !enabled || !decision || decision.state === 'considered'
  elements.shortlistMedia.setAttribute('aria-pressed', String(decision?.state === 'shortlisted'))
  elements.alternateMedia.setAttribute('aria-pressed', String(decision?.state === 'alternate'))
  elements.rejectSlideMedia.setAttribute('aria-pressed', String(decision?.state === 'rejected-for-slide'))
  const compared = asset ? curateCompareIds.includes(asset.id) : false
  elements.toggleCompareMedia.disabled = !enabled || (!compared && curateCompareIds.length >= CURATE_COMPARE_LIMIT)
  elements.toggleCompareMedia.setAttribute('aria-pressed', String(compared))
  elements.toggleCompareMedia.textContent = 'Compare choice'
  elements.toggleCompareMedia.title = compared ? 'Remove from Compare' : 'Add to Compare'
  elements.toggleCompareMedia.setAttribute('aria-label', elements.toggleCompareMedia.title)
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
  elements.curateBack.disabled = !projection
  elements.curateNext.disabled = !projection
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
  const scaledCardFloor = Math.max(density, Math.round(120 * interfaceScale))
  const columns = Math.max(1, Math.floor((viewportWidth - CURATE_MEDIA_GAP) / (scaledCardFloor + CURATE_MEDIA_GAP)))
  const cardWidth = Math.max(120, Math.floor((viewportWidth - CURATE_MEDIA_GAP * (columns + 1)) / columns))
  const cardChromeHeight = Math.max(112, Math.round(128 * interfaceScale))
  const cardHeight = Math.round(density * 0.7) + cardChromeHeight
  const rowHeight = cardHeight + CURATE_MEDIA_GAP
  const window = calculateCurateVirtualWindow({
    total: assetCount,
    scrollTop: elements.mediaScroll.scrollTop,
    viewportHeight: elements.mediaScroll.clientHeight,
    rowHeight,
    columns,
    overscanRows: CURATE_MEDIA_OVERSCAN_ROWS,
  })
  return Object.freeze({ total: assetCount, viewportWidth, density, columns, cardWidth, cardHeight, rowHeight, ...window })
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
    curateCompareIds.includes(asset.id),
  ])
}

function positionCurateMediaCard(card, index, metrics) {
  const row = Math.floor(index / metrics.columns)
  const column = index % metrics.columns
  card.setAttribute('aria-posinset', String(index + 1))
  card.setAttribute('aria-setsize', String(metrics.total))
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
  card.setAttribute('role', 'option')
  const signature = curateMediaCardRenderSignature(asset)
  if (card.dataset.renderSignature === signature) return card
  card.dataset.renderSignature = signature
  const decision = curateDecisionForAsset(asset.id)
  const judgment = curateJudgmentForAsset(asset.id)
  const compared = curateCompareIds.includes(asset.id)
  const stateText = mediaAssetStateText(asset)
  const descriptors = [
    asset.mediaKind,
    asset.availability,
    asset.displayPath,
    judgment.rating ? `Rating ${judgment.rating} of 5` : '',
    judgment.review !== 'unreviewed' ? `Project review ${judgment.review}` : '',
    judgment.projectPick ? 'Project Pick' : '',
    decision?.state ? `Slide decision ${String(decision.state).replaceAll('-', ' ')}` : '',
    compared ? 'Selected for Compare' : '',
  ]
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
  if (judgment.rating) badges.append(curateMediaBadge(`${judgment.rating}/5`, 'project'))
  if (judgment.review !== 'unreviewed') badges.append(curateMediaBadge(judgment.review, 'project'))
  if (judgment.projectPick) badges.append(curateMediaBadge('Pick', 'project'))
  if (compared) badges.append(curateMediaBadge('Compare', 'compare'))
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
    const active = card.dataset.assetId === curateFocusedMediaId
    card.dataset.active = String(active)
    card.setAttribute('aria-selected', String(active))
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
  else if (!curateRoots.length) message = 'Choose a project media folder to begin.'
  else if (!assets.length && curateAssets.length) message = 'No matching media in the loaded catalogue pages.'
  else if (!assets.length) message = 'No media is available from the selected Root.'
  else if (curateMediaNextOffset !== null) {
    message = `${assets.length} matching in ${curateAssets.length} loaded of ${curateMediaTotal} total${hasClientFilter ? ' · filters apply to loaded pages' : ''}.`
  } else message = `${assets.length} matching Assets.`
  const action = !curateMediaLoading && curateMediaError
    ? 'retry'
    : !curateMediaLoading && curateMediaNextOffset !== null
      ? 'more'
      : ''
  const signature = `${message}\u001f${action}`
  if (elements.mediaWallState.dataset.signature === signature) return
  elements.mediaWallState.dataset.signature = signature
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
  elements.mediaFocusOwner.tabIndex = assets.length ? 0 : -1
  if (curateFocusedMediaId && !assets.some((asset) => asset.id === curateFocusedMediaId)) {
    curateFocusedMediaId = assets[0]?.id ?? null
  }
  if (!curateFocusedMediaId && assets.length) curateFocusedMediaId = assets[0].id
  const metrics = curateVirtualMetrics(assets.length)
  elements.mediaCanvas.style.height = `${Math.max(elements.mediaScroll.clientHeight, metrics.rowCount * metrics.rowHeight + CURATE_MEDIA_GAP)}px`
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
  elements.mediaFocusOwner.textContent = focusedAsset
    ? `${focusedAsset.label}. Arrow keys navigate; Space previews; S shortlists; M assigns.`
    : 'No media loaded'
  const mediaCount = curateMediaNextOffset === null
    ? `${assets.length} Assets`
    : `${assets.length} shown · ${curateAssets.length}/${curateMediaTotal} loaded`
  if (elements.mediaCount.textContent !== mediaCount) elements.mediaCount.textContent = mediaCount
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
  if (curateVirtualFrame) return
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
  return setProjectJudgmentForAsset(asset?.id, patch, sourceLabel)
}

async function setProjectJudgmentForAsset(assetId, patch, sourceLabel = 'Set project Asset judgment') {
  const asset = curateAssetById(assetId)
  if (!asset || !projection) return null
  const judgment = { ...curateJudgmentForAsset(asset.id), ...patch }
  return executeCurateCommand('curate.projectJudgment.set', {
    assetReferenceId: asset.id,
    ...payloadAssetReference(asset),
    judgment,
  }, sourceLabel, [asset.id])
}

async function setFocusedSlideDecision(decision, sourceLabel) {
  const asset = selectedCurateAsset()
  return setSlideDecisionForAsset(asset?.id, decision, sourceLabel)
}

async function setSlideDecisionForAsset(assetId, decision, sourceLabel) {
  const asset = curateAssetById(assetId)
  if (!asset || !projection || !selectedSlideId) return null
  return executeCurateCommand('curate.slideDecision.set', {
    slideId: selectedSlideId,
    assetReferenceId: asset.id,
    ...payloadAssetReference(asset),
    decision,
  }, sourceLabel, [asset.id])
}

async function assignFocusedAsset() {
  const asset = selectedCurateAsset()
  return assignAssetForCurrentSlide(asset?.id)
}

async function assignAssetForCurrentSlide(assetId) {
  const asset = curateAssetById(assetId)
  const slot = curateAssignmentTargetSlot()
  if (!asset || !slot) {
    setCurateLiveStatus('This Slide does not request Primary media. Change its Visual Style in Plan first.')
    return false
  }
  if (slot.selected?.assetReferenceId === asset?.id) {
    setCurateLiveStatus(`${asset.label} is already ${slotDisplayName(slot)}.`)
    return true
  }
  const decision = { state: 'selected', slotKey: slot.key }
  if (!slot.selected) decision.mediaAssignmentId = crypto.randomUUID()
  return Boolean(await setSlideDecisionForAsset(asset.id, decision, `Assign Asset to ${slotDisplayName(slot)}`))
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

function curatePreviewAssetIds() {
  return [...new Set([
    ...filteredCurateAssets().map((asset) => asset.id),
    ...(curateSlideProjection?.slots ?? []).map((slot) => slot.selected?.assetReferenceId),
    ...(curateSlideProjection?.decisions ?? []).map((entry) => entry.assetReferenceId),
    ...curateProjectPicksProjection.map((entry) => entry.assetReferenceId),
  ].filter(Boolean))]
}

function selectedCuratePreviewAsset() {
  return curateAssetById(curatePreviewMediaId)
}

function renderCuratePreview() {
  const asset = selectedCuratePreviewAsset()
  if (!asset) return false
  elements.previewMediaTitle.textContent = asset.label
  elements.previewMediaDetails.innerHTML = curateAssetDetailsMarkup(asset)
  elements.previewMediaImage.hidden = true
  elements.previewMediaImage.removeAttribute('src')
  const url = curatePreviewRenditionUrl(asset)
  if (url) {
    elements.previewMediaImage.alt = `Preview of ${asset.label}`
    elements.previewMediaImage.src = url
    elements.previewMediaImage.hidden = false
    elements.previewCapabilityState.textContent = asset.renditions.previewStandard
      ? 'Local preview rendition.'
      : 'Local thumbnail rendition.'
  } else {
    elements.previewCapabilityState.textContent = `${mediaAssetStateText(asset) || 'Preview unavailable'}. The catalogue descriptor remains usable.`
  }
  elements.previewCapabilityState.hidden = false

  const previewIds = curatePreviewAssetIds()
  const index = previewIds.indexOf(asset.id)
  elements.previewMediaPrevious.disabled = curatePreviewActionPending || previewIds.length < 2 || index < 0
  elements.previewMediaNext.disabled = curatePreviewActionPending || previewIds.length < 2 || index < 0

  const judgment = curateJudgmentForAsset(asset.id)
  for (const button of elements.previewRating.querySelectorAll('[data-preview-rating]')) {
    const rating = Number(button.dataset.previewRating)
    button.disabled = curateAssignmentPending || curatePreviewActionPending
    button.setAttribute('aria-pressed', String(judgment.rating === rating))
  }
  elements.previewProjectPick.disabled = curateAssignmentPending || curatePreviewActionPending
  elements.previewProjectPick.setAttribute('aria-pressed', String(judgment.projectPick))
  elements.previewProjectPick.textContent = judgment.projectPick ? 'Project Pick ✓' : 'Project Pick'

  const decision = curateDecisionForAsset(asset.id)
  elements.previewShortlist.disabled = curateAssignmentPending || curatePreviewActionPending
  elements.previewAlternate.disabled = curateAssignmentPending || curatePreviewActionPending
  elements.previewShortlist.setAttribute('aria-pressed', String(decision?.state === 'shortlisted'))
  elements.previewAlternate.setAttribute('aria-pressed', String(decision?.state === 'alternate'))

  elements.previewAssign.disabled = curateAssignmentPending || curatePreviewActionPending
  elements.previewAssign.textContent = 'Assign to Slide…'
  return true
}

function openFocusedPreview(assetId = curateFocusedMediaId) {
  const asset = curateAssetById(assetId)
  if (!asset) return false
  curatePreviewMediaId = asset.id
  renderCuratePreview()
  if (!elements.mediaPreview.open) elements.mediaPreview.showModal()
  return true
}

function moveCuratePreview(delta) {
  if (curateAssignmentPending || curatePreviewActionPending) return false
  const ids = curatePreviewAssetIds()
  if (ids.length < 2) return false
  const current = Math.max(0, ids.indexOf(curatePreviewMediaId))
  curatePreviewMediaId = ids[(current + delta + ids.length) % ids.length]
  if (curateAssets.some((asset) => asset.id === curatePreviewMediaId)) {
    focusCurateAsset(curatePreviewMediaId, { focus: false })
  }
  return renderCuratePreview()
}

async function setCuratePreviewRating(rating) {
  const assetId = curatePreviewMediaId
  if (!assetId || curateAssignmentPending || curatePreviewActionPending) return false
  if (curateJudgmentForAsset(assetId).rating === rating) return true
  curatePreviewActionPending = true
  renderCuratePreview()
  try {
    return Boolean(await setProjectJudgmentForAsset(assetId, { rating }, 'Set project Asset rating'))
  } finally {
    curatePreviewActionPending = false
    if (elements.mediaPreview.open) renderCuratePreview()
  }
}

async function toggleCuratePreviewProjectPick() {
  const assetId = curatePreviewMediaId
  if (!assetId || curateAssignmentPending || curatePreviewActionPending) return false
  const judgment = curateJudgmentForAsset(assetId)
  curatePreviewActionPending = true
  renderCuratePreview()
  try {
    return Boolean(await setProjectJudgmentForAsset(assetId, { projectPick: !judgment.projectPick }, 'Toggle Project Pick'))
  } finally {
    curatePreviewActionPending = false
    if (elements.mediaPreview.open) renderCuratePreview()
  }
}

async function toggleCuratePreviewDecision(state) {
  const assetId = curatePreviewMediaId
  if (!assetId || curateAssignmentPending || curatePreviewActionPending) return false
  const decision = curateDecisionForAsset(assetId)
  const nextState = decision?.state === state ? 'considered' : state
  const label = state === 'shortlisted' ? 'Shortlist Asset for Slide' : 'Add Slide Alternate'
  curatePreviewActionPending = true
  renderCuratePreview()
  try {
    return Boolean(await setSlideDecisionForAsset(assetId, { state: nextState }, label))
  } finally {
    curatePreviewActionPending = false
    if (elements.mediaPreview.open) renderCuratePreview()
  }
}

async function assignCuratePreviewAsset() {
  const assetId = curatePreviewMediaId
  if (!assetId || curateAssignmentPending || curatePreviewActionPending) return false
  return openCurateAssignmentChooser(assetId)
}

function handleCuratePreviewKeydown(event) {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveCuratePreview(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveCuratePreview(1)
  } else if (/^[0-5]$/.test(event.key)) {
    event.preventDefault()
    void setCuratePreviewRating(Number(event.key))
  }
}

function assignmentTargetRecords() {
  return planRecords().filter((record) => record.metadata.lifecycle === 'included')
}

async function queryCurateAssignmentTargets(expectedRevision, generation) {
  const records = assignmentTargetRecords()
  const queueBySlideId = new Map(curateQueueProjection.map((item) => [item.slideId, item]))
  const targets = []
  for (let index = 0; index < records.length; index += 8) {
    const batch = records.slice(index, index + 8)
    const results = await Promise.all(batch.map(async (record) => {
      const queueItem = queueBySlideId.get(record.slide.id)
      if (Array.isArray(queueItem?.slots)) {
        return { revision: expectedRevision, slots: queueItem.slots }
      }
      return window.deckBridge.query({ name: 'curate.slide', params: { slideId: record.slide.id } })
    }))
    if (
      generation !== curateAssignmentTargetGeneration
      || projection?.revision !== expectedRevision
    ) throw curateNamedError('CurateSnapshotChanged', 'Curate assignment targets changed while loading')
    for (let offset = 0; offset < batch.length; offset += 1) {
      const result = results[offset]
      if (result?.revision !== expectedRevision) {
        throw curateNamedError('CurateSnapshotChanged', 'Curate assignment targets changed while loading')
      }
      targets.push({ record: batch[offset], slideId: batch[offset].slide.id, slots: result?.slots ?? [] })
    }
  }
  return targets
}

function renderCurateAssignmentTargets(assetId, targets = curateAssignmentTargets) {
  elements.mediaAssignmentTargets.replaceChildren()
  const asset = curateAssetById(assetId)
  if (!asset) {
    elements.mediaAssignmentTargets.append(createCurateTrayEmpty('Asset unavailable', 'Choose another image.'))
    return
  }
  let targetCount = 0
  for (const target of targets) {
    if (!target.slots.length) continue
    const section = document.createElement('section')
    section.className = 'media-assignment-slide'
    const heading = document.createElement('h3')
    heading.textContent = target.record.metadata.internalTitle || 'Untitled Slide'
    const part = document.createElement('p')
    part.textContent = target.record.section.title
    section.append(heading, part)
    const selectedSlot = target.slots.find((slot) => slot.selected?.assetReferenceId === assetId)
    for (const slot of target.slots) {
      targetCount += 1
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.assignmentSlideId = target.slideId
      button.dataset.assignmentSlotKey = slot.key
      const slotName = slotDisplayName(slot, target.record)
      const occupant = slot.selected
      if (selectedSlot) {
        button.disabled = true
        button.textContent = selectedSlot.key === slot.key
          ? `Already ${slotName}`
          : `Used as ${slotDisplayName(selectedSlot, target.record)}`
      } else if (occupant) {
        button.textContent = `Replace ${slotName} · ${durableAssetLabel(occupant.assetReferenceId, occupant.assetReference)}`
      } else {
        button.textContent = `Use as ${slotName}`
      }
      button.disabled = button.disabled || curateAssignmentPending
      section.append(button)
    }
    elements.mediaAssignmentTargets.append(section)
  }
  if (!targetCount) {
    elements.mediaAssignmentTargets.append(createCurateTrayEmpty('No media roles', 'Choose a Visual Style in Plan first.'))
  }
}

async function openCurateAssignmentChooser(assetId = curateFocusedMediaId) {
  if (curateAssignmentPending || curatePreviewActionPending) return false
  const asset = curateAssetById(assetId)
  if (!asset || !projection) return false
  elements.mediaContextMenu.hidden = true
  if (elements.mediaPreview.open) elements.mediaPreview.close()
  curateAssignmentAssetId = asset.id
  curateAssignmentTargets = []
  const generation = ++curateAssignmentTargetGeneration
  const expectedRevision = projection.revision
  elements.mediaAssignmentAsset.textContent = asset.label
  elements.mediaAssignmentTargets.replaceChildren(createCurateTrayEmpty('Loading Slides…', 'Finding every named media role.'))
  if (!elements.mediaAssignmentDialog.open) elements.mediaAssignmentDialog.showModal()
  try {
    const targets = await queryCurateAssignmentTargets(expectedRevision, generation)
    if (generation !== curateAssignmentTargetGeneration || curateAssignmentAssetId !== asset.id) return false
    curateAssignmentTargets = targets
    renderCurateAssignmentTargets(asset.id)
    return true
  } catch (error) {
    if (generation !== curateAssignmentTargetGeneration) return false
    elements.mediaAssignmentTargets.replaceChildren(createCurateTrayEmpty('Assignments unavailable', error.message))
    return false
  }
}

async function assignCurateAssetToTarget(slideId, slotKey) {
  const asset = curateAssetById(curateAssignmentAssetId)
  const target = curateAssignmentTargets.find((candidate) => candidate.slideId === slideId)
  const slot = target?.slots.find((candidate) => candidate.key === slotKey)
  if (!asset || !slot || !projection || curateAssignmentPending) return false
  const decision = { state: 'selected', slotKey: slot.key }
  if (!slot.selected) decision.mediaAssignmentId = crypto.randomUUID()
  curateAssignmentPending = true
  renderCurateAssignmentTargets(asset.id)
  const currentSlideId = selectedSlideId
  try {
    const result = await executeStructural(
      'curate.slideDecision.set',
      {
        slideId,
        assetReferenceId: asset.id,
        ...payloadAssetReference(asset),
        decision,
      },
      currentSlideId,
      {
        sourceLabel: `Assign Asset to ${slotDisplayName(slot, target.record)}`,
        preserveCurrentSelection: true,
      },
    )
    if (!result) return false
    if (elements.mediaAssignmentDialog.open) elements.mediaAssignmentDialog.close()
    setCurateLiveStatus(`${asset.label} assigned to ${target.record.metadata.internalTitle} · ${slotDisplayName(slot, target.record)}.`)
    return true
  } finally {
    curateAssignmentPending = false
    if (elements.mediaAssignmentDialog.open) renderCurateAssignmentTargets(asset.id)
  }
}

function renderCurateCompare() {
  elements.compareMediaGrid.replaceChildren()
  for (const assetId of curateCompareIds) {
    const asset = curateAssetById(assetId)
    if (!asset) continue
    const card = document.createElement('article')
    card.className = 'compare-card'
    const titleId = `compare-title-${curateDomToken(asset.id)}`
    card.setAttribute('aria-labelledby', titleId)
    const thumb = document.createElement('div')
    thumb.className = 'media-thumb'
    appendCurateThumbnail(thumb, asset, `Preview of ${asset.label}`)
    const footer = document.createElement('footer')
    const title = document.createElement('h3')
    title.id = titleId
    title.textContent = asset.label
    const detail = document.createElement('small')
    detail.textContent = `${asset.mediaKind} · ${asset.availability} · ${asset.displayPath}`
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.dataset.removeCompareId = asset.id
    remove.textContent = 'Remove'
    remove.setAttribute('aria-label', `Remove ${asset.label} from Compare`)
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
  if (elements?.mediaAssignmentDialog?.open) elements.mediaAssignmentDialog.close()
  if (elements?.mediaContextMenu) elements.mediaContextMenu.hidden = true
  if (elements?.projectMediaJudgment?.open) elements.projectMediaJudgment.open = false
  if (elements?.findMorePanel?.open) elements.findMorePanel.open = false
  curatePreviewMediaId = null
  curateAssignmentAssetId = null
  curateAssignmentTargets = []
  curateAssignmentTargetGeneration += 1
}

function restoreCurateMediaFocus() {
  if (activePhase === 'curate' && curateFocusedMediaId) focusCurateAsset(curateFocusedMediaId)
}

async function executeMediaRootCommand(type, payload, sourceLabel) {
  if (!projection) return false
  const operationDeckId = projection.deckId
  const operationRefreshGeneration = refreshGeneration
  setBusy(`${sourceLabel}…`)
  try {
    const result = await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: 'ui', label: sourceLabel },
        issuedAt: new Date().toISOString(),
      },
    })
    if (!projection || projection.deckId !== operationDeckId) return false
    const targetSlideId = pendingWorkspaceSlideId ?? selectedSlideId
    const viewChangedDuringOperation = refreshGeneration !== operationRefreshGeneration
    const refreshed = await refreshWorkspace(targetSlideId)
    if (!refreshed || projection?.deckId !== operationDeckId) return false
    if (!viewChangedDuringOperation) setCurateLiveStatus(`${sourceLabel} complete.`)
    return { result, refreshed }
  } catch (error) {
    if (!projection || projection.deckId !== operationDeckId) return false
    renderAll()
    setCurateLiveStatus(`${error.name ?? 'Error'}: ${error.message}`)
    return false
  }
}

async function authoriseCurateMediaRoot() {
  const completed = await executeMediaRootCommand('media.root.authorize', {}, 'Authorise Media Root')
  const rootId = completed?.result?.media?.root?.id
  if (!rootId || ![...elements.mediaRootFilter.options].some((option) => option.value === rootId)) return Boolean(completed)
  elements.mediaRootFilter.value = rootId
  renderCurateRootControls()
  const root = selectedCurateRoot()
  if (root?.availability === 'available' && root.assetCount === 0) {
    return scanSelectedCurateRoot({ automatic: true })
  }
  scheduleCurateMediaReset({ message: 'Media folder connected. Loading its images…' })
  return true
}

async function scanSelectedCurateRoot({ automatic = false } = {}) {
  const root = selectedCurateRoot()
  if (!root) {
    scheduleCurateMediaReset({ message: 'Loading media catalogue…' })
    return false
  }
  if (root.availability !== 'available') {
    scheduleCurateMediaReset({ message: `Loading ${root.label} catalogue…` })
    return false
  }
  resetCurateMediaCatalog(`Scanning ${root.label}…`)
  renderCurateMediaWall()
  const scanned = await executeMediaRootCommand('media.root.scan', { rootId: root.id }, automatic ? `Scan ${root.label}` : 'Scan Media Root')
  if (scanned && !curateMediaLoading && curateAssets.length === 0) {
    scheduleCurateMediaReset({ message: `Loading ${root.label} catalogue…` })
  }
  return scanned
}

async function saveCurateFindMore() {
  if (!projection || !selectedSlideId) return
  const targetSlideId = selectedSlideId
  const value = normalizedFindMoreValue({
    state: elements.findMoreState.value,
    existingPrimaryStatus: elements.findMorePrimaryStatus.value,
    brief: elements.findMoreBrief.value,
  })
  if (findMoreValuesEqual(value, curateSlideProjection?.findMoreMedia)) {
    curateFindMoreDrafts.delete(targetSlideId)
    updateWorkspaceDraftStatus()
    setCurateLiveStatus('No Find More Media changes')
    return true
  }
  const result = await executeCurateCommand('curate.findMore.set', {
    slideId: targetSlideId,
    value,
  }, 'Save Find More Media')
  if (result) {
    curateFindMoreDrafts.delete(targetSlideId)
    updateWorkspaceDraftStatus()
  }
}

async function saveAllCurateFindMoreDrafts() {
  const drafts = [...curateFindMoreDrafts.entries()].map(([slideId, value]) => [slideId, structuredClone(value)])
  let savedCount = 0
  for (const [slideId, value] of drafts) {
    const current = await window.deckBridge.query({ name: 'curate.slide', params: { slideId } })
    if (findMoreValuesEqual(value, current?.findMoreMedia)) {
      curateFindMoreDrafts.delete(slideId)
      continue
    }
    const result = await executeStructural('curate.findMore.set', { slideId, value }, selectedSlideId, {
      sourceLabel: 'Save Find More draft',
      preserveCurrentSelection: true,
    })
    if (!result) {
      await enterPhaseForSlide('curate', slideId)
      elements.findMorePanel.open = true
      positionCurateDisclosure(elements.findMorePanel)
      elements.findMoreBrief.focus({ preventScroll: true })
      return { saved: false, count: savedCount }
    }
    curateFindMoreDrafts.delete(slideId)
    savedCount += 1
  }
  if (activePhase === 'curate') renderCurateBrief()
  updateWorkspaceDraftStatus()
  return { saved: true, count: savedCount }
}

function unresolvedCurateSlideIds() {
  const stateBySlideId = new Map(curateQueueProjection.map((item) => [item.slideId, item]))
  return planRecords()
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
  const ids = planRecords()
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
      || (action === 'assign' && !curateQueueProjection.some((item) => Number(item.requiredSlotCount ?? 0) > 0))
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
  if (action === 'assign') {
    await openCurateAssignmentChooser()
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

function curateDisclosurePanel(details) {
  return details === elements.projectMediaJudgment
    ? details.querySelector('.project-media-actions')
    : details.querySelector('.find-more-form')
}

function positionCurateDisclosure(details) {
  if (!details?.open) {
    if (details) delete details.dataset.disclosurePositioned
    return false
  }
  const trigger = details.querySelector(':scope > summary')
  const panel = curateDisclosurePanel(details)
  if (!trigger || !panel) return false
  const margin = 8
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const gap = Math.max(6, rootSize * 0.35)
  const triggerRect = trigger.getBoundingClientRect()
  const above = Math.max(0, triggerRect.top - margin - gap)
  const below = Math.max(0, window.innerHeight - triggerRect.bottom - margin - gap)
  const naturalHeight = Math.min(panel.scrollHeight, window.innerHeight - (margin * 2))
  const opensAbove = above >= naturalHeight || above >= below
  const availableHeight = Math.max(1, opensAbove ? above : below)
  panel.style.maxHeight = `${availableHeight}px`
  const panelRect = panel.getBoundingClientRect()
  const alignEnd = details === elements.findMorePanel
  const preferredLeft = alignEnd ? triggerRect.right - panelRect.width : triggerRect.left
  const left = Math.min(
    window.innerWidth - panelRect.width - margin,
    Math.max(margin, preferredLeft),
  )
  const preferredTop = opensAbove
    ? triggerRect.top - gap - panelRect.height
    : triggerRect.bottom + gap
  const top = Math.min(
    window.innerHeight - panelRect.height - margin,
    Math.max(margin, preferredTop),
  )
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
  panel.style.setProperty('--disclosure-origin', opensAbove
    ? `bottom ${alignEnd ? 'right' : 'left'}`
    : `top ${alignEnd ? 'right' : 'left'}`)
  panel.style.setProperty('--disclosure-enter-y', opensAbove ? '0.35rem' : '-0.35rem')
  details.dataset.disclosurePlacement = opensAbove ? 'above' : 'below'
  details.dataset.disclosurePositioned = 'true'
  return true
}

function positionOpenCurateDisclosures() {
  positionCurateDisclosure(elements.projectMediaJudgment)
  positionCurateDisclosure(elements.findMorePanel)
}

function handleCurateViewportScroll(event) {
  const projectPanel = curateDisclosurePanel(elements.projectMediaJudgment)
  const findMorePanel = curateDisclosurePanel(elements.findMorePanel)
  if (projectPanel?.contains(event.target) || findMorePanel?.contains(event.target)) return
  positionOpenCurateDisclosures()
}

function bindCurateDisclosure(details, otherDetails) {
  const trigger = details.querySelector(':scope > summary')
  const panel = curateDisclosurePanel(details)
  trigger.addEventListener('click', (event) => {
    if (event.detail > 0 && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      details.dataset.pointerToggle = 'true'
    }
  })
  details.addEventListener('toggle', () => {
    const pointerOpening = details.dataset.pointerToggle === 'true'
    delete details.dataset.pointerToggle
    details.classList.remove('is-pointer-opening')
    if (!details.open) {
      delete details.dataset.disclosurePositioned
      delete details.dataset.disclosurePlacement
      return
    }
    otherDetails.open = false
    positionCurateDisclosure(details)
    if (pointerOpening && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      details.classList.add('is-pointer-opening')
      panel.addEventListener('animationend', () => details.classList.remove('is-pointer-opening'), { once: true })
    }
  })
}

function bindCurateEvents() {
  bindCurateDisclosure(elements.projectMediaJudgment, elements.findMorePanel)
  bindCurateDisclosure(elements.findMorePanel, elements.projectMediaJudgment)
  elements.curateBack.addEventListener('click', () => void enterPhaseForSlide('plan'))
  elements.curateNext.addEventListener('click', () => void enterPhaseForSlide('assemble'))
  elements.curateQueueFilters.forEach((button) => button.addEventListener('click', () => {
    curateQueueFilter = button.dataset.curateQueueFilter
    renderCurateQueue()
  }))
  elements.nextCurateIssue.addEventListener('click', () => void moveToNextCurateIssue())
  elements.curateSlideQueue.addEventListener('click', (event) => {
    const button = event.target.closest('[data-curate-slide-id]')
    if (!button) return
    const slideId = button.dataset.curateSlideId
    void enterPhaseForSlide('curate', slideId).then((entered) => {
      if (!entered || activePhase !== 'curate') return
      elements.curateSlideQueue
        .querySelector(`[data-curate-slide-id="${CSS.escape(slideId)}"]`)
        ?.focus({ preventScroll: true })
    })
  })

  elements.mediaSearch.addEventListener('input', () => {
    scheduleCurateMediaReset({ delay: 180, message: 'Search changed. Loading matching media…' })
  })
  elements.mediaRootFilter.addEventListener('change', () => {
    const root = selectedCurateRoot()
    const needsInitialScan = root
      && root.availability === 'available'
      && root.assetCount === 0
    if (needsInitialScan) void scanSelectedCurateRoot({ automatic: true })
    else scheduleCurateMediaReset({ message: 'Media Root changed. Loading catalogue…' })
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
    void assignFocusedAsset()
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
  elements.previewMedia.addEventListener('click', () => openFocusedPreview())
  elements.shortlistMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'shortlisted' }, 'Shortlist Asset for Slide'))
  elements.assignPrimaryMedia.addEventListener('click', assignFocusedAsset)
  elements.alternateMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'alternate' }, 'Add Slide Alternate'))
  elements.rejectSlideMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'rejected-for-slide' }, 'Reject Asset for current Slide'))
  elements.clearSlideMedia.addEventListener('click', () => void setFocusedSlideDecision({ state: 'considered' }, 'Clear current-Slide Asset decision'))
  elements.toggleCompareMedia.addEventListener('click', toggleFocusedCompare)
  elements.openMediaCompare.addEventListener('click', openCurateCompare)

  elements.authoriseMediaRoot.addEventListener('click', () => void authoriseCurateMediaRoot())
  elements.reconnectMediaRoot.addEventListener('click', () => {
    const root = selectedCurateRoot()
    if (root) void executeMediaRootCommand('media.root.reconnect', { rootId: root.id }, 'Reconnect Media Root')
  })
  elements.scanMediaRoot.addEventListener('click', () => {
    void scanSelectedCurateRoot()
  })
  elements.revealMediaSource.addEventListener('click', () => setCurateLiveStatus('Source reveal is not exposed to the renderer in this gate.'))

  for (const control of [elements.findMoreState, elements.findMorePrimaryStatus, elements.findMoreBrief]) {
    control.addEventListener('input', () => {
      if (selectedSlideId) {
        const value = normalizedFindMoreValue({
          state: elements.findMoreState.value,
          existingPrimaryStatus: elements.findMorePrimaryStatus.value,
          brief: elements.findMoreBrief.value,
        })
        if (findMoreValuesEqual(value, curateSlideProjection?.findMoreMedia)) {
          curateFindMoreDrafts.delete(selectedSlideId)
        } else {
          curateFindMoreDrafts.set(selectedSlideId, value)
        }
        elements.saveFindMore.disabled = !curateFindMoreDrafts.has(selectedSlideId)
      }
      elements.findMoreSummary.textContent = String(elements.findMoreState.value).replaceAll('-', ' ')
      updateWorkspaceDraftStatus()
    })
  }
  elements.findMoreForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveCurateFindMore()
  })
  for (const tray of [elements.primaryTray, elements.projectPickTray, elements.alternateTray, elements.shortlistTray, elements.unplacedTray]) {
    tray.addEventListener('click', (event) => {
      const slot = event.target.closest('[data-slot-key]')
      if (slot) {
        curateTargetSlotKey = slot.dataset.slotKey
        renderCurateTrays()
        elements.primaryTray
          .querySelector(`[data-slot-key="${CSS.escape(curateTargetSlotKey)}"]`)
          ?.focus({ preventScroll: true })
        renderCurateActions()
      }
      const assetButton = event.target.closest('[data-tray-asset-id]')
      if (assetButton && !focusCurateAsset(assetButton.dataset.trayAssetId)) {
        openFocusedPreview(assetButton.dataset.trayAssetId)
      }
    })
  }

  elements.previewMediaImage.addEventListener('error', () => {
    elements.previewMediaImage.hidden = true
    elements.previewMediaImage.removeAttribute('src')
    elements.previewCapabilityState.textContent = 'Preview failed. The catalogue descriptor remains usable.'
  })
  elements.previewMediaImage.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (curatePreviewMediaId && !curateAssignmentPending && !curatePreviewActionPending) {
      void openCurateAssignmentChooser(curatePreviewMediaId)
    }
  })
  elements.previewMediaPrevious.addEventListener('click', () => moveCuratePreview(-1))
  elements.previewMediaNext.addEventListener('click', () => moveCuratePreview(1))
  elements.previewRating.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-rating]')
    if (button) void setCuratePreviewRating(Number(button.dataset.previewRating))
  })
  elements.previewProjectPick.addEventListener('click', () => void toggleCuratePreviewProjectPick())
  elements.previewShortlist.addEventListener('click', () => void toggleCuratePreviewDecision('shortlisted'))
  elements.previewAlternate.addEventListener('click', () => void toggleCuratePreviewDecision('alternate'))
  elements.previewAssign.addEventListener('click', () => void assignCuratePreviewAsset())
  elements.mediaPreview.addEventListener('keydown', handleCuratePreviewKeydown)
  elements.mediaPreview.addEventListener('close', () => {
    curatePreviewMediaId = null
    restoreCurateMediaFocus()
  })
  elements.mediaCompare.addEventListener('close', restoreCurateMediaFocus)
  elements.compareMediaGrid.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-compare-id]')
    if (!remove) return
    const priorIndex = curateCompareIds.indexOf(remove.dataset.removeCompareId)
    curateCompareIds = curateCompareIds.filter((id) => id !== remove.dataset.removeCompareId)
    renderCurateCompare()
    renderCurateActions()
    if (curateCompareIds.length < 2 && elements.mediaCompare.open) {
      elements.mediaCompare.close()
    } else {
      const successors = [...elements.compareMediaGrid.querySelectorAll('[data-remove-compare-id]')]
      successors[Math.min(priorIndex, successors.length - 1)]?.focus({ preventScroll: true })
    }
  })
  elements.mediaContextMenu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-media-context-action]')?.dataset.mediaContextAction
    if (action) void runCurateContextAction(action)
  })
  elements.mediaContextMenu.addEventListener('keydown', handleCurateContextMenuKeydown)
  elements.mediaAssignmentTargets.addEventListener('click', (event) => {
    const button = event.target.closest('[data-assignment-slide-id][data-assignment-slot-key]')
    if (!button || button.disabled) return
    void assignCurateAssetToTarget(button.dataset.assignmentSlideId, button.dataset.assignmentSlotKey)
  })
  elements.mediaAssignmentDialog.addEventListener('close', () => {
    curateAssignmentAssetId = null
    curateAssignmentTargets = []
    curateAssignmentTargetGeneration += 1
    restoreCurateMediaFocus()
  })
  document.addEventListener('pointerdown', (event) => {
    if (!elements.mediaContextMenu.hidden && !elements.mediaContextMenu.contains(event.target)) {
      elements.mediaContextMenu.hidden = true
    }
    if (elements.projectMediaJudgment.open && !elements.projectMediaJudgment.contains(event.target)) {
      elements.projectMediaJudgment.open = false
    }
    if (elements.findMorePanel.open && !elements.findMorePanel.contains(event.target)) {
      elements.findMorePanel.open = false
    }
  }, true)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (elements.projectMediaJudgment.open) {
      elements.projectMediaJudgment.open = false
      elements.projectMediaSummary.focus({ preventScroll: true })
    } else if (elements.findMorePanel.open) {
      elements.findMorePanel.open = false
      elements.findMoreSummaryTrigger.focus({ preventScroll: true })
    }
  })
  document.addEventListener('scroll', handleCurateViewportScroll, true)
  window.addEventListener('resize', positionOpenCurateDisclosures)
  window.addEventListener('blur', () => { elements.mediaContextMenu.hidden = true })

  if ('ResizeObserver' in window) {
    curateResizeObserver = new ResizeObserver(scheduleCurateVirtualRender)
    curateResizeObserver.observe(elements.mediaScroll)
  }
}
