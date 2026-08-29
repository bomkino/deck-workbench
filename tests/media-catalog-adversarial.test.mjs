import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_MEDIA_QUERY_LIMIT,
  MAX_MEDIA_QUERY_RESPONSE_BYTES,
  createMediaCatalog,
  openMediaCatalog,
  queryMediaCatalog,
  reconcileMediaScan,
} from '../packages/media-catalog/index.mjs'
import {
  deterministicIdFactory,
  observationForIndex,
} from './fixtures/curate-media-fixture.mjs'

function setup(count = 2, overrides = () => ({})) {
  const idFactory = deterministicIdFactory()
  let catalog = createMediaCatalog({
    deckId: 'deck-adversarial',
    catalogId: 'catalog-adversarial',
    roots: [{ id: 'root-adversarial', label: 'Adversarial Root' }],
    idFactory,
  })
  catalog = reconcileMediaScan(catalog, {
    rootId: 'root-adversarial',
    status: 'completed',
    observations: Array.from({ length: count }, (_, index) => ({
      ...observationForIndex(index),
      ...overrides(index),
    })),
  }, { idFactory }).catalog
  return { catalog, idFactory }
}

test('portable catalogues are bound to one Deck and strip unknown locator fields on open', () => {
  const { catalog } = setup(1)
  assert.throws(
    () => openMediaCatalog(catalog, { expectedDeckId: 'deck-other' }),
    (error) => error.name === 'CatalogDeckMismatch',
  )

  const crafted = structuredClone(catalog)
  crafted.hostPath = '/Users/alice/project'
  crafted.roots[0].authorizedPath = '/Users/alice/project/media'
  crafted.assets[0].absolutePath = '/Users/alice/project/media/secret.jpg'
  const reopened = openMediaCatalog(crafted, { expectedDeckId: 'deck-adversarial' })
  assert.equal('hostPath' in reopened, false)
  assert.equal('authorizedPath' in reopened.roots[0], false)
  assert.equal('absolutePath' in reopened.assets[0], false)
  assert.equal(JSON.stringify(reopened).includes('/Users/alice'), false)

  const leakedLabel = structuredClone(catalog)
  leakedLabel.roots[0].label = '/Users/alice/project/media'
  assert.throws(() => openMediaCatalog(leakedLabel), /display name, not a path/)
})

test('filename and folder are derived from a bounded Root-relative path', () => {
  const { catalog, idFactory } = setup(0)
  const base = observationForIndex(0)
  assert.throws(
    () => reconcileMediaScan(catalog, {
      rootId: 'root-adversarial',
      status: 'completed',
      observations: [{ ...base, relativePath: 'safe/a.jpg', filename: '/Users/alice/secret/a.jpg' }],
    }, { idFactory }),
    /filename must match the Root-relative path basename/,
  )
  const longFolder = `${'a'.repeat(1_000)}/${'b'.repeat(1_000)}/c`
  assert.throws(
    () => reconcileMediaScan(catalog, {
      rootId: 'root-adversarial',
      status: 'completed',
      observations: [{ ...base, relativePath: `${longFolder}/a.jpg`, filename: 'a.jpg' }],
    }, { idFactory }),
    /folder.*at most 2000/,
  )
})

test('live Root availability is part of the pinned page generation', () => {
  const { catalog } = setup(2)
  const first = queryMediaCatalog(catalog, {
    limit: 1,
    availabilities: ['available'],
    rootAvailability: { 'root-adversarial': 'available' },
  })
  assert.equal(first.total, 2)
  assert.throws(
    () => queryMediaCatalog(catalog, {
      offset: first.nextOffset,
      limit: 1,
      expectedCatalogRevision: first.catalogRevision,
      expectedAvailabilityRevision: first.availabilityRevision,
      availabilities: ['available'],
      rootAvailability: { 'root-adversarial': 'offline_volume' },
    }),
    (error) => error.name === 'QuerySnapshotChanged' && /availability changed/.test(error.message),
  )
})

test('maximal summaries produce an authoritative short page below the 1 MiB control-frame ceiling', () => {
  const { catalog } = setup(MAX_MEDIA_QUERY_LIMIT, (index) => ({
    title: `title-${index}-${'t'.repeat(980)}`,
    note: `note-${index}-${'n'.repeat(3_980)}`,
  }))
  const page = queryMediaCatalog(catalog, { limit: MAX_MEDIA_QUERY_LIMIT })
  const bytes = new TextEncoder().encode(JSON.stringify(page)).byteLength
  assert.equal(page.items.length < MAX_MEDIA_QUERY_LIMIT, true)
  assert.equal(page.items.length > 0, true)
  assert.equal(page.nextOffset, page.items.length)
  assert.equal(bytes <= MAX_MEDIA_QUERY_RESPONSE_BYTES, true, `${bytes} bytes`)
})

test('changed bytes append immutable Source Revision history that survives reopen', () => {
  const { catalog: before, idFactory } = setup(1)
  const assetBefore = before.assets[0]
  const changed = {
    ...observationForIndex(0),
    byteSize: assetBefore.byteSize + 1,
    fingerprint: `${assetBefore.fingerprint}-changed`,
  }
  const after = reconcileMediaScan(before, {
    rootId: 'root-adversarial',
    status: 'completed',
    observations: [changed],
  }, { idFactory }).catalog
  assert.equal(after.sourceRevisions.length, 2)
  assert.equal(after.sourceRevisions.some((entry) => entry.id === assetBefore.sourceRevisionId), true)
  assert.notEqual(after.assets[0].sourceRevisionId, assetBefore.sourceRevisionId)
  const reopened = openMediaCatalog(JSON.parse(JSON.stringify(after)), { expectedDeckId: 'deck-adversarial' })
  assert.deepEqual(reopened.sourceRevisions, after.sourceRevisions)
})

test('generated identity collisions fail before a malformed catalogue can be returned', () => {
  const catalog = createMediaCatalog({
    deckId: 'deck-collision',
    catalogId: 'catalog-collision',
    roots: [{ id: 'root-collision', label: 'Collision Root' }],
    idFactory: () => 'unused',
  })
  assert.throws(
    () => reconcileMediaScan(catalog, {
      rootId: 'root-collision',
      status: 'completed',
      observations: [observationForIndex(0)],
    }, { idFactory: () => 'same-generated-id' }),
    (error) => error.name === 'IdentityCollision',
  )
})

test('revision exhaustion rejects a changed scan before returning an unsafe catalogue', () => {
  const { catalog, idFactory } = setup(1)
  const exhausted = openMediaCatalog({
    ...structuredClone(catalog),
    revision: Number.MAX_SAFE_INTEGER,
  })
  const before = JSON.stringify(exhausted)
  assert.throws(
    () => reconcileMediaScan(exhausted, {
      rootId: 'root-adversarial',
      status: 'completed',
      observations: [{
        ...observationForIndex(0),
        byteSize: exhausted.assets[0].byteSize + 1,
        fingerprint: 'changed-at-revision-limit',
      }],
    }, { idFactory }),
    (error) => error.name === 'RevisionExhausted',
  )
  assert.equal(JSON.stringify(exhausted), before)
})
