import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMediaCatalog,
  queryMediaCatalog,
  reconcileMediaScan,
} from '../packages/media-catalog/index.mjs'
import {
  deterministicIdFactory,
  observationForIndex,
} from './fixtures/curate-media-fixture.mjs'

function observation(index, relativePath, overrides = {}) {
  return {
    ...observationForIndex(index),
    relativePath,
    filename: relativePath.split('/').at(-1),
    ...overrides,
  }
}

function setup() {
  const idFactory = deterministicIdFactory()
  const catalog = createMediaCatalog({
    deckId: 'deck-reconciliation',
    catalogId: 'catalog-reconciliation',
    roots: [
      { id: 'root-a', label: 'Root A' },
      { id: 'root-b', label: 'Root B' },
    ],
    idFactory,
  })
  return { catalog, idFactory }
}

function complete(catalog, idFactory, rootId, observations) {
  return reconcileMediaScan(catalog, {
    rootId,
    status: 'completed',
    observations,
  }, { idFactory })
}

test('same Root-relative path refresh preserves lineage while changed bytes create a new Source Revision', () => {
  const { catalog: initial, idFactory } = setup()
  let catalog = initial
  const alpha = observation(30, 'shoot/day-01/alpha.jpg')
  catalog = complete(catalog, idFactory, 'root-a', [alpha]).catalog
  const before = structuredClone(catalog.assets[0])

  const changed = {
    ...alpha,
    byteSize: alpha.byteSize + 91,
    fingerprint: `${alpha.fingerprint}-changed`,
    note: 'Retouched at the same location',
  }
  const result = complete(catalog, idFactory, 'root-a', [changed])
  const after = result.catalog.assets[0]
  assert.equal(result.summary.refreshed, 1)
  assert.equal(after.id, before.id)
  assert.equal(after.sourceId, before.sourceId)
  assert.equal(after.locationId, before.locationId)
  assert.notEqual(after.sourceRevisionId, before.sourceRevisionId)
  assert.equal(after.relativePath, before.relativePath)
  assert.equal(after.note, 'Retouched at the same location')
})

test('a unique single-link platform identity plus absent old path and equal bytes reconciles a move in place', () => {
  const { catalog: initial, idFactory } = setup()
  const alpha = observation(40, 'shoot/day-01/alpha.jpg')
  const beta = observation(41, 'shoot/day-01/beta.jpg')
  let catalog = complete(initial, idFactory, 'root-a', [alpha, beta]).catalog
  const before = structuredClone(catalog.assets.find((asset) => asset.relativePath === beta.relativePath))

  const movedBeta = {
    ...beta,
    relativePath: 'selects/final/beta-renamed.jpg',
    filename: 'beta-renamed.jpg',
  }
  const result = complete(catalog, idFactory, 'root-a', [alpha, movedBeta])
  const after = result.catalog.assets.find((asset) => asset.id === before.id)
  assert.equal(result.summary.moved, 1)
  assert.equal(result.summary.created, 0)
  assert.equal(result.summary.missing, 0)
  assert.deepEqual(
    [after.id, after.sourceId, after.sourceRevisionId, after.locationId],
    [before.id, before.sourceId, before.sourceRevisionId, before.locationId],
  )
  assert.equal(after.relativePath, movedBeta.relativePath)
  assert.equal(after.availability, 'available')
  assert.equal(result.catalog.assets.some((asset) => asset.relativePath === beta.relativePath), false)
})

test('hard links, ambiguous platform identities, changed bytes and a still-present old path never steal identity', () => {
  const cases = [
    {
      name: 'hard link',
      observations: (source, moved) => [{ ...moved, linkCount: 2 }],
    },
    {
      name: 'persisted hard link evidence',
      sourceOverrides: { linkCount: 2 },
      observations: (source, moved) => [{ ...moved, linkCount: 1 }],
    },
    {
      name: 'changed bytes',
      observations: (source, moved) => [{ ...moved, fingerprint: `${source.fingerprint}-copy` }],
    },
    {
      name: 'changed media kind',
      observations: (source, moved) => [{
        ...moved,
        mediaKind: 'video',
        previewCapability: 'unsupported',
        previewReason: 'video-preview-provider-not-installed',
        width: null,
        height: null,
        orientation: null,
      }],
    },
    {
      name: 'old path still present',
      observations: (source, moved) => [source, moved],
    },
    {
      name: 'ambiguous platform identity',
      observations: (source, moved) => [
        moved,
        { ...moved, relativePath: 'selects/two/source-copy.jpg', filename: 'source-copy.jpg' },
      ],
    },
  ]

  for (const scenario of cases) {
    const { catalog: initial, idFactory } = setup()
    const source = observation(50, 'original/source.jpg', scenario.sourceOverrides)
    let catalog = complete(initial, idFactory, 'root-a', [source]).catalog
    const originalId = catalog.assets[0].id
    const moved = { ...source, relativePath: 'selects/source.jpg', filename: 'source.jpg' }
    const result = complete(catalog, idFactory, 'root-a', scenario.observations(source, moved))
    const original = result.catalog.assets.find((asset) => asset.id === originalId)
    assert.equal(result.summary.moved, 0, scenario.name)
    assert.equal(result.catalog.assets.some((asset) => asset.id !== originalId), true, scenario.name)
    if (scenario.name === 'old path still present') assert.equal(original.availability, 'available', scenario.name)
    else assert.equal(original.availability, 'missing', scenario.name)
  }
})

test('move evidence never crosses Roots even when every byte and platform field matches', () => {
  const { catalog: initial, idFactory } = setup()
  const source = observation(60, 'original/source.jpg')
  let catalog = complete(initial, idFactory, 'root-a', [source]).catalog
  const rootAId = catalog.assets[0].id
  const rootBResult = complete(catalog, idFactory, 'root-b', [{
    ...source,
    relativePath: 'moved/source.jpg',
    filename: 'source.jpg',
  }])
  const rootB = rootBResult.catalog.assets.find((asset) => asset.rootId === 'root-b')
  assert.notEqual(rootB.id, rootAId)
  assert.equal(rootBResult.summary.created, 1)
  assert.equal(rootBResult.summary.moved, 0)
})

test('cancelled scans may publish safe refreshes and creates but never infer missing or a move from absence', () => {
  const { catalog: initial, idFactory } = setup()
  const alpha = observation(70, 'day-one/alpha.jpg')
  const beta = observation(71, 'day-one/beta.jpg')
  let catalog = complete(initial, idFactory, 'root-a', [alpha, beta]).catalog
  const betaBefore = structuredClone(catalog.assets.find((asset) => asset.relativePath === beta.relativePath))
  const changedAlpha = { ...alpha, note: 'Observed before cancellation' }
  const gamma = observation(72, 'day-one/gamma.jpg')
  const movedBeta = { ...beta, relativePath: 'selects/beta.jpg', filename: 'beta.jpg' }

  const cancelled = reconcileMediaScan(catalog, {
    rootId: 'root-a',
    status: 'cancelled',
    observations: [changedAlpha, gamma, movedBeta],
  }, { idFactory })
  assert.equal(cancelled.summary.status, 'cancelled')
  assert.equal(cancelled.summary.refreshed, 1)
  assert.equal(cancelled.summary.created, 1)
  assert.equal(cancelled.summary.moved, 0)
  assert.equal(cancelled.summary.missing, 0)
  assert.equal(cancelled.summary.deferred, 1)
  assert.equal(cancelled.catalog.assets.find((asset) => asset.id === betaBefore.id).availability, 'available')
  assert.equal(cancelled.catalog.assets.find((asset) => asset.id === betaBefore.id).relativePath, beta.relativePath)
  assert.equal(cancelled.catalog.assets.some((asset) => asset.relativePath === movedBeta.relativePath), false)

  const completed = complete(cancelled.catalog, idFactory, 'root-a', [changedAlpha, gamma, movedBeta])
  const betaAfter = completed.catalog.assets.find((asset) => asset.id === betaBefore.id)
  assert.equal(completed.summary.moved, 1)
  assert.equal(betaAfter.relativePath, movedBeta.relativePath)
  assert.equal(betaAfter.availability, 'available')
})

test('only a completed scan marks unseen Assets missing and a same-path return restores the same identity', () => {
  const { catalog: initial, idFactory } = setup()
  const alpha = observation(80, 'day-two/alpha.jpg')
  const beta = observation(81, 'day-two/beta.jpg')
  let catalog = complete(initial, idFactory, 'root-a', [alpha, beta]).catalog
  const betaId = catalog.assets.find((asset) => asset.relativePath === beta.relativePath).id

  catalog = complete(catalog, idFactory, 'root-a', [alpha]).catalog
  assert.equal(catalog.assets.find((asset) => asset.id === betaId).availability, 'missing')
  const restored = complete(catalog, idFactory, 'root-a', [alpha, beta])
  assert.equal(restored.catalog.assets.find((asset) => asset.id === betaId).availability, 'available')
  assert.equal(restored.catalog.assets.filter((asset) => asset.relativePath === beta.relativePath).length, 1)
})

test('catalogue JSON rejects absolute paths and exposes availability without preview fabrication', () => {
  const { catalog, idFactory } = setup()
  assert.throws(
    () => complete(catalog, idFactory, 'root-a', [{
      ...observation(90, 'safe/source.jpg'),
      relativePath: '/private/source.jpg',
    }]),
    /slash-separated relative path/,
  )
  assert.throws(
    () => complete(catalog, idFactory, 'root-a', [{
      ...observation(90, 'safe/source.jpg'),
      relativePath: 'C:\\private\\source.jpg',
    }]),
    /slash-separated relative path/,
  )

  const catalogueOnly = observation(9_920, 'video/source.video', {
    width: null,
    height: null,
    orientation: null,
    availability: 'available',
    previewCapability: 'unsupported',
    previewReason: 'video-preview-provider-not-installed',
  })
  const scanned = complete(catalog, idFactory, 'root-a', [catalogueOnly]).catalog
  const [projected] = queryMediaCatalog(scanned, { limit: 1 }).items
  assert.equal(projected.availability, 'available')
  assert.equal(projected.previewCapability, 'unsupported')
  assert.equal(projected.previewReason, 'video-preview-provider-not-installed')
  assert.equal(projected.width, null)
  assert.equal(projected.orientation, null)
})
