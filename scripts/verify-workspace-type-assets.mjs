import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function fail(message) {
  throw new Error(`WorkspaceTypeAssetGate: ${message}`)
}

function equalSets(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value))
  const unexpected = [...actual].filter((value) => !expected.has(value))
  if (missing.length || unexpected.length) {
    fail(`${label} differs (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function fontAssetPaths(styles) {
  const paths = new Set()
  for (const match of styles.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)) {
    const candidate = match[2]
    if (!candidate.toLowerCase().endsWith('.woff2')) continue
    if (!candidate.startsWith('./') || candidate.includes('..') || candidate.includes('://')) {
      fail(`font URL must be a contained relative path: ${candidate}`)
    }
    paths.add(candidate.slice(2))
  }
  return paths
}

function contentSecurityPolicy(html) {
  const meta = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0]
  const content = meta?.match(/\bcontent=(["'])([\s\S]*?)\1/i)?.[2]
  if (!content) fail('index.html is missing its Content-Security-Policy metadata')
  return new Map(content.split(';').map((directive) => directive.trim()).filter(Boolean).map((directive) => {
    const [name, ...values] = directive.split(/\s+/)
    return [name, values]
  }))
}

async function verifiedFile(path, expected) {
  let bytes
  try {
    bytes = await readFile(path)
  } catch {
    fail(`missing packaged asset: ${path}`)
  }
  if (expected.bytes !== undefined && bytes.byteLength !== expected.bytes) {
    fail(`${path} has ${bytes.byteLength} bytes; expected ${expected.bytes}`)
  }
  const actualHash = sha256(bytes)
  if (actualHash !== expected.sha256) fail(`${path} SHA-256 does not match provenance`)
}

export async function verifyWorkspaceTypeAssets({ workspaceRoot, legalRoot, nativePhosphorPath = null }) {
  const [styles, html, fontProvenance, iconProvenance] = await Promise.all([
    readFile(resolve(workspaceRoot, 'styles.css'), 'utf8'),
    readFile(resolve(workspaceRoot, 'index.html'), 'utf8'),
    readFile(resolve(legalRoot, 'fontblind-v13/FONT-PROVENANCE.json'), 'utf8').then(JSON.parse),
    readFile(resolve(legalRoot, 'phosphor-icons/PROVENANCE.json'), 'utf8').then(JSON.parse),
  ])

  if (fontProvenance.release !== 'v13.0.0') fail(`expected pitch.dog type release v13.0.0, received ${fontProvenance.release}`)
  if (fontProvenance.sourceRepository !== 'https://github.com/bomkino/pitchdog-type-system') {
    fail('pitch.dog font provenance points at an unexpected source repository')
  }
  if (fontProvenance.licenseIdentifier !== 'CC0-1.0') fail('pitch.dog font provenance must declare CC0-1.0')
  if (iconProvenance.component !== '@phosphor-icons/web' || iconProvenance.licenseIdentifier !== 'MIT') {
    fail('Phosphor provenance is incomplete or identifies the wrong component')
  }

  const webFonts = fontProvenance.files.filter((entry) => entry.name.endsWith('.woff2'))
  const expectedFontAssets = new Map(webFonts.map((entry) => [`fonts/v13/${entry.name}`, entry]))
  const webIcon = iconProvenance.files.find((entry) => entry.path.endsWith('/Phosphor.woff2'))
  if (!webIcon) fail('Phosphor provenance does not identify the webfont')
  expectedFontAssets.set('icons/phosphor/Phosphor.woff2', webIcon)

  const referencedFontAssets = fontAssetPaths(styles)
  equalSets(referencedFontAssets, new Set(expectedFontAssets.keys()), 'CSS font asset graph')
  for (const [relativePath, expected] of expectedFontAssets) {
    await verifiedFile(resolve(workspaceRoot, relativePath), expected)
  }

  const csp = contentSecurityPolicy(html)
  const fontPolicy = csp.get('font-src') ?? []
  if (fontPolicy.length !== 1 || fontPolicy[0] !== "'self'") {
    fail(`font-src must allow only the packaged workspace origin; received ${fontPolicy.join(' ') || 'nothing'}`)
  }

  if (nativePhosphorPath) {
    for (const nativeFont of fontProvenance.files.filter((entry) => entry.distributionPath?.includes('/Resources/Fonts/'))) {
      await verifiedFile(resolve(dirname(nativePhosphorPath), basename(nativeFont.distributionPath)), nativeFont)
    }
    const nativeIcon = iconProvenance.files.find((entry) => entry.path.endsWith('/Phosphor.ttf'))
    if (!nativeIcon) fail('Phosphor provenance does not identify the native font')
    await verifiedFile(nativePhosphorPath, nativeIcon)
  }

  return Object.freeze({ fontAssetPaths: Object.freeze([...referencedFontAssets].sort()) })
}

function linuxWorkspaceMaps(source) {
  const start = source.indexOf('const allowedWorkspaceFiles')
  const end = source.indexOf('\n\napp.commandLine.appendSwitch', start)
  if (start < 0 || end <= start) fail('cannot evaluate Linux workspace route tables')
  return Function(`"use strict"; ${source.slice(start, end)}; return { allowedWorkspaceFiles, workspaceContentTypes };`)()
}

function macWorkspaceMap(source) {
  const start = source.indexOf('private let allowedFiles: [String: String] = [')
  const end = source.indexOf('\n    ]', start)
  if (start < 0 || end <= start) fail('cannot inspect macOS workspace route table')
  return new Map([...source.slice(start, end).matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)]
    .map(([, route, path]) => [route, path]))
}

export function verifyWorkspaceFontHostRoutes({ styles, linuxSource, macSource }) {
  const assetPaths = fontAssetPaths(styles)
  const expectedRoutes = new Map([...assetPaths].map((path) => [`/${path}`, path]))
  const { allowedWorkspaceFiles, workspaceContentTypes } = linuxWorkspaceMaps(linuxSource)
  const macAllowedFiles = macWorkspaceMap(macSource)

  for (const [route, relativePath] of expectedRoutes) {
    if (allowedWorkspaceFiles.get(route) !== relativePath) fail(`Linux host does not authorize ${route}`)
    if (workspaceContentTypes[relativePath] !== 'font/woff2') fail(`Linux host does not serve ${route} as font/woff2`)
    if (macAllowedFiles.get(route) !== relativePath) fail(`macOS host does not authorize ${route}`)
  }

  const linuxFontRoutes = new Set([...allowedWorkspaceFiles.keys()].filter((route) => route.endsWith('.woff2')))
  const macFontRoutes = new Set([...macAllowedFiles.keys()].filter((route) => route.endsWith('.woff2')))
  equalSets(linuxFontRoutes, new Set(expectedRoutes.keys()), 'Linux packaged font allowlist')
  equalSets(macFontRoutes, new Set(expectedRoutes.keys()), 'macOS packaged font allowlist')

  const macMimeFunction = macSource.slice(macSource.indexOf('private func mimeType(for name: String)'))
  if (!/if name\.hasSuffix\("\.woff2"\) \{ return "font\/woff2" \}/.test(macMimeFunction)) {
    fail('macOS host does not serve WOFF2 routes as font/woff2')
  }
  return Object.freeze({ routes: Object.freeze([...expectedRoutes.keys()].sort()) })
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [, , workspaceRoot, legalRoot, nativePhosphorPath] = process.argv
  if (!workspaceRoot || !legalRoot) {
    console.error('Usage: node scripts/verify-workspace-type-assets.mjs WORKSPACE_ROOT LEGAL_ROOT [NATIVE_PHOSPHOR_TTF]')
    process.exitCode = 2
  } else {
    await verifyWorkspaceTypeAssets({ workspaceRoot, legalRoot, nativePhosphorPath })
    console.log(`Verified packaged pitch.dog v13 and Phosphor assets: ${workspaceRoot}`)
  }
}
