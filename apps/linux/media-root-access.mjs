import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { constants } from 'node:fs'
import { lstat, open, opendir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'

const MEDIA_KINDS = new Map([
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.png', 'image'],
  ['.webp', 'image'],
  ['.gif', 'gif'],
  ['.mp4', 'video'],
  ['.mov', 'video'],
  ['.m4v', 'video'],
  ['.webm', 'video'],
])
const PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const MAX_DISCOVERED_FILES = 12_000
const MAX_FINGERPRINT_BYTES = 256 * 1024 * 1024
const MAX_RESOURCE_BYTES = 32 * 1024 * 1024
const MAX_DECODED_PIXELS = 64_000_000
const MAX_DIMENSION = 32_768
const MAX_METADATA_BYTES = 4 * 1024 * 1024
const PREVIEW_PROFILES = Object.freeze({
  gridStandard: Object.freeze({
    id: 'grid_standard',
    maxLongestSide: 512,
    maxOutputBytes: 8 * 1024 * 1024,
  }),
  previewStandard: Object.freeze({
    id: 'preview_standard',
    maxLongestSide: 2048,
    maxOutputBytes: 32 * 1024 * 1024,
  }),
})

function failure(name, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { name })
}

function abortIfRequested(signal) {
  if (signal?.aborted) throw failure('JobCancelled', 'Media Root scan was cancelled')
}

function contained(root, candidate) {
  const fromRoot = relative(root, candidate)
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
}

function safeSegments(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 8192) {
    throw failure('UnsafeMediaLocation', 'Media location identity is invalid')
  }
  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))) {
    throw failure('UnsafeMediaLocation', 'Media location identity is invalid')
  }
  return segments
}

function displayPath(relativePath) {
  return relativePath.replace(/[\u0000-\u001f\u007f]/g, '�')
}

function relativeIdentity(root, candidate) {
  const value = relative(root, candidate)
  if (!value || value.startsWith('..') || isAbsolute(value)) {
    throw failure('UnsafeMediaLocation', 'Media file escaped its authorised Root')
  }
  return value.split(sep).join('/')
}

async function fingerprint(path, byteLength, signal) {
  if (byteLength > MAX_FINGERPRINT_BYTES) return null
  abortIfRequested(signal)
  const hash = createHash('sha256')
  const stream = createReadStream(path, { signal })
  try {
    for await (const chunk of stream) {
      abortIfRequested(signal)
      hash.update(chunk)
    }
    return hash.digest('hex')
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') {
      throw failure('JobCancelled', 'Media Root scan was cancelled', error)
    }
    throw error
  }
}

async function probeImage(path, extension, signal) {
  abortIfRequested(signal)
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const entry = await handle.stat()
    const bytes = Buffer.alloc(Math.min(entry.size, MAX_METADATA_BYTES))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    abortIfRequested(signal)
    const dimensions = imageDimensions(bytes.subarray(0, bytesRead), extension)
    if (
      !dimensions
      || dimensions.width <= 0
      || dimensions.height <= 0
      || dimensions.width > MAX_DIMENSION
      || dimensions.height > MAX_DIMENSION
      || dimensions.width * dimensions.height > MAX_DECODED_PIXELS
    ) return null
    return dimensions
  } finally {
    await handle?.close().catch(() => {})
  }
}

export async function authorizeDirectory(path) {
  const requested = resolve(path)
  let entry
  try {
    entry = await lstat(requested)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('not a real directory')
    const canonicalPath = await realpath(requested)
    const canonicalEntry = await stat(canonicalPath)
    if (!canonicalEntry.isDirectory()) throw new Error('not a directory')
    return {
      authorizedPath: canonicalPath,
      displayName: basename(canonicalPath) || 'Media Root',
      rootDevice: String(canonicalEntry.dev),
      rootInode: String(canonicalEntry.ino),
    }
  } catch (error) {
    throw failure('MediaRootUnavailable', 'The selected media Root is unavailable or unsafe', error)
  }
}

export async function discoverMediaRoot(rootPath, { signal, knownByRelativePath = new Map() } = {}) {
  const root = await authorizeDirectory(rootPath)
  const discovered = []
  let complete = true
  let warningCount = 0

  async function visit(directory, depth) {
    abortIfRequested(signal)
    if (depth > 64) {
      complete = false
      warningCount += 1
      return
    }
    let stream
    try {
      stream = await opendir(directory)
      for await (const item of stream) {
        abortIfRequested(signal)
        if (discovered.length >= MAX_DISCOVERED_FILES) {
          complete = false
          warningCount += 1
          return
        }
        const candidate = resolve(directory, item.name)
        let entry
        try {
          entry = await lstat(candidate)
          if (entry.isSymbolicLink()) continue
          const canonical = await realpath(candidate)
          if (!contained(root.authorizedPath, canonical)) {
            complete = false
            warningCount += 1
            continue
          }
          if (entry.isDirectory()) {
            await visit(canonical, depth + 1)
            continue
          }
          if (!entry.isFile()) continue
          const extension = extname(item.name).toLowerCase()
          const mediaKind = MEDIA_KINDS.get(extension)
          if (!mediaKind) continue
          const relativePath = relativeIdentity(root.authorizedPath, canonical)
          const known = knownByRelativePath.get(relativePath)
          const modifiedAt = Math.trunc(entry.mtimeMs)
          const digest = known
            && known.byteSize === entry.size
            && known.modifiedAt === modifiedAt
            && typeof known.fingerprint === 'string'
            ? known.fingerprint
            : await fingerprint(canonical, entry.size, signal)
          const dimensions = PREVIEW_EXTENSIONS.has(extension)
            ? await probeImage(canonical, extension, signal)
            : null
          const validImage = dimensions !== null
          const readablePreview = validImage && entry.size > 0 && entry.size <= MAX_RESOURCE_BYTES
          discovered.push({
            relativePath,
            relativeDisplayPath: displayPath(relativePath),
            label: displayPath(item.name),
            mediaKind,
            extension,
            byteSize: entry.size,
            modifiedAt,
            fingerprint: digest,
            fileIdentity: { device: String(entry.dev), inode: String(entry.ino) },
            linkCount: entry.nlink,
            availability: PREVIEW_EXTENSIONS.has(extension) && !validImage ? 'unreadable' : 'available',
            previewCapability: readablePreview
              ? mediaKind === 'gif' ? 'animated-image' : 'still-image'
              : 'unsupported',
            previewReason: readablePreview
              ? null
              : !PREVIEW_EXTENSIONS.has(extension)
                ? 'video_catalogue_only'
                : validImage ? 'source_outside_preview_bounds' : 'unreadable_image',
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
          })
        } catch (error) {
          if (signal?.aborted || error.name === 'JobCancelled' || error.name === 'AbortError') throw error
          complete = false
          warningCount += 1
        }
      }
    } catch (error) {
      if (signal?.aborted || error.name === 'JobCancelled' || error.name === 'AbortError') throw error
      complete = false
      warningCount += 1
      await stream?.close().catch(() => {})
    }
  }

  await visit(root.authorizedPath, 0)
  abortIfRequested(signal)
  return { root, discovered, complete, warningCount }
}

export async function verifyReconnect(candidatePath, { expectedGrant, assets }) {
  const candidate = await authorizeDirectory(candidatePath)
  if (
    expectedGrant
    && candidate.rootDevice === expectedGrant.rootDevice
    && candidate.rootInode === expectedGrant.rootInode
  ) return candidate

  const evidence = assets
    .filter((asset) =>
      asset.availability !== 'missing'
      && typeof asset.fingerprint === 'string'
      && !asset.fingerprint.startsWith('unavailable:')
      && asset.byteSize <= 128 * 1024 * 1024)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .slice(0, 8)
  const required = Math.min(2, evidence.length)
  if (required === 0) return candidate

  let matched = 0
  let inspectedBytes = 0
  const startedAt = Date.now()
  for (const asset of evidence) {
    if (Date.now() - startedAt > 10_000 || inspectedBytes >= MAX_FINGERPRINT_BYTES) break
    const path = resolve(candidate.authorizedPath, ...safeSegments(asset.relativePath))
    try {
      const entry = await lstat(path)
      if (entry.isSymbolicLink() || !entry.isFile() || entry.size !== asset.byteSize) continue
      if (entry.size > 128 * 1024 * 1024 || inspectedBytes + entry.size > MAX_FINGERPRINT_BYTES) continue
      const canonical = await realpath(path)
      if (!contained(candidate.authorizedPath, canonical)) continue
      inspectedBytes += entry.size
      if (await fingerprint(canonical, entry.size) === asset.fingerprint) matched += 1
      if (matched >= required) return candidate
    } catch {
      // Bounded evidence is intentionally conservative; one miss does not establish identity.
    }
  }
  throw failure('MediaRootMismatch', 'The selected folder does not match this media Root')
}

function imageDimensions(bytes, extension) {
  if (extension === '.png' && bytes.length >= 24 && bytes.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (extension === '.gif' && bytes.length >= 10 && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  if ((extension === '.jpg' || extension === '.jpeg') && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
      const length = bytes.readUInt16BE(offset + 2)
      if (length < 2) break
      offset += 2 + length
    }
    return null
  }
  if (extension === '.webp' && bytes.length >= 30 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    const kind = bytes.subarray(12, 16).toString('ascii')
    if (kind === 'VP8X') {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      }
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const packed = bytes.readUInt32LE(21)
      return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >>> 14) & 0x3fff) }
    }
    if (
      kind === 'VP8 '
      && bytes.length >= 30
      && bytes[23] === 0x9d
      && bytes[24] === 0x01
      && bytes[25] === 0x2a
    ) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      }
    }
  }
  return null
}

export async function readGridSource({ rootPath, asset }) {
  if (!['still-image', 'animated-image'].includes(asset.previewCapability)) {
    throw failure('UnsupportedMediaPreview', 'This media type is catalogue-only in the current gate')
  }
  const root = await authorizeDirectory(rootPath)
  const candidate = resolve(root.authorizedPath, ...safeSegments(asset.relativePath))
  let handle
  try {
    const pathEntry = await lstat(candidate)
    if (pathEntry.isSymbolicLink() || !pathEntry.isFile()) throw new Error('not a regular file')
    handle = await open(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const entry = await handle.stat()
    if (!entry.isFile() || entry.size <= 0 || entry.size > MAX_RESOURCE_BYTES) {
      throw failure('UnsupportedMediaPreview', 'Image is outside the bounded preview limits')
    }
    const descriptorPath = `/proc/self/fd/${handle.fd}`
    const openedPath = await realpath(descriptorPath)
    if (!contained(root.authorizedPath, openedPath)) {
      throw failure('PermissionDenied', 'Media resource escaped its authorised Root')
    }
    const bytes = await handle.readFile()
    const extension = extname(asset.relativePath).toLowerCase()
    if (!PREVIEW_EXTENSIONS.has(extension)) {
      throw failure('UnsupportedMediaPreview', 'This media type is catalogue-only in the current gate')
    }
    const dimensions = imageDimensions(bytes, extension)
    if (
      !dimensions
      || dimensions.width <= 0
      || dimensions.height <= 0
      || dimensions.width > MAX_DIMENSION
      || dimensions.height > MAX_DIMENSION
      || dimensions.width * dimensions.height > MAX_DECODED_PIXELS
    ) {
      throw failure('UnsupportedMediaPreview', 'Image dimensions are invalid or outside preview limits')
    }
    return { bytes, dimensions }
  } catch (error) {
    if (error?.name && error.name !== 'Error') throw error
    throw failure('MissingMedia', 'Media resource is unavailable or unsafe', error)
  } finally {
    await handle?.close().catch(() => {})
  }
}

export const mediaRootAccessContract = Object.freeze({
  maxDiscoveredFiles: MAX_DISCOVERED_FILES,
  maxFingerprintBytes: MAX_FINGERPRINT_BYTES,
  maxResourceBytes: MAX_RESOURCE_BYTES,
  maxDecodedPixels: MAX_DECODED_PIXELS,
  previewProfile: PREVIEW_PROFILES.gridStandard.id,
  previewProfiles: PREVIEW_PROFILES,
})
