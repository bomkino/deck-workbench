import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, curate, workspace, core, plan, focus, build] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-curate.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-plan.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-workspace.mjs', import.meta.url), 'utf8'),
])

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`)
  const end = source.indexOf(`\nfunction ${nextName}`, start)
  assert.ok(start >= 0 && end > start, `cannot extract ${name}`)
  return Function(`"use strict"; ${source.slice(start, end)}; return ${name}`)()
}

function functionSource(source, name, nextName) {
  const marker = source.indexOf(`function ${name}`)
  const start = source.lastIndexOf('\n', marker) + 1
  const nextMarker = source.indexOf(`function ${nextName}`, marker + name.length)
  const end = source.lastIndexOf('\n', nextMarker) + 1
  assert.ok(marker >= 0 && nextMarker > marker && end > marker, `cannot read ${name}`)
  return source.slice(start, end)
}

function extractFunctionBefore(source, name, endMarker) {
  const start = source.indexOf(`function ${name}`)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `cannot extract ${name}`)
  return Function(`"use strict"; ${source.slice(start, end)}; return ${name}`)()
}

test('Production Curate renders four stable regions and bounded host-owned previews', () => {
  for (const id of ['curate-slide-queue', 'media-focus-owner', 'media-canvas', 'curate-brief-content', 'primary-tray', 'alternate-tray', 'shortlist-tray', 'unplaced-tray-heading', 'unplaced-tray']) {
    assert.match(html, new RegExp(`id="${id}"`))
  }
  assert.match(styles, /grid-template-areas: "queue wall brief" "tray tray tray"/)
  assert.match(styles, /grid-template-rows: minmax\(0, 1fr\) minmax\(7rem, 16vh\)/)
  assert.match(html, /img-src 'self' pitchdog-asset:/)
  assert.doesNotMatch(html, /img-src[^;]*(?:data:|blob:)/)
  assert.match(curate, /candidate\.startsWith\('pitchdog-asset:'\)/)
  assert.match(curate, /asset\?\.previewCapability === 'grid'/)
  assert.doesNotMatch(curate, /createObjectURL|readAsDataURL|localStorage|absolutePath|file:\/\//)
})

test('10,000 media descriptors mount only visible rows plus fixed overscan', () => {
  const calculate = extractFunction(curate, 'calculateCurateVirtualWindow', 'curateDomToken')
  const input = {
    total: 10_000,
    scrollTop: 180_000,
    viewportHeight: 720,
    rowHeight: 240,
    columns: 5,
    overscanRows: 2,
  }
  const window = calculate(input)
  const upperBound = (Math.ceil(input.viewportHeight / input.rowHeight) + 2 * input.overscanRows + 1) * input.columns
  assert.equal(window.rowCount, 2_000)
  assert.equal(window.startIndex > 0, true)
  assert.equal(window.endIndex < input.total, true)
  assert.equal(window.endIndex - window.startIndex <= upperBound, true)
  assert.equal(window.endIndex - window.startIndex < 100, true)
})

test('focus within a mounted media window preserves keyed cards and preview image nodes', () => {
  const windowKey = extractFunction(curate, 'curateMediaWindowKey', 'reconcileCurateMediaCards')
  const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const metrics = { startIndex: 0, endIndex: 3, columns: 3, cardWidth: 200, cardHeight: 220, rowHeight: 232 }
  const first = windowKey(assets, metrics, 4)
  assert.equal(windowKey(assets, metrics, 4), first)
  assert.notEqual(windowKey(assets, { ...metrics, startIndex: 1 }, 4), first)
  assert.notEqual(windowKey(assets, metrics, 5), first)
  const renderWall = functionSource(curate, 'renderCurateMediaWall', 'scheduleCurateVirtualRender')
  assert.doesNotMatch(renderWall, /mediaCanvas\.replaceChildren/)
  assert.match(renderWall, /if \(windowKey !== curateRenderedWindowKey\)/)
  const reconcile = functionSource(curate, 'reconcileCurateMediaCards', 'updateCurateMediaActivePresentation')
  assert.match(reconcile, /existing\.get\(asset\.id\)/)
  assert.match(reconcile, /mediaCanvas\.insertBefore\(card, cursor\)/)
  assert.match(reconcile, /staleCard\.remove\(\)/)
  const updateCard = functionSource(curate, 'updateCurateMediaCard', 'createCurateMediaCard')
  assert.match(updateCard, /card\.dataset\.renderSignature === signature/)
  assert.match(curate, /function curateMediaCardRenderSignature[\s\S]*curateCompareIds\.includes\(asset\.id\)/)
  assert.doesNotMatch(html, /id="curate-status"/)
})

test('Curate uses exact bridge seams and keeps project judgment separate from current-Slide decisions', () => {
  for (const query of ['media.roots', 'media.assets', 'curate.queue', 'curate.slide', 'curate.assetStates']) {
    assert.match(curate, new RegExp(`name: '${query.replaceAll('.', '\\.')}'`))
  }
  const rootQuery = functionSource(curate, 'queryCurateRootSnapshot', 'prepareCuratePhaseSnapshot')
  assert.match(rootQuery, /const params = \{ offset, limit: 250 \}/)
  assert.match(rootQuery, /params\.expectedCatalogRevision = catalogRevision/)
  assert.match(rootQuery, /params\.expectedAvailabilityRevision = availabilityRevision/)
  assert.match(rootQuery, /Array\.isArray\(page\?\.items\) \? page\.items/)
  assert.match(rootQuery, /error\?\.name === 'QuerySnapshotChanged' && attempt === 0/)
  assert.match(curate, /params\.expectedAvailabilityRevision = curateAvailabilityRevision/)
  assert.match(curate, /error\.name === 'QuerySnapshotChanged'[\s\S]*loadCurateMediaPage\(\{ reset: true, resetGeneration: restartGeneration \}\)/)
  for (const command of ['media.root.authorize', 'media.root.reconnect', 'media.root.scan']) {
    assert.match(curate, new RegExp(`executeMediaRootCommand\\('${command.replaceAll('.', '\\.')}'`))
  }
  assert.match(curate, /judgment,\n\s+\}, sourceLabel/)
  assert.match(curate, /slideId: selectedSlideId,[\s\S]*?decision,/)
  assert.match(curate, /const decision = \{ state: 'selected', slotKey: slot\.key \}/)
  assert.match(curate, /decision\.mediaAssignmentId = crypto\.randomUUID\(\)/)
  assert.match(html, /Project-level Asset judgment/)
  assert.match(html, /Current-Slide Asset decision/)
})

test('Unplaced media blocks Ready and included Story order owns queue navigation', () => {
  const queueState = extractFunction(curate, 'curateQueueState', 'curateQueueLabel')
  const full = { slideId: 'slide-a', requiredSlotCount: 1, filledSlotCount: 1, findMoreState: 'not-needed' }
  assert.equal(queueState(full, 0), 'ready')
  assert.equal(queueState(full, 1), 'needs')
  assert.equal(queueState(full, null), 'needs')
  assert.match(curate, /renderDecisionTray\('unplaced', elements\.unplacedTray\)/)
  assert.match(curate, /previousSlotKey \?\? decision\.previousAssignmentRole/)
  assert.match(curate, /\[elements\.primaryTray, elements\.alternateTray, elements\.shortlistTray, elements\.unplacedTray\]/)
  const renderQueue = functionSource(curate, 'renderCurateQueue', 'renderCurateBrief')
  assert.match(renderQueue, /planRecords\(\)\.filter\(\(record\) => record\.metadata\.lifecycle === 'included'\)/)
  const unresolved = functionSource(curate, 'unresolvedCurateSlideIds', 'moveToNextCurateIssue')
  assert.match(unresolved, /planRecords\(\)/)
  assert.match(unresolved, /metadata\.lifecycle === 'included'/)
  assert.doesNotMatch(curate, /recordsFromStory/)
})

test('empty or failed first media pages wait for an explicit retry', () => {
  const shouldLoad = extractFunction(curate, 'shouldAutoLoadCurateMedia', 'renderCurate')
  const ready = { phase: 'curate', hasProjection: true, rootCount: 1, assetCount: 0, loading: false, initialAttemptGeneration: -1, loadGeneration: 4 }
  assert.equal(shouldLoad(ready), true)
  assert.equal(shouldLoad({ ...ready, initialAttemptGeneration: 4 }), false)
  assert.equal(shouldLoad({ ...ready, loading: true }), false)
  const loadPage = functionSource(curate, 'loadCurateMediaPage', 'curateQueueState')
  assert.match(loadPage, /curateMediaInitialAttemptGeneration = generation/)
  assert.match(curate, /retry\.textContent = 'Retry'/)
})

test('cross-Slide phase entry publishes only matching bounded-retry snapshots', () => {
  const snapshotAwait = workspace.indexOf('const nextCurateSnapshot = await prepareCuratePhaseSnapshot(nextSelectedSlideId)')
  const revisionGuard = workspace.indexOf('workspaceSnapshotRevisionsMatch(nextStory, nextProjection, nextCurateSnapshot, nextSelectedSlideId)', snapshotAwait)
  const mediaGenerationGuard = workspace.indexOf('nextCurateSnapshot.assetStateMediaGeneration !== curateMediaLoadGeneration', snapshotAwait)
  const storyPublish = workspace.indexOf('storyDocument = nextStory', snapshotAwait)
  const projectionPublish = workspace.indexOf('projection = nextProjection', snapshotAwait)
  assert.ok(snapshotAwait >= 0 && revisionGuard > snapshotAwait && mediaGenerationGuard > snapshotAwait)
  assert.ok(storyPublish > revisionGuard && projectionPublish > revisionGuard)
  assert.match(workspace, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/)
  const revisionsMatch = extractFunctionBefore(workspace, 'workspaceSnapshotRevisionsMatch', '\n\nrefreshWorkspace =')
  const matching = {
    story: { revision: 7 },
    projection: { revision: 7, slide: { id: 'slide-b' } },
    curate: { queueRevision: 7, slide: { revision: 7, slide: { id: 'slide-b' } } },
  }
  assert.equal(revisionsMatch(matching.story, matching.projection, matching.curate, 'slide-b'), true)
  assert.equal(revisionsMatch(matching.story, { ...matching.projection, revision: 6 }, matching.curate, 'slide-b'), false)
  assert.equal(revisionsMatch(matching.story, matching.projection, { ...matching.curate, queueRevision: 8 }, 'slide-b'), false)
  assert.equal(revisionsMatch(matching.story, matching.projection, matching.curate, 'slide-a'), false)
  assert.match(workspace, /async function enterPhaseForSlide\(phase, slideId = selectedSlideId\)/)
  assert.match(workspace, /pendingWorkspaceSlideId = slideId\n\s+const next = await refreshWorkspace\(slideId\)/)
  assert.match(workspace, /const next = await refreshWorkspace\(slideId\)/)
  const select = functionSource(core, 'selectSlide', 'historyAction')
  assert.match(select, /if \(!slideId\) return null/)
  assert.match(select, /pendingWorkspaceSlideId = slideId[\s\S]*return refreshWorkspace\(slideId\)/)
  assert.doesNotMatch(select, /findStoryLocation/)
  assert.match(workspace, /window\.deckWorkbench = Object\.freeze\(\{[\s\S]*selectSlide,/)
  assert.match(workspace, /if \(pendingWorkspaceSlideId === requestedSlideId\) pendingWorkspaceSlideId = null/)
  assert.match(core, /options\.preserveCurrentSelection[\s\S]*pendingWorkspaceSlideId \?\? selectedSlideId/)
  assert.match(plan, /enterPhaseForSlide\('curate', slideId\)/)
  assert.match(plan, /enterPhaseForSlide\('assemble', slideId\)/)
  assert.doesNotMatch(plan.slice(0, plan.indexOf('elements.planForm.addEventListener')), /selectedSlideId = slideId/)
})

test('media focus remains a stable composite while cards recycle', () => {
  assert.match(html, /id="media-focus-owner"[\s\S]*role="listbox"[\s\S]*aria-describedby="media-keyboard-help"/)
  assert.doesNotMatch(html, /aria-multiselectable/)
  assert.match(curate, /card\.setAttribute\('role', 'option'\)/)
  assert.match(curate, /const active = card\.dataset\.assetId === curateFocusedMediaId[\s\S]*aria-selected', String\(active\)/)
  assert.match(curate, /aria-posinset/)
  assert.match(curate, /aria-setsize/)
  assert.match(curate, /aria-activedescendant/)
  assert.match(curate, /aria-owns/)
  assert.match(curate, /ArrowLeft/)
  assert.match(curate, /ArrowDown/)
  assert.match(curate, /event\.key\.toLowerCase\(\) === 'n'/)
  assert.match(curate, /event\.key\.toLowerCase\(\) === 'p'/)
  assert.match(focus, /mediaAssetId: curateFocusedAssetId\(\)/)
  assert.match(focus, /focusCurateAsset\(target\.mediaAssetId\)/)
  assert.match(styles, /\.media-focus-owner:focus-visible \+ \.media-scroll \.media-card\[data-active="true"\] \{ outline: 3px solid var\(--focus\)/)
  assert.match(styles, /@media \(forced-colors: active\)/)
})

test('snapshot, reset, and document guards reject stale async results', () => {
  const prepareStates = functionSource(curate, 'prepareCurateAssetStateSnapshot', 'prepareCurateUnplacedCounts')
  assert.match(prepareStates, /curateAssets\.map\(\(asset\) => asset\.id\)/)
  assert.match(prepareStates, /mediaGeneration !== curateMediaLoadGeneration/)
  const commit = functionSource(curate, 'commitCuratePhaseSnapshot', 'clearCurateState')
  assert.match(commit, /assetStateMediaGeneration !== curateMediaLoadGeneration/)
  assert.match(commit, /curateAssetStates = new Map\(snapshot\?\.assetStates \?\? \[\]\)/)
  assert.match(commit, /priorAvailabilityRevision[\s\S]*resetCurateMediaCatalog/)
  const clear = functionSource(curate, 'clearCurateState', 'resetCurateMediaCatalog')
  assert.match(clear, /clearTimeout\(curateSearchTimer\)/)
  assert.match(clear, /curateMediaLoadGeneration \+= 1/)
  assert.match(clear, /curateMediaLoading = false/)
  assert.match(workspace, /clearProjectionAndInvalidateRefresh[\s\S]*refreshGeneration \+= 1/)
  assert.match(workspace, /if \(!next\) \{\n\s+clearProjection\(\)/)
})

test('external revision notifications retain the current Slide and refresh every live projection', () => {
  const renderExternal = functionSource(workspace, 'renderProjectionFromCanonicalCache', 'executeStructuralWithProjectionFocus')
  assert.match(renderExternal, /pendingWorkspaceSlideId \?\? selectedSlideId \?\? next\.slide\?\.id/)
  assert.match(renderExternal, /if \(!documentChanged && priorDeckId !== null\)/)
  assert.match(renderExternal, /refreshWorkspace\(refreshSlideId\)/)
  assert.doesNotMatch(renderExternal, /selectedSlideId = next\?\.slide\?\.id/)
})

test('context actions and deferred media-root operations cannot strand or cross document focus', () => {
  const contextAction = functionSource(curate, 'runCurateContextAction', 'handleCurateContextMenuKeydown')
  assert.match(contextAction, /^async function runCurateContextAction/)
  assert.match(contextAction, /if \(action === 'preview'\)[\s\S]*return/)
  assert.match(contextAction, /finally \{\n\s+restoreCurateMediaFocus\(\)/)
  const rootCommand = functionSource(curate, 'executeMediaRootCommand', 'saveCurateFindMore')
  assert.match(rootCommand, /const operationDeckId = projection\.deckId/)
  assert.match(rootCommand, /const operationRefreshGeneration = refreshGeneration/)
  assert.match(rootCommand, /projection\.deckId !== operationDeckId/)
  assert.match(rootCommand, /pendingWorkspaceSlideId \?\? selectedSlideId/)
})

test('default four-region layout keeps Curate controls inside the 1440px wall', () => {
  assert.match(styles, /\.media-toolbar \{[^}]*grid-template-columns: minmax\(12rem, 2fr\) repeat\(4, minmax\(6rem, 1fr\)\) minmax\(8rem, 1\.2fr\) auto/)
  assert.match(styles, /\.media-toolbar > label \{ min-width: 0;/)
  assert.match(styles, /\.media-source-bar \{[^}]*flex-wrap: wrap/)
  assert.match(styles, /\.slide-media-actions \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/)
  assert.match(styles, /\.media-action-bar \{[^}]*grid-template-columns: minmax\(10rem, 0\.44fr\) minmax\(0, 1fr\)/)
  assert.doesNotMatch(styles, /\.media-action-bar \{[^}]*auto auto/)
  assert.match(styles, /\.media-action-bar \{ position: relative;/)
  assert.match(styles, /\.project-media-judgment \{ position: relative;/)
  assert.match(styles, /\.project-media-actions \{ position: fixed;[^}]*left: 0;[^}]*width: min\(25rem, calc\(100vw - 1rem\)\)/)
})

test('shared workspace build preserves Curate script order', () => {
  assert.match(build, /'workspace-plan\.js',\n\s+'workspace-curate\.js',\n\s+'workspace-visual\.js'/)
  assert.match(html, /workspace-plan\.js" defer><\/script>\s+<script src="workspace-curate\.js" defer><\/script>\s+<script src="workspace-visual\.js" defer><\/script>/)
})
