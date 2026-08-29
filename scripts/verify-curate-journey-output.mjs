import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const COMMIT_PATTERN = /^[a-f0-9]{40}$/
const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const PLATFORMS = new Set(['macos-arm64', 'ubuntu-x64'])
const PACKAGE_KINDS = new Set(['app-zip', 'tarball', 'appimage'])
const REVIEW_STATES = new Set(['unreviewed', 'keep', 'maybe', 'reject'])
const FIND_MORE_STATES = new Set(['not-needed', 'needed', 'resolved', 'waived'])
const PRIMARY_STATUSES = new Set(['none', 'temporary', 'usable', 'approved'])
const FORBIDDEN_RENDERER_KEYS = /^(?:absolutePath|authorizedPath|nativePath|bookmark|securityScopedBookmark|fingerprint|platformIdentity)$/i

export function verifyCurateJourneyResult(result, {
  expectedCommit,
  expectedPlatform,
  expectedPackageKind,
  label = 'packaged Production Curate journey',
} = {}) {
  object(result, 'result')
  assert.equal(result.schemaVersion, 1, `${label}: unsupported result schema`)
  assert.equal(result.gate, 'wb-f02-production-curate', `${label}: wrong gate identity`)
  assert.equal(result.ok, true, `${label}: journey reported a failed assertion`)

  assert.match(result.commit, COMMIT_PATTERN, `${label}: invalid source commit`)
  if (expectedCommit !== undefined) {
    assert.match(expectedCommit, COMMIT_PATTERN, `${label}: invalid expected commit`)
    assert.equal(result.commit, expectedCommit, `${label}: result did not come from the expected commit`)
  }
  assert.equal(PLATFORMS.has(result.platform), true, `${label}: unsupported platform`)
  if (expectedPlatform !== undefined) {
    assert.equal(result.platform, expectedPlatform, `${label}: platform mismatch`)
  }
  assert.equal(PACKAGE_KINDS.has(result.packageKind), true, `${label}: unsupported package kind`)
  if (expectedPackageKind !== undefined) {
    assert.equal(PACKAGE_KINDS.has(expectedPackageKind), true, `${label}: invalid expected package kind`)
    assert.equal(result.packageKind, expectedPackageKind, `${label}: package kind mismatch`)
  }
  if (result.platform === 'macos-arm64') {
    assert.equal(result.packageKind, 'app-zip', `${label}: macOS evidence must come from the packaged app ZIP`)
  }

  verifyProcessLifecycle(result.processLifecycle, label)
  verifyCatalog(result.catalog, label)
  verifyInteraction(result.interaction, label)
  verifyDecisions(result.decisions, label)
  verifyRepeater(result.repeater, label)
  verifySourceRoundTrip(result.sourceRoundTrip, label)
  verifyPersistence(result.persistence, result, label)
  assert.equal(
    result.decisions.primaryAssignments.some(
      (assignment) => assignment.assetReferenceId === result.interaction.previewedAssetId,
    ),
    true,
    `${label}: previewed Asset was not a proved Primary assignment`,
  )

  return Object.freeze({
    commit: result.commit,
    platform: result.platform,
    packageKind: result.packageKind,
    catalogItemCount: result.catalog.itemCount,
    semanticDigest: result.persistence.afterReopenDigest,
  })
}

function verifyProcessLifecycle(value, label) {
  object(value, `${label}: processLifecycle`)
  positiveInteger(value.createProcessId, `${label}: createProcessId`)
  positiveInteger(value.reopenProcessId, `${label}: reopenProcessId`)
  assert.notEqual(value.createProcessId, value.reopenProcessId, `${label}: application process was reused`)
  opaqueId(value.createInstanceId, `${label}: createInstanceId`)
  opaqueId(value.reopenInstanceId, `${label}: reopenInstanceId`)
  assert.notEqual(value.createInstanceId, value.reopenInstanceId, `${label}: application instance was reused`)
  assert.equal(value.distinctProcesses, true, `${label}: full application relaunch was not proved`)
}

function verifyCatalog(value, label) {
  object(value, `${label}: catalog`)
  opaqueId(value.rootId, `${label}: rootId`)
  assert.equal(value.authorization, 'picker-ui', `${label}: a native picker authorization was not proved`)
  assert.equal(value.realMediaBytesRead, true, `${label}: real media bytes were not read`)
  positiveInteger(value.itemCount, `${label}: catalog itemCount`)
  positiveInteger(value.pageLimit, `${label}: catalog pageLimit`)
  assert.equal(value.pageLimit <= 250, true, `${label}: catalog page limit exceeds 250`)
  positiveInteger(value.progressivePageCount, `${label}: progressivePageCount`)
  assert.equal(value.progressivePageCount >= 2, true, `${label}: progressive paging was not proved`)
  assert.equal(value.itemCount > value.pageLimit, true, `${label}: catalogue did not cross a page boundary`)
  positiveInteger(value.maximumMountedItems, `${label}: maximumMountedItems`)
  assert.equal(
    value.maximumMountedItems < value.itemCount,
    true,
    `${label}: the media wall did not prove a bounded virtual window`,
  )
  assert.equal(value.cancelledStalePage, true, `${label}: stale-page cancellation was not proved`)
  assert.equal(value.selectionRetainedAcrossPaging, true, `${label}: selection was not retained across paging`)
  nonEmptyArray(value.rendererDescriptors, `${label}: rendererDescriptors`)
  for (const [index, descriptor] of value.rendererDescriptors.entries()) {
    verifyRendererDescriptor(descriptor, `${label}: rendererDescriptors[${index}]`)
  }
}

function verifyRendererDescriptor(value, label) {
  object(value, label)
  opaqueId(value.id, `${label}.id`)
  relativeDisplayPath(value.displayPath, `${label}.displayPath`)
  if (value.relativeDisplayPath !== undefined) {
    relativeDisplayPath(value.relativeDisplayPath, `${label}.relativeDisplayPath`)
  }
  if (value.filename !== undefined) portableDisplayField(value.filename, `${label}.filename`)
  if (value.folder !== undefined && value.folder !== '') relativeDisplayPath(value.folder, `${label}.folder`)
  assertNoForbiddenRendererData(value, label)
}

function verifyInteraction(value, label) {
  object(value, `${label}: interaction`)
  nonEmptyString(value.search, `${label}: search`)
  nonEmptyArray(value.filters, `${label}: filters`)
  opaqueId(value.previewedAssetId, `${label}: previewedAssetId`)
  uniqueIds(value.comparedAssetIds, `${label}: comparedAssetIds`, { minimum: 2, maximum: 4 })
  assert.equal(value.keyboardAndPointerParity, true, `${label}: keyboard and pointer parity was not proved`)
  assert.equal(value.focusRetained, true, `${label}: media-wall focus was not retained`)
}

function verifyDecisions(value, label) {
  object(value, `${label}: decisions`)
  object(value.projectJudgment, `${label}: projectJudgment`)
  opaqueId(value.projectJudgment.assetReferenceId, `${label}: projectJudgment assetReferenceId`)
  integerInRange(value.projectJudgment.rating, 0, 5, `${label}: project rating`)
  assert.equal(
    REVIEW_STATES.has(value.projectJudgment.review),
    true,
    `${label}: unsupported project review`,
  )
  assert.equal(typeof value.projectJudgment.projectPick, 'boolean', `${label}: projectPick must be boolean`)

  object(value.rejectedForSlide, `${label}: rejectedForSlide`)
  opaqueId(value.rejectedForSlide.assetReferenceId, `${label}: rejected assetReferenceId`)
  opaqueId(value.rejectedForSlide.slideId, `${label}: rejected slideId`)
  assert.equal(value.rejectedForSlide.state, 'rejected-for-slide', `${label}: wrong per-Slide rejection state`)
  assert.equal(
    value.rejectedForSlide.projectJudgmentUnchanged,
    true,
    `${label}: per-Slide rejection changed project judgment`,
  )
  assert.equal(
    value.rejectedForSlide.assetReferenceId,
    value.projectJudgment.assetReferenceId,
    `${label}: Slide rejection did not exercise the judged Asset`,
  )

  uniqueIds(value.shortlistedAssetIds, `${label}: shortlistedAssetIds`, { minimum: 2 })
  uniqueIds(value.alternateAssetIds, `${label}: alternateAssetIds`, { minimum: 2 })

  object(value.findMore, `${label}: findMore`)
  opaqueId(value.findMore.slideId, `${label}: Find More slideId`)
  assert.equal(FIND_MORE_STATES.has(value.findMore.state), true, `${label}: unsupported Find More state`)
  assert.equal(value.findMore.state, 'needed', `${label}: Find More needed state was not exercised`)
  assert.equal(
    value.rejectedForSlide.slideId,
    value.findMore.slideId,
    `${label}: Slide rejection and Find More did not exercise the same Slide`,
  )
  assignmentList(value.primaryAssignments, `${label}: primaryAssignments`, {
    minimum: 1,
    slot: 'primary',
    slideId: value.findMore.slideId,
  })
  nonEmptyString(value.findMore.brief, `${label}: Find More brief`)
  assert.equal(
    PRIMARY_STATUSES.has(value.findMore.existingPrimaryStatus),
    true,
    `${label}: unsupported existing Primary status`,
  )
  assert.equal(value.findMore.persistedAfterPrimaryAssignment, true, `${label}: assigning Primary cleared Find More`)
}

function verifyRepeater(value, label) {
  object(value, `${label}: repeater`)
  opaqueId(value.slideId, `${label}: Repeater slideId`)
  uniqueIds(value.supportingItemIds, `${label}: supportingItemIds`, { minimum: 2 })
  assignmentList(value.assignments, `${label}: Repeater assignments`, {
    minimum: value.supportingItemIds.length,
    slot: 'repeater',
    slideId: value.slideId,
  })
  assert.equal(value.assignments.length, value.supportingItemIds.length, `${label}: not every Supporting Item has a named assignment`)
  const assignedItems = new Set()
  for (const assignment of value.assignments) {
    const match = /^item:([^:]+):media$/.exec(assignment.slotKey)
    assert.ok(match, `${label}: Repeater assignment is not keyed by Supporting Item identity`)
    assignedItems.add(match[1])
  }
  assert.deepEqual(
    [...assignedItems].sort(),
    [...value.supportingItemIds].sort(),
    `${label}: Repeater assignment identities do not match Supporting Items`,
  )
  assert.equal(value.identityRetainedAfterReorder, true, `${label}: Repeater identity did not survive reorder`)
}

function verifySourceRoundTrip(value, label) {
  object(value, `${label}: sourceRoundTrip`)
  assert.equal(value.disconnectedAvailability, 'missing', `${label}: disconnected source was not visible as missing`)
  const missing = uniqueIds(value.visibleMissingAssetIds, `${label}: visibleMissingAssetIds`, { minimum: 1 })
  const reconnected = uniqueIds(value.reconnectedAssetIds, `${label}: reconnectedAssetIds`, { minimum: 1 })
  const moved = uniqueIds(value.movedAssetIds, `${label}: movedAssetIds`, { minimum: 1 })
  assert.equal(value.identityPreserved, true, `${label}: reconnect did not preserve Asset identity`)
  assert.equal(value.decisionsPreserved, true, `${label}: reconnect did not preserve Curate decisions`)
  assert.equal(
    missing.some((assetId) => reconnected.includes(assetId)),
    true,
    `${label}: no missing Asset identity survived reconnect`,
  )
  assert.equal(
    moved.some((assetId) => missing.includes(assetId) && reconnected.includes(assetId)),
    true,
    `${label}: no moved Asset identity survived disconnect and reconnect`,
  )
}

function verifyPersistence(value, result, label) {
  object(value, `${label}: persistence`)
  assert.match(value.beforeCloseDigest, DIGEST_PATTERN, `${label}: invalid pre-close semantic digest`)
  assert.match(value.afterReopenDigest, DIGEST_PATTERN, `${label}: invalid reopened semantic digest`)
  assert.equal(value.afterReopenDigest, value.beforeCloseDigest, `${label}: Deck meaning changed after reopen`)
  positiveInteger(value.savedRevision, `${label}: savedRevision`)
  positiveInteger(value.reopenedRevision, `${label}: reopenedRevision`)
  assert.equal(value.reopenedRevision >= value.savedRevision, true, `${label}: reopened revision regressed`)
  assert.equal(value.undoRedoAfterReopen, true, `${label}: reopened Curate history was not proved`)
  uniqueIds(value.reopenedAssetIds, `${label}: reopenedAssetIds`, { minimum: 1 })

  const requiredIds = new Set([
    result.decisions.projectJudgment.assetReferenceId,
    result.decisions.rejectedForSlide.assetReferenceId,
    ...result.decisions.shortlistedAssetIds,
    ...result.decisions.primaryAssignments.map((assignment) => assignment.assetReferenceId),
    ...result.decisions.alternateAssetIds,
    ...result.repeater.assignments.map((assignment) => assignment.assetReferenceId),
  ])
  const reopenedIds = new Set(value.reopenedAssetIds)
  for (const assetId of requiredIds) {
    assert.equal(reopenedIds.has(assetId), true, `${label}: reopened Deck lost Asset identity ${assetId}`)
  }
}

function assignmentList(value, label, { minimum, slot, slideId }) {
  nonEmptyArray(value, label)
  assert.equal(value.length >= minimum, true, `${label}: expected at least ${minimum} assignments`)
  const assignmentIds = new Set()
  const assetIds = new Set()
  for (const [index, assignment] of value.entries()) {
    object(assignment, `${label}[${index}]`)
    opaqueId(assignment.assignmentId, `${label}[${index}].assignmentId`)
    opaqueId(assignment.assetReferenceId, `${label}[${index}].assetReferenceId`)
    opaqueId(assignment.slideId, `${label}[${index}].slideId`)
    if (slideId !== undefined) {
      assert.equal(assignment.slideId, slideId, `${label}: assignment belongs to the wrong Slide`)
    }
    nonEmptyString(assignment.slotKey, `${label}[${index}].slotKey`)
    if (slot === 'primary') assert.match(assignment.slotKey, /^primary:[1-9][0-9]*$/, `${label}: invalid Primary slot key`)
    if (slot === 'repeater') assert.match(assignment.slotKey, /^item:[^:]+:media$/, `${label}: invalid Repeater slot key`)
    assert.equal(assignmentIds.has(assignment.assignmentId), false, `${label}: duplicate assignment identity`)
    assignmentIds.add(assignment.assignmentId)
    assert.equal(assetIds.has(assignment.assetReferenceId), false, `${label}: duplicate Asset identity`)
    assetIds.add(assignment.assetReferenceId)
  }
}

function assertNoForbiddenRendererData(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_RENDERER_KEYS.test(key), false, `${label}: renderer descriptor exposes ${key}`)
    if (typeof child === 'string') {
      assert.equal(child.includes('file://'), false, `${label}: renderer descriptor exposes a file URL`)
      assert.equal(child.startsWith('/'), false, `${label}: renderer descriptor exposes an absolute POSIX path`)
      assert.equal(/^[A-Za-z]:[\\/]/.test(child), false, `${label}: renderer descriptor exposes an absolute Windows path`)
    }
    assertNoForbiddenRendererData(child, label, seen)
  }
}

function portableDisplayField(value, label) {
  nonEmptyString(value, label)
  assert.equal(/[\\/]/.test(value), false, `${label}: display field must not contain path separators`)
  assert.equal(/^[A-Za-z]:/.test(value), false, `${label}: absolute Windows path is forbidden`)
}

function relativeDisplayPath(value, label) {
  nonEmptyString(value, label)
  assert.equal(value.includes('\\'), false, `${label}: path must use portable separators`)
  assert.equal(value.startsWith('/'), false, `${label}: absolute POSIX path is forbidden`)
  assert.equal(/^[A-Za-z]:/.test(value), false, `${label}: absolute Windows path is forbidden`)
  assert.equal(value.split('/').some((segment) => segment === '..' || segment === ''), false, `${label}: unsafe relative path`)
}

function uniqueIds(value, label, { minimum = 1, maximum = Number.POSITIVE_INFINITY } = {}) {
  nonEmptyArray(value, label)
  assert.equal(value.length >= minimum, true, `${label}: expected at least ${minimum} items`)
  assert.equal(value.length <= maximum, true, `${label}: expected at most ${maximum} items`)
  const unique = new Set()
  for (const [index, id] of value.entries()) {
    opaqueId(id, `${label}[${index}]`)
    assert.equal(unique.has(id), false, `${label}: duplicate identity`)
    unique.add(id)
  }
  return [...unique]
}

function opaqueId(value, label) {
  nonEmptyString(value, label)
  assert.equal(value.length <= 500, true, `${label}: identity is too long`)
  assert.equal(/[\\/]/.test(value), false, `${label}: identity must not be a path`)
  assert.equal(value === '.' || value === '..', false, `${label}: identity must not be a path segment`)
}

function object(value, label) {
  assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, `${label} must be an object`)
}

function nonEmptyArray(value, label) {
  assert.equal(Array.isArray(value) && value.length > 0, true, `${label} must be a non-empty array`)
}

function nonEmptyString(value, label) {
  assert.equal(typeof value === 'string' && value.trim().length > 0, true, `${label} must be a non-empty string`)
}

function positiveInteger(value, label) {
  assert.equal(Number.isSafeInteger(value) && value > 0, true, `${label} must be a positive integer`)
}

function integerInRange(value, minimum, maximum, label) {
  assert.equal(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    true,
    `${label} must be an integer from ${minimum} to ${maximum}`,
  )
}

async function main() {
  const [resultPath, expectedCommit, expectedPlatform, expectedPackageKind, label] = process.argv.slice(2)
  if (!resultPath || !expectedCommit || !expectedPlatform || !expectedPackageKind) {
    throw new Error('Usage: node scripts/verify-curate-journey-output.mjs RESULT EXPECTED_COMMIT EXPECTED_PLATFORM EXPECTED_PACKAGE_KIND [LABEL]')
  }
  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  const verified = verifyCurateJourneyResult(result, {
    expectedCommit,
    expectedPlatform,
    expectedPackageKind,
    label,
  })
  console.log(`Verified packaged Production Curate journey for ${verified.platform} at ${verified.commit}`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main()
}
