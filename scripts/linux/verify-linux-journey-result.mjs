import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [resultPath, label = 'Linux package'] = process.argv.slice(2)
if (!resultPath) throw new Error('Journey result path is required')

const result = JSON.parse(readFileSync(resultPath, 'utf8'))
if (result.schemaVersion !== 1) throw new Error(`${label}: unsupported packaged journey result`)
if (result.ok !== true) throw new Error(`${label}: packaged journey reported a failed assertion`)

const lifecycle = result.processLifecycle ?? {}
if (!Number.isInteger(lifecycle.createProcessId)
  || !Number.isInteger(lifecycle.reopenProcessId)
  || typeof lifecycle.createInstanceId !== 'string'
  || typeof lifecycle.reopenInstanceId !== 'string'
  || lifecycle.createInstanceId.length < 1
  || lifecycle.reopenInstanceId.length < 1
  || lifecycle.createInstanceId === lifecycle.reopenInstanceId
  || lifecycle.distinctProcesses !== true) {
  throw new Error(`${label}: full application process relaunch was not proved`)
}

const checks = result.checks ?? {}
if (checks.utilityOwner !== 'electron-utility-process') throw new Error(`${label}: kernel did not run in the utility process`)
if (checks.exactBridge !== true) throw new Error(`${label}: typed bridge parity failed`)
if (checks.rendererNodeRequire !== 'undefined' || checks.rendererNodeProcess !== 'undefined') {
  throw new Error(`${label}: renderer privilege isolation failed`)
}
if (checks.rendererNetworkBlocked !== true) throw new Error(`${label}: renderer network policy failed`)

const expectedHeadlines = {
  initialHeadline: 'Untitled Story',
  editedHeadline: 'Linux Story Traced',
  undoneHeadline: 'Untitled Story',
  redoneHeadline: 'Linux Story Traced',
  reopenedHeadline: 'Linux Story Traced',
  reopenedUndoHeadline: 'Linux Story Traced',
  reopenedRedoHeadline: 'Linux Story Traced',
}
for (const [field, expected] of Object.entries(expectedHeadlines)) {
  if (checks[field] !== expected) throw new Error(`${label}: ${field} mismatch`)
}

if (!Number.isInteger(checks.reopenedUndoDepth) || checks.reopenedUndoDepth < 1) {
  throw new Error(`${label}: reopened undo history is unavailable`)
}
if (checks.savedRevision !== 11 || checks.reopenSavedRevision !== 13 || checks.finalRevision !== 13) {
  throw new Error(`${label}: saved revision sequence mismatch`)
}
if (checks.reopenedUndoDepth !== 9 || checks.finalUndoDepth !== 9) {
  throw new Error(`${label}: structured Story undo history mismatch`)
}
if (checks.reopenedStoryRevision !== 11
  || checks.reopenedSectionOrder?.length !== 2
  || checks.reopenedOpeningSlideOrder?.length !== 2
  || checks.reopenedBodyText !== 'A body block.\n\nThat survives design.'
  || checks.reopenedUndoBodyText !== 'A body block that survives design.'
  || checks.reopenedRedoBodyText !== 'A body block.\n\nThat survives design.') {
  throw new Error(`${label}: structured Story replay or history mismatch`)
}
if (checks.theme !== 'dark' || checks.persistedTheme !== 'dark'
  || checks.interfaceScale !== 1.25 || checks.artboardZoom !== 0.5
  || checks.persistedInterfaceScale !== 1.25 || checks.persistedArtboardZoom !== 0.5) {
  throw new Error(`${label}: appearance, Interface Scale, or artboard zoom persistence failed`)
}

const runtimeUI = checks.runtimeUI ?? {}
const expectedRuntimeUIViewports = [
  { label: 'mac-post-toolbar-proxy', width: 1180, height: 605 },
  { label: 'compact-desktop', width: 1280, height: 720 },
]
const expectedRuntimeUIScales = [1, 1.25, 1.5, 1.75]
const expectedRuntimeUICases = new Set(expectedRuntimeUIViewports.flatMap((viewport) => (
  expectedRuntimeUIScales.map((scale) => `${viewport.width}x${viewport.height}@${scale}`)
)))

const numberCloseTo = (actual, expected, tolerance = 1) => Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance
const rectStable = (before, after, tolerance = 1) => before && after
  && ['left', 'top', 'right', 'bottom', 'width', 'height']
    .every((field) => numberCloseTo(before[field], after[field], tolerance))
const rectInside = (rect, width, height) => rect
  && rect.width > 0
  && rect.height > 0
  && rect.left >= -1
  && rect.top >= -1
  && rect.right <= width + 1
  && rect.bottom <= height + 1
const rectNested = (inner, outer) => inner && outer
  && inner.width > 0
  && inner.height > 0
  && inner.left >= outer.left - 1
  && inner.top >= outer.top - 1
  && inner.right <= outer.right + 1
  && inner.bottom <= outer.bottom + 1
const toolbarFits = (toolbar, width) => toolbar?.present !== false
  && toolbar?.fits !== false
  && Number.isFinite(toolbar?.clientWidth)
  && Number.isFinite(toolbar?.scrollWidth)
  && toolbar.scrollWidth <= toolbar.clientWidth + 1
  && toolbar.rect?.left >= -1
  && toolbar.rect?.right <= width + 1
  && Array.isArray(toolbar.children)
  && toolbar.children.every((child) => child.rect?.left >= toolbar.rect.left - 1
    && child.rect?.right <= toolbar.rect.right + 1)
const scrollOwnerAtOrigin = (owner) => Number.isFinite(owner?.scrollTop)
  && owner.scrollTop === 0
  && Number.isFinite(owner.scrollLeft)
  && owner.scrollLeft === 0
  && Number.isFinite(owner.clientWidth)
  && owner.clientWidth > 0
  && Number.isFinite(owner.scrollWidth)
  && owner.scrollWidth <= owner.clientWidth + 1
const scrollOwnersAtOrigin = (owners, expectedNames) => expectedNames
  .every((name) => scrollOwnerAtOrigin(owners?.[name]))

if (runtimeUI.schemaVersion !== 1
  || runtimeUI.ok !== true
  || JSON.stringify(runtimeUI.viewports) !== JSON.stringify(expectedRuntimeUIViewports)
  || JSON.stringify(runtimeUI.scales) !== JSON.stringify(expectedRuntimeUIScales)) {
  throw new Error(`${label}: runtime UI evidence matrix is missing or malformed`)
}

function verifyRuntimeUICases(cases, kind) {
  if (!Array.isArray(cases) || cases.length !== expectedRuntimeUICases.size) {
    throw new Error(`${label}: runtime UI ${kind} matrix is incomplete`)
  }
  const observed = new Set()
  for (const entry of cases) {
    const viewport = entry?.viewport ?? {}
    const scale = entry?.scale
    const key = `${viewport.width}x${viewport.height}@${scale}`
    if (!expectedRuntimeUICases.has(key) || observed.has(key)) {
      throw new Error(`${label}: runtime UI ${kind} matrix has an unexpected or duplicate case (${key})`)
    }
    observed.add(key)
    const configuration = entry.configuration ?? {}
    if (entry.ok !== true
      || configuration.exactViewport !== true
      || configuration.fontsReady !== true
      || configuration.fontsLoaded !== true
      || configuration.scale !== scale
      || configuration.requestedViewport?.width !== viewport.width
      || configuration.requestedViewport?.height !== viewport.height
      || configuration.viewport?.width !== viewport.width
      || configuration.viewport?.height !== viewport.height
      || !Array.isArray(configuration.fontLoads)
      || configuration.fontLoads.length !== 6
      || configuration.fontLoads.some((font) => font.faceCount < 1 || font.check !== true)
      || !configuration.computedFamilies?.body?.includes('PD Body')
      || !configuration.computedFamilies?.head?.includes('PD Head')
      || !configuration.computedFamilies?.eyebrow?.includes('PD Eyebrow')
      || !configuration.computedFamilies?.icon?.includes('Phosphor')) {
      throw new Error(`${label}: runtime UI ${kind} setup failed at ${key}`)
    }

    const geometry = entry.geometry ?? {}
    const expectedScrollOwners = kind === 'cold'
      ? ['document', 'body', 'workbench', 'phaseWorkspaces', 'activePhase']
      : ['document', 'body', 'workbench', 'phaseWorkspaces']
    if (geometry.documentScrollTop !== 0
      || geometry.documentScrollLeft !== 0
      || geometry.bodyScrollTop !== 0
      || geometry.bodyScrollLeft !== 0
      || !scrollOwnersAtOrigin(geometry.scrollOwners, expectedScrollOwners)) {
      throw new Error(`${label}: runtime UI ${kind} scroll ownership drifted at ${key}`)
    }
    if (kind === 'cold') {
      if (geometry.createDeckFullyVisible !== true
        || geometry.openDeckFullyVisible !== true
        || !rectInside(geometry.createDeckRect, viewport.width, viewport.height)
        || !rectInside(geometry.openDeckRect, viewport.width, viewport.height)
        || geometry.toolbarFitsHorizontally !== true
        || !toolbarFits({ ...geometry.toolbar, present: true, fits: geometry.toolbarFitsHorizontally }, viewport.width)) {
        throw new Error(`${label}: runtime UI cold actions or toolbar clip at ${key}`)
      }
      continue
    }

    const curate = geometry.curate ?? {}
    const maxBadgeCard = curate.maxBadgeCard ?? {}
    if (!scrollOwnerAtOrigin(curate.scroll)) {
      throw new Error(`${label}: runtime UI Curate scroll ownership drifted at ${key}`)
    }
    if (curate.mediaScrollFitsVirtualCard !== true
      || !Number.isFinite(curate.mediaScrollHeight)
      || !Number.isFinite(curate.virtualCardHeight)
      || curate.mediaScrollHeight < curate.virtualCardHeight
      || curate.maxBadgeCardFits !== true
      || maxBadgeCard.noClipping !== true
      || maxBadgeCard.everyBadgeFits !== true
      || maxBadgeCard.copyInsideCard !== true
      || !Number.isFinite(maxBadgeCard.copyClientWidth)
      || !Number.isFinite(maxBadgeCard.copyScrollWidth)
      || maxBadgeCard.copyClientWidth <= 0
      || maxBadgeCard.copyScrollWidth > maxBadgeCard.copyClientWidth + 1
      || !Number.isFinite(maxBadgeCard.copyClientHeight)
      || !Number.isFinite(maxBadgeCard.copyScrollHeight)
      || maxBadgeCard.copyClientHeight <= 0
      || maxBadgeCard.copyScrollHeight > maxBadgeCard.copyClientHeight + 1
      || !Number.isFinite(maxBadgeCard.badgesClientWidth)
      || !Number.isFinite(maxBadgeCard.badgesScrollWidth)
      || maxBadgeCard.badgesClientWidth <= 0
      || maxBadgeCard.badgesScrollWidth > maxBadgeCard.badgesClientWidth + 1
      || curate.noToolbarHorizontalClipping !== true
      || !Array.isArray(curate.toolbars)
      || curate.toolbars.length !== 4
      || curate.toolbars.some((toolbar) => !toolbarFits(toolbar, viewport.width))) {
      throw new Error(`${label}: runtime UI Curate geometry clips at ${key}`)
    }

    const handoff = geometry.handoff ?? {}
    if (!scrollOwnerAtOrigin(handoff.scroll)) {
      throw new Error(`${label}: runtime UI Handoff scroll ownership drifted at ${key}`)
    }
    if (handoff.introNotClipped !== true
      || handoff.introFullyVisible !== true
      || !numberCloseTo(handoff.introRect?.height, handoff.introRect?.bottom - handoff.introRect?.top)
      || handoff.copyRect?.bottom > handoff.introRect?.bottom + 1
      || !rectInside(handoff.introRect, viewport.width, viewport.height)
      || !toolbarFits(handoff.globalToolbar, viewport.width)) {
      throw new Error(`${label}: runtime UI Handoff introduction clips at ${key}`)
    }

    const assemble = geometry.assemble ?? {}
    if (!scrollOwnerAtOrigin(assemble.scroll)) {
      throw new Error(`${label}: runtime UI Assemble scroll ownership drifted at ${key}`)
    }
    if (assemble.artboardMajorityInitiallyVisible !== true
      || !Number.isFinite(assemble.artboardVisibleRatio)
      || assemble.artboardVisibleRatio < 0.5
      || assemble.noToolbarHorizontalClipping !== true
      || !Array.isArray(assemble.toolbars)
      || assemble.toolbars.length !== 2
      || assemble.toolbars.some((toolbar) => !toolbarFits(toolbar, viewport.width))) {
      throw new Error(`${label}: runtime UI Assemble artboard or toolbar clips at ${key}`)
    }
  }
}

verifyRuntimeUICases(runtimeUI.cold, 'cold')
verifyRuntimeUICases(runtimeUI.document, 'document')

const polish = runtimeUI.polish ?? {}
const disclosureEntries = Object.values(polish.disclosures ?? {})
const polishViewport = { width: 1440, height: 900 }
const disclosuresPass = disclosureEntries.length === 2 && disclosureEntries.every((entry) => (
  entry.triggerStable === true
    && entry.overlayInsideViewport === true
    && entry.viewportPositioned === true
    && entry.noOuterScrollDrift === true
    && rectStable(entry.triggerBefore, entry.triggerOpen)
    && rectStable(entry.triggerBefore, entry.triggerAfter)
    && rectInside(entry.triggerBefore, polishViewport.width, polishViewport.height)
    && rectInside(entry.overlayRect, polishViewport.width, polishViewport.height)
))
const iconItems = polish.icons?.items ?? []
const iconsPass = polish.icons?.centeredAndUnclipped === true
  && iconItems.length >= 2
  && iconItems.every((entry) => entry.centeredAndUnclipped === true
    && entry.phosphorBound === true
    && Number.isFinite(entry.centerDelta?.x)
    && Number.isFinite(entry.centerDelta?.y)
    && entry.centerDelta.x <= 1.5
    && entry.centerDelta.y <= 1.5
    && rectNested(entry.iconRect, entry.buttonRect))
const zoomPass = polish.zoom?.stable === true
  && rectStable(polish.zoom.zoom95?.labelRect, polish.zoom.zoom100?.labelRect)
  && rectStable(polish.zoom.zoom95?.fitRect, polish.zoom.zoom100?.fitRect)
const statusPass = polish.longStatus?.stable === true
  && rectStable(polish.longStatus.before?.toolbarRect, polish.longStatus.long?.toolbarRect)
  && rectStable(polish.longStatus.before?.phaseWorkspacesRect, polish.longStatus.long?.phaseWorkspacesRect)
  && rectNested(polish.longStatus.long?.statusRect, polish.longStatus.long?.toolbarRect)
  && polish.longStatus.long?.whiteSpace === 'nowrap'
  && polish.longStatus.long?.overflow === 'hidden'
  && polish.longStatus.long?.textOverflow === 'ellipsis'
const handoffPass = polish.longHandoffButton?.stable === true
  && rectStable(polish.longHandoffButton.before?.viewRect, polish.longHandoffButton.long?.viewRect)
  && rectStable(polish.longHandoffButton.before?.containerRect, polish.longHandoffButton.long?.containerRect)
  && rectStable(polish.longHandoffButton.before?.buttonRect, polish.longHandoffButton.long?.buttonRect)
  && rectNested(polish.longHandoffButton.long?.buttonRect, polish.longHandoffButton.long?.containerRect)
  && polish.longHandoffButton.long?.whiteSpace === 'nowrap'
  && polish.longHandoffButton.long?.overflow === 'hidden'
  && polish.longHandoffButton.long?.textOverflow === 'ellipsis'
if (polish.ok !== true
  || polish.viewport?.width !== polishViewport.width
  || polish.viewport?.height !== polishViewport.height
  || polish.scale !== 1
  || !disclosuresPass
  || !iconsPass
  || !zoomPass
  || !statusPass
  || !handoffPass) {
  throw new Error(`${label}: runtime UI polish stability evidence failed`)
}

const expectedScreenshots = new Map([
  ['ui-cold-1180x605-175.png', { width: 1180, height: 605 }],
  ['ui-assemble-1180x605-175.png', { width: 1180, height: 605 }],
  ['ui-handoff-1180x605-175.png', { width: 1180, height: 605 }],
  ['ui-curate-1180x605-175.png', { width: 1180, height: 605 }],
  ...['light', 'dark'].flatMap((theme) => ['plan', 'curate', 'assemble', 'handoff']
    .map((phase) => [`ui-${phase}-${theme}-1440x900-100.png`, { width: 1440, height: 900 }])),
])
if (!Array.isArray(runtimeUI.screenshots)
  || runtimeUI.screenshots.length !== expectedScreenshots.size
  || runtimeUI.screenshots.some((screenshot) => {
    const expected = expectedScreenshots.get(screenshot.file)
    return !expected
      || screenshot.width !== expected.width
      || screenshot.height !== expected.height
      || screenshot.bytes < 100
      || !/^[a-f0-9]{64}$/.test(screenshot.sha256 ?? '')
  })
  || new Set(runtimeUI.screenshots.map((screenshot) => screenshot.sha256)).size !== expectedScreenshots.size) {
  throw new Error(`${label}: runtime UI screenshots are incomplete or invalid`)
}
for (const screenshot of runtimeUI.screenshots) {
  const bytes = readFileSync(resolve(dirname(resultPath), screenshot.file))
  if (bytes.byteLength !== screenshot.bytes
    || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) {
    throw new Error(`${label}: runtime UI screenshot file is invalid (${screenshot.file})`)
  }
}

if (!Number.isInteger(checks.pdfBytes) || checks.pdfBytes < 100 || !/^[a-f0-9]{64}$/.test(checks.pdfSHA256 ?? '')) {
  throw new Error(`${label}: PDF evidence is invalid`)
}

console.log(`Verified ${label} two-process journey`)
