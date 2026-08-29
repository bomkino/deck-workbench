import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_MEDIA_QUERY_LIMIT,
  createMediaCatalog,
  queryMediaCatalog,
  reconcileMediaScan,
} from '../packages/media-catalog/index.mjs'
import {
  CURATE_MEDIA_FIXTURE_COUNT,
  CURATE_MEDIA_MISSING_COUNT,
  CURATE_MEDIA_OFFLINE_COUNT,
  CURATE_MEDIA_PAGE_SIZE,
  CURATE_MEDIA_ROOTS,
  createCurateMediaFixture,
  createManualPagedSource,
  deterministicIdFactory,
  observationForIndex,
} from './fixtures/curate-media-fixture.mjs'

test('10,240 records page under one pinned catalogue revision with Asset ID as the stable tie-break', () => {
  const fixture = createCurateMediaFixture()
  const first = queryMediaCatalog(fixture.catalog, {
    limit: MAX_MEDIA_QUERY_LIMIT,
    expectedCatalogRevision: null,
    rootAvailability: fixture.rootAvailability,
  })
  assert.equal(first.catalogRevision, fixture.catalog.revision)
  assert.equal(first.total, CURATE_MEDIA_FIXTURE_COUNT)
  assert.equal(first.items.length, MAX_MEDIA_QUERY_LIMIT)

  const items = [...first.items]
  let nextOffset = first.nextOffset
  while (nextOffset !== null) {
    const page = queryMediaCatalog(fixture.catalog, {
      offset: nextOffset,
      limit: MAX_MEDIA_QUERY_LIMIT,
      expectedCatalogRevision: first.catalogRevision,
      expectedAvailabilityRevision: first.availabilityRevision,
      rootAvailability: fixture.rootAvailability,
    })
    assert.equal(page.catalogRevision, first.catalogRevision)
    const expectedEnd = nextOffset + page.items.length
    assert.equal(page.nextOffset, expectedEnd < page.total ? expectedEnd : null)
    items.push(...page.items)
    nextOffset = page.nextOffset
  }

  assert.equal(items.length, CURATE_MEDIA_FIXTURE_COUNT)
  assert.equal(new Set(items.map((asset) => asset.id)).size, CURATE_MEDIA_FIXTURE_COUNT)
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]
    const current = items[index]
    assert.equal(
      previous.filename < current.filename
      || (previous.filename === current.filename && previous.id < current.id),
      true,
      `unstable ordering at ${index}: ${previous.filename}/${previous.id} then ${current.filename}/${current.id}`,
    )
  }

  const duplicate = items.filter((asset) => asset.filename === 'duplicate-0000.jpg')
  assert.equal(duplicate.length, 2)
  assert.notEqual(duplicate[0].id, duplicate[1].id)
  assert.equal(duplicate[0].id < duplicate[1].id, true)
  for (const asset of items.slice(0, 50)) {
    assert.equal('fingerprint' in asset, false)
    assert.equal('platformIdentity' in asset, false)
    assert.equal('sourceId' in asset, false)
    assert.equal(asset.displayPath.startsWith('/'), false)
    assert.equal(asset.id.includes(asset.filename), false)
  }
})

test('heavy queries keep source availability separate from preview capability and combine real filters', () => {
  const fixture = createCurateMediaFixture()
  const query = (request) => queryMediaCatalog(fixture.catalog, {
    limit: MAX_MEDIA_QUERY_LIMIT,
    rootAvailability: fixture.rootAvailability,
    ...request,
  })

  assert.equal(query({ availabilities: ['missing'] }).total, CURATE_MEDIA_MISSING_COUNT)
  assert.equal(query({ availabilities: ['offline_volume'] }).total, CURATE_MEDIA_OFFLINE_COUNT)
  assert.equal(query({ previewCapabilities: ['unsupported'] }).total, 640)
  assert.equal(query({ mediaKinds: ['image'] }).total, 9_600)
  assert.equal(query({ mediaKinds: ['gif'] }).total, 320)
  assert.equal(query({ mediaKinds: ['video'] }).total, 320)
  assert.equal(query({ search: 'winter harbor' }).total, 102)
  assert.equal(query({ folders: ['campaign-0/unit-0/scene-0'] }).total, 160)

  const slowGIFs = query({
    rootIds: [CURATE_MEDIA_ROOTS.slow],
    mediaKinds: ['gif'],
    orientations: ['square'],
    previewCapabilities: ['unsupported'],
  })
  assert.equal(slowGIFs.total, 320)
  assert.equal(slowGIFs.items.every((asset) => asset.availability === 'available'), true)
  assert.equal(slowGIFs.items.every((asset) => asset.previewReason === 'gif-preview-provider-not-installed'), true)

  const catalogueOnlyVideo = query({ mediaKinds: ['video'] })
  assert.equal(catalogueOnlyVideo.items.length, MAX_MEDIA_QUERY_LIMIT)
  assert.equal(catalogueOnlyVideo.items.every((asset) => asset.width === null), true)
  assert.equal(catalogueOnlyVideo.items.every((asset) => asset.height === null), true)
  assert.equal(catalogueOnlyVideo.items.every((asset) => asset.orientation === null), true)
  assert.equal(catalogueOnlyVideo.items.every((asset) => asset.availability !== 'unreadable'), true)
  assert.equal(catalogueOnlyVideo.items.every((asset) => asset.previewCapability === 'unsupported'), true)

  const before = JSON.stringify(fixture.catalog)
  query({ availabilities: ['offline_volume'] })
  assert.equal(JSON.stringify(fixture.catalog), before, 'live Root availability must not mutate portable catalogue JSON')
})

test('later pages reject a stale catalogue revision and bounded query inputs fail explicitly', () => {
  const idFactory = deterministicIdFactory()
  let catalog = createMediaCatalog({
    deckId: 'deck-query-snapshot',
    catalogId: 'catalog-query-snapshot',
    roots: [{ id: 'root-query', label: 'Query Root' }],
    idFactory,
  })
  catalog = reconcileMediaScan(catalog, {
    rootId: 'root-query',
    status: 'completed',
    observations: [observationForIndex(0), observationForIndex(1)],
  }, { idFactory }).catalog
  const first = queryMediaCatalog(catalog, { limit: 1 })
  assert.equal(first.nextOffset, 1)
  assert.throws(
    () => queryMediaCatalog(catalog, { offset: first.nextOffset, limit: 1 }),
    /expectedCatalogRevision is required/,
  )
  assert.throws(
    () => queryMediaCatalog(catalog, {
      offset: first.nextOffset,
      limit: 1,
      expectedCatalogRevision: null,
    }),
    /expectedCatalogRevision is required/,
  )

  const changed = {
    ...observationForIndex(0),
    note: 'Metadata changed between pages',
  }
  catalog = reconcileMediaScan(catalog, {
    rootId: 'root-query',
    status: 'completed',
    observations: [changed, observationForIndex(1)],
  }, { idFactory }).catalog
  assert.equal(catalog.revision, first.catalogRevision + 1)
  assert.throws(
    () => queryMediaCatalog(catalog, {
      offset: first.nextOffset,
      limit: 1,
      expectedCatalogRevision: first.catalogRevision,
      expectedAvailabilityRevision: first.availabilityRevision,
    }),
    (error) => error.name === 'QuerySnapshotChanged'
      && error.message.includes(String(first.catalogRevision))
      && error.message.includes(String(catalog.revision)),
  )

  assert.throws(() => queryMediaCatalog(catalog, { limit: 0 }), /positive integer/)
  assert.throws(() => queryMediaCatalog(catalog, { limit: MAX_MEDIA_QUERY_LIMIT + 1 }), /must not exceed/)
  assert.throws(() => queryMediaCatalog(catalog, { offset: -1 }), /non-negative integer/)
  assert.throws(() => queryMediaCatalog(catalog, { expectedCatalogRevision: '1' }), /non-negative integer/)
  assert.throws(() => queryMediaCatalog(catalog, { orientations: ['unknown'] }), /unsupported value/)
})

test('the slow-root fixture advances only when asked and cancellation publishes no stale page', () => {
  const fixture = createCurateMediaFixture()
  const slow = queryMediaCatalog(fixture.catalog, {
    rootIds: [CURATE_MEDIA_ROOTS.slow],
    limit: MAX_MEDIA_QUERY_LIMIT,
  })
  assert.equal(slow.total, fixture.stats.slow)
  const source = createManualPagedSource(
    fixture.catalog.assets.filter((asset) => asset.rootId === CURATE_MEDIA_ROOTS.slow),
    { pageSize: CURATE_MEDIA_PAGE_SIZE },
  )
  const first = source.next()
  const second = source.next()
  assert.equal(first.items.length, CURATE_MEDIA_PAGE_SIZE)
  assert.equal(second.items.length, CURATE_MEDIA_PAGE_SIZE)
  assert.equal(second.nextOffset, CURATE_MEDIA_PAGE_SIZE * 2)
  assert.deepEqual(source.cancel(), { status: 'cancellation_requested' })
  assert.deepEqual(source.next(), { status: 'cancelled', items: [], nextOffset: null })
})
