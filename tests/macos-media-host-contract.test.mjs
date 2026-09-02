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
  assert.match(media, /static func canonicalPath\(_ path: String\)[^]*Darwin\.realpath/)
  assert.match(media, /let path = candidate\.path[^]*let canonical = try MediaFilesystem\.canonicalPath\(path\)/)
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
  assert.match(media, /let assetIds = try requestedAssetIds\(params\)/)
  assert.match(media, /defaultLimit: assetIds\?\.count \?\? 100/)
  assert.match(media, /if let assetIds, !assetIds\.contains\(asset\.id\)/)
  assert.match(media, /assetIds must contain between 1 and 250 opaque identities/)
  assert.match(media, /assetIds must contain unique opaque identities/)
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
  assert.match(handler, /\["grid_standard", "preview_standard"\]\.contains\(profile\)/)
  assert.match(handler, /Cache-Control": "private, no-store"/)
  assert.match(handler, /width <= 64_000_000 \/ height/)
  assert.match(handler, /case "grid_standard":[^]*maximumLongestSide = 512[^]*maximumOutputBytes = 8 \* 1024 \* 1024/)
  assert.match(handler, /case "preview_standard":[^]*maximumLongestSide = 2048[^]*maximumOutputBytes = 32 \* 1024 \* 1024/)
  assert.match(handler, /kCGImageSourceCreateThumbnailWithTransform: true/)
  assert.match(handler, /kCGImageSourceThumbnailMaxPixelSize: maximumLongestSide/)
  assert.match(handler, /max\(thumbnail\.width, thumbnail\.height\) <= maximumLongestSide/)
  assert.match(media, /"gridStandard": gridRendition,[^]*"previewStandard": previewRendition/)
  assert.match(media, /lease\.matches\(nonce\)/)
  assert.match(media, /O_RDONLY \| O_DIRECTORY \| O_NOFOLLOW/)
  assert.match(media, /Darwin\.openat\(parentDescriptor, segments\.last!, O_RDONLY \| O_NOFOLLOW\)/)
  assert.match(media, /maximumResourceBytes = 32 \* 1024 \* 1024/)
  assert.match(media, /maximumDecodedPixels = 64_000_000/)
  assert.match(media, /metadata\.byteSize <= maximumResourceBytes/)
  assert.match(media, /javaScriptURIComponentAllowed = CharacterSet/)
  assert.match(media, /asset\.id\.addingPercentEncoding\([^]*withAllowedCharacters: Self\.javaScriptURIComponentAllowed/)
  assert.match(media, /nonisolated func revoke\(\)[^]*lease\.revoke\(\)/)
})

test('macOS asset scheme decodes one opaque path component exactly once', async () => {
  const handler = await source('MediaAssetSchemeHandler.swift')
  const parseStart = handler.indexOf('guard let encodedPath = URLComponents(')
  const parseEnd = handler.indexOf('let source = try await controller.mediaResourceData', parseStart)
  assert.ok(parseStart >= 0 && parseEnd > parseStart)
  const parser = handler.slice(parseStart, parseEnd)
  assert.match(parser, /\)\?\.percentEncodedPath/)
  assert.match(parser, /split\(separator: "\/", omittingEmptySubsequences: false\)/)
  assert.match(parser, /components\.count == 3/)
  assert.match(parser, /!Self\.containsEncodedSlash\(components\[1\]\)/)
  assert.match(parser, /let assetId = components\[1\]\.removingPercentEncoding/)
  assert.match(parser, /let profile = components\[2\]\.removingPercentEncoding/)
  assert.ok(
    parser.indexOf('containsEncodedSlash(components[1])') < parser.indexOf('components[1].removingPercentEncoding'),
    'encoded path separators must be rejected before the one permitted decode',
  )
  assert.doesNotMatch(parser, /url\.path\.split/)

  function parseRuntimeEquivalent(value) {
    const url = new URL(value)
    if (url.protocol !== 'pitchdog-asset:' || url.username || url.password || url.port || url.search || url.hash) return null
    const components = url.pathname.split('/')
    if (
      components.length !== 3
      || components[0] !== ''
      || !components[1]
      || !components[2]
      || /%2f/i.test(components[1])
      || /%2f/i.test(components[2])
    ) return null
    try {
      const assetId = decodeURIComponent(components[1])
      const profile = decodeURIComponent(components[2])
      return ['grid_standard', 'preview_standard'].includes(profile)
        ? { nonce: url.hostname, assetId, profile }
        : null
    } catch {
      return null
    }
  }

  for (const assetId of ['asset-%', 'asset-%2F', 'asset-?', 'asset-#']) {
    for (const profile of ['grid_standard', 'preview_standard']) {
      const parsed = parseRuntimeEquivalent(
        `pitchdog-asset://session/${encodeURIComponent(assetId)}/${profile.replace('_', '%5F')}`,
      )
      assert.deepEqual(parsed, { nonce: 'session', assetId, profile })
    }
  }
  assert.equal(parseRuntimeEquivalent('pitchdog-asset://session/asset-%2F-child/grid_standard'), null)
  assert.equal(parseRuntimeEquivalent('pitchdog-asset://session/asset/child/grid_standard'), null)
  assert.equal(parseRuntimeEquivalent('pitchdog-asset://session/asset/grid_standard?query=1'), null)
  assert.equal(parseRuntimeEquivalent('pitchdog-asset://session/asset/grid_standard#fragment'), null)
})
