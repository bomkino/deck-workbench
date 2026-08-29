import {
  createMediaCatalog,
  reconcileMediaScan,
} from '../../packages/media-catalog/index.mjs'

export const CURATE_MEDIA_FIXTURE_COUNT = 10_240
export const CURATE_MEDIA_FAST_COUNT = 7_680
export const CURATE_MEDIA_SLOW_COUNT = 2_304
export const CURATE_MEDIA_OFFLINE_COUNT = 256
export const CURATE_MEDIA_MISSING_COUNT = 128
export const CURATE_MEDIA_PAGE_SIZE = 128

export const CURATE_MEDIA_ROOTS = Object.freeze({
  fast: 'root-fast-project',
  slow: 'root-slow-external',
  offline: 'root-offline-archive',
})

let cachedFixture

export function createCurateMediaFixture() {
  if (cachedFixture) return cachedFixture
  const idFactory = deterministicIdFactory()
  let catalog = createMediaCatalog({
    deckId: 'deck-curate-heavy-v1',
    catalogId: 'catalog-curate-heavy-v1',
    idFactory,
    roots: [
      { id: CURATE_MEDIA_ROOTS.fast, label: 'Project media' },
      { id: CURATE_MEDIA_ROOTS.slow, label: 'External archive' },
      { id: CURATE_MEDIA_ROOTS.offline, label: 'Offline archive' },
    ],
  })

  const observations = {
    [CURATE_MEDIA_ROOTS.fast]: [],
    [CURATE_MEDIA_ROOTS.slow]: [],
    [CURATE_MEDIA_ROOTS.offline]: [],
  }
  for (let index = 0; index < CURATE_MEDIA_FIXTURE_COUNT; index += 1) {
    observations[rootForIndex(index)].push(observationForIndex(index))
  }

  for (const rootId of [CURATE_MEDIA_ROOTS.fast, CURATE_MEDIA_ROOTS.slow, CURATE_MEDIA_ROOTS.offline]) {
    catalog = reconcileMediaScan(catalog, {
      rootId,
      status: 'completed',
      observations: observations[rootId],
    }, { idFactory }).catalog
  }

  const retainedFast = observations[CURATE_MEDIA_ROOTS.fast].slice(
    0,
    CURATE_MEDIA_FAST_COUNT - CURATE_MEDIA_MISSING_COUNT,
  )
  catalog = reconcileMediaScan(catalog, {
    rootId: CURATE_MEDIA_ROOTS.fast,
    status: 'completed',
    observations: retainedFast,
  }, { idFactory }).catalog

  cachedFixture = deepFreeze({
    catalog,
    rootAvailability: {
      [CURATE_MEDIA_ROOTS.fast]: 'available',
      [CURATE_MEDIA_ROOTS.slow]: 'available',
      [CURATE_MEDIA_ROOTS.offline]: 'offline_volume',
    },
    stats: {
      total: CURATE_MEDIA_FIXTURE_COUNT,
      fast: CURATE_MEDIA_FAST_COUNT,
      slow: CURATE_MEDIA_SLOW_COUNT,
      offline: CURATE_MEDIA_OFFLINE_COUNT,
      missing: CURATE_MEDIA_MISSING_COUNT,
      images: 9_600,
      gifs: 320,
      videos: 320,
      landscape: 4_096,
      portrait: 3_072,
      square: 2_752,
      unknownOrientation: 320,
      duplicateBasenameGroups: 512,
      nestedLeafFolders: 64,
    },
  })
  return cachedFixture
}

export function createManualPagedSource(items, { pageSize = CURATE_MEDIA_PAGE_SIZE } = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array')
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be positive')
  let offset = 0
  let cancelled = false
  return Object.freeze({
    next() {
      if (cancelled) return Object.freeze({ status: 'cancelled', items: [], nextOffset: null })
      const page = items.slice(offset, offset + pageSize)
      offset += page.length
      return Object.freeze({
        status: 'ready',
        items: Object.freeze(page),
        nextOffset: offset < items.length ? offset : null,
      })
    },
    cancel() {
      cancelled = true
      return Object.freeze({ status: 'cancellation_requested' })
    },
    get cancelled() {
      return cancelled
    },
  })
}

export function deterministicIdFactory() {
  const counters = new Map()
  return (kind) => {
    const next = (counters.get(kind) ?? 0) + 1
    counters.set(kind, next)
    return `${kind}-${String(next).padStart(8, '0')}`
  }
}

export function observationForIndex(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= CURATE_MEDIA_FIXTURE_COUNT) {
    throw new RangeError('Fixture index is out of range')
  }
  const mediaKind = index < 9_600 ? 'image' : index < 9_920 ? 'gif' : 'video'
  const extension = mediaKind === 'image' ? 'jpg' : mediaKind
  const filename = index < 1_024
    ? `duplicate-${String(Math.floor(index / 2)).padStart(4, '0')}.${extension}`
    : `asset-${String(index).padStart(5, '0')}.${extension}`
  const leaf = index % 64
  const folder = `campaign-${Math.floor(leaf / 16)}/unit-${Math.floor((leaf % 16) / 4)}/scene-${leaf % 4}`
  const orientation = index < 4_096 ? 'landscape' : index < 7_168 ? 'portrait' : 'square'
  const dimensions = {
    landscape: [2_400, 1_600],
    portrait: [1_600, 2_400],
    square: [2_000, 2_000],
  }[orientation]
  const catalogueOnlyVideo = mediaKind === 'video'
  return {
    relativePath: `${folder}/${filename}`,
    filename,
    title: index % 101 === 0
      ? `Winter Harbor ${String(index).padStart(5, '0')}`
      : index % 257 === 0
        ? `Saoirse & Noël — frame ${index}`
        : `Frame ${String(index).padStart(5, '0')}`,
    note: index % 389 === 0 ? `Café dusk; research pick ${index}` : `fixture-index:${index}`,
    mediaKind,
    orientation: catalogueOnlyVideo ? null : orientation,
    previewCapability: mediaKind === 'image' ? 'still-image' : 'unsupported',
    previewReason: mediaKind === 'image' ? null : `${mediaKind}-preview-provider-not-installed`,
    width: catalogueOnlyVideo ? null : dimensions[0],
    height: catalogueOnlyVideo ? null : dimensions[1],
    byteSize: 100_000 + index * 17,
    fingerprint: `sha256:${index.toString(16).padStart(64, '0')}`,
    platformIdentity: `fixture-file-id:${String(index).padStart(8, '0')}`,
    platformIdentityKind: 'fixture-file-id',
    linkCount: 1,
    availability: 'available',
  }
}

function rootForIndex(index) {
  if (index < CURATE_MEDIA_FAST_COUNT) return CURATE_MEDIA_ROOTS.fast
  if (index < CURATE_MEDIA_FAST_COUNT + CURATE_MEDIA_SLOW_COUNT) return CURATE_MEDIA_ROOTS.slow
  return CURATE_MEDIA_ROOTS.offline
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}
