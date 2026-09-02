import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import {
  createMediaCatalog,
  MediaCatalogError,
  openMediaCatalog,
  queryMediaCatalog,
  reconcileMediaScan,
} from '../../packages/media-catalog/index.mjs'
import { SerialOperationQueue } from './serial-operation-queue.mjs'
import {
  authorizeDirectory,
  discoverMediaRoot,
  mediaRootAccessContract,
  readGridSource,
  verifyReconnect,
} from './media-root-access.mjs'

const MAX_CATALOG_BYTES = 64 * 1024 * 1024
const MAX_CONTROL_FRAME_BYTES = 1024 * 1024
const MAX_QUERY_LIMIT = 250
const GRID_CAPABILITIES = new Set(['still-image', 'animated-image'])
const PREVIEW_PROFILE_IDS = new Set(
  Object.values(mediaRootAccessContract.previewProfiles).map((profile) => profile.id),
)

function failure(name, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { name })
}

function opaqueId(kind) {
  return `${kind}-${randomUUID()}`
}

function safeDisplay(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '�')
}

function isMissing(error) {
  return error?.code === 'ENOENT'
    || error?.cause?.code === 'ENOENT'
    || error?.code === 'ENOTDIR'
    || error?.cause?.code === 'ENOTDIR'
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeAtomically(path, bytes) {
  const temporary = `${path}.tmp-${randomUUID()}`
  let handle
  try {
    handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    )
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, path)
    await syncDirectory(dirname(path))
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw failure('MediaCatalogWriteFailure', 'The portable media catalogue could not be saved', error)
  }
}

async function prepareCatalogPath(packagePath) {
  const requested = resolve(packagePath)
  if (extname(requested).toLowerCase() !== '.pitchdeck') {
    throw failure('UnsupportedSchema', 'Media catalogues belong to an open .pitchdeck package')
  }
  let packageEntry
  try {
    packageEntry = await lstat(requested)
  } catch (error) {
    throw failure('DocumentUnavailable', 'The active Deck package is unavailable', error)
  }
  if (packageEntry.isSymbolicLink() || !packageEntry.isDirectory()) {
    throw failure('PermissionDenied', 'The active Deck package is not a safe directory')
  }
  const packageRoot = await realpath(requested)
  const mediaPath = resolve(packageRoot, 'media')
  try {
    await mkdir(mediaPath, { mode: 0o700 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw failure('MediaCatalogWriteFailure', 'The Deck media directory could not be created', error)
  }
  const mediaEntry = await lstat(mediaPath)
  if (mediaEntry.isSymbolicLink() || !mediaEntry.isDirectory() || await realpath(mediaPath) !== mediaPath) {
    throw failure('PermissionDenied', 'The Deck media directory is not a contained real directory')
  }
  return resolve(mediaPath, 'catalog.json')
}

async function loadCatalog(path, deckId) {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile() || entry.size > MAX_CATALOG_BYTES) {
      throw failure('UnsupportedSchema', 'The Deck media catalogue is not a safe bounded file')
    }
    return openMediaCatalog(JSON.parse(await readFile(path, 'utf8')), { expectedDeckId: deckId })
  } catch (error) {
    if (isMissing(error)) return null
    if (error instanceof MediaCatalogError || error?.name === 'UnsupportedSchema') throw error
    throw failure('UnsupportedSchema', 'The Deck media catalogue could not be opened', error)
  }
}

function publicCapability(capability) {
  return GRID_CAPABILITIES.has(capability) ? 'grid' : 'catalog_only'
}

function checkedNextRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw failure(
      'RevisionExhausted',
      'Media catalogue revision space is exhausted; no Root changes were committed',
    )
  }
  return revision + 1
}

function rootAssetCounts(catalog) {
  const counts = new Map(catalog.roots.map((root) => [root.id, { assetCount: 0, missingCount: 0 }]))
  for (const asset of catalog.assets) {
    const count = counts.get(asset.rootId)
    if (!count) continue
    count.assetCount += 1
    if (asset.availability === 'missing') count.missingCount += 1
  }
  return counts
}

function pageRequest(params) {
  const offset = params.offset ?? 0
  const limit = params.limit ?? 100
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw failure('InvalidCommand', 'Media query offset must be a non-negative integer')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw failure('InvalidCommand', `Media query limit must be between 1 and ${MAX_QUERY_LIMIT}`)
  }
  if (offset > 0 && params.expectedCatalogRevision === undefined) {
    throw failure('InvalidCommand', 'expectedCatalogRevision is required after the first media page')
  }
  if (
    params.expectedCatalogRevision !== undefined
    && (!Number.isSafeInteger(params.expectedCatalogRevision) || params.expectedCatalogRevision < 0)
  ) {
    throw failure('InvalidCommand', 'expectedCatalogRevision must be a non-negative integer')
  }
  if (offset > 0 && params.expectedAvailabilityRevision === undefined) {
    throw failure('InvalidCommand', 'expectedAvailabilityRevision is required after the first media page')
  }
  if (
    params.expectedAvailabilityRevision !== undefined
    && (typeof params.expectedAvailabilityRevision !== 'string'
      || params.expectedAvailabilityRevision.length === 0
      || params.expectedAvailabilityRevision.length > 100)
  ) {
    throw failure('InvalidCommand', 'expectedAvailabilityRevision must be a bounded generation identity')
  }
  return { offset, limit }
}

function boundedPageResponse({ catalogRevision, availabilityRevision, offset, limit, total, items, kind }) {
  const boundedItems = [...items]
  while (true) {
    const deliveredEnd = offset + boundedItems.length
    const response = {
      catalogRevision,
      availabilityRevision,
      offset,
      limit,
      total,
      nextOffset: deliveredEnd < total ? deliveredEnd : null,
      items: boundedItems,
    }
    if (Buffer.byteLength(JSON.stringify(response), 'utf8') <= MAX_CONTROL_FRAME_BYTES) return response
    if (boundedItems.length <= 1) {
      throw failure('ResultTooLarge', `One media ${kind} summary exceeds the 1 MiB control-frame limit`)
    }
    boundedItems.pop()
  }
}

export class LinuxMediaSession {
  static async open({ packagePath, deckId, grantStore }) {
    if (typeof deckId !== 'string' || deckId.length === 0 || !grantStore) {
      throw failure('InvalidCommand', 'A Deck identity and native grant store are required')
    }
    const catalogPath = await prepareCatalogPath(packagePath)
    const existing = await loadCatalog(catalogPath, deckId)
    const catalog = existing ?? createMediaCatalog({ deckId, idFactory: opaqueId })
    const media = new LinuxMediaSession({ catalogPath, deckId, grantStore, catalog })
    if (!existing) await media.#persist(catalog)
    return media
  }

  #catalogPath
  #deckId
  #grantStore
  #catalog
  #nonce = randomUUID()
  #queue = new SerialOperationQueue()
  #scanControllers = new Map()
  #closed = false

  constructor({ catalogPath, deckId, grantStore, catalog }) {
    this.#catalogPath = catalogPath
    this.#deckId = deckId
    this.#grantStore = grantStore
    this.#catalog = catalog
  }

  get catalogRevision() {
    this.#requireOpen()
    return this.#catalog.revision
  }

  async query(name, params = {}) {
    this.#requireOpen()
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw failure('InvalidCommand', 'Media query parameters must be an object')
    }
    if (name === 'media.roots') return this.#queryRoots(params)
    if (name === 'media.assets') return this.#queryAssets(params)
    throw failure('InvalidCommand', `Unknown media query: ${name}`)
  }

  authorizeRoot(path) {
    return this.#queue.run(async () => {
      this.#requireOpen()
      const authorized = await authorizeDirectory(path)
      const duplicate = this.#grantStore.list(this.#deckId).find((grant) =>
        grant.rootDevice === authorized.rootDevice && grant.rootInode === authorized.rootInode)
      if (duplicate) throw failure('RootAlreadyAuthorized', 'That folder is already attached to this Deck')

      const rootId = opaqueId('root')
      const revision = checkedNextRevision(this.#catalog.revision)
      const next = openMediaCatalog({
        ...this.#catalog,
        revision,
        roots: [...this.#catalog.roots, { id: rootId, label: safeDisplay(authorized.displayName) }],
      }, { expectedDeckId: this.#deckId })
      await this.#persist(next)
      await this.#grantStore.set({
        deckId: this.#deckId,
        rootId,
        authorizedPath: authorized.authorizedPath,
        rootDevice: authorized.rootDevice,
        rootInode: authorized.rootInode,
        fileIdentities: {},
      })
      const scan = await this.#scanAuthorized(rootId, authorized)
      this.#requireOpen()
      return { root: await this.#publicRoot(rootId), scan }
    })
  }

  reconnectRoot(rootId, path) {
    return this.#queue.run(async () => {
      this.#requireRoot(rootId)
      const previous = this.#grantStore.get(this.#deckId, rootId)
      const assets = this.#catalog.assets.filter((asset) => asset.rootId === rootId)
      const authorized = await verifyReconnect(path, { expectedGrant: previous, assets })
      await this.#grantStore.set({
        deckId: this.#deckId,
        rootId,
        authorizedPath: authorized.authorizedPath,
        rootDevice: authorized.rootDevice,
        rootInode: authorized.rootInode,
        fileIdentities: previous?.fileIdentities ?? {},
      })
      const scan = await this.#scanAuthorized(rootId, authorized)
      this.#requireOpen()
      return { root: await this.#publicRoot(rootId), scan }
    })
  }

  scanRoot(rootId) {
    return this.#queue.run(async () => {
      this.#requireRoot(rootId)
      const grant = this.#grantStore.get(this.#deckId, rootId)
      if (!grant) throw failure('MediaRootNeedsPermission', 'This media Root needs permission')
      const authorized = await authorizeDirectory(grant.authorizedPath)
      if (authorized.rootDevice !== grant.rootDevice || authorized.rootInode !== grant.rootInode) {
        throw failure('MediaRootNeedsPermission', 'The stored media Root no longer identifies the authorised folder')
      }
      const scan = await this.#scanAuthorized(rootId, authorized)
      this.#requireOpen()
      return { root: await this.#publicRoot(rootId), scan }
    })
  }

  async readGridResource({ nonce, assetId, profile }) {
    this.#requireOpen()
    if (nonce !== this.#nonce) throw failure('StaleMediaSession', 'This media resource session is no longer active')
    if (!PREVIEW_PROFILE_IDS.has(profile)) {
      throw failure('UnsupportedMediaPreview', 'Unknown media preview profile')
    }
    const asset = this.#catalog.assets.find((candidate) => candidate.id === assetId)
    if (!asset) throw failure('MissingMedia', 'Media Asset does not exist')
    if (asset.availability !== 'available' || !GRID_CAPABILITIES.has(asset.previewCapability)) {
      throw failure('UnsupportedMediaPreview', 'This Media Asset has no safe preview')
    }
    const grant = this.#grantStore.get(this.#deckId, asset.rootId)
    if (!grant) throw failure('MediaRootNeedsPermission', 'This media Root needs permission')
    const authorized = await authorizeDirectory(grant.authorizedPath)
    if (authorized.rootDevice !== grant.rootDevice || authorized.rootInode !== grant.rootInode) {
      throw failure('MediaRootNeedsPermission', 'This media Root must be reconnected')
    }
    const source = await readGridSource({ rootPath: authorized.authorizedPath, asset })
    this.#requireOpen()
    if (nonce !== this.#nonce) throw failure('StaleMediaSession', 'This media resource session is no longer active')
    return source
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    this.#nonce = null
    for (const controller of this.#scanControllers.values()) controller.abort()
    this.#scanControllers.clear()
  }

  async #queryRoots(params) {
    const allowed = new Set([
      'offset',
      'limit',
      'expectedCatalogRevision',
      'expectedAvailabilityRevision',
    ])
    if (Object.keys(params).some((key) => !allowed.has(key))) {
      throw failure('InvalidCommand', 'media.roots accepts only bounded pagination and generation parameters')
    }
    const { offset, limit } = pageRequest(params)
    const catalog = this.#catalog
    if (
      params.expectedCatalogRevision !== undefined
      && params.expectedCatalogRevision !== catalog.revision
    ) {
      throw failure(
        'QuerySnapshotChanged',
        `Expected media catalogue revision ${params.expectedCatalogRevision}; current revision is ${catalog.revision}`,
      )
    }
    const availabilityEntries = []
    for (const root of catalog.roots) {
      availabilityEntries.push([root.id, await this.#rootAvailability(root.id)])
    }
    if (this.#catalog !== catalog) {
      throw failure('QuerySnapshotChanged', 'The media catalogue changed while Root availability was read')
    }
    const rootAvailability = Object.fromEntries(availabilityEntries)
    const availability = queryMediaCatalog(catalog, { limit: 1, rootAvailability })
    if (
      params.expectedAvailabilityRevision !== undefined
      && params.expectedAvailabilityRevision !== availability.availabilityRevision
    ) {
      throw failure('QuerySnapshotChanged', 'Live media Root availability changed during the paged query')
    }
    const end = Math.min(catalog.roots.length, offset + limit)
    const page = offset < catalog.roots.length ? catalog.roots.slice(offset, end) : []
    const counts = rootAssetCounts(catalog)
    const items = page.map((root) => ({
      id: root.id,
      label: safeDisplay(root.label),
      availability: rootAvailability[root.id],
      ...(counts.get(root.id) ?? { assetCount: 0, missingCount: 0 }),
    }))
    this.#requireOpen()
    return boundedPageResponse({
      catalogRevision: catalog.revision,
      availabilityRevision: availability.availabilityRevision,
      offset,
      limit,
      total: catalog.roots.length,
      items,
      kind: 'Root',
    })
  }

  async #queryAssets(params) {
    const catalog = this.#catalog
    const requested = { ...params }
    if (requested.rootId !== undefined) {
      if (typeof requested.rootId !== 'string') throw failure('InvalidCommand', 'rootId must be an opaque identity')
      requested.rootIds = [requested.rootId]
      delete requested.rootId
    }
    const offset = requested.offset ?? 0
    const limit = requested.limit
      ?? (Array.isArray(requested.assetIds) ? requested.assetIds.length : 100)
    const availabilityEntries = []
    for (const root of catalog.roots) {
      availabilityEntries.push([root.id, await this.#rootAvailability(root.id)])
    }
    if (this.#catalog !== catalog) {
      throw failure('QuerySnapshotChanged', 'The media catalogue changed while Root availability was read')
    }
    const rootAvailability = Object.fromEntries(availabilityEntries)
    const result = queryMediaCatalog(catalog, { ...requested, rootAvailability })
    const items = result.items.map((asset) => {
        const grid = GRID_CAPABILITIES.has(asset.previewCapability)
        const available = asset.availability === 'available'
        return {
          ...asset,
          filename: safeDisplay(asset.filename),
          folder: safeDisplay(asset.folder),
          displayPath: safeDisplay(asset.displayPath),
          relativeDisplayPath: safeDisplay(asset.displayPath),
          label: safeDisplay(asset.filename),
          width: asset.mediaKind === 'video' || asset.availability === 'unreadable' ? null : asset.width,
          height: asset.mediaKind === 'video' || asset.availability === 'unreadable' ? null : asset.height,
          orientation: asset.mediaKind === 'video' || asset.availability === 'unreadable' ? null : asset.orientation,
          previewCapability: publicCapability(asset.previewCapability),
          renditions: {
            gridStandard: grid && available
              ? `pitchdog-asset://${this.#nonce}/${encodeURIComponent(asset.id)}/${mediaRootAccessContract.previewProfiles.gridStandard.id}`
              : null,
            previewStandard: grid && available
              ? `pitchdog-asset://${this.#nonce}/${encodeURIComponent(asset.id)}/${mediaRootAccessContract.previewProfiles.previewStandard.id}`
              : null,
          },
        }
      })
    this.#requireOpen()
    return boundedPageResponse({
      catalogRevision: result.catalogRevision,
      availabilityRevision: result.availabilityRevision,
      offset,
      limit,
      total: result.total,
      items,
      kind: 'Asset',
    })
  }

  async #publicRoot(rootId) {
    const root = this.#requireRoot(rootId)
    const counts = rootAssetCounts(this.#catalog).get(root.id) ?? { assetCount: 0, missingCount: 0 }
    return {
      id: root.id,
      label: safeDisplay(root.label),
      availability: await this.#rootAvailability(root.id),
      ...counts,
    }
  }

  async #rootAvailability(rootId) {
    const grant = this.#grantStore.get(this.#deckId, rootId)
    if (!grant) return 'needs_permission'
    try {
      const authorized = await authorizeDirectory(grant.authorizedPath)
      return authorized.rootDevice === grant.rootDevice && authorized.rootInode === grant.rootInode
        ? 'available'
        : 'needs_permission'
    } catch (error) {
      return isMissing(error) ? 'offline_volume' : 'needs_permission'
    }
  }

  async #scanAuthorized(rootId, authorized) {
    const controller = new AbortController()
    this.#scanControllers.set(rootId, controller)
    try {
      const knownByRelativePath = new Map(
        this.#catalog.assets
          .filter((asset) => asset.rootId === rootId)
          .map((asset) => [asset.relativePath, asset]),
      )
      const discovery = await discoverMediaRoot(authorized.authorizedPath, {
        signal: controller.signal,
        knownByRelativePath,
      })
      const observations = discovery.discovered.map((entry) => ({
        relativePath: entry.relativePath,
        mediaKind: entry.mediaKind,
        width: entry.width,
        height: entry.height,
        byteSize: entry.byteSize,
        availability: entry.availability,
        previewCapability: entry.previewCapability,
        previewReason: entry.previewReason,
        fingerprint: entry.fingerprint ?? `unavailable:${entry.byteSize}:${entry.modifiedAt}`,
        platformIdentity: entry.fingerprint !== null && entry.linkCount === 1
          ? `${entry.fileIdentity.device}:${entry.fileIdentity.inode}`
          : null,
        platformIdentityKind: entry.fingerprint !== null && entry.linkCount === 1
          ? 'linux-dev-inode'
          : null,
        linkCount: entry.linkCount,
      }))
      const reconciled = reconcileMediaScan(this.#catalog, {
        rootId,
        status: discovery.complete ? 'completed' : 'cancelled',
        observations,
      }, { idFactory: opaqueId })
      if (reconciled.summary.changed) await this.#persist(reconciled.catalog)

      const previousGrant = this.#grantStore.get(this.#deckId, rootId)
      const identities = new Map(Object.entries(previousGrant?.fileIdentities ?? {}))
      const observationByPath = new Map(discovery.discovered.map((entry) => [entry.relativePath, entry]))
      for (const asset of this.#catalog.assets.filter((candidate) => candidate.rootId === rootId)) {
        const observation = observationByPath.get(asset.relativePath)
        if (observation) identities.set(asset.id, observation.fileIdentity)
      }
      await this.#grantStore.set({
        deckId: this.#deckId,
        rootId,
        authorizedPath: authorized.authorizedPath,
        rootDevice: authorized.rootDevice,
        rootInode: authorized.rootInode,
        fileIdentities: Object.fromEntries(identities),
      })
      return {
        ...reconciled.summary,
        status: discovery.complete ? reconciled.summary.status : 'incomplete',
        discovered: discovery.discovered.length,
        warningCount: discovery.warningCount,
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'JobCancelled') {
        return { status: 'cancelled', changed: false, discovered: 0, warningCount: 0 }
      }
      throw error
    } finally {
      if (this.#scanControllers.get(rootId) === controller) this.#scanControllers.delete(rootId)
    }
  }

  async #persist(catalog) {
    this.#requireOpen()
    const validated = openMediaCatalog(catalog, { expectedDeckId: this.#deckId })
    const compact = `${JSON.stringify(validated)}\n`
    if (Buffer.byteLength(compact, 'utf8') > MAX_CATALOG_BYTES) {
      throw failure('MediaCatalogWriteFailure', 'The portable media catalogue exceeds its 64 MiB persistence bound')
    }
    const pretty = `${JSON.stringify(validated, null, 2)}\n`
    await writeAtomically(
      this.#catalogPath,
      Buffer.byteLength(pretty, 'utf8') <= MAX_CATALOG_BYTES ? pretty : compact,
    )
    this.#catalog = validated
  }

  #requireRoot(rootId) {
    if (typeof rootId !== 'string' || rootId.length === 0) {
      throw failure('InvalidCommand', 'rootId must be an opaque identity')
    }
    const root = this.#catalog.roots.find((candidate) => candidate.id === rootId)
    if (!root) throw failure('UnknownRoot', `Root does not exist: ${rootId}`)
    return root
  }

  #requireOpen() {
    if (this.#closed) throw failure('DocumentUnavailable', 'The Deck media session is closed')
  }
}

export const linuxMediaSessionContract = Object.freeze({
  catalogFile: 'media/catalog.json',
  queryNames: Object.freeze(['media.roots', 'media.assets']),
  commandTypes: Object.freeze(['media.root.authorize', 'media.root.reconnect', 'media.root.scan']),
  previewProfile: mediaRootAccessContract.previewProfile,
  previewProfiles: mediaRootAccessContract.previewProfiles,
})
