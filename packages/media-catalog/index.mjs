const freeze = (value) => Object.freeze(value)

export const MEDIA_CATALOG_FORMAT = 'pitchdog.media-catalog'
export const MEDIA_CATALOG_VERSION = 1
export const MAX_MEDIA_QUERY_LIMIT = 250
export const MAX_MEDIA_QUERY_RESPONSE_BYTES = 1024 * 1024

export const MEDIA_KINDS = freeze(['image', 'gif', 'video'])
export const MEDIA_ORIENTATIONS = freeze(['landscape', 'portrait', 'square'])
export const ASSET_AVAILABILITIES = freeze(['available', 'missing', 'unreadable'])
export const ROOT_AVAILABILITIES = freeze(['available', 'offline_volume', 'needs_permission'])
export const PREVIEW_CAPABILITIES = freeze([
  'still-image',
  'animated-image',
  'video-poster',
  'unsupported',
])

const QUERY_SORT_FIELDS = freeze(['filename', 'folder', 'mediaKind', 'orientation', 'byteSize'])
const validatedCatalogs = new WeakSet()
const catalogQueryCaches = new WeakMap()
const MAX_CACHED_QUERIES_PER_CATALOG = 8

export class MediaCatalogError extends Error {
  constructor(name, message) {
    super(message)
    this.name = name
  }
}

export function createMediaCatalog({ deckId, catalogId, roots = [], idFactory } = {}) {
  const createId = resolvedIdFactory(idFactory)
  const nextDeckId = opaqueId(deckId, 'deckId')
  const nextCatalogId = catalogId === undefined ? createId('catalog') : opaqueId(catalogId, 'catalogId')
  const seenRoots = new Set()
  const canonicalRoots = roots.map((root, index) => {
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      invalid(`roots[${index}] must be an object`)
    }
    const id = opaqueId(root.id, `roots[${index}].id`)
    if (seenRoots.has(id)) invalid(`Duplicate Root identity: ${id}`)
    seenRoots.add(id)
    return {
      id,
      label: rootLabel(root.label ?? id, `roots[${index}].label`),
    }
  })

  return finalizeCatalog({
    format: MEDIA_CATALOG_FORMAT,
    version: MEDIA_CATALOG_VERSION,
    deckId: nextDeckId,
    catalogId: nextCatalogId,
    revision: 0,
    roots: canonicalRoots,
    sourceRevisions: [],
    assets: [],
  })
}

export function openMediaCatalog(input, { clone = true, expectedDeckId } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Media catalogue must be an object')
  if (validatedCatalogs.has(input)) {
    if (expectedDeckId !== undefined && input.deckId !== opaqueId(expectedDeckId, 'expectedDeckId')) {
      throw new MediaCatalogError('CatalogDeckMismatch', 'Media catalogue belongs to a different Deck')
    }
    return clone ? finalizeCatalog(structuredClone(input)) : input
  }
  if (input.format !== MEDIA_CATALOG_FORMAT || input.version !== MEDIA_CATALOG_VERSION) {
    throw new MediaCatalogError('UnsupportedSchema', 'Only pitchdog.media-catalog version 1 is supported')
  }
  const deckId = opaqueId(input.deckId, 'deckId')
  if (expectedDeckId !== undefined && deckId !== opaqueId(expectedDeckId, 'expectedDeckId')) {
    throw new MediaCatalogError('CatalogDeckMismatch', 'Media catalogue belongs to a different Deck')
  }
  const catalogId = opaqueId(input.catalogId, 'catalogId')
  const revision = nonNegativeInteger(input.revision, 'revision')
  if (!Array.isArray(input.roots) || !Array.isArray(input.sourceRevisions) || !Array.isArray(input.assets)) {
    invalid('Media catalogue roots, Source revisions and assets must be arrays')
  }

  const rootIds = new Set()
  const roots = []
  for (const [index, root] of input.roots.entries()) {
    if (!root || typeof root !== 'object' || Array.isArray(root)) invalid(`roots[${index}] must be an object`)
    const rootId = opaqueId(root.id, `roots[${index}].id`)
    if (rootIds.has(rootId)) invalid(`Duplicate Root identity: ${rootId}`)
    rootIds.add(rootId)
    roots.push({ id: rootId, label: rootLabel(root.label, `roots[${index}].label`) })
  }

  const assetIds = new Set()
  const locationIds = new Set()
  const sourceIds = new Set()
  const sourceRevisionIds = new Set()
  const sourceRevisions = []
  for (const [index, revisionEntry] of input.sourceRevisions.entries()) {
    if (!revisionEntry || typeof revisionEntry !== 'object' || Array.isArray(revisionEntry)) {
      invalid(`sourceRevisions[${index}] must be an object`)
    }
    const id = opaqueId(revisionEntry.id, `sourceRevisions[${index}].id`)
    unique(sourceRevisionIds, id, 'Source Revision')
    sourceRevisions.push({
      id,
      sourceId: opaqueId(revisionEntry.sourceId, `sourceRevisions[${index}].sourceId`),
      byteSize: nonNegativeInteger(revisionEntry.byteSize, `sourceRevisions[${index}].byteSize`),
      fingerprint: boundedString(revisionEntry.fingerprint, `sourceRevisions[${index}].fingerprint`, 500),
      mediaKind: enumValue(revisionEntry.mediaKind, MEDIA_KINDS, `sourceRevisions[${index}].mediaKind`),
    })
  }
  const sourceRevisionById = new Map(sourceRevisions.map((entry) => [entry.id, entry]))
  const paths = new Set()
  const assets = []
  for (const [index, asset] of input.assets.entries()) {
    validateAsset(asset, index, rootIds)
    unique(assetIds, asset.id, 'Asset')
    unique(locationIds, asset.locationId, 'Location')
    unique(sourceIds, asset.sourceId, 'Source')
    const revisionEntry = sourceRevisionById.get(asset.sourceRevisionId)
    if (!revisionEntry || revisionEntry.sourceId !== asset.sourceId) {
      invalid(`Asset references unknown or mismatched Source Revision: ${asset.sourceRevisionId}`)
    }
    const pathKey = `${asset.rootId}\u0000${asset.relativePath}`
    if (paths.has(pathKey)) invalid(`Duplicate Root-relative location: ${asset.rootId}/${asset.relativePath}`)
    paths.add(pathKey)
    assets.push(canonicalStoredAsset(asset))
  }
  for (const revisionEntry of sourceRevisions) {
    if (!sourceIds.has(revisionEntry.sourceId)) {
      invalid(`Source Revision references unknown Source: ${revisionEntry.sourceId}`)
    }
  }
  for (const asset of assets) {
    const current = sourceRevisionById.get(asset.sourceRevisionId)
    if (
      current.byteSize !== asset.byteSize
      || current.fingerprint !== asset.fingerprint
      || current.mediaKind !== asset.mediaKind
    ) {
      invalid(`Current Source Revision metadata does not match Asset: ${asset.id}`)
    }
  }
  const catalog = {
    format: MEDIA_CATALOG_FORMAT,
    version: MEDIA_CATALOG_VERSION,
    deckId,
    catalogId,
    revision,
    roots,
    sourceRevisions,
    assets,
  }
  return finalizeCatalog(clone ? catalog : catalog)
}

export function reconcileMediaScan(catalogInput, scan, { idFactory } = {}) {
  const catalog = openMediaCatalog(catalogInput)
  if (!scan || typeof scan !== 'object' || Array.isArray(scan)) invalid('scan must be an object')
  const rootId = opaqueId(scan.rootId, 'scan.rootId')
  if (!catalog.roots.some((root) => root.id === rootId)) {
    throw new MediaCatalogError('UnknownRoot', `Root does not exist: ${rootId}`)
  }
  if (!['completed', 'cancelled'].includes(scan.status)) invalid('scan.status must be completed or cancelled')
  if (scan.status === 'completed' && !Array.isArray(scan.observations)) invalid('A completed scan requires observations')
  if (scan.observations !== undefined && !Array.isArray(scan.observations)) invalid('scan.observations must be an array')

  const createId = resolvedIdFactory(idFactory, catalogIdentitySet(catalog))
  const observations = (scan.observations ?? []).map((observation, index) => canonicalObservation(observation, index))
  const incomingPaths = new Set()
  const incomingPlatformCounts = new Map()
  for (const observation of observations) {
    if (incomingPaths.has(observation.relativePath)) {
      invalid(`Completed scan contains duplicate relative path: ${observation.relativePath}`)
    }
    incomingPaths.add(observation.relativePath)
    if (observation.platformIdentity !== null) {
      const identityKey = platformIdentityKey(observation)
      incomingPlatformCounts.set(
        identityKey,
        (incomingPlatformCounts.get(identityKey) ?? 0) + 1,
      )
    }
  }

  const rootAssets = catalog.assets.filter((asset) => asset.rootId === rootId)
  const existingByPath = new Map(rootAssets.map((asset) => [asset.relativePath, asset]))
  const existingByPlatform = new Map()
  for (const asset of rootAssets) {
    if (asset.platformIdentity === null) continue
    const identityKey = platformIdentityKey(asset)
    const entries = existingByPlatform.get(identityKey) ?? []
    entries.push(asset)
    existingByPlatform.set(identityKey, entries)
  }

  const assets = catalog.assets.map((asset) => structuredClone(asset))
  const sourceRevisions = catalog.sourceRevisions.map((entry) => structuredClone(entry))
  const indexById = new Map(assets.map((asset, index) => [asset.id, index]))
  const seenExisting = new Set()
  let changed = false
  let created = 0
  let refreshed = 0
  let moved = 0
  let missing = 0
  let deferred = 0

  for (const observation of observations) {
    const samePath = existingByPath.get(observation.relativePath)
    if (samePath) {
      const refreshedAsset = refreshAsset(samePath, observation, createId)
      seenExisting.add(samePath.id)
      refreshed += 1
      if (!sameAsset(samePath, refreshedAsset)) {
        assets[indexById.get(samePath.id)] = refreshedAsset
        if (refreshedAsset.sourceRevisionId !== samePath.sourceRevisionId) {
          sourceRevisions.push(sourceRevisionFor(refreshedAsset))
        }
        changed = true
      }
      continue
    }

    const identityKey = observation.platformIdentity === null ? null : platformIdentityKey(observation)
    const platformMatches = identityKey === null
      ? []
      : existingByPlatform.get(identityKey) ?? []
    const couldBeStrictMove = platformMatches.length === 1
      && incomingPlatformCounts.get(identityKey) === 1
      && !incomingPaths.has(platformMatches[0].relativePath)
      && !seenExisting.has(platformMatches[0].id)
      && platformMatches[0].linkCount === 1
      && observation.linkCount === 1
      && platformMatches[0].mediaKind === observation.mediaKind
      && platformMatches[0].byteSize === observation.byteSize
      && platformMatches[0].fingerprint === observation.fingerprint
    const moveCandidate = scan.status === 'completed' && couldBeStrictMove
      ? platformMatches[0]
      : null

    if (moveCandidate) {
      const movedAsset = refreshAsset(moveCandidate, observation, createId)
      seenExisting.add(moveCandidate.id)
      assets[indexById.get(moveCandidate.id)] = movedAsset
      changed = true
      moved += 1
      continue
    }

    if (scan.status === 'cancelled' && couldBeStrictMove) {
      deferred += 1
      continue
    }

    const asset = createAsset(rootId, observation, createId)
    assets.push(asset)
    sourceRevisions.push(sourceRevisionFor(asset))
    indexById.set(asset.id, assets.length - 1)
    changed = true
    created += 1
  }

  if (scan.status === 'completed') {
    for (const existing of rootAssets) {
      if (seenExisting.has(existing.id)) continue
      const index = indexById.get(existing.id)
      if (assets[index].availability !== 'missing') {
        assets[index] = { ...assets[index], availability: 'missing' }
        changed = true
        missing += 1
      }
    }
  }

  if (changed && catalog.revision === Number.MAX_SAFE_INTEGER) {
    throw new MediaCatalogError(
      'RevisionExhausted',
      'Media catalogue revision space is exhausted; no scan changes were committed',
    )
  }
  const nextCatalog = changed
    ? finalizeCatalog({ ...catalog, revision: catalog.revision + 1, sourceRevisions, assets })
    : catalog
  return {
    catalog: nextCatalog,
    summary: freeze({ status: scan.status, changed, created, refreshed, moved, missing, deferred }),
  }
}

export function queryMediaCatalog(catalogInput, request = {}) {
  const catalog = openMediaCatalog(catalogInput, { clone: false })
  if (!request || typeof request !== 'object' || Array.isArray(request)) invalid('query request must be an object')
  const offset = request.offset === undefined ? 0 : nonNegativeInteger(request.offset, 'offset')
  const expectedRevision = request.expectedCatalogRevision
  if (offset > 0 && (expectedRevision === undefined || expectedRevision === null)) {
    invalid('expectedCatalogRevision is required when offset is greater than zero')
  }
  if (expectedRevision !== undefined && expectedRevision !== null) {
    nonNegativeInteger(expectedRevision, 'expectedCatalogRevision')
  }
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== catalog.revision) {
    throw new MediaCatalogError(
      'QuerySnapshotChanged',
      `Expected media catalogue revision ${expectedRevision}; current revision is ${catalog.revision}`,
    )
  }

  const limit = request.limit === undefined ? 100 : positiveInteger(request.limit, 'limit')
  if (limit > MAX_MEDIA_QUERY_LIMIT) invalid(`limit must not exceed ${MAX_MEDIA_QUERY_LIMIT}`)
  const search = request.search === undefined ? '' : boundedString(request.search, 'search', 500).trim().toLowerCase()
  const rootIds = optionalSet(request.rootIds, 'rootIds')
  const folders = optionalSet(request.folders, 'folders')
  const mediaKinds = optionalEnumSet(request.mediaKinds, MEDIA_KINDS, 'mediaKinds')
  const orientations = optionalEnumSet(request.orientations, MEDIA_ORIENTATIONS, 'orientations')
  const availabilities = optionalEnumSet(
    request.availabilities,
    [...ASSET_AVAILABILITIES, ...ROOT_AVAILABILITIES.filter((value) => value !== 'available')],
    'availabilities',
  )
  const previewCapabilities = optionalEnumSet(request.previewCapabilities, PREVIEW_CAPABILITIES, 'previewCapabilities')
  const rootAvailability = canonicalRootAvailability(request.rootAvailability, catalog.roots)
  const availabilityRevision = rootAvailabilityRevision(catalog.roots, rootAvailability)
  const expectedAvailabilityRevision = request.expectedAvailabilityRevision
  if (offset > 0 && (expectedAvailabilityRevision === undefined || expectedAvailabilityRevision === null)) {
    invalid('expectedAvailabilityRevision is required when offset is greater than zero')
  }
  if (expectedAvailabilityRevision !== undefined && expectedAvailabilityRevision !== null) {
    boundedString(expectedAvailabilityRevision, 'expectedAvailabilityRevision', 100)
    if (expectedAvailabilityRevision !== availabilityRevision) {
      throw new MediaCatalogError(
        'QuerySnapshotChanged',
        'Live media Root availability changed during the paged query',
      )
    }
  }
  const sortBy = request.sortBy ?? 'filename'
  if (!QUERY_SORT_FIELDS.includes(sortBy)) invalid(`Unknown media query sort field: ${sortBy}`)
  const sortDirection = request.sortDirection ?? 'ascending'
  if (!['ascending', 'descending'].includes(sortDirection)) invalid('sortDirection must be ascending or descending')

  const queryKey = JSON.stringify({
    availabilityRevision,
    search,
    rootIds: sortedSetValues(rootIds),
    folders: sortedSetValues(folders),
    mediaKinds: sortedSetValues(mediaKinds),
    orientations: sortedSetValues(orientations),
    availabilities: sortedSetValues(availabilities),
    previewCapabilities: sortedSetValues(previewCapabilities),
    sortBy,
    sortDirection,
  })
  let cache = catalogQueryCaches.get(catalog)
  if (!cache) {
    cache = new Map()
    catalogQueryCaches.set(catalog, cache)
  }
  let matched = cache.get(queryKey)
  if (matched) {
    cache.delete(queryKey)
    cache.set(queryKey, matched)
  } else {
    matched = catalog.assets.filter((asset) => {
      const availability = effectiveAvailability(asset, rootAvailability)
      if (rootIds && !rootIds.has(asset.rootId)) return false
      if (folders && !folders.has(asset.folder)) return false
      if (mediaKinds && !mediaKinds.has(asset.mediaKind)) return false
      if (orientations && !orientations.has(asset.orientation)) return false
      if (availabilities && !availabilities.has(availability)) return false
      if (previewCapabilities && !previewCapabilities.has(asset.previewCapability)) return false
      if (search) {
        const haystack = `${asset.filename}\n${asset.folder}\n${asset.relativePath}\n${asset.title}\n${asset.note}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
    matched.sort((left, right) => {
      const primary = compareValues(left[sortBy], right[sortBy])
      if (primary !== 0) return sortDirection === 'descending' ? -primary : primary
      return compareValues(left.id, right.id)
    })
    freeze(matched)
    cache.set(queryKey, matched)
    while (cache.size > MAX_CACHED_QUERIES_PER_CATALOG) cache.delete(cache.keys().next().value)
  }

  const requestedEnd = Math.min(matched.length, offset + limit)
  const items = []
  const emptyPageBytes = encodedJsonBytes({
    catalogRevision: catalog.revision,
    availabilityRevision,
    total: matched.length,
    items: [],
    nextOffset: null,
  })
  let pageBytes = emptyPageBytes + 64
  let end = offset
  for (; end < requestedEnd; end += 1) {
    const item = publicAsset(matched[end], effectiveAvailability(matched[end], rootAvailability))
    const itemBytes = encodedJsonBytes(item) + (items.length > 0 ? 1 : 0)
    if (pageBytes + itemBytes > MAX_MEDIA_QUERY_RESPONSE_BYTES) {
      if (items.length === 0) {
        throw new MediaCatalogError('ResultTooLarge', 'One media Asset summary exceeds the 1 MiB control-frame limit')
      }
      break
    }
    items.push(item)
    pageBytes += itemBytes
  }
  const result = {
    catalogRevision: catalog.revision,
    availabilityRevision,
    total: matched.length,
    items,
    nextOffset: end < matched.length ? end : null,
  }
  if (encodedJsonBytes(result) > MAX_MEDIA_QUERY_RESPONSE_BYTES) {
    throw new MediaCatalogError('ResultTooLarge', 'Media Asset page exceeds the 1 MiB control-frame limit')
  }
  return result
}

export function planMediaVirtualWindow({
  itemCount,
  viewportWidth,
  viewportHeight,
  scrollTop = 0,
  targetCardWidth = 180,
  mediaAspectRatio = 4 / 3,
  labelHeight = 48,
  gap = 12,
  overscanRows = 3,
} = {}) {
  nonNegativeInteger(itemCount, 'itemCount')
  positiveFinite(viewportWidth, 'viewportWidth')
  positiveFinite(viewportHeight, 'viewportHeight')
  nonNegativeFinite(scrollTop, 'scrollTop')
  positiveFinite(targetCardWidth, 'targetCardWidth')
  positiveFinite(mediaAspectRatio, 'mediaAspectRatio')
  nonNegativeFinite(labelHeight, 'labelHeight')
  nonNegativeFinite(gap, 'gap')
  nonNegativeInteger(overscanRows, 'overscanRows')

  const columns = Math.max(1, Math.floor((viewportWidth + gap) / (targetCardWidth + gap)))
  const cardWidth = (viewportWidth - gap * (columns - 1)) / columns
  const cardHeight = cardWidth / mediaAspectRatio + labelHeight
  const rowHeight = cardHeight + gap
  const rowCount = Math.ceil(itemCount / columns)
  const contentHeight = rowCount === 0 ? 0 : rowCount * rowHeight - gap
  const canvasHeight = Math.max(viewportHeight, contentHeight)
  const boundedScrollTop = Math.min(scrollTop, Math.max(0, canvasHeight - viewportHeight))
  const firstVisibleRow = Math.floor(boundedScrollTop / rowHeight)
  const visibleEndRow = Math.min(rowCount, Math.ceil((boundedScrollTop + viewportHeight + gap) / rowHeight))
  const startRow = Math.max(0, firstVisibleRow - overscanRows)
  const endRow = Math.min(rowCount, visibleEndRow + overscanRows)
  const startIndex = startRow * columns
  const endIndex = Math.min(itemCount, endRow * columns)
  const items = []
  for (let index = startIndex; index < endIndex; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    items.push(freeze({
      index,
      left: column * (cardWidth + gap),
      top: row * rowHeight,
      width: cardWidth,
      height: cardHeight,
    }))
  }

  return freeze({
    itemCount,
    columns,
    cardWidth,
    cardHeight,
    rowHeight,
    rowCount,
    canvasHeight,
    scrollTop: boundedScrollTop,
    startIndex,
    endIndex,
    items: freeze(items),
  })
}

export function captureMediaScrollAnchor({ itemIndex, columns, rowHeight, scrollTop }) {
  nonNegativeInteger(itemIndex, 'itemIndex')
  positiveInteger(columns, 'columns')
  positiveFinite(rowHeight, 'rowHeight')
  nonNegativeFinite(scrollTop, 'scrollTop')
  return freeze({
    itemIndex,
    offsetFromViewportTop: Math.floor(itemIndex / columns) * rowHeight - scrollTop,
  })
}

export function restoreMediaScrollAnchor({ anchor, columns, rowHeight }) {
  if (!anchor || typeof anchor !== 'object') invalid('anchor must be an object')
  nonNegativeInteger(anchor.itemIndex, 'anchor.itemIndex')
  finiteNumber(anchor.offsetFromViewportTop, 'anchor.offsetFromViewportTop')
  positiveInteger(columns, 'columns')
  positiveFinite(rowHeight, 'rowHeight')
  return Math.max(0, Math.floor(anchor.itemIndex / columns) * rowHeight - anchor.offsetFromViewportTop)
}

export function moveMediaGridFocus({ currentIndex, key, itemCount, columns, pageRows = 1 }) {
  nonNegativeInteger(itemCount, 'itemCount')
  positiveInteger(columns, 'columns')
  positiveInteger(pageRows, 'pageRows')
  if (itemCount === 0) return -1
  let index = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0
  if (key === 'ArrowLeft') index = Math.max(0, index - 1)
  else if (key === 'ArrowRight') index = Math.min(itemCount - 1, index + 1)
  else if (key === 'ArrowUp') index = Math.max(0, index - columns)
  else if (key === 'ArrowDown') index = Math.min(itemCount - 1, index + columns)
  else if (key === 'Home') index = 0
  else if (key === 'End') index = itemCount - 1
  else if (key === 'PageUp') index = Math.max(0, index - columns * pageRows)
  else if (key === 'PageDown') index = Math.min(itemCount - 1, index + columns * pageRows)
  return index
}

export function scrollTopToRevealMediaItem({
  itemIndex,
  columns,
  rowHeight,
  viewportHeight,
  currentScrollTop,
} = {}) {
  nonNegativeInteger(itemIndex, 'itemIndex')
  positiveInteger(columns, 'columns')
  positiveFinite(rowHeight, 'rowHeight')
  positiveFinite(viewportHeight, 'viewportHeight')
  nonNegativeFinite(currentScrollTop, 'currentScrollTop')
  const top = Math.floor(itemIndex / columns) * rowHeight
  const bottom = top + rowHeight
  if (top < currentScrollTop) return top
  if (bottom > currentScrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight)
  return currentScrollTop
}

export function adjustMediaDensity(current, key, { minimum = 96, maximum = 320, step = 16 } = {}) {
  positiveFinite(current, 'current')
  positiveFinite(minimum, 'minimum')
  positiveFinite(maximum, 'maximum')
  positiveFinite(step, 'step')
  if (minimum > maximum) invalid('minimum density must not exceed maximum density')
  if (key === '+' || key === '=') return Math.max(minimum, Math.min(maximum, current - step))
  if (key === '-' || key === '_') return Math.max(minimum, Math.min(maximum, current + step))
  return Math.max(minimum, Math.min(maximum, current))
}

function validateAsset(asset, index, rootIds) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) invalid(`assets[${index}] must be an object`)
  opaqueId(asset.id, `assets[${index}].id`)
  opaqueId(asset.sourceId, `assets[${index}].sourceId`)
  opaqueId(asset.sourceRevisionId, `assets[${index}].sourceRevisionId`)
  opaqueId(asset.locationId, `assets[${index}].locationId`)
  opaqueId(asset.rootId, `assets[${index}].rootId`)
  if (!rootIds.has(asset.rootId)) invalid(`Asset references unknown Root: ${asset.rootId}`)
  const path = relativePath(asset.relativePath, `assets[${index}].relativePath`)
  const parts = path.split('/')
  const derivedFilename = parts.at(-1)
  const derivedFolder = parts.slice(0, -1).join('/')
  const filename = boundedString(asset.filename, `assets[${index}].filename`, 500)
  const folder = boundedString(asset.folder, `assets[${index}].folder`, 2_000, { allowEmpty: true })
  if (filename !== derivedFilename || folder !== derivedFolder) {
    invalid(`assets[${index}] filename and folder must be derived from its Root-relative path`)
  }
  boundedString(asset.title, `assets[${index}].title`, 1_000, { allowEmpty: true })
  boundedString(asset.note, `assets[${index}].note`, 4_000, { allowEmpty: true })
  enumValue(asset.mediaKind, MEDIA_KINDS, `assets[${index}].mediaKind`)
  enumValue(asset.availability, ASSET_AVAILABILITIES, `assets[${index}].availability`)
  enumValue(asset.previewCapability, PREVIEW_CAPABILITIES, `assets[${index}].previewCapability`)
  validateDimensions(asset, `assets[${index}]`)
  nonNegativeInteger(asset.byteSize, `assets[${index}].byteSize`)
  boundedString(asset.fingerprint, `assets[${index}].fingerprint`, 500)
  nullableBoundedString(asset.platformIdentity, `assets[${index}].platformIdentity`, 500)
  nullableBoundedString(asset.platformIdentityKind, `assets[${index}].platformIdentityKind`, 100)
  validatePlatformIdentityPair(asset, `assets[${index}]`)
  positiveInteger(asset.linkCount, `assets[${index}].linkCount`)
  nullableBoundedString(asset.previewReason, `assets[${index}].previewReason`, 500)
  validatePreviewReason(asset, `assets[${index}]`)
}

function canonicalObservation(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid(`observations[${index}] must be an object`)
  const path = relativePath(input.relativePath, `observations[${index}].relativePath`)
  const parts = path.split('/')
  const filename = boundedString(parts.at(-1), `observations[${index}].filename`, 500)
  const folder = parts.slice(0, -1).join('/')
  if (input.filename !== undefined && input.filename !== filename) {
    invalid(`observations[${index}].filename must match the Root-relative path basename`)
  }
  boundedString(folder, `observations[${index}].folder`, 2_000, { allowEmpty: true })
  const width = nullablePositiveInteger(input.width ?? null, `observations[${index}].width`)
  const height = nullablePositiveInteger(input.height ?? null, `observations[${index}].height`)
  if ((width === null) !== (height === null)) invalid(`observations[${index}] width and height must both be known or both be null`)
  const orientation = width === null
    ? input.orientation ?? null
    : input.orientation ?? orientationFor(width, height)
  const observation = {
    relativePath: path,
    filename,
    folder,
    title: boundedString(input.title ?? '', `observations[${index}].title`, 1_000, { allowEmpty: true }),
    note: boundedString(input.note ?? '', `observations[${index}].note`, 4_000, { allowEmpty: true }),
    mediaKind: enumValue(input.mediaKind, MEDIA_KINDS, `observations[${index}].mediaKind`),
    orientation: orientation === null
      ? null
      : enumValue(orientation, MEDIA_ORIENTATIONS, `observations[${index}].orientation`),
    availability: enumValue(input.availability ?? 'available', ['available', 'unreadable'], `observations[${index}].availability`),
    previewCapability: enumValue(input.previewCapability, PREVIEW_CAPABILITIES, `observations[${index}].previewCapability`),
    width,
    height,
    byteSize: nonNegativeInteger(input.byteSize, `observations[${index}].byteSize`),
    fingerprint: boundedString(input.fingerprint, `observations[${index}].fingerprint`, 500),
    platformIdentity: nullableBoundedString(input.platformIdentity ?? null, `observations[${index}].platformIdentity`, 500),
    platformIdentityKind: nullableBoundedString(input.platformIdentityKind ?? null, `observations[${index}].platformIdentityKind`, 100),
    linkCount: positiveInteger(input.linkCount ?? 1, `observations[${index}].linkCount`),
    previewReason: nullableBoundedString(input.previewReason ?? null, `observations[${index}].previewReason`, 500),
  }
  validateDimensions(observation, `observations[${index}]`)
  validatePlatformIdentityPair(observation, `observations[${index}]`)
  validatePreviewReason(observation, `observations[${index}]`)
  return observation
}

function createAsset(rootId, observation, createId) {
  return {
    id: createId('asset'),
    sourceId: createId('source'),
    sourceRevisionId: createId('source-revision'),
    locationId: createId('location'),
    rootId,
    ...structuredClone(observation),
  }
}

function refreshAsset(asset, observation, createId) {
  const contentChanged = asset.byteSize !== observation.byteSize
    || asset.fingerprint !== observation.fingerprint
    || asset.mediaKind !== observation.mediaKind
  return {
    ...asset,
    ...structuredClone(observation),
    sourceRevisionId: contentChanged ? createId('source-revision') : asset.sourceRevisionId,
  }
}

function sourceRevisionFor(asset) {
  return {
    id: asset.sourceRevisionId,
    sourceId: asset.sourceId,
    byteSize: asset.byteSize,
    fingerprint: asset.fingerprint,
    mediaKind: asset.mediaKind,
  }
}

function publicAsset(asset, availability) {
  return {
    id: asset.id,
    locationId: asset.locationId,
    rootId: asset.rootId,
    filename: asset.filename,
    folder: asset.folder,
    displayPath: asset.relativePath,
    title: asset.title,
    note: asset.note,
    mediaKind: asset.mediaKind,
    orientation: asset.orientation,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    availability,
    previewCapability: asset.previewCapability,
    previewReason: asset.previewReason,
  }
}

function canonicalStoredAsset(asset) {
  return {
    id: asset.id,
    sourceId: asset.sourceId,
    sourceRevisionId: asset.sourceRevisionId,
    locationId: asset.locationId,
    rootId: asset.rootId,
    relativePath: asset.relativePath,
    filename: asset.filename,
    folder: asset.folder,
    title: asset.title,
    note: asset.note,
    mediaKind: asset.mediaKind,
    orientation: asset.orientation,
    availability: asset.availability,
    previewCapability: asset.previewCapability,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    fingerprint: asset.fingerprint,
    platformIdentity: asset.platformIdentity,
    platformIdentityKind: asset.platformIdentityKind,
    linkCount: asset.linkCount,
    previewReason: asset.previewReason,
  }
}

function finalizeCatalog(catalog) {
  for (const root of catalog.roots) freeze(root)
  for (const revisionEntry of catalog.sourceRevisions) freeze(revisionEntry)
  for (const asset of catalog.assets) freeze(asset)
  freeze(catalog.roots)
  freeze(catalog.sourceRevisions)
  freeze(catalog.assets)
  freeze(catalog)
  validatedCatalogs.add(catalog)
  return catalog
}

function platformIdentityKey(value) {
  return `${value.platformIdentityKind}\u0000${value.platformIdentity}`
}

function validateDimensions(value, label) {
  const width = nullablePositiveInteger(value.width, `${label}.width`)
  const height = nullablePositiveInteger(value.height, `${label}.height`)
  if ((width === null) !== (height === null)) invalid(`${label} width and height must both be known or both be null`)
  if (width === null) {
    if (value.orientation !== null) invalid(`${label}.orientation must be null when dimensions are unknown`)
    if (value.previewCapability !== 'unsupported') {
      invalid(`${label} requires dimensions when a preview provider is available`)
    }
    return
  }
  enumValue(value.orientation, MEDIA_ORIENTATIONS, `${label}.orientation`)
}

function validatePlatformIdentityPair(value, label) {
  if ((value.platformIdentity === null) !== (value.platformIdentityKind === null)) {
    invalid(`${label} platform identity and kind must both be present or both be null`)
  }
}

function validatePreviewReason(value, label) {
  if (value.previewCapability === 'unsupported' && value.previewReason === null) {
    invalid(`${label}.previewReason is required when previewCapability is unsupported`)
  }
}

function effectiveAvailability(asset, rootAvailability) {
  const root = rootAvailability.get(asset.rootId) ?? 'available'
  return root === 'available' ? asset.availability : root
}

function canonicalRootAvailability(input, roots) {
  const values = new Map()
  if (input === undefined) return values
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('rootAvailability must be an object')
  const knownRoots = new Set(roots.map((root) => root.id))
  for (const [rootId, availability] of Object.entries(input)) {
    if (!knownRoots.has(rootId)) throw new MediaCatalogError('UnknownRoot', `Root does not exist: ${rootId}`)
    values.set(rootId, enumValue(availability, ROOT_AVAILABILITIES, `rootAvailability.${rootId}`))
  }
  return values
}

function rootAvailabilityRevision(roots, rootAvailability) {
  const snapshot = roots
    .map((root) => `${root.id}\u0000${rootAvailability.get(root.id) ?? 'available'}`)
    .sort()
    .join('\u0001')
  let hash = 0x811c9dc5
  for (let index = 0; index < snapshot.length; index += 1) {
    hash ^= snapshot.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `root-availability-${hash.toString(16).padStart(8, '0')}`
}

function encodedJsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function resolvedIdFactory(factory, usedIdentities = new Set()) {
  const source = factory ?? ((kind) => {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (!uuid) throw new MediaCatalogError('IdentityUnavailable', 'A random ID factory is required on this host')
    return `${kind}-${uuid}`
  })
  if (typeof source !== 'function') invalid('idFactory must be a function')
  return (kind) => {
    const id = opaqueId(source(kind), `${kind} identity`)
    if (usedIdentities.has(id)) throw new MediaCatalogError('IdentityCollision', `Generated identity already exists: ${id}`)
    usedIdentities.add(id)
    return id
  }
}

function catalogIdentitySet(catalog) {
  return new Set([
    catalog.deckId,
    catalog.catalogId,
    ...catalog.roots.map((root) => root.id),
    ...catalog.sourceRevisions.flatMap((entry) => [entry.id, entry.sourceId]),
    ...catalog.assets.flatMap((asset) => [asset.id, asset.sourceId, asset.sourceRevisionId, asset.locationId]),
  ])
}

function sameAsset(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function orientationFor(width, height) {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function compareValues(left, right) {
  if (left === right) return 0
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1
  return String(left) < String(right) ? -1 : 1
}

function optionalSet(value, label) {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must be a non-empty array when provided`)
  return new Set(value.map((entry, index) => boundedString(entry, `${label}[${index}]`, 2_000)))
}

function optionalEnumSet(value, allowed, label) {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must be a non-empty array when provided`)
  return new Set(value.map((entry, index) => enumValue(entry, allowed, `${label}[${index}]`)))
}

function sortedSetValues(value) {
  return value === null ? null : [...value].sort()
}

function rootLabel(value, label) {
  const next = boundedString(value, label, 160)
  if (/[\\/\u0000-\u001f\u007f]/.test(next)) invalid(`${label} must be a display name, not a path`)
  return next
}

function relativePath(value, label) {
  const path = boundedString(value, label, 4_000)
  if (
    path.startsWith('/')
    || path.startsWith('\\')
    || /^[A-Za-z]:[\\/]/.test(path)
    || path.includes('\\')
    || path.includes('\u0000')
  ) {
    invalid(`${label} must be a slash-separated relative path`)
  }
  const parts = path.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    invalid(`${label} must be normalized and contained within its Root`)
  }
  return path
}

function opaqueId(value, label) {
  const id = boundedString(value, label, 200)
  if (/[\\/\u0000]/.test(id)) invalid(`${label} must be opaque and path-independent`)
  return id
}

function nullableBoundedString(value, label, maximum) {
  if (value === null) return null
  return boundedString(value, label, maximum)
}

function boundedString(value, label, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') invalid(`${label} must be a string`)
  if ((!allowEmpty && value.length === 0) || value.length > maximum) {
    invalid(`${label} must contain ${allowEmpty ? 'at most' : 'between 1 and'} ${maximum} characters`)
  }
  if (value.includes('\u0000')) invalid(`${label} must not contain NUL`)
  return value
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) invalid(`${label} has an unsupported value`)
  return value
}

function unique(set, value, label) {
  if (set.has(value)) invalid(`Duplicate ${label} identity: ${value}`)
  set.add(value)
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) invalid(`${label} must be finite`)
  return value
}

function positiveFinite(value, label) {
  finiteNumber(value, label)
  if (value <= 0) invalid(`${label} must be positive`)
  return value
}

function nonNegativeFinite(value, label) {
  finiteNumber(value, label)
  if (value < 0) invalid(`${label} must not be negative`)
  return value
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(`${label} must be a positive integer`)
  return value
}

function nullablePositiveInteger(value, label) {
  if (value === null) return null
  return positiveInteger(value, label)
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative integer`)
  return value
}

function invalid(message) {
  throw new MediaCatalogError('InvalidMediaCatalog', message)
}
