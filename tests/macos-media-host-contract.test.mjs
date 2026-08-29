import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

async function source(name) {
  return readFile(resolve(root, 'apps/macos/Sources', name), 'utf8')
}

test('macOS media authorization stays behind the existing typed bridge', async () => {
  const [controller, bridge] = await Promise.all([
    source('DeckSessionController.swift'),
    source('BridgeCoordinator.swift'),
  ])
  assert.match(controller, /NSOpenPanel\(\)/)
  assert.match(controller, /media\.root\.authorize does not accept renderer paths or parameters/)
  assert.match(controller, /payload\.count == 1[^]*payload\["rootId"\]/)
  assert.match(bridge, /name == "media\.roots" \|\| name == "media\.assets"/)
  assert.match(bridge, /type\.hasPrefix\("media\."\)/)
  assert.equal(bridge.includes('authorizedPath'), false)
})

test('macOS portable catalogue is Deck-bound while native locators stay in Application Support', async () => {
  const media = await source('MediaCatalogSession.swift')
  assert.match(media, /let deckId: String/)
  assert.match(media, /catalog\.deckId == expectedDeckId/)
  assert.match(media, /asset\.filename == derivedFilename/)
  assert.match(media, /asset\.folder == derivedFolder/)
  assert.match(media, /appendingPathComponent\("Deck Workbench", isDirectory: true\)/)
  assert.match(media, /authorizedPath: String/)
  assert.match(media, /relativePath: "media\/catalog\.json"/)
  assert.match(media, /sourceRevisions: \[PortableSourceRevision\]/)
  assert.match(media, /guard data\.count <= maximumCatalogBytes/)
  assert.match(media, /encoder\.outputFormatting = \[\.sortedKeys, \.withoutEscapingSlashes\]/)
})

test('macOS native media pages bound their final enriched JSON and pin both generations', async () => {
  const media = await source('MediaCatalogSession.swift')
  assert.match(media, /maximumControlFrameBytes = 1_048_576/)
  assert.match(media, /media\.roots accepts only bounded pagination and generation parameters/)
  assert.match(media, /limit <= 250/)
  assert.match(media, /expectedCatalogRevision is required after the first media page/)
  assert.match(media, /expectedAvailabilityRevision is required after the first media page/)
  assert.match(media, /"total": catalog\.roots\.count,[^]*"nextOffset": nextOffset,[^]*"items": items/)
  assert.match(media, /encoded\.count <= maximumControlFrameBytes/)
  assert.match(media, /One media Root summary exceeds the 1 MiB control-frame limit/)
  assert.match(media, /One media Asset summary exceeds the 1 MiB control-frame limit/)
  assert.match(media, /items\.removeLast\(\)/)
  assert.match(media, /var fileIdentities: \[String: MediaFileIdentity\]/)
  assert.match(media, /Dictionary\(uniqueKeysWithValues: try catalog\.roots\.map/)
})

test('macOS catalogue revisions use the portable safe-integer ceiling without trapping', async () => {
  const media = await source('MediaCatalogSession.swift')
  assert.match(media, /maximumCatalogRevision = 9_007_199_254_740_991/)
  assert.match(media, /let revision = try Self\.nextCatalogRevision\(catalog\.revision\)[^]*catalog\.revision = revision/)
  assert.match(media, /var nextCatalog = catalog/)
  assert.match(media, /nextCatalog\.revision = try Self\.nextCatalogRevision\(catalog\.revision\)[^]*catalog = nextCatalog/)
  assert.match(media, /guard revision >= 0, revision < maximumCatalogRevision/)
  assert.match(media, /name: "RevisionExhausted"/)
  assert.equal(media.includes('catalog.revision += 1'), false)
})

test('macOS asset scheme is nonce-bound and opens Root-relative files without following links', async () => {
  const [media, handler, webView] = await Promise.all([
    source('MediaCatalogSession.swift'),
    source('MediaAssetSchemeHandler.swift'),
    source('WorkspaceWebView.swift'),
  ])
  assert.match(webView, /forURLScheme: "pitchdog-asset"/)
  assert.match(handler, /profile == "grid_standard"/)
  assert.match(handler, /Cache-Control": "private, no-store"/)
  assert.match(handler, /width <= 64_000_000 \/ height/)
  assert.match(media, /lease\.matches\(nonce\)/)
  assert.match(media, /O_RDONLY \| O_DIRECTORY \| O_NOFOLLOW/)
  assert.match(media, /Darwin\.openat\(parentDescriptor, segments\.last!, O_RDONLY \| O_NOFOLLOW\)/)
  assert.match(media, /maximumResourceBytes = 32 \* 1024 \* 1024/)
  assert.match(media, /maximumDecodedPixels = 64_000_000/)
  assert.match(media, /metadata\.byteSize <= maximumResourceBytes/)
  assert.match(media, /nonisolated func revoke\(\)[^]*lease\.revoke\(\)/)
})
