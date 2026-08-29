import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createMediaCatalog,
  queryMediaCatalog,
  reconcileMediaScan,
} from '../packages/media-catalog/index.mjs'
import { MediaGrantStore } from '../apps/linux/media-grants.mjs'
import { mediaRootAccessContract } from '../apps/linux/media-root-access.mjs'
import { LinuxMediaSession } from '../apps/linux/media-session.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test('Linux catalogue replacement preflights the exact compact encoded bytes', async () => {
  const sessionSource = await readFile(
    new URL('../apps/linux/media-session.mjs', import.meta.url),
    'utf8',
  )
  assert.match(sessionSource, /const compact = `\$\{JSON\.stringify\(validated\)\}\\n`/)
  assert.match(sessionSource, /Buffer\.byteLength\(compact, 'utf8'\) > MAX_CATALOG_BYTES/)
  assert.equal(mediaRootAccessContract.maxDecodedPixels, 64_000_000)
})

async function fixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'deck-workbench-media-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const packagePath = join(temporaryRoot, 'Media.pitchdeck')
  const mediaRoot = join(temporaryRoot, 'Selected Media')
  const grantPath = join(temporaryRoot, 'host-state', 'media-grants.json')
  await mkdir(packagePath)
  await mkdir(mediaRoot)
  const grantStore = await MediaGrantStore.open(grantPath)
  const session = await LinuxMediaSession.open({
    packagePath,
    deckId: 'deck-media-host-test',
    grantStore,
  })
  t.after(() => session.close())
  return { temporaryRoot, packagePath, mediaRoot, grantPath, grantStore, session }
}

function parseRendition(url) {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  return { nonce: parsed.hostname, assetId: parts[0], profile: parts[1] }
}

function testIdFactory(prefix, overrides = {}) {
  let serial = 0
  return (kind) => overrides[kind] ?? `${prefix}-${kind}-${serial++}`
}

async function installCatalog(t, value, catalog) {
  value.session.close()
  await writeFile(
    join(value.packagePath, 'media', 'catalog.json'),
    `${JSON.stringify(catalog)}\n`,
  )
  const session = await LinuxMediaSession.open({
    packagePath: value.packagePath,
    deckId: 'deck-media-host-test',
    grantStore: value.grantStore,
  })
  t.after(() => session.close())
  return session
}

async function authorizeStoredRoot(grantStore, mediaRoot, rootId, fileIdentities = {}) {
  const metadata = await stat(mediaRoot)
  await grantStore.set({
    deckId: 'deck-media-host-test',
    rootId,
    authorizedPath: mediaRoot,
    rootDevice: String(metadata.dev),
    rootInode: String(metadata.ino),
    fileIdentities,
  })
}

test('native media session keeps absolute locators outside the portable Deck catalogue', async (t) => {
  const value = await fixture(t)
  await writeFile(join(value.mediaRoot, 'frame.png'), PNG_1X1)
  await writeFile(join(value.mediaRoot, 'rushes.mp4'), Buffer.from('catalogue-only-video'))

  const attached = await value.session.authorizeRoot(value.mediaRoot)
  assert.equal(attached.root.label, 'Selected Media')
  assert.equal(attached.root.availability, 'available')
  assert.equal(attached.scan.status, 'completed')

  const roots = await value.session.query('media.roots')
  const assets = await value.session.query('media.assets', { limit: 250 })
  assert.equal(roots.items.length, 1)
  assert.equal(roots.total, 1)
  assert.equal(roots.nextOffset, null)
  assert.equal(typeof roots.availabilityRevision, 'string')
  assert.equal(assets.availabilityRevision, roots.availabilityRevision)
  assert.equal(assets.items.length, 2)
  assert.equal(assets.nextOffset, null)
  const image = assets.items.find((asset) => asset.filename === 'frame.png')
  const video = assets.items.find((asset) => asset.filename === 'rushes.mp4')
  assert.equal(image.previewCapability, 'grid')
  assert.match(image.renditions.gridStandard, /^pitchdog-asset:\/\//)
  assert.equal(video.previewCapability, 'catalog_only')
  assert.equal(video.renditions.gridStandard, null)
  assert.equal(video.width, null)
  assert.equal(video.orientation, null)

  const portable = await readFile(join(value.packagePath, 'media', 'catalog.json'), 'utf8')
  const portableCatalog = JSON.parse(portable)
  assert.equal(portableCatalog.deckId, 'deck-media-host-test')
  assert.equal(portableCatalog.assets.every((asset) =>
    asset.filename === asset.relativePath.split('/').at(-1)), true)
  const hostLocal = await readFile(value.grantPath, 'utf8')
  assert.equal(portable.includes(value.mediaRoot), false)
  assert.equal(portable.includes('authorizedPath'), false)
  assert.equal(hostLocal.includes(value.mediaRoot), true)

  const source = await value.session.readGridResource(parseRendition(image.renditions.gridStandard))
  assert.deepEqual(source.dimensions, { width: 1, height: 1 })
  assert.equal(source.bytes.equals(PNG_1X1), true)
  await assert.rejects(
    value.session.query('media.assets', { limit: 251 }),
    (error) => error.name === 'InvalidMediaCatalog',
  )
  const firstPage = await value.session.query('media.assets', { limit: 1 })
  const secondPage = await value.session.query('media.assets', {
    offset: firstPage.nextOffset,
    limit: 1,
    expectedCatalogRevision: firstPage.catalogRevision,
    expectedAvailabilityRevision: firstPage.availabilityRevision,
  })
  assert.equal(secondPage.items.length, 1)
})

test('portable catalogue refuses a cross-Deck package swap', async (t) => {
  const value = await fixture(t)
  await writeFile(join(value.mediaRoot, 'frame.png'), PNG_1X1)
  await value.session.authorizeRoot(value.mediaRoot)
  const swappedPackage = join(value.temporaryRoot, 'Swapped.pitchdeck')
  await mkdir(join(swappedPackage, 'media'), { recursive: true })
  await writeFile(
    join(swappedPackage, 'media', 'catalog.json'),
    await readFile(join(value.packagePath, 'media', 'catalog.json')),
  )
  await assert.rejects(
    LinuxMediaSession.open({
      packagePath: swappedPackage,
      deckId: 'different-deck-id',
      grantStore: value.grantStore,
    }),
    (error) => error.name === 'CatalogDeckMismatch',
  )
})

test('oversized image sources are catalogue-only before any rendition URL is advertised', async (t) => {
  const value = await fixture(t)
  const path = join(value.mediaRoot, 'oversized.png')
  const handle = await open(path, 'w')
  try {
    await handle.write(PNG_1X1, 0, PNG_1X1.length, 0)
    await handle.truncate(32 * 1024 * 1024 + 1)
  } finally {
    await handle.close()
  }
  await value.session.authorizeRoot(value.mediaRoot)
  const assets = await value.session.query('media.assets')
  assert.equal(assets.items.length, 1)
  assert.equal(assets.items[0].availability, 'available')
  assert.equal(assets.items[0].previewCapability, 'catalog_only')
  assert.equal(assets.items[0].previewReason, 'source_outside_preview_bounds')
  assert.equal(assets.items[0].renditions.gridStandard, null)
})

test('same filesystem identity moves in place while missing files remain explicit', async (t) => {
  const value = await fixture(t)
  const originalPath = join(value.mediaRoot, 'original.png')
  const movedPath = join(value.mediaRoot, 'moved.png')
  await writeFile(originalPath, PNG_1X1)
  const rootId = (await value.session.authorizeRoot(value.mediaRoot)).root.id
  const before = await value.session.query('media.assets')
  const assetId = before.items[0].id

  await rename(originalPath, movedPath)
  const moved = await value.session.scanRoot(rootId)
  assert.equal(moved.scan.moved, 1)
  const afterMove = await value.session.query('media.assets')
  assert.equal(afterMove.items.length, 1)
  assert.equal(afterMove.items[0].id, assetId)
  assert.equal(afterMove.items[0].displayPath, 'moved.png')

  await rm(movedPath)
  const removed = await value.session.scanRoot(rootId)
  assert.equal(removed.scan.missing, 1)
  const afterRemoval = await value.session.query('media.assets')
  assert.equal(afterRemoval.items[0].id, assetId)
  assert.equal(afterRemoval.items[0].availability, 'missing')
  assert.equal(afterRemoval.items[0].renditions.gridStandard, null)
})

test('Root disconnect is a live availability overlay and reconnect preserves catalogue revision when unchanged', async (t) => {
  const value = await fixture(t)
  await writeFile(join(value.mediaRoot, 'frame.png'), PNG_1X1)
  const rootId = (await value.session.authorizeRoot(value.mediaRoot)).root.id
  const before = await value.session.query('media.assets')
  const relocated = join(value.temporaryRoot, 'Relocated Media')
  await rename(value.mediaRoot, relocated)

  const disconnectedRoots = await value.session.query('media.roots')
  const disconnectedAssets = await value.session.query('media.assets', {
    expectedCatalogRevision: before.catalogRevision,
  })
  assert.equal(disconnectedRoots.catalogRevision, before.catalogRevision)
  assert.equal(disconnectedRoots.items[0].availability, 'offline_volume')
  assert.equal(disconnectedAssets.items[0].availability, 'offline_volume')
  assert.equal(disconnectedAssets.items[0].renditions.gridStandard, null)

  const reconnected = await value.session.reconnectRoot(rootId, relocated)
  assert.equal(reconnected.root.availability, 'available')
  const after = await value.session.query('media.assets')
  assert.equal(after.catalogRevision, before.catalogRevision)
  assert.equal(after.items[0].id, before.items[0].id)
  assert.equal(after.items[0].availability, 'available')
})

test('resource lookup rejects symlink substitution and stale session nonces', async (t) => {
  const value = await fixture(t)
  const mediaPath = join(value.mediaRoot, 'frame.png')
  const outsidePath = join(value.temporaryRoot, 'outside.png')
  await writeFile(mediaPath, PNG_1X1)
  await writeFile(outsidePath, PNG_1X1)
  await symlink(outsidePath, join(value.mediaRoot, 'ignored.png'))
  await value.session.authorizeRoot(value.mediaRoot)
  const assets = await value.session.query('media.assets')
  assert.deepEqual(assets.items.map((asset) => asset.filename), ['frame.png'])
  const resource = parseRendition(assets.items[0].renditions.gridStandard)

  await rm(mediaPath)
  await symlink(outsidePath, mediaPath)
  await assert.rejects(
    value.session.readGridResource(resource),
    (error) => error.name === 'MissingMedia',
  )

  value.session.close()
  await assert.rejects(
    value.session.readGridResource(resource),
    (error) => error.name === 'DocumentUnavailable',
  )
})

test('an incomplete native walk never marks unseen catalogue entries missing', async (t) => {
  const value = await fixture(t)
  const original = join(value.mediaRoot, 'frame.png')
  await writeFile(original, PNG_1X1)
  const rootId = (await value.session.authorizeRoot(value.mediaRoot)).root.id
  const before = await value.session.query('media.assets')

  let deep = value.mediaRoot
  for (let index = 0; index < 66; index += 1) {
    deep = join(deep, `level-${String(index).padStart(2, '0')}`)
    await mkdir(deep)
  }
  await rename(original, join(deep, 'frame.png'))
  const result = await value.session.scanRoot(rootId)
  assert.equal(result.scan.status, 'incomplete')
  assert.equal(result.scan.missing, 0)

  const after = await value.session.query('media.assets')
  assert.equal(after.items[0].id, before.items[0].id)
  assert.equal(after.items[0].availability, 'available')
})

test('final enriched Asset pages stay within the exact control-frame bound', async (t) => {
  const value = await fixture(t)
  const rootId = 'root-hostile-assets'
  let catalog = createMediaCatalog({
    deckId: 'deck-media-host-test',
    roots: [{ id: rootId, label: 'Hostile summaries' }],
    idFactory: testIdFactory('hostile-catalog'),
  })
  const folder = Array.from(
    { length: 19 },
    (_, index) => `${String(index).padStart(2, '0')}${'d'.repeat(96)}`,
  ).join('/')
  const observations = Array.from({ length: 250 }, (_, index) => ({
    relativePath: `${folder}/${String(index).padStart(3, '0')}-${'f'.repeat(480)}.png`,
    title: 't'.repeat(1_000),
    note: 'n'.repeat(4_000),
    mediaKind: 'image',
    width: null,
    height: null,
    byteSize: 1,
    availability: 'available',
    previewCapability: 'unsupported',
    previewReason: 'catalogue-only',
    fingerprint: 'f'.repeat(500),
    platformIdentity: null,
    platformIdentityKind: null,
    linkCount: 1,
  }))
  catalog = reconcileMediaScan(catalog, {
    rootId,
    status: 'completed',
    observations,
  }, { idFactory: testIdFactory('hostile-assets') }).catalog

  const corePage = queryMediaCatalog(catalog, {
    limit: 250,
    rootAvailability: { [rootId]: 'needs_permission' },
  })
  const naivelyEnriched = {
    catalogRevision: corePage.catalogRevision,
    availabilityRevision: corePage.availabilityRevision,
    offset: 0,
    limit: 250,
    total: corePage.total,
    nextOffset: corePage.nextOffset,
    items: corePage.items.map((asset) => ({
      ...asset,
      relativeDisplayPath: asset.displayPath,
      label: asset.filename,
      previewCapability: 'catalog_only',
      renditions: { gridStandard: null },
    })),
  }
  assert.ok(Buffer.byteLength(JSON.stringify(naivelyEnriched), 'utf8') > 1_048_576)

  const session = await installCatalog(t, value, catalog)
  const first = await session.query('media.assets', { limit: 250 })
  assert.ok(first.items.length > 0)
  assert.ok(first.items.length < corePage.items.length)
  assert.equal(first.nextOffset, first.items.length)
  assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') <= 1_048_576)
  const second = await session.query('media.assets', {
    offset: first.nextOffset,
    limit: 250,
    expectedCatalogRevision: first.catalogRevision,
    expectedAvailabilityRevision: first.availabilityRevision,
  })
  assert.ok(Buffer.byteLength(JSON.stringify(second), 'utf8') <= 1_048_576)
  assert.notEqual(first.items.at(-1).id, second.items[0].id)
})

test('Root pages are bounded, advancing, and pinned to catalogue and live availability generations', async (t) => {
  const value = await fixture(t)
  const roots = Array.from({ length: 601 }, (_, index) => ({
    id: `root-page-${String(index).padStart(4, '0')}`,
    label: `${String(index).padStart(4, '0')}-${'r'.repeat(155)}`,
  }))
  const catalog = createMediaCatalog({
    deckId: 'deck-media-host-test',
    roots,
    idFactory: testIdFactory('root-pages'),
  })
  const session = await installCatalog(t, value, catalog)
  const first = await session.query('media.roots', { offset: 0, limit: 250 })
  assert.equal(first.items.length, 250)
  assert.equal(first.total, 601)
  assert.equal(first.nextOffset, 250)
  assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') <= 1_048_576)
  await assert.rejects(
    session.query('media.roots', {
      offset: first.nextOffset,
      limit: 250,
      expectedCatalogRevision: first.catalogRevision,
    }),
    (error) => error.name === 'InvalidCommand',
  )
  const second = await session.query('media.roots', {
    offset: first.nextOffset,
    limit: 250,
    expectedCatalogRevision: first.catalogRevision,
    expectedAvailabilityRevision: first.availabilityRevision,
  })
  assert.equal(second.items.length, 250)
  assert.equal(second.nextOffset, 500)
  assert.ok(Buffer.byteLength(JSON.stringify(second), 'utf8') <= 1_048_576)
  const third = await session.query('media.roots', {
    offset: second.nextOffset,
    limit: 250,
    expectedCatalogRevision: second.catalogRevision,
    expectedAvailabilityRevision: second.availabilityRevision,
  })
  assert.equal(third.items.length, 101)
  assert.equal(third.nextOffset, null)
  assert.ok(Buffer.byteLength(JSON.stringify(third), 'utf8') <= 1_048_576)

  await authorizeStoredRoot(value.grantStore, value.mediaRoot, roots[0].id)
  await assert.rejects(
    session.query('media.roots', {
      offset: first.nextOffset,
      limit: 250,
      expectedCatalogRevision: first.catalogRevision,
      expectedAvailabilityRevision: first.availabilityRevision,
    }),
    (error) => error.name === 'QuerySnapshotChanged',
  )
})

test('reserved Root identities cannot corrupt live availability overlays', async (t) => {
  const value = await fixture(t)
  const rootId = '__proto__'
  const catalog = createMediaCatalog({
    deckId: 'deck-media-host-test',
    roots: [{ id: rootId, label: 'Reserved Root' }],
    idFactory: testIdFactory('reserved-root'),
  })
  await authorizeStoredRoot(value.grantStore, value.mediaRoot, rootId)
  const session = await installCatalog(t, value, catalog)
  const roots = await session.query('media.roots')
  const assets = await session.query('media.assets')
  assert.equal(roots.items[0].id, rootId)
  assert.equal(roots.items[0].availability, 'available')
  assert.equal(assets.availabilityRevision, roots.availabilityRevision)
})

test('reserved Asset identities remain own keys in host-local scan observations', async (t) => {
  const value = await fixture(t)
  await writeFile(join(value.mediaRoot, 'frame.png'), PNG_1X1)
  const rootId = 'root-reserved-asset'
  let catalog = createMediaCatalog({
    deckId: 'deck-media-host-test',
    roots: [{ id: rootId, label: 'Reserved Asset' }],
    idFactory: testIdFactory('reserved-asset-catalog'),
  })
  catalog = reconcileMediaScan(catalog, {
    rootId,
    status: 'completed',
    observations: [{
      relativePath: 'frame.png',
      mediaKind: 'image',
      width: 1,
      height: 1,
      byteSize: PNG_1X1.length,
      availability: 'available',
      previewCapability: 'still-image',
      previewReason: null,
      fingerprint: createHash('sha256').update(PNG_1X1).digest('hex'),
      platformIdentity: null,
      platformIdentityKind: null,
      linkCount: 1,
    }],
  }, { idFactory: testIdFactory('reserved-asset', { asset: '__proto__' }) }).catalog
  await authorizeStoredRoot(value.grantStore, value.mediaRoot, rootId)
  const session = await installCatalog(t, value, catalog)
  await session.scanRoot(rootId)
  const grant = value.grantStore.get('deck-media-host-test', rootId)
  assert.equal(Object.hasOwn(grant.fileIdentities, '__proto__'), true)
  assert.deepEqual(Object.getPrototypeOf(grant.fileIdentities), Object.prototype)
  const assets = await session.query('media.assets')
  assert.equal(assets.items[0].id, '__proto__')
  assert.equal(assets.items[0].previewCapability, 'grid')
  const source = await session.readGridResource(parseRendition(assets.items[0].renditions.gridStandard))
  assert.equal(source.bytes.equals(PNG_1X1), true)
})

test('Root authorization rejects an exhausted catalogue revision before persistence', async (t) => {
  const value = await fixture(t)
  const exhausted = {
    ...createMediaCatalog({
      deckId: 'deck-media-host-test',
      idFactory: testIdFactory('exhausted'),
    }),
    revision: Number.MAX_SAFE_INTEGER,
  }
  const session = await installCatalog(t, value, exhausted)
  await assert.rejects(
    session.authorizeRoot(value.mediaRoot),
    (error) => error.name === 'RevisionExhausted',
  )
  const persisted = JSON.parse(await readFile(join(value.packagePath, 'media', 'catalog.json'), 'utf8'))
  assert.equal(persisted.revision, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(persisted.roots, [])
  assert.deepEqual(value.grantStore.list('deck-media-host-test'), [])
})
