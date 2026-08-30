import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  protocol,
  session,
  shell,
  utilityProcess,
} from 'electron'
import { bridgeChannel, readBridgeContract } from './bridge-contract.mjs'
import { performNativeAction } from './native-action.mjs'
import { SerialOperationQueue } from './serial-operation-queue.mjs'
import { UtilityKernelClient } from './utility-client.mjs'
import { defaultPreferences, interfaceScaleSteps, loadPreferencesFile, themeValues } from './preferences.mjs'
import { MediaGrantStore } from './media-grants.mjs'
import { LinuxMediaSession } from './media-session.mjs'
import { settleRuntimeViewport } from './runtime-viewport.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const sharedWorkspaceRoot = resolve(repositoryRoot, 'apps/macos/Resources/Workspace')
const preloadPath = resolve(import.meta.dirname, 'preload.cjs')
const kernelUtilityPath = resolve(import.meta.dirname, 'kernel-utility.mjs')
const allowedWorkspaceFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/workspace.js', 'workspace.js'],
  ['/workbench-mark.svg', 'workbench-mark.svg'],
  ['/fonts/v13/pd-head.woff2', 'fonts/v13/pd-head.woff2'],
  ['/fonts/v13/pd-head-alt.woff2', 'fonts/v13/pd-head-alt.woff2'],
  ['/fonts/v13/pd-body-roman.woff2', 'fonts/v13/pd-body-roman.woff2'],
  ['/fonts/v13/pd-body-italic.woff2', 'fonts/v13/pd-body-italic.woff2'],
  ['/fonts/v13/pd-body-alt-roman.woff2', 'fonts/v13/pd-body-alt-roman.woff2'],
  ['/fonts/v13/pd-body-alt-italic.woff2', 'fonts/v13/pd-body-alt-italic.woff2'],
  ['/fonts/v13/pd-eyebrow-site.woff2', 'fonts/v13/pd-eyebrow-site.woff2'],
  ['/icons/phosphor/Phosphor.woff2', 'icons/phosphor/Phosphor.woff2'],
])
const workspaceContentTypes = Object.freeze({
  'index.html': 'text/html; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'workspace.js': 'text/javascript; charset=utf-8',
  'workbench-mark.svg': 'image/svg+xml',
  'fonts/v13/pd-head.woff2': 'font/woff2',
  'fonts/v13/pd-head-alt.woff2': 'font/woff2',
  'fonts/v13/pd-body-roman.woff2': 'font/woff2',
  'fonts/v13/pd-body-italic.woff2': 'font/woff2',
  'fonts/v13/pd-body-alt-roman.woff2': 'font/woff2',
  'fonts/v13/pd-body-alt-italic.woff2': 'font/woff2',
  'fonts/v13/pd-eyebrow-site.woff2': 'font/woff2',
  'icons/phosphor/Phosphor.woff2': 'font/woff2',
})

app.commandLine.appendSwitch('disable-background-networking')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pitchdog-ui',
    privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false },
  },
  {
    scheme: 'pitchdog-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false },
  },
])

let mainWindow = null
let utility = null
let activePackagePath = null
let mediaGrantStore = null
let mediaSession = null
let processedMediaCommands = new Map()
let preferences = { ...defaultPreferences }
const preferencesQueue = new SerialOperationQueue()
const processInstanceId = randomUUID()
const packagedStoryIds = Object.freeze({
  secondSectionId: '00000000-0000-4000-8000-000000000106',
  secondSlideId: '00000000-0000-4000-8000-000000000107',
  secondHeadlineBlockId: '00000000-0000-4000-8000-000000000108',
  bodyBlockId: '00000000-0000-4000-8000-000000000109',
})
let quitAfterCheckpoint = false
let pendingQuit = null

function namedError(name, message) {
  return Object.assign(new Error(message), { name })
}

function storyBlockPlainText(story, blockId) {
  for (const section of story.sections ?? []) {
    for (const slide of section.slides ?? []) {
      const block = (slide.contentBlocks ?? []).find((candidate) => candidate.id === blockId)
      if (block) return block.plainText
    }
  }
  return undefined
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw namedError('InvalidCommand', 'Bridge payload must be an object')
  }
  const size = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  if (size > 1_048_576) throw namedError('InvalidCommand', 'Bridge payload exceeds 1 MiB')
  return payload
}

function seedFor(title = 'Untitled Deck') {
  return {
    deckId: randomUUID(),
    sectionId: randomUUID(),
    slideId: randomUUID(),
    blockId: randomUUID(),
    title,
    initialHeadline: 'Untitled Story',
  }
}

function requiredMediaSession() {
  if (!mediaSession) throw namedError('DocumentUnavailable', 'No Deck media session is open')
  return mediaSession
}

async function activateMediaSession(packagePath) {
  const summary = await utility.request('document.query', { name: 'deck.summary', params: {} })
  const candidate = await LinuxMediaSession.open({
    packagePath,
    deckId: summary.deckId,
    grantStore: mediaGrantStore,
  })
  const previous = mediaSession
  mediaSession = candidate
  processedMediaCommands = new Map()
  previous?.close()
}

function abandonMediaSession() {
  mediaSession?.close()
  mediaSession = null
  processedMediaCommands = new Map()
}

function normalizeCreatePath(value) {
  return extname(value).toLowerCase() === '.pitchdeck' ? value : `${value}.pitchdeck`
}

async function renderProjection(projection) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.webContents.executeJavaScript(
    `globalThis.deckWorkbench.renderProjection(${JSON.stringify(projection)})`,
    true,
  )
}

async function flushWorkspaceDrafts() {
  if (!activePackagePath || !mainWindow || mainWindow.isDestroyed()) return { saved: true }
  const result = await mainWindow.webContents.executeJavaScript(
    'globalThis.deckWorkbench.saveDrafts()',
    true,
  )
  if (result?.saved !== true) {
    throw namedError('UnsavedWorkspaceDraft', 'Save the highlighted Slide draft before leaving this Deck')
  }
  return result
}

async function saveDocument() {
  await flushWorkspaceDrafts()
  return utility.request('document.save')
}

async function createDocument(packagePath) {
  await flushWorkspaceDrafts()
  const projection = await utility.request('document.create', {
    packagePath,
    seed: seedFor(basename(packagePath, '.pitchdeck')),
  })
  try {
    await activateMediaSession(packagePath)
  } catch (error) {
    abandonMediaSession()
    activePackagePath = null
    await utility.request('document.close').catch(() => {})
    throw error
  }
  activePackagePath = packagePath
  await renderProjection(projection)
  return projection
}

async function openDocument(packagePath) {
  await flushWorkspaceDrafts()
  const projection = await utility.request('document.open', { packagePath })
  try {
    await activateMediaSession(packagePath)
  } catch (error) {
    abandonMediaSession()
    activePackagePath = null
    await utility.request('document.close').catch(() => {})
    throw error
  }
  activePackagePath = packagePath
  await renderProjection(projection)
  return projection
}

async function presentNewDocument() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Create Deck',
    defaultPath: 'Untitled Deck.pitchdeck',
    filters: [{ name: 'Pitch Deck', extensions: ['pitchdeck'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  })
  if (result.canceled || !result.filePath) throw namedError('JobCancelled', 'Create Deck was cancelled')
  return createDocument(normalizeCreatePath(result.filePath))
}

async function presentOpenDocument() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Deck',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length !== 1) throw namedError('JobCancelled', 'Open Deck was cancelled')
  return openDocument(result.filePaths[0])
}

async function writeDurably(path, bytes) {
  const handle = await open(path, 'w', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeAtomically(path, bytes) {
  const parent = dirname(path)
  const temporary = `${path}.tmp-${randomUUID()}`
  await mkdir(parent, { recursive: true })
  try {
    await writeDurably(temporary, bytes)
    await rename(temporary, path)
    const directory = await open(parent, 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function preferencesPath() {
  return resolve(app.getPath('userData'), 'preferences.json')
}

async function loadPreferences() {
  const loaded = await loadPreferencesFile(preferencesPath())
  preferences = loaded.preferences
  nativeTheme.themeSource = preferences.theme
  if (loaded.warning) process.stderr.write(`InvalidPreferences: ${loaded.warning}
`)
}

async function persistPreferences(next) {
  await writeAtomically(
    preferencesPath(),
    `${JSON.stringify({ schemaVersion: 2, ...next }, null, 2)}\n`,
  )
  preferences = next
  nativeTheme.themeSource = preferences.theme
  return { ...preferences }
}

async function exportOnePagePDF(destination) {
  if (!mainWindow || mainWindow.isDestroyed()) throw namedError('WorkspaceUnavailable', 'Workspace is unavailable')
  const frame = await mainWindow.webContents.executeJavaScript(`deckWorkbench.exportFrame('linux')`, true)
  if (frame?.error === 'CompositionOverflow') {
    throw namedError('CompositionOverflow', `${frame.overflowCount} authored element(s) exceed the composition frame`)
  }
  if (frame?.error === 'ExportBusy') throw namedError('ExportBusy', 'Another PDF export is already in progress')
  if (frame?.error === 'ExportStale') throw namedError('ExportStale', 'The active Slide changed while preparing export')
  if (typeof frame?.token !== 'string' || !frame.token) {
    throw namedError('WorkspaceUnavailable', 'Slide export frame is invalid')
  }
  const pageWidthMm = Number(frame.pageWidthMm)
  const pageHeightMm = Number(frame.pageHeightMm)
  if (
    !Number.isFinite(pageWidthMm)
    || !Number.isFinite(pageHeightMm)
    || pageWidthMm <= 0
    || pageHeightMm <= 0
    || pageWidthMm > 1000
    || pageHeightMm > 1000
  ) throw namedError('WorkspaceUnavailable', 'Slide export page geometry is invalid')
  const pageWidthCSS = `${pageWidthMm.toFixed(3)}mm`
  const pageHeightCSS = `${pageHeightMm.toFixed(3)}mm`
  let cssKey = null
  let result = null
  let operationFailure = null
  try {
    cssKey = await mainWindow.webContents.insertCSS(`
      @media print {
        @page { size: ${pageWidthCSS} ${pageHeightCSS}; margin: 0; }
        html, body { width: ${pageWidthCSS} !important; height: ${pageHeightCSS} !important; margin: 0 !important; overflow: hidden !important; }
        body > * { display: none !important; }
        .workbench, .editorial-spine, .stage, .stage-scroll, #artboard { display: block !important; }
        .workbench > :not(.editorial-spine), .editorial-spine > :not(.stage), .stage > :not(.stage-scroll) { display: none !important; }
        #artboard { margin: 0 !important; }
      }
    `)
    const pdf = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: Math.round(pageWidthMm * 1000), height: Math.round(pageHeightMm * 1000) },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    })
    await writeAtomically(destination, pdf)
    result = { bytes: pdf.byteLength, sha256: createHash('sha256').update(pdf).digest('hex') }
  } catch (error) {
    operationFailure = error
  }
  const cleanupFailures = []
  if (cssKey) {
    try {
      await mainWindow.webContents.removeInsertedCSS(cssKey)
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  try {
    const cleanup = await mainWindow.webContents.executeJavaScript(
      `deckWorkbench.finishExport(${JSON.stringify(frame.token)})`,
      true,
    )
    if (cleanup?.finished !== true) cleanupFailures.push(namedError('ExportCleanupFailed', 'Workspace export session did not close'))
  } catch (error) {
    cleanupFailures.push(error)
  }
  if (cleanupFailures.length) {
    if (operationFailure) {
      throw namedError(
        'ExportCleanupFailed',
        `${operationFailure?.name ?? 'PDF export'} failed and workspace cleanup also failed as ${cleanupFailures[0]?.name ?? 'Error'}`,
      )
    }
    throw cleanupFailures[0]
  }
  if (operationFailure) throw operationFailure
  return result
}

async function presentPDFExport() {
  if (!activePackagePath) throw namedError('DocumentUnavailable', 'No Deck document is open')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: `${basename(activePackagePath, '.pitchdeck')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) throw namedError('JobCancelled', 'PDF export was cancelled')
  await flushWorkspaceDrafts()
  await exportOnePagePDF(result.filePath)
  return { url: pathToFileURL(result.filePath).href }
}

async function presentNativeFailure(failure) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      await mainWindow.webContents.executeJavaScript(`(() => {
        const status = document.querySelector('#save-state')
        if (status) status.textContent = ${JSON.stringify(`${failure.name}: ${failure.message}`)}
      })()`, true)
    } catch {
      // The native alert remains authoritative when the workspace cannot receive status.
    }
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Deck Workbench',
      message: failure.name,
      detail: failure.message,
    })
    return
  }
  dialog.showErrorBox(failure.name, failure.message)
}

function assertMediaCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw namedError('InvalidCommand', 'Typed Deck command is required')
  }
  if (typeof command.commandId !== 'string' || command.commandId.length === 0 || command.commandId.length > 256) {
    throw namedError('InvalidCommand', 'commandId must be a bounded opaque identity')
  }
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw namedError('InvalidCommand', 'expectedRevision must be a non-negative integer')
  }
  if (![
    'media.root.authorize',
    'media.root.reconnect',
    'media.root.scan',
  ].includes(command.type)) {
    throw namedError('InvalidCommand', 'Unknown native media command')
  }
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) {
    throw namedError('InvalidCommand', `${command.type} requires an object payload`)
  }
  if (
    !command.source
    || typeof command.source !== 'object'
    || Array.isArray(command.source)
    || !['ui', 'keyboard', 'cli', 'mcp', 'migration'].includes(command.source.kind)
  ) {
    throw namedError('InvalidCommand', 'source.kind is unsupported')
  }
  if (
    typeof command.issuedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(command.issuedAt)
    || !Number.isFinite(Date.parse(command.issuedAt))
  ) {
    throw namedError('InvalidCommand', 'issuedAt must be an ISO-8601 timestamp')
  }
  const keys = Object.keys(command.payload).sort()
  if (command.type === 'media.root.authorize' && keys.length !== 0) {
    throw namedError('InvalidCommand', 'media.root.authorize does not accept renderer paths or parameters')
  }
  if (
    command.type !== 'media.root.authorize'
    && (keys.length !== 1 || keys[0] !== 'rootId' || typeof command.payload.rootId !== 'string')
  ) {
    throw namedError('InvalidCommand', `${command.type} requires only an opaque rootId`)
  }
  return command
}

async function chooseMediaRoot(title) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory', 'dontAddToRecent'],
  })
  if (result.canceled || result.filePaths.length !== 1) {
    throw namedError('JobCancelled', 'Media Root selection was cancelled')
  }
  return result.filePaths[0]
}

async function executeMediaCommand(rawCommand) {
  const command = assertMediaCommand(rawCommand)
  const duplicate = processedMediaCommands.get(command.commandId)
  if (duplicate) return structuredClone(duplicate)
  const summary = await utility.request('document.query', { name: 'deck.summary', params: {} })
  if (command.expectedRevision !== summary.revision) {
    throw namedError(
      'StaleRevision',
      `Expected revision ${summary.revision}; received ${String(command.expectedRevision)}`,
    )
  }

  const media = requiredMediaSession()
  let result
  if (command.type === 'media.root.authorize') {
    result = await media.authorizeRoot(await chooseMediaRoot('Choose Media Folder'))
  } else if (command.type === 'media.root.reconnect') {
    result = await media.reconnectRoot(
      command.payload.rootId,
      await chooseMediaRoot('Reconnect Media Folder'),
    )
  } else {
    result = await media.scanRoot(command.payload.rootId)
  }
  if (mediaSession !== media) {
    throw namedError('DocumentUnavailable', 'The Deck changed while the media command was running')
  }
  const projection = await utility.request('document.query', {
    name: 'slide.activeProjection',
    params: {},
  })
  if (mediaSession !== media) {
    throw namedError('DocumentUnavailable', 'The Deck changed while the media command was running')
  }
  const response = {
    acknowledgement: {
      commandId: command.commandId,
      revision: summary.revision,
      status: 'completed',
    },
    media: { catalogRevision: media.catalogRevision, ...result },
    projection,
  }
  processedMediaCommands.set(command.commandId, structuredClone(response))
  return response
}

async function dispatchBridge(method, rawPayload = {}) {
  const payload = assertPayload(rawPayload)
  switch (method) {
    case 'deck.create': return presentNewDocument()
    case 'deck.open': return presentOpenDocument()
    case 'deck.query': {
      if (typeof payload.name !== 'string') throw namedError('InvalidCommand', 'Named query is required')
      if (payload.name === 'media.roots' || payload.name === 'media.assets') {
        return requiredMediaSession().query(payload.name, payload.params ?? {})
      }
      return utility.request('document.query', { name: payload.name, params: payload.params ?? {} })
    }
    case 'deck.execute': {
      if (!payload.command || typeof payload.command !== 'object') {
        throw namedError('InvalidCommand', 'Typed Deck command is required')
      }
      if (typeof payload.command.type === 'string' && payload.command.type.startsWith('media.')) {
        return executeMediaCommand(payload.command)
      }
      return utility.request('document.execute', { command: payload.command })
    }
    case 'deck.undo': return utility.request('document.undo')
    case 'deck.redo': return utility.request('document.redo')
    case 'deck.exportPDF': return presentPDFExport()
    case 'ui.getPreferences': return { ...preferences }
    case 'ui.setTheme': {
      const value = String(payload.value ?? '')
      if (!themeValues.includes(value)) {
        throw namedError('InvalidCommand', 'Theme must be System, Light, or Dark')
      }
      return preferencesQueue.run(() => persistPreferences({ ...preferences, theme: value }))
    }
    case 'ui.setInterfaceScale': {
      const value = Number(payload.value)
      if (!interfaceScaleSteps.includes(value)) {
        throw namedError('InvalidCommand', 'Interface Scale must use an allowed step')
      }
      return preferencesQueue.run(() => persistPreferences({ ...preferences, interfaceScale: value }))
    }
    case 'ui.setArtboardZoom': {
      const value = Number(payload.value)
      if (!Number.isFinite(value) || value < 0.1 || value > 4) {
        throw namedError('InvalidCommand', 'Artboard zoom must be between 10% and 400%')
      }
      return preferencesQueue.run(() => persistPreferences({ ...preferences, artboardZoom: value }))
    }
    default: throw namedError('InvalidCommand', `Unknown bridge method: ${method}`)
  }
}

async function registerWorkspaceProtocol() {
  protocol.handle('pitchdog-ui', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'workspace') return new Response('Not found', { status: 404 })
    const resource = allowedWorkspaceFiles.get(url.pathname)
    if (!resource) return new Response('Not found', { status: 404 })
    const resourcePath = resolve(sharedWorkspaceRoot, resource)
    if (resource === 'index.html') {
      const source = await readFile(resourcePath, 'utf8')
      const linuxHTML = source.replace(/\s*<script src="bridge\.generated\.js" defer><\/script>/, '')
      return new Response(linuxHTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response(await readFile(resourcePath), {
      headers: { 'content-type': workspaceContentTypes[resource] },
    })
  })
}

function mediaProtocolStatus(error) {
  if (error?.name === 'StaleMediaSession') return 410
  if (error?.name === 'UnsupportedMediaPreview') return 415
  if (['MissingMedia', 'MediaRootNeedsPermission', 'MediaRootUnavailable'].includes(error?.name)) return 404
  return 404
}

async function registerMediaProtocol() {
  protocol.handle('pitchdog-asset', async (request) => {
    try {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      const url = new URL(request.url)
      if (url.username || url.password || url.port || url.search || url.hash) {
        return new Response('Not found', { status: 404 })
      }
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 2) return new Response('Not found', { status: 404 })
      const assetId = decodeURIComponent(parts[0])
      const profile = decodeURIComponent(parts[1])
      const activeMedia = requiredMediaSession()
      const { bytes } = await activeMedia.readGridResource({
        nonce: url.hostname,
        assetId,
        profile,
      })
      if (mediaSession !== activeMedia) {
        throw namedError('StaleMediaSession', 'This media resource session is no longer active')
      }
      const decoded = nativeImage.createFromBuffer(bytes)
      if (decoded.isEmpty()) throw namedError('UnsupportedMediaPreview', 'Image decoding failed')
      const size = decoded.getSize()
      if (size.width <= 0 || size.height <= 0) {
        throw namedError('UnsupportedMediaPreview', 'Image dimensions are invalid')
      }
      const scale = Math.min(1, 512 / Math.max(size.width, size.height))
      const rendition = scale < 1
        ? decoded.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
            quality: 'best',
          })
        : decoded
      const png = rendition.toPNG()
      if (png.byteLength === 0 || png.byteLength > 8 * 1024 * 1024) {
        throw namedError('UnsupportedMediaPreview', 'Image rendering failed or exceeded output limits')
      }
      return new Response(png, {
        headers: {
          'cache-control': 'private, no-store',
          'content-security-policy': "default-src 'none'",
          'content-type': 'image/png',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch (error) {
      return new Response('Media preview unavailable', {
        status: mediaProtocolStatus(error),
        headers: {
          'cache-control': 'private, no-store',
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        },
      })
    }
  })
}

async function installBridgeHandlers() {
  const contract = await readBridgeContract()
  for (const method of contract.methods) {
    ipcMain.handle(bridgeChannel(method.name), (event, payload) => {
      if (
        !mainWindow
        || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || event.senderFrame.url !== 'pitchdog-ui://workspace/index.html'
      ) {
        throw namedError('PermissionDenied', 'Bridge request did not originate from the workspace')
      }
      return dispatchBridge(method.name, payload)
    })
  }
}

async function createWindow({ hidden = false } = {}) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: !hidden,
    title: 'Deck Workbench',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171a1c' : '#e7edef',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: !hidden,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, target) => {
    if (target !== 'pitchdog-ui://workspace/index.html') event.preventDefault()
  })
  let allowClose = false
  window.on('close', (event) => {
    if (hidden || allowClose || !activePackagePath || quitAfterCheckpoint) return
    event.preventDefault()
    if (pendingQuit) return
    pendingQuit = flushWorkspaceDrafts()
      .then(() => utility.request('document.close'))
      .then(() => {
        activePackagePath = null
        abandonMediaSession()
        quitAfterCheckpoint = true
        allowClose = true
        window.close()
      })
      .catch((error) => {
        pendingQuit = null
        return presentNativeFailure(error)
      })
  })
  mainWindow = window
  try {
    await window.loadURL('pitchdog-ui://workspace/index.html')
    return window
  } catch (error) {
    if (mainWindow === window) mainWindow = null
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
}

async function invokeInWorkspace(javaScriptName, payload = {}) {
  return mainWindow.webContents.executeJavaScript(
    `globalThis.deckBridge[${JSON.stringify(javaScriptName)}](${JSON.stringify(payload)})`,
    true,
  )
}

async function inspectRendererBoundary() {
  const shape = await mainWindow.webContents.executeJavaScript(`({
    methods: Object.keys(globalThis.deckBridge).sort(),
    nodeRequire: typeof globalThis.require,
    nodeProcess: typeof globalThis.process,
  })`)
  const networkBlocked = await mainWindow.webContents.executeJavaScript(`
    fetch('https://network-must-remain-blocked.invalid/').then(() => false, () => true)
  `)
  const expectedMethods = (await readBridgeContract()).methods.map((method) => method.javascriptName).sort()
  return {
    exactBridge: JSON.stringify(shape.methods) === JSON.stringify(expectedMethods),
    rendererNodeRequire: shape.nodeRequire,
    rendererNodeProcess: shape.nodeProcess,
    rendererNetworkBlocked: networkBlocked,
  }
}

const runtimeUIViewports = Object.freeze([
  Object.freeze({ label: 'mac-post-toolbar-proxy', width: 1180, height: 605 }),
  Object.freeze({ label: 'compact-desktop', width: 1280, height: 720 }),
])
const runtimeUIScales = Object.freeze([1, 1.25, 1.5, 1.75])
const representativeRuntimeUIViewport = Object.freeze({
  label: 'representative-desktop',
  width: 1440,
  height: 900,
})

async function configureRuntimeUI(viewport, scale) {
  mainWindow.setContentSize(viewport.width, viewport.height)
  const viewportSettle = await settleRuntimeViewport({
    requestedViewport: viewport,
    readViewport: () => mainWindow.webContents.executeJavaScript(`({
      width: window.innerWidth,
      height: window.innerHeight,
    })`, true),
  })
  return mainWindow.webContents.executeJavaScript(`(async () => {
    const requested = ${JSON.stringify({ viewport: null, scale: null })};
    requested.viewport = ${JSON.stringify(viewport)};
    requested.scale = ${JSON.stringify(scale)};
    const scaleResult = await globalThis.deckBridge.setInterfaceScale({ value: requested.scale });
    interfaceScale = scaleResult.interfaceScale;
    applyScales();
    const requiredFonts = [
      { family: 'PD Head', font: '500 16px "PD Head"', sample: 'Deck Workbench' },
      { family: 'PD Head Alt', font: '500 16px "PD Head Alt"', sample: 'Deck Workbench' },
      { family: 'PD Body', font: '400 16px "PD Body"', sample: 'Deck Workbench' },
      { family: 'PD Body Alt', font: '400 16px "PD Body Alt"', sample: 'Deck Workbench' },
      { family: 'PD Eyebrow', font: '500 16px "PD Eyebrow"', sample: 'PLAN 0123' },
      { family: 'Phosphor', font: '400 16px "Phosphor"', sample: '\\uE038' },
    ];
    const fontLoads = await Promise.all(requiredFonts.map(async (entry) => ({
      family: entry.family,
      faceCount: (await document.fonts.load(entry.font, entry.sample)).length,
      check: document.fonts.check(entry.font, entry.sample),
    })));
    await document.fonts.ready;
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const familyOf = (selector) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).fontFamily : '';
    };
    const computedFamilies = {
      body: familyOf('body'),
      head: familyOf('.plan-empty-title'),
      eyebrow: familyOf('.eyebrow'),
      icon: familyOf('.phosphor-icon'),
    };
    const bindingsCorrect = computedFamilies.body.includes('PD Body')
      && computedFamilies.head.includes('PD Head')
      && computedFamilies.eyebrow.includes('PD Eyebrow')
      && computedFamilies.icon.includes('Phosphor');
    return {
      requestedViewport: requested.viewport,
      viewportSettle: ${JSON.stringify(viewportSettle)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scale: interfaceScale,
      layout: document.documentElement.dataset.workspaceLayout,
      fontsReady: document.fonts.status === 'loaded',
      fontsLoaded: fontLoads.every((entry) => entry.faceCount > 0 && entry.check) && bindingsCorrect,
      fontLoads,
      computedFamilies,
      exactViewport: window.innerWidth === requested.viewport.width
        && window.innerHeight === requested.viewport.height,
    };
  })()`, true)
}

async function inspectColdRuntimeUI() {
  return mainWindow.webContents.executeJavaScript(`(() => {
    const scrollEvidence = (element) => element ? ({
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }) : null;
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const fullyInsideViewport = (element) => {
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return false;
      const value = element.getBoundingClientRect();
      return value.width > 0
        && value.height > 0
        && value.left >= -1
        && value.top >= -1
        && value.right <= window.innerWidth + 1
        && value.bottom <= window.innerHeight + 1;
    };
    const toolbar = document.querySelector('.toolbar');
    const createDeck = document.querySelector('#create-deck');
    const openDeck = document.querySelector('#open-deck');
    const workbench = document.querySelector('.workbench');
    const phaseWorkspaces = document.querySelector('.phase-workspaces');
    const activePhaseView = document.querySelector('.phase-view.is-active');
    const toolbarRect = toolbar.getBoundingClientRect();
    const toolbarChildren = [...toolbar.children]
      .filter((child) => !child.hidden && getComputedStyle(child).display !== 'none')
      .map((child) => ({
        id: child.id,
        className: child.className,
        rect: rect(child),
      }));
    return {
      createDeckRect: rect(createDeck),
      openDeckRect: rect(openDeck),
      createDeckFullyVisible: fullyInsideViewport(createDeck),
      openDeckFullyVisible: fullyInsideViewport(openDeck),
      toolbar: {
        rect: rect(toolbar),
        clientWidth: toolbar.clientWidth,
        scrollWidth: toolbar.scrollWidth,
        children: toolbarChildren,
      },
      toolbarFitsHorizontally: toolbar.scrollWidth <= toolbar.clientWidth + 1
        && toolbarChildren.every((child) => child.rect.left >= toolbarRect.left - 1
          && child.rect.right <= toolbarRect.right + 1),
      scrollOwners: {
        document: scrollEvidence(document.scrollingElement),
        body: scrollEvidence(document.body),
        workbench: scrollEvidence(workbench),
        phaseWorkspaces: scrollEvidence(phaseWorkspaces),
        activePhase: scrollEvidence(activePhaseView),
      },
      documentScrollTop: document.scrollingElement.scrollTop,
      documentScrollLeft: document.scrollingElement.scrollLeft,
      bodyScrollTop: document.body.scrollTop,
      bodyScrollLeft: document.body.scrollLeft,
    };
  })()`, true)
}

async function inspectDocumentRuntimeUI() {
  return mainWindow.webContents.executeJavaScript(`(async () => {
    const settle = () => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const scrollEvidence = (element) => element ? ({
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }) : null;
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const intersectionRatio = (element, clip) => {
      const value = element.getBoundingClientRect();
      const clips = Array.isArray(clip) ? clip.map((entry) => entry.getBoundingClientRect()) : [clip.getBoundingClientRect()];
      let left = value.left;
      let top = value.top;
      let right = value.right;
      let bottom = value.bottom;
      for (const item of clips) {
        left = Math.max(left, item.left, 0);
        top = Math.max(top, item.top, 0);
        right = Math.min(right, item.right, window.innerWidth);
        bottom = Math.min(bottom, item.bottom, window.innerHeight);
      }
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      const area = Math.max(1, value.width * value.height);
      return visibleArea / area;
    };
    const toolbarEvidence = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, present: false, fits: false };
      const bounds = element.getBoundingClientRect();
      const children = [...element.children]
        .filter((child) => !child.hidden && getComputedStyle(child).display !== 'none')
        .map((child) => ({
          id: child.id,
          className: child.className,
          rect: rect(child),
        }));
      const childrenInside = children.every((child) => child.rect.left >= bounds.left - 1
        && child.rect.right <= bounds.right + 1);
      return {
        selector,
        present: true,
        fits: element.scrollWidth <= element.clientWidth + 1 && childrenInside,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        rect: rect(element),
        children,
      };
    };
    const activate = async (phase) => {
      await enterPhaseForSlide(phase);
      const view = document.querySelector('[data-phase-view="' + phase + '"]');
      await settle();
      return view;
    };

    const curateView = await activate('curate');
    const mediaScroll = document.querySelector('#media-scroll');
    const mediaCanvas = document.querySelector('#media-canvas');
    const previousDensity = elements.thumbnailDensity.value;
    elements.thumbnailDensity.value = elements.thumbnailDensity.min;
    const virtualCard = curateVirtualMetrics(1);
    const badgeProbe = document.createElement('div');
    badgeProbe.className = 'media-card';
    badgeProbe.style.setProperty('--card-left', '0px');
    badgeProbe.style.setProperty('--card-top', '0px');
    badgeProbe.style.setProperty('--card-width', virtualCard.cardWidth + 'px');
    badgeProbe.style.setProperty('--card-height', virtualCard.cardHeight + 'px');
    const badgeProbeThumb = document.createElement('div');
    badgeProbeThumb.className = 'media-thumb';
    const badgeProbeCopy = document.createElement('div');
    badgeProbeCopy.className = 'media-card-copy';
    const badgeProbeTitle = document.createElement('strong');
    badgeProbeTitle.textContent = 'A representative media asset';
    const badgeProbeBadges = document.createElement('span');
    badgeProbeBadges.className = 'media-badges';
    for (const [label, kind] of [['5/5', 'project'], ['shortlisted', 'project'], ['Pick', 'project'], ['Compare', 'compare'], ['alternate', 'slide']]) {
      const badge = document.createElement('span');
      badge.className = 'media-badge ' + kind;
      badge.textContent = label;
      badgeProbeBadges.append(badge);
    }
    const badgeProbePath = document.createElement('small');
    badgeProbePath.textContent = 'media/representative-wide-image.jpg';
    badgeProbeCopy.append(badgeProbeTitle, badgeProbeBadges, badgeProbePath);
    badgeProbe.append(badgeProbeThumb, badgeProbeCopy);
    mediaCanvas.append(badgeProbe);
    await settle();
    const badgeProbeEvidence = {
      cardRect: rect(badgeProbe),
      copyClientWidth: badgeProbeCopy.clientWidth,
      copyScrollWidth: badgeProbeCopy.scrollWidth,
      copyClientHeight: badgeProbeCopy.clientHeight,
      copyScrollHeight: badgeProbeCopy.scrollHeight,
      badgesClientWidth: badgeProbeBadges.clientWidth,
      badgesScrollWidth: badgeProbeBadges.scrollWidth,
      everyBadgeFits: [...badgeProbeBadges.children].every((badge) => badge.scrollWidth <= badge.clientWidth + 1),
    };
    const badgeProbeRect = badgeProbe.getBoundingClientRect();
    const badgeProbeCopyRect = badgeProbeCopy.getBoundingClientRect();
    badgeProbeEvidence.copyInsideCard = badgeProbeCopyRect.left >= badgeProbeRect.left - 1
      && badgeProbeCopyRect.right <= badgeProbeRect.right + 1
      && badgeProbeCopyRect.top >= badgeProbeRect.top - 1
      && badgeProbeCopyRect.bottom <= badgeProbeRect.bottom + 1;
    badgeProbeEvidence.noClipping = badgeProbeEvidence.copyScrollWidth <= badgeProbeEvidence.copyClientWidth + 1
      && badgeProbeEvidence.copyScrollHeight <= badgeProbeEvidence.copyClientHeight + 1
      && badgeProbeEvidence.badgesScrollWidth <= badgeProbeEvidence.badgesClientWidth + 1
      && badgeProbeEvidence.everyBadgeFits
      && badgeProbeEvidence.copyInsideCard;
    badgeProbe.remove();
    elements.thumbnailDensity.value = previousDensity;
    const curateToolbars = [
      toolbarEvidence('.toolbar'),
      toolbarEvidence('.media-toolbar'),
      toolbarEvidence('.media-source-bar'),
      toolbarEvidence('.media-action-bar'),
    ];
    const curate = {
      phaseRect: rect(curateView),
      mediaScrollRect: rect(mediaScroll),
      mediaScrollHeight: mediaScroll.clientHeight,
      virtualCardHeight: virtualCard.cardHeight,
      mediaScrollFitsVirtualCard: mediaScroll.clientHeight >= virtualCard.cardHeight,
      maxBadgeCard: badgeProbeEvidence,
      maxBadgeCardFits: badgeProbeEvidence.noClipping,
      toolbars: curateToolbars,
      noToolbarHorizontalClipping: curateToolbars.every((entry) => entry.fits),
      scroll: scrollEvidence(curateView),
    };

    const handoffView = await activate('handoff');
    const handoffIntro = document.querySelector('.handoff-phase .phase-introduction');
    const handoffCopy = handoffIntro.querySelector('p:last-child');
    const introRect = handoffIntro.getBoundingClientRect();
    const copyRect = handoffCopy.getBoundingClientRect();
    const handoff = {
      phaseRect: rect(handoffView),
      introRect: rect(handoffIntro),
      copyRect: rect(handoffCopy),
      introNotClipped: handoffIntro.scrollHeight <= handoffIntro.clientHeight + 1
        && copyRect.bottom <= introRect.bottom + 1,
      introFullyVisible: intersectionRatio(handoffIntro, handoffView) >= 0.999,
      globalToolbar: toolbarEvidence('.toolbar'),
      scroll: scrollEvidence(handoffView),
    };

    const assembleView = await activate('assemble');
    const stageScroll = document.querySelector('#stage-scroll');
    const artboard = document.querySelector('#artboard');
    const assembleToolbars = [toolbarEvidence('.toolbar'), toolbarEvidence('.stage-toolbar')];
    const assemble = {
      phaseRect: rect(assembleView),
      stageRect: rect(stageScroll),
      artboardRect: rect(artboard),
      artboardVisibleRatio: intersectionRatio(artboard, [stageScroll, assembleView]),
      artboardMajorityInitiallyVisible: intersectionRatio(artboard, [stageScroll, assembleView]) >= 0.5,
      toolbars: assembleToolbars,
      noToolbarHorizontalClipping: assembleToolbars.every((entry) => entry.fits),
      scroll: scrollEvidence(assembleView),
    };

    const workbench = document.querySelector('.workbench');
    const phaseWorkspaces = document.querySelector('.phase-workspaces');
    return {
      curate,
      handoff,
      assemble,
      scrollOwners: {
        document: scrollEvidence(document.scrollingElement),
        body: scrollEvidence(document.body),
        workbench: scrollEvidence(workbench),
        phaseWorkspaces: scrollEvidence(phaseWorkspaces),
      },
      documentScrollTop: document.scrollingElement.scrollTop,
      documentScrollLeft: document.scrollingElement.scrollLeft,
      bodyScrollTop: document.body.scrollTop,
      bodyScrollLeft: document.body.scrollLeft,
    };
  })()`, true)
}

async function inspectRuntimeUIPolishStability() {
  return mainWindow.webContents.executeJavaScript(`(async () => {
    const settle = () => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const rectInside = (inner, outer, tolerance = 1) => inner.width > 0
      && inner.height > 0
      && inner.left >= outer.left - tolerance
      && inner.top >= outer.top - tolerance
      && inner.right <= outer.right + tolerance
      && inner.bottom <= outer.bottom + tolerance;
    const rectStable = (before, after, tolerance = 1) => [
      'left', 'top', 'right', 'bottom', 'width', 'height',
    ].every((field) => Math.abs(before[field] - after[field]) <= tolerance);
    const scrollSnapshot = () => {
      const owners = {
        document: document.scrollingElement,
        body: document.body,
        workbench: document.querySelector('.workbench'),
        phaseWorkspaces: document.querySelector('.phase-workspaces'),
        activePhase: document.querySelector('.phase-view.is-active'),
      };
      return Object.fromEntries(Object.entries(owners).map(([name, element]) => [name, {
        scrollTop: element.scrollTop,
        scrollLeft: element.scrollLeft,
      }]));
    };
    const scrollStable = (before, after) => Object.keys(before).every((name) => (
      before[name].scrollTop === after[name].scrollTop
        && before[name].scrollLeft === after[name].scrollLeft
    ));
    const activate = async (phase) => {
      await enterPhaseForSlide(phase);
      await settle();
      return document.querySelector('[data-phase-view="' + phase + '"]');
    };
    const viewportRect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

    const curateView = await activate('curate');
    const disclosureEvidence = async (detailsSelector, overlaySelector) => {
      const details = document.querySelector(detailsSelector);
      const trigger = details.querySelector(':scope > summary');
      const overlay = details.querySelector(overlaySelector);
      details.open = false;
      await settle();
      const scrollBefore = scrollSnapshot();
      const triggerBefore = rect(trigger);
      details.open = true;
      details.open = false;
      details.open = true;
      await settle();
      const triggerOpen = rect(trigger);
      const overlayRect = rect(overlay);
      const overlayStyle = getComputedStyle(overlay);
      const viewportPositioned = overlayStyle.position === 'fixed'
        && ['above', 'below'].includes(details.dataset.disclosurePlacement);
      const scrollOpen = scrollSnapshot();
      details.open = false;
      await settle();
      const triggerAfter = rect(trigger);
      const scrollAfter = scrollSnapshot();
      return {
        triggerBefore,
        triggerOpen,
        triggerAfter,
        overlayRect,
        triggerStable: rectStable(triggerBefore, triggerOpen) && rectStable(triggerBefore, triggerAfter),
        overlayInsideViewport: rectInside(overlayRect, viewportRect),
        viewportPositioned,
        noOuterScrollDrift: scrollStable(scrollBefore, scrollOpen) && scrollStable(scrollBefore, scrollAfter),
      };
    };
    const disclosures = {
      projectReview: await disclosureEvidence('.project-media-judgment', '.project-media-actions'),
      findMore: await disclosureEvidence('#find-more-panel', '#find-more-form'),
    };

    await activate('plan');
    const icons = [...document.querySelectorAll('button.icon-button .phosphor-icon')]
      .filter((icon) => {
        const style = getComputedStyle(icon);
        return !icon.hidden && style.display !== 'none' && icon.getClientRects().length > 0;
      })
      .map((icon) => {
        const button = icon.closest('button');
        const buttonRect = rect(button);
        const iconRect = rect(icon);
        const centerDelta = {
          x: Math.abs((iconRect.left + iconRect.width / 2) - (buttonRect.left + buttonRect.width / 2)),
          y: Math.abs((iconRect.top + iconRect.height / 2) - (buttonRect.top + buttonRect.height / 2)),
        };
        const style = getComputedStyle(icon);
        return {
          buttonId: button.id,
          buttonRect,
          iconRect,
          centerDelta,
          phosphorBound: style.fontFamily.includes('Phosphor'),
          centeredAndUnclipped: rectInside(iconRect, buttonRect)
            && centerDelta.x <= 1.5
            && centerDelta.y <= 1.5
            && style.fontFamily.includes('Phosphor'),
        };
      });

    await activate('assemble');
    const zoomLabel = document.querySelector('#zoom-label');
    const fitArtboard = document.querySelector('#fit-artboard');
    const originalZoomLabel = zoomLabel.textContent;
    zoomLabel.textContent = '95%';
    await settle();
    const zoom95 = { labelRect: rect(zoomLabel), fitRect: rect(fitArtboard) };
    zoomLabel.textContent = '100%';
    await settle();
    const zoom100 = { labelRect: rect(zoomLabel), fitRect: rect(fitArtboard) };
    zoomLabel.textContent = originalZoomLabel;
    await settle();
    const zoom = {
      zoom95,
      zoom100,
      stable: rectStable(zoom95.labelRect, zoom100.labelRect)
        && rectStable(zoom95.fitRect, zoom100.fitRect),
    };

    await activate('plan');
    const toolbar = document.querySelector('.toolbar');
    const phaseWorkspaces = document.querySelector('.phase-workspaces');
    const status = document.querySelector('#save-state');
    const originalStatus = status.textContent;
    const statusBefore = {
      toolbarRect: rect(toolbar),
      phaseWorkspacesRect: rect(phaseWorkspaces),
      statusRect: rect(status),
    };
    status.textContent = 'InvalidPreferences: ' + 'A deliberately long native status message. '.repeat(8);
    await settle();
    const statusStyle = getComputedStyle(status);
    const statusLong = {
      toolbarRect: rect(toolbar),
      phaseWorkspacesRect: rect(phaseWorkspaces),
      statusRect: rect(status),
      whiteSpace: statusStyle.whiteSpace,
      overflow: statusStyle.overflow,
      textOverflow: statusStyle.textOverflow,
    };
    status.textContent = originalStatus;
    await settle();
    const longStatus = {
      before: statusBefore,
      long: statusLong,
      stable: rectStable(statusBefore.toolbarRect, statusLong.toolbarRect)
        && rectStable(statusBefore.phaseWorkspacesRect, statusLong.phaseWorkspacesRect)
        && rectInside(statusLong.statusRect, statusLong.toolbarRect)
        && statusStyle.whiteSpace === 'nowrap'
        && statusStyle.overflow === 'hidden'
        && statusStyle.textOverflow === 'ellipsis',
    };

    const handoffView = await activate('handoff');
    const exportButton = document.querySelector('#export-pdf');
    const exportContainer = exportButton.parentElement;
    const originalExportLabel = exportButton.textContent;
    const exportBefore = {
      viewRect: rect(handoffView),
      containerRect: rect(exportContainer),
      buttonRect: rect(exportButton),
    };
    exportButton.textContent = 'Export “' + 'A deliberately long Slide title '.repeat(8) + '” PDF';
    await settle();
    const exportStyle = getComputedStyle(exportButton);
    const exportLong = {
      viewRect: rect(handoffView),
      containerRect: rect(exportContainer),
      buttonRect: rect(exportButton),
      whiteSpace: exportStyle.whiteSpace,
      overflow: exportStyle.overflow,
      textOverflow: exportStyle.textOverflow,
    };
    exportButton.textContent = originalExportLabel;
    await settle();
    const longHandoffButton = {
      before: exportBefore,
      long: exportLong,
      stable: rectStable(exportBefore.viewRect, exportLong.viewRect)
        && rectStable(exportBefore.containerRect, exportLong.containerRect)
        && rectStable(exportBefore.buttonRect, exportLong.buttonRect)
        && rectInside(exportLong.buttonRect, exportLong.containerRect)
        && exportStyle.whiteSpace === 'nowrap'
        && exportStyle.overflow === 'hidden'
        && exportStyle.textOverflow === 'ellipsis',
    };

    const result = {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scale: interfaceScale,
      disclosures,
      icons: {
        items: icons,
        centeredAndUnclipped: icons.length >= 2 && icons.every((entry) => entry.centeredAndUnclipped),
      },
      zoom,
      longStatus,
      longHandoffButton,
    };
    result.ok = Object.values(disclosures).every((entry) => entry.triggerStable
        && entry.overlayInsideViewport
        && entry.viewportPositioned
        && entry.noOuterScrollDrift)
      && result.icons.centeredAndUnclipped
      && zoom.stable
      && longStatus.stable
      && longHandoffButton.stable;
    return result;
  })()`, true)
}

async function presentRuntimePhaseForScreenshot(phase) {
  await mainWindow.webContents.executeJavaScript(`(async () => {
    await enterPhaseForSlide(${JSON.stringify(phase)});
    const view = document.querySelector('[data-phase-view="${phase}"]');
    const screenshotOwners = [
      document.scrollingElement,
      document.body,
      document.querySelector('.workbench'),
      document.querySelector('.phase-workspaces'),
      view,
    ];
    for (const owner of screenshotOwners) {
      owner.scrollTop = 0;
      owner.scrollLeft = 0;
    }
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  })()`, true)
}

async function captureRuntimeUIScreenshot(outputDirectory, name) {
  const capture = await mainWindow.webContents.capturePage()
  const png = capture.toPNG()
  const size = capture.getSize()
  await writeDurably(resolve(outputDirectory, name), png)
  return {
    file: name,
    width: size.width,
    height: size.height,
    bytes: png.byteLength,
    sha256: createHash('sha256').update(png).digest('hex'),
  }
}

async function captureRepresentativeRuntimeUIScreenshots(outputDirectory) {
  const screenshots = []
  const previousArtboardZoom = await mainWindow.webContents.executeJavaScript('artboardZoom', true)
  const previousTheme = preferences.theme
  for (const theme of ['light', 'dark']) {
    await mainWindow.webContents.executeJavaScript(`(async () => {
      const result = await globalThis.deckBridge.setTheme({ value: ${JSON.stringify(theme)} });
      applyThemePreference(result.theme);
      await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    })()`, true)
    for (const phase of ['plan', 'curate', 'assemble', 'handoff']) {
      await presentRuntimePhaseForScreenshot(phase)
      if (phase === 'assemble') {
        await mainWindow.webContents.executeJavaScript(`(() => {
          artboardZoom = 0.65;
          elements.artboardZoom.value = String(artboardZoom);
          applyScales();
        })()`, true)
        await new Promise((resolveFrame) => setTimeout(resolveFrame, 50))
      }
      screenshots.push(await captureRuntimeUIScreenshot(
        outputDirectory,
        `ui-${phase}-${theme}-1440x900-100.png`,
      ))
    }
  }
  await mainWindow.webContents.executeJavaScript(`(() => {
    artboardZoom = ${JSON.stringify(previousArtboardZoom)};
    elements.artboardZoom.value = String(artboardZoom);
    applyScales();
  })()`, true)
  await mainWindow.webContents.executeJavaScript(`(async () => {
    const result = await globalThis.deckBridge.setTheme({ value: ${JSON.stringify(previousTheme)} });
    applyThemePreference(result.theme);
  })()`, true)
  return screenshots
}

async function inspectPackagedCanvasPresets(outputDirectory) {
  const previousPreferences = { ...preferences }
  const packagePath = resolve(outputDirectory, 'canvas-presets.pitchdeck')
  const seed = {
    deckId: '00000000-0000-4000-8000-000000000301',
    sectionId: '00000000-0000-4000-8000-000000000302',
    slideId: '00000000-0000-4000-8000-000000000303',
    blockId: '00000000-0000-4000-8000-000000000304',
    title: 'Canvas Preset Proof',
    initialHeadline: 'One Story. Every Frame.',
  }
  activePackagePath = packagePath
  const initial = await utility.request('document.create', { packagePath, seed })
  await renderProjection(initial)

  const execute = async (commandId, type, payload, issuedAt) => {
    const story = await invokeInWorkspace('query', { name: 'story.document', params: {} })
    const result = await invokeInWorkspace('execute', {
      command: {
        commandId,
        expectedRevision: story.revision,
        type,
        payload,
        source: { kind: 'ui', label: 'Packaged canvas preset proof' },
        issuedAt,
      },
    })
    await renderProjection(result.projection)
    return result.projection
  }

  await execute(
    '00000000-0000-4000-8000-000000000305',
    'content.add',
    {
      slideId: seed.slideId,
      blockId: '00000000-0000-4000-8000-000000000306',
      semanticKey: 'story.body',
      role: 'body',
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Landscape, square and portrait stay deliberate.' }] }],
      },
      afterBlockId: seed.blockId,
    },
    '2026-08-30T15:00:00.000Z',
  )

  const cases = [
    { id: 'widescreen-1920x1080', slug: 'landscape' },
    { id: 'square-2160x2160', slug: 'square' },
    { id: 'a4-portrait', slug: 'portrait' },
  ]
  const evidence = []
  const screenshots = []
  for (const [index, item] of cases.entries()) {
    await execute(
      `00000000-0000-4000-8000-00000000031${index}`,
      'canvas.preset.set',
      { canvasPresetId: item.id },
      `2026-08-30T15:00:1${index}.000Z`,
    )
    const projection = await execute(
      `00000000-0000-4000-8000-00000000032${index}`,
      'designOption.applyPattern',
      {
        slideId: seed.slideId,
        designOptionId: `00000000-0000-4000-8000-00000000033${index}`,
        patternId: 'editorial-body',
        patternVersion: 1,
        contentBindings: {
          headline: seed.blockId,
          body: '00000000-0000-4000-8000-000000000306',
        },
      },
      `2026-08-30T15:00:2${index}.000Z`,
    )
    await configureRuntimeUI(representativeRuntimeUIViewport, 1)
    await presentRuntimePhaseForScreenshot('assemble')
    await mainWindow.webContents.executeJavaScript(`(() => {
      artboardZoom = fittedArtboardZoom();
      elements.artboardZoom.value = String(artboardZoom);
      applyScales();
    })()`, true)
    for (const theme of ['light', 'dark']) {
      await mainWindow.webContents.executeJavaScript(`(async () => {
        const result = await globalThis.deckBridge.setTheme({ value: ${JSON.stringify(theme)} });
        applyThemePreference(result.theme);
        await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      })()`, true)
      screenshots.push(await captureRuntimeUIScreenshot(
        outputDirectory,
        `canvas-${item.slug}-${theme}-1440x900.png`,
      ))
    }
    const pdfFile = `canvas-${item.slug}.pdf`
    const pdf = await exportOnePagePDF(resolve(outputDirectory, pdfFile))
    evidence.push({
      canvas: projection.canvas,
      designOption: projection.designOption,
      pdf: { file: pdfFile, ...pdf },
    })
  }
  await utility.request('document.save')
  await invokeInWorkspace('setTheme', { value: previousPreferences.theme })
  await invokeInWorkspace('setInterfaceScale', { value: previousPreferences.interfaceScale })
  await invokeInWorkspace('setArtboardZoom', { value: previousPreferences.artboardZoom })
  await utility.request('document.close')
  activePackagePath = null
  return { cases: evidence, screenshots, ok: evidence.length === cases.length }
}

function runtimeUIScrollOwnerPassed(owner) {
  return Number.isFinite(owner?.scrollTop)
    && owner.scrollTop === 0
    && Number.isFinite(owner.scrollLeft)
    && owner.scrollLeft === 0
    && Number.isFinite(owner.clientWidth)
    && owner.clientWidth > 0
    && Number.isFinite(owner.scrollWidth)
    && owner.scrollWidth <= owner.clientWidth + 1
}

function runtimeUIScrollOwnersPassed(owners, expectedNames) {
  return expectedNames.every((name) => runtimeUIScrollOwnerPassed(owners?.[name]))
}

function runtimeUICasePassed(entry, kind) {
  if (!entry.configuration.exactViewport
    || !entry.configuration.fontsReady
    || !entry.configuration.fontsLoaded) return false
  if (kind === 'cold') {
    return entry.geometry.createDeckFullyVisible
      && entry.geometry.openDeckFullyVisible
      && entry.geometry.toolbarFitsHorizontally
      && entry.geometry.documentScrollTop === 0
      && entry.geometry.documentScrollLeft === 0
      && entry.geometry.bodyScrollTop === 0
      && entry.geometry.bodyScrollLeft === 0
      && runtimeUIScrollOwnersPassed(entry.geometry.scrollOwners, [
        'document', 'body', 'workbench', 'phaseWorkspaces', 'activePhase',
      ])
  }
  return entry.geometry.curate.mediaScrollFitsVirtualCard
    && entry.geometry.curate.maxBadgeCardFits
    && entry.geometry.curate.noToolbarHorizontalClipping
    && entry.geometry.handoff.introNotClipped
    && entry.geometry.handoff.introFullyVisible
    && entry.geometry.handoff.globalToolbar.fits
    && entry.geometry.assemble.artboardMajorityInitiallyVisible
    && entry.geometry.assemble.noToolbarHorizontalClipping
    && entry.geometry.documentScrollTop === 0
    && entry.geometry.documentScrollLeft === 0
    && entry.geometry.bodyScrollTop === 0
    && entry.geometry.bodyScrollLeft === 0
    && runtimeUIScrollOwnersPassed(entry.geometry.scrollOwners, [
      'document', 'body', 'workbench', 'phaseWorkspaces',
    ])
    && [entry.geometry.curate, entry.geometry.handoff, entry.geometry.assemble]
      .every((phase) => runtimeUIScrollOwnerPassed(phase.scroll))
}

async function inspectPackagedColdRuntimeUI(outputDirectory) {
  const cases = []
  const screenshots = []
  for (const viewport of runtimeUIViewports) {
    for (const scale of runtimeUIScales) {
      const configuration = await configureRuntimeUI(viewport, scale)
      const geometry = await inspectColdRuntimeUI()
      const entry = { viewport, scale, configuration, geometry }
      entry.ok = runtimeUICasePassed(entry, 'cold')
      cases.push(entry)
      if (viewport.label === 'mac-post-toolbar-proxy' && scale === 1.75) {
        screenshots.push(await captureRuntimeUIScreenshot(
          outputDirectory,
          'ui-cold-1180x605-175.png',
        ))
      }
    }
  }
  return { cases, screenshots, ok: cases.every((entry) => entry.ok) }
}

async function inspectPackagedDocumentRuntimeUI(outputDirectory) {
  const cases = []
  const screenshots = []
  for (const viewport of runtimeUIViewports) {
    for (const scale of runtimeUIScales) {
      const configuration = await configureRuntimeUI(viewport, scale)
      const geometry = await inspectDocumentRuntimeUI()
      const entry = { viewport, scale, configuration, geometry }
      entry.ok = runtimeUICasePassed(entry, 'document')
      cases.push(entry)
      if (viewport.label === 'mac-post-toolbar-proxy' && scale === 1.75) {
        screenshots.push(await captureRuntimeUIScreenshot(
          outputDirectory,
          'ui-assemble-1180x605-175.png',
        ))
        await presentRuntimePhaseForScreenshot('handoff')
        screenshots.push(await captureRuntimeUIScreenshot(
          outputDirectory,
          'ui-handoff-1180x605-175.png',
        ))
        await presentRuntimePhaseForScreenshot('curate')
        screenshots.push(await captureRuntimeUIScreenshot(
          outputDirectory,
          'ui-curate-1180x605-175.png',
        ))
      }
    }
  }
  await configureRuntimeUI(representativeRuntimeUIViewport, 1)
  const polish = await inspectRuntimeUIPolishStability()
  screenshots.push(...await captureRepresentativeRuntimeUIScreenshots(outputDirectory))
  await configureRuntimeUI(representativeRuntimeUIViewport, 1.25)
  await presentRuntimePhaseForScreenshot('plan')
  return { cases, screenshots, polish, ok: cases.every((entry) => entry.ok) && polish.ok }
}

async function runPackagedTracerCreate(outputDirectory) {
  if (!isAbsolute(outputDirectory)) throw namedError('InvalidCommand', 'Tracer output directory must be absolute')
  await mkdir(outputDirectory, { recursive: true })
  const packagePath = resolve(outputDirectory, 'tracer.pitchdeck')
  const runtimeUICold = await inspectPackagedColdRuntimeUI(outputDirectory)

  const seed = {
    deckId: '00000000-0000-4000-8000-000000000101',
    sectionId: '00000000-0000-4000-8000-000000000102',
    slideId: '00000000-0000-4000-8000-000000000103',
    blockId: '00000000-0000-4000-8000-000000000104',
    title: 'Linux Packaged Tracer',
    initialHeadline: 'Untitled Story',
  }
  activePackagePath = packagePath
  const initial = await utility.request('document.create', { packagePath, seed })
  await renderProjection(initial)
  const boundary = await inspectRendererBoundary()
  const expectedRevision = initial.revision
  const editedResult = await invokeInWorkspace('execute', {
    command: {
      commandId: '00000000-0000-4000-8000-000000000105',
      expectedRevision,
      type: 'content.update',
      payload: {
        slideId: seed.slideId,
        blockId: seed.blockId,
        value: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linux Story Traced' }] }],
        },
      },
      source: { kind: 'ui', label: 'Linux packaged tracer' },
      issuedAt: '2026-08-27T00:00:00.000Z',
    },
  })
  const edited = editedResult.projection
  await renderProjection(edited)
  const undoneResult = await invokeInWorkspace('undo')
  const undone = undoneResult.projection
  await renderProjection(undone)
  const redoneResult = await invokeInWorkspace('redo')
  const redone = redoneResult.projection
  await renderProjection(redone)
  const theme = await invokeInWorkspace('setTheme', { value: 'dark' })
  const scale = await invokeInWorkspace('setInterfaceScale', { value: 1.25 })
  const zoom = await invokeInWorkspace('setArtboardZoom', { value: 0.5 })

  const executeStoryCommand = async (commandId, type, payload, issuedAt) => {
    const story = await invokeInWorkspace('query', { name: 'story.document', params: {} })
    return invokeInWorkspace('execute', {
      command: {
        commandId,
        expectedRevision: story.revision,
        type,
        payload,
        source: { kind: 'ui', label: 'Linux packaged Story journey' },
        issuedAt,
      },
    })
  }
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000110',
    'section.add',
    { sectionId: packagedStoryIds.secondSectionId, title: 'Act Two', afterSectionId: seed.sectionId },
    '2026-08-27T00:00:01.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000111',
    'slide.add',
    {
      sectionId: packagedStoryIds.secondSectionId,
      slideId: packagedStoryIds.secondSlideId,
      blockId: packagedStoryIds.secondHeadlineBlockId,
      intent: 'statement',
      headline: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Work Begins' }] }],
      },
      afterSlideId: null,
    },
    '2026-08-27T00:00:02.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000112',
    'section.move',
    { sectionId: packagedStoryIds.secondSectionId, afterSectionId: null },
    '2026-08-27T00:00:03.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000113',
    'slide.move',
    { slideId: packagedStoryIds.secondSlideId, targetSectionId: seed.sectionId, afterSlideId: seed.slideId },
    '2026-08-27T00:00:04.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000114',
    'section.rename',
    { sectionId: packagedStoryIds.secondSectionId, title: 'Act II' },
    '2026-08-27T00:00:05.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000115',
    'slide.intent.set',
    { slideId: packagedStoryIds.secondSlideId, intent: 'editorial-body' },
    '2026-08-27T00:00:06.000Z',
  )
  await executeStoryCommand(
    '00000000-0000-4000-8000-000000000116',
    'content.add',
    {
      slideId: packagedStoryIds.secondSlideId,
      blockId: packagedStoryIds.bodyBlockId,
      semanticKey: 'story.body.1',
      role: 'body',
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A body block that survives design.' }] }],
      },
      afterBlockId: packagedStoryIds.secondHeadlineBlockId,
    },
    '2026-08-27T00:00:07.000Z',
  )
  const structuredResult = await executeStoryCommand(
    '00000000-0000-4000-8000-000000000117',
    'content.update',
    {
      slideId: packagedStoryIds.secondSlideId,
      blockId: packagedStoryIds.bodyBlockId,
      value: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'A body block.' }] },
          { type: 'paragraph', content: [] },
          { type: 'paragraph', content: [{ type: 'text', text: 'That survives design.' }] },
        ],
      },
    },
    '2026-08-27T00:00:08.000Z',
  )
  await renderProjection(structuredResult.projection)
  const structuredStory = await invokeInWorkspace('query', { name: 'story.document', params: {} })
  const sectionOrder = structuredStory.sections.map((section) => section.id)
  const openingSlideOrder = structuredStory.sections[1].slides.map((slide) => slide.id)
  const bodyText = storyBlockPlainText(structuredStory, packagedStoryIds.bodyBlockId)
  const runtimeUIDocument = await inspectPackagedDocumentRuntimeUI(outputDirectory)
  const runtimeUI = {
    schemaVersion: 1,
    viewports: runtimeUIViewports,
    scales: runtimeUIScales,
    cold: runtimeUICold.cases,
    document: runtimeUIDocument.cases,
    polish: runtimeUIDocument.polish,
    screenshots: [...runtimeUICold.screenshots, ...runtimeUIDocument.screenshots],
    ok: runtimeUICold.ok && runtimeUIDocument.ok,
  }

  const saved = await utility.request('document.save')
  await utility.request('document.close')
  activePackagePath = null
  const canvasPresets = await inspectPackagedCanvasPresets(outputDirectory)
  runtimeUI.canvasPresets = canvasPresets
  runtimeUI.screenshots.push(...canvasPresets.screenshots)
  runtimeUI.ok = runtimeUI.ok && canvasPresets.ok
  const persistedPreferences = JSON.parse(await readFile(preferencesPath(), 'utf8'))

  const result = {
    schemaVersion: 1,
    processId: process.pid,
    processInstanceId,
    checks: {
      utilityOwner: (await utility.ready()).owner,
      ...boundary,
      initialHeadline: initial.headline.plainText,
      editedHeadline: edited.headline.plainText,
      undoneHeadline: undone.headline.plainText,
      redoneHeadline: redone.headline.plainText,
      savedRevision: saved.revision,
      theme: theme.theme,
      interfaceScale: scale.interfaceScale,
      artboardZoom: zoom.artboardZoom,
      persistedTheme: persistedPreferences.theme,
      persistedInterfaceScale: persistedPreferences.interfaceScale,
      persistedArtboardZoom: persistedPreferences.artboardZoom,
      storyRevision: structuredStory.revision,
      sectionOrder,
      openingSlideOrder,
      emptySecondSection: structuredStory.sections[0].slides.length === 0,
      renamedSectionTitle: structuredStory.sections[0].title,
      secondSlideIntent: structuredStory.sections[1].slides[1].intent,
      bodyBlockId: packagedStoryIds.bodyBlockId,
      bodyOriginalText: 'A body block that survives design.',
      bodyText,
      runtimeUI,
    },
  }
  result.ok = result.checks.utilityOwner === 'electron-utility-process'
    && result.checks.exactBridge
    && result.checks.rendererNodeRequire === 'undefined'
    && result.checks.rendererNodeProcess === 'undefined'
    && result.checks.rendererNetworkBlocked === true
    && result.checks.initialHeadline === 'Untitled Story'
    && result.checks.editedHeadline === 'Linux Story Traced'
    && result.checks.undoneHeadline === 'Untitled Story'
    && result.checks.redoneHeadline === 'Linux Story Traced'
    && result.checks.savedRevision === 11
    && result.checks.theme === 'dark'
    && result.checks.interfaceScale === 1.25
    && result.checks.artboardZoom === 0.5
    && result.checks.persistedTheme === 'dark'
    && result.checks.persistedInterfaceScale === 1.25
    && result.checks.persistedArtboardZoom === 0.5
    && result.checks.storyRevision === 11
    && JSON.stringify(result.checks.sectionOrder) === JSON.stringify([
      packagedStoryIds.secondSectionId,
      seed.sectionId,
    ])
    && JSON.stringify(result.checks.openingSlideOrder) === JSON.stringify([
      seed.slideId,
      packagedStoryIds.secondSlideId,
    ])
    && result.checks.emptySecondSection === true
    && result.checks.renamedSectionTitle === 'Act II'
    && result.checks.secondSlideIntent === 'editorial-body'
    && result.checks.bodyText === 'A body block.\n\nThat survives design.'
    && result.checks.runtimeUI.ok === true
  await writeDurably(
    resolve(outputDirectory, 'journey-create-result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
  if (!result.ok) {
    const failedRuntimeUICases = ['cold', 'document'].flatMap((kind) => result.checks.runtimeUI[kind]
      .filter((entry) => entry.ok !== true)
      .map((entry) => ({ kind, ...entry })))
    if (failedRuntimeUICases.length) {
      console.error('Runtime UI assertion evidence:')
      console.error(JSON.stringify(failedRuntimeUICases, null, 2))
    }
    throw namedError('TracerFailed', 'Linux packaged create journey assertions failed')
  }
  return result
}

async function runPackagedTracerReopen(outputDirectory, { requireDistinctProcess = true } = {}) {
  if (!isAbsolute(outputDirectory)) throw namedError('InvalidCommand', 'Tracer output directory must be absolute')
  const packagePath = resolve(outputDirectory, 'tracer.pitchdeck')
  const pdfPath = resolve(outputDirectory, 'tracer.pdf')
  const createResult = JSON.parse(await readFile(resolve(outputDirectory, 'journey-create-result.json'), 'utf8'))
  if (
    createResult.schemaVersion !== 1
    || createResult.ok !== true
    || !Number.isInteger(createResult.processId)
    || typeof createResult.processInstanceId !== 'string'
  ) {
    throw namedError('TracerFailed', 'Packaged create-phase evidence is invalid')
  }

  const reopened = await utility.request('document.open', { packagePath })
  activePackagePath = packagePath
  await renderProjection(reopened)
  const boundary = await inspectRendererBoundary()
  const historyAtReopen = await invokeInWorkspace('query', { name: 'history.summary', params: {} })
  const reopenedStory = await invokeInWorkspace('query', { name: 'story.document', params: {} })
  const reopenedPreferences = await invokeInWorkspace('getPreferences')
  const reopenedUndo = (await invokeInWorkspace('undo')).projection
  await renderProjection(reopenedUndo)
  const reopenedUndoStory = await invokeInWorkspace('query', { name: 'story.document', params: {} })
  const reopenedRedo = (await invokeInWorkspace('redo')).projection
  await renderProjection(reopenedRedo)
  const reopenedRedoStory = await invokeInWorkspace('query', { name: 'story.document', params: {} })
  const history = await invokeInWorkspace('query', { name: 'history.summary', params: {} })
  const pdf = await exportOnePagePDF(pdfPath)
  const reopenedSaved = await utility.request('document.save')
  await utility.request('document.close')
  activePackagePath = null

  const result = {
    schemaVersion: 1,
    processLifecycle: {
      createProcessId: createResult.processId,
      reopenProcessId: process.pid,
      createInstanceId: createResult.processInstanceId,
      reopenInstanceId: processInstanceId,
      distinctProcesses: createResult.processInstanceId !== processInstanceId,
    },
    checks: {
      utilityOwner: (await utility.ready()).owner,
      exactBridge: createResult.checks.exactBridge && boundary.exactBridge,
      rendererNodeRequire: boundary.rendererNodeRequire,
      rendererNodeProcess: boundary.rendererNodeProcess,
      rendererNetworkBlocked: createResult.checks.rendererNetworkBlocked && boundary.rendererNetworkBlocked,
      initialHeadline: createResult.checks.initialHeadline,
      editedHeadline: createResult.checks.editedHeadline,
      undoneHeadline: createResult.checks.undoneHeadline,
      redoneHeadline: createResult.checks.redoneHeadline,
      reopenedHeadline: reopened.headline.plainText,
      reopenedUndoDepth: historyAtReopen.undoDepth,
      reopenedUndoHeadline: reopenedUndo.headline.plainText,
      reopenedRedoHeadline: reopenedRedo.headline.plainText,
      finalRevision: history.revision,
      finalUndoDepth: history.undoDepth,
      savedRevision: createResult.checks.savedRevision,
      reopenSavedRevision: reopenedSaved.revision,
      theme: createResult.checks.theme,
      interfaceScale: createResult.checks.interfaceScale,
      artboardZoom: createResult.checks.artboardZoom,
      persistedTheme: reopenedPreferences.theme,
      persistedInterfaceScale: reopenedPreferences.interfaceScale,
      persistedArtboardZoom: reopenedPreferences.artboardZoom,
      reopenedStoryRevision: reopenedStory.revision,
      reopenedSectionOrder: reopenedStory.sections.map((section) => section.id),
      reopenedOpeningSlideOrder: reopenedStory.sections[1].slides.map((slide) => slide.id),
      reopenedBodyText: storyBlockPlainText(reopenedStory, createResult.checks.bodyBlockId),
      reopenedUndoBodyText: storyBlockPlainText(reopenedUndoStory, createResult.checks.bodyBlockId),
      reopenedRedoBodyText: storyBlockPlainText(reopenedRedoStory, createResult.checks.bodyBlockId),
      runtimeUI: createResult.checks.runtimeUI,
      pdfBytes: pdf.bytes,
      pdfSHA256: pdf.sha256,
    },
    unsupportedClaims: [
      'KDE Portal native picker behavior requires the target Garuda KDE/Wayland machine.',
    ],
  }
  if (!result.processLifecycle.distinctProcesses) {
    result.unsupportedClaims.push(
      'Compatibility mode closes and reopens the durable session in one process; use the create and reopen flags for process-lifecycle proof.',
    )
  }
  const failed = !result.checks.exactBridge
    || result.checks.rendererNodeRequire !== 'undefined'
    || result.checks.rendererNodeProcess !== 'undefined'
    || result.checks.rendererNetworkBlocked !== true
    || result.checks.editedHeadline !== 'Linux Story Traced'
    || result.checks.undoneHeadline !== 'Untitled Story'
    || result.checks.redoneHeadline !== 'Linux Story Traced'
    || result.checks.reopenedHeadline !== 'Linux Story Traced'
    || result.checks.reopenedUndoDepth < 1
    || result.checks.reopenedUndoHeadline !== 'Linux Story Traced'
    || result.checks.reopenedRedoHeadline !== 'Linux Story Traced'
    || result.checks.finalRevision !== 13
    || result.checks.finalUndoDepth !== 9
    || result.checks.reopenedUndoDepth !== 9
    || result.checks.savedRevision !== 11
    || result.checks.reopenSavedRevision !== 13
    || result.checks.theme !== 'dark'
    || result.checks.interfaceScale !== 1.25
    || result.checks.artboardZoom !== 0.5
    || result.checks.persistedTheme !== 'dark'
    || result.checks.persistedInterfaceScale !== 1.25
    || result.checks.persistedArtboardZoom !== 0.5
    || result.checks.reopenedStoryRevision !== 11
    || JSON.stringify(result.checks.reopenedSectionOrder) !== JSON.stringify(createResult.checks.sectionOrder)
    || JSON.stringify(result.checks.reopenedOpeningSlideOrder) !== JSON.stringify(createResult.checks.openingSlideOrder)
    || result.checks.reopenedBodyText !== 'A body block.\n\nThat survives design.'
    || result.checks.reopenedUndoBodyText !== createResult.checks.bodyOriginalText
    || result.checks.reopenedRedoBodyText !== 'A body block.\n\nThat survives design.'
    || result.checks.runtimeUI?.ok !== true
    || result.checks.pdfBytes < 100
    || (requireDistinctProcess && !result.processLifecycle.distinctProcesses)
  result.ok = !failed
  await writeDurably(resolve(outputDirectory, 'journey-result.json'), `${JSON.stringify(result, null, 2)}\n`)
  if (failed) throw namedError('TracerFailed', 'Linux packaged journey assertions failed')
  return result
}

async function runPackagedTracer(outputDirectory) {
  await runPackagedTracerCreate(outputDirectory)
  return runPackagedTracerReopen(outputDirectory, { requireDistinctProcess: false })
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Deck…', accelerator: 'CmdOrCtrl+N', click: () => void performNativeAction(presentNewDocument, presentNativeFailure) },
        { label: 'Open Deck…', accelerator: 'CmdOrCtrl+O', click: () => void performNativeAction(presentOpenDocument, presentNativeFailure) },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => void performNativeAction(saveDocument, presentNativeFailure) },
        { label: 'Close Deck', accelerator: 'CmdOrCtrl+W', click: () => void performNativeAction(closeDocument, presentNativeFailure) },
        { type: 'separator' },
        { label: 'Export PDF…', click: () => void performNativeAction(presentPDFExport, presentNativeFailure) },
        {
          label: 'Reveal Deck',
          click: () => { if (activePackagePath) shell.showItemInFolder(activePackagePath) },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo Deck Change', accelerator: 'CmdOrCtrl+Z', click: () => void performNativeAction(async () => renderProjection((await utility.request('document.undo')).projection), presentNativeFailure) },
        { label: 'Redo Deck Change', accelerator: 'CmdOrCtrl+Shift+Z', click: () => void performNativeAction(async () => renderProjection((await utility.request('document.redo')).projection), presentNativeFailure) },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Theme',
          submenu: themeValues.map((value) => ({
            label: value === 'system' ? 'System' : `${value[0].toUpperCase()}${value.slice(1)}`,
            type: 'radio',
            checked: preferences.theme === value,
            click: () => void performNativeAction(() => setThemeFromMenu(value), presentNativeFailure),
          })),
        },
        {
          label: 'Interface Scale',
          submenu: interfaceScaleSteps.map((value) => ({
            label: `${Math.round(value * 100)}%`,
            type: 'radio',
            checked: preferences.interfaceScale === value,
            click: () => void performNativeAction(() => setInterfaceScaleFromMenu(value), presentNativeFailure),
          })),
        },
      ],
    },
  ]))
}

async function closeDocument() {
  if (!activePackagePath) return
  await flushWorkspaceDrafts()
  await utility.request('document.close')
  abandonMediaSession()
  activePackagePath = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.webContents.executeJavaScript('globalThis.deckWorkbench.clearProjection()', true)
  }
}

async function setInterfaceScaleFromMenu(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.webContents.executeJavaScript(`(async () => {
    const result = await globalThis.deckBridge.setInterfaceScale({ value: ${JSON.stringify(value)} })
    interfaceScale = result.interfaceScale
    applyScales()
    return result
  })()`, true)
}

async function setThemeFromMenu(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.webContents.executeJavaScript(`(async () => {
    const result = await globalThis.deckBridge.setTheme({ value: ${JSON.stringify(value)} })
    applyThemePreference(result.theme)
    return result
  })()`, true)
}

async function start() {
  await app.whenReady()
  await loadPreferences()
  try {
    mediaGrantStore = await MediaGrantStore.open(resolve(app.getPath('userData'), 'media-grants.json'))
  } catch (error) {
    if (error?.name !== 'InvalidMediaGrantStore') throw error
    process.stderr.write(`${error.name}: ${error.message}\n`)
    mediaGrantStore = await MediaGrantStore.open(resolve(app.getPath('userData'), 'media-grants.json'))
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false
    try {
      const url = new URL(details.url)
      allowed = url.protocol === 'pitchdog-ui:'
        && url.hostname === 'workspace'
        && allowedWorkspaceFiles.has(url.pathname)
      if (!allowed && url.protocol === 'pitchdog-asset:') {
        const segments = url.pathname.split('/').filter(Boolean)
        allowed = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(url.hostname)
          && segments.length === 2
          && segments[1] === 'grid_standard'
          && !url.username
          && !url.password
          && !url.port
          && !url.search
      }
    } catch {
      allowed = false
    }
    callback({ cancel: !allowed })
  })
  await registerWorkspaceProtocol()
  await registerMediaProtocol()

  const child = utilityProcess.fork(kernelUtilityPath, [], {
    serviceName: 'Deck Workbench Kernel',
    stdio: 'pipe',
  })
  utility = new UtilityKernelClient(child)
  await utility.ready()
  await installBridgeHandlers()

  const tracerModes = [
    { flag: '--run-packaged-tracer-create', run: runPackagedTracerCreate },
    { flag: '--run-packaged-tracer-reopen', run: runPackagedTracerReopen },
    { flag: '--run-packaged-tracer', run: runPackagedTracer },
  ].filter((mode) => process.argv.includes(mode.flag))
  if (tracerModes.length > 1) throw namedError('InvalidCommand', 'Only one packaged tracer mode may run')
  const tracerMode = tracerModes[0] ?? null
  const tracerOutput = tracerMode ? process.argv[process.argv.indexOf(tracerMode.flag) + 1] : null
  if (tracerMode && !tracerOutput) {
    throw namedError('InvalidCommand', 'Tracer output directory is required')
  }
  mainWindow = await createWindow({ hidden: Boolean(tracerOutput) })
  installMenu()

  if (tracerMode) {
    await tracerMode.run(tracerOutput)
    await utility.request('document.close')
    utility.shutdown()
    app.exit(0)
  }
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (!utility || quitAfterCheckpoint) {
    abandonMediaSession()
    if (utility) utility.shutdown()
    return
  }
  event.preventDefault()
  if (pendingQuit) return
  pendingQuit = flushWorkspaceDrafts()
    .then(() => utility.request('document.close'))
    .then(() => {
      quitAfterCheckpoint = true
      abandonMediaSession()
      utility.shutdown()
      app.quit()
    })
    .catch((error) => {
      pendingQuit = null
      dialog.showErrorBox(
        'Deck could not close safely',
        `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
      )
    })
})

start().catch((error) => {
  process.stderr.write(`${error?.name ?? 'Error'}: ${error?.stack ?? error?.message ?? String(error)}\n`)
  abandonMediaSession()
  if (utility) utility.shutdown()
  app.exit(1)
})
