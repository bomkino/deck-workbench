import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

import { verifyCurateJourneyResult } from '../scripts/verify-curate-journey-output.mjs'

const execFileAsync = promisify(execFile)
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const DIGEST = 'a'.repeat(64)

function validResult() {
  return {
    schemaVersion: 1,
    gate: 'wb-f02-production-curate',
    ok: true,
    commit: COMMIT,
    platform: 'ubuntu-x64',
    packageKind: 'appimage',
    processLifecycle: {
      createProcessId: 101,
      reopenProcessId: 202,
      createInstanceId: 'instance-create',
      reopenInstanceId: 'instance-reopen',
      distinctProcesses: true,
    },
    catalog: {
      rootId: 'root-project-media',
      authorization: 'picker-ui',
      realMediaBytesRead: true,
      itemCount: 10_240,
      pageLimit: 128,
      progressivePageCount: 80,
      maximumMountedItems: 96,
      cancelledStalePage: true,
      selectionRetainedAcrossPaging: true,
      rendererDescriptors: [
        { id: 'asset-primary', displayPath: 'campaign/unit/primary.jpg', mediaKind: 'image' },
        { id: 'asset-project', displayPath: 'campaign/unit/judged.jpg', mediaKind: 'image' },
      ],
    },
    interaction: {
      search: 'winter harbor',
      filters: ['folder:campaign/unit', 'orientation:landscape'],
      previewedAssetId: 'asset-primary',
      comparedAssetIds: ['asset-primary', 'asset-alt-1', 'asset-alt-2'],
      keyboardAndPointerParity: true,
      focusRetained: true,
    },
    decisions: {
      projectJudgment: {
        assetReferenceId: 'asset-project',
        rating: 4,
        review: 'keep',
        projectPick: true,
      },
      rejectedForSlide: {
        assetReferenceId: 'asset-project',
        slideId: 'slide-full-bleed',
        state: 'rejected-for-slide',
        projectJudgmentUnchanged: true,
      },
      shortlistedAssetIds: ['asset-short-1', 'asset-short-2'],
      primaryAssignments: [
        {
          assignmentId: 'assignment-primary',
          assetReferenceId: 'asset-primary',
          slideId: 'slide-full-bleed',
          slotKey: 'primary:1',
        },
      ],
      alternateAssetIds: ['asset-alt-1', 'asset-alt-2'],
      findMore: {
        slideId: 'slide-full-bleed',
        state: 'needed',
        brief: 'Find a warmer, wider frame.',
        existingPrimaryStatus: 'temporary',
        persistedAfterPrimaryAssignment: true,
      },
    },
    repeater: {
      slideId: 'slide-repeater',
      supportingItemIds: ['bear', 'dogs'],
      assignments: [
        {
          assignmentId: 'assignment-bear',
          assetReferenceId: 'asset-bear',
          slideId: 'slide-repeater',
          slotKey: 'item:bear:media',
        },
        {
          assignmentId: 'assignment-dogs',
          assetReferenceId: 'asset-dogs',
          slideId: 'slide-repeater',
          slotKey: 'item:dogs:media',
        },
      ],
      identityRetainedAfterReorder: true,
    },
    sourceRoundTrip: {
      disconnectedAvailability: 'missing',
      visibleMissingAssetIds: ['asset-primary'],
      reconnectedAssetIds: ['asset-primary'],
      movedAssetIds: ['asset-primary'],
      identityPreserved: true,
      decisionsPreserved: true,
    },
    persistence: {
      beforeCloseDigest: DIGEST,
      afterReopenDigest: DIGEST,
      savedRevision: 19,
      reopenedRevision: 21,
      undoRedoAfterReopen: true,
      reopenedAssetIds: [
        'asset-project',
        'asset-short-1',
        'asset-short-2',
        'asset-primary',
        'asset-alt-1',
        'asset-alt-2',
        'asset-bear',
        'asset-dogs',
      ],
    },
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

test('strict Curate verifier accepts a complete same-platform packaged journey', () => {
  const verified = verifyCurateJourneyResult(validResult(), {
    expectedCommit: COMMIT,
    expectedPlatform: 'ubuntu-x64',
    expectedPackageKind: 'appimage',
    label: 'fixture AppImage',
  })
  assert.deepEqual(verified, {
    commit: COMMIT,
    platform: 'ubuntu-x64',
    packageKind: 'appimage',
    catalogItemCount: 10_240,
    semanticDigest: DIGEST,
  })
})

test('Curate verifier rejects synthetic revision and process-reuse evidence', () => {
  assert.throws(
    () => verifyCurateJourneyResult(validResult(), {
      expectedCommit: 'f'.repeat(40),
      expectedPlatform: 'ubuntu-x64',
    }),
    /expected commit/,
  )

  const reused = clone(validResult())
  reused.processLifecycle.reopenInstanceId = reused.processLifecycle.createInstanceId
  assert.throws(() => verifyCurateJourneyResult(reused), /application instance was reused/)

  const reusedPid = clone(validResult())
  reusedPid.processLifecycle.reopenProcessId = reusedPid.processLifecycle.createProcessId
  assert.throws(() => verifyCurateJourneyResult(reusedPid), /application process was reused/)
})

test('Curate verifier rejects renderer path leakage and a non-virtual media wall', () => {
  const leaked = clone(validResult())
  leaked.catalog.rendererDescriptors[0].absolutePath = '/private/project/primary.jpg'
  assert.throws(() => verifyCurateJourneyResult(leaked), /renderer descriptor exposes absolutePath/)

  const disguised = clone(validResult())
  disguised.catalog.rendererDescriptors[0].filename = '/Users/alice/secret/primary.jpg'
  assert.throws(() => verifyCurateJourneyResult(disguised), /display field must not contain path separators/)

  const fullyMounted = clone(validResult())
  fullyMounted.catalog.maximumMountedItems = fullyMounted.catalog.itemCount
  assert.throws(() => verifyCurateJourneyResult(fullyMounted), /bounded virtual window/)
})

test('Curate verifier rejects collapsed judgments, positional Repeater slots and cleared Find More', () => {
  const collapsed = clone(validResult())
  collapsed.decisions.rejectedForSlide.projectJudgmentUnchanged = false
  assert.throws(() => verifyCurateJourneyResult(collapsed), /changed project judgment/)

  const positional = clone(validResult())
  positional.repeater.assignments[0].slotKey = 'primary:1'
  assert.throws(() => verifyCurateJourneyResult(positional), /invalid Repeater slot key/)

  const cleared = clone(validResult())
  cleared.decisions.findMore.state = 'resolved'
  assert.throws(() => verifyCurateJourneyResult(cleared), /needed state was not exercised/)

  const unrelatedJudgment = clone(validResult())
  unrelatedJudgment.decisions.rejectedForSlide.assetReferenceId = 'asset-unrelated'
  assert.throws(() => verifyCurateJourneyResult(unrelatedJudgment), /did not exercise the judged Asset/)

  const wrongRepeaterSlide = clone(validResult())
  wrongRepeaterSlide.repeater.assignments[0].slideId = 'slide-other'
  assert.throws(() => verifyCurateJourneyResult(wrongRepeaterSlide), /wrong Slide/)

  const onePage = clone(validResult())
  onePage.catalog.itemCount = 2
  onePage.catalog.pageLimit = 128
  onePage.catalog.progressivePageCount = 1
  onePage.catalog.maximumMountedItems = 1
  assert.throws(() => verifyCurateJourneyResult(onePage), /progressive paging|page boundary/)

  const unrelatedMove = clone(validResult())
  unrelatedMove.sourceRoundTrip.movedAssetIds = ['asset-unrelated']
  assert.throws(() => verifyCurateJourneyResult(unrelatedMove), /survived disconnect and reconnect/)
})

test('Curate verifier rejects semantic drift and its CLI binds the result to an exact SHA', async (t) => {
  const drifted = clone(validResult())
  drifted.persistence.afterReopenDigest = 'b'.repeat(64)
  assert.throws(() => verifyCurateJourneyResult(drifted), /Deck meaning changed after reopen/)

  const directory = await mkdtemp(join(tmpdir(), 'deck-curate-verifier-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const resultPath = join(directory, 'curate-journey-result.json')
  const verifierPath = fileURLToPath(new URL('../scripts/verify-curate-journey-output.mjs', import.meta.url))
  await writeFile(resultPath, `${JSON.stringify(validResult())}\n`)
  const { stdout } = await execFileAsync(process.execPath, [
    verifierPath,
    resultPath,
    COMMIT,
    'ubuntu-x64',
    'appimage',
    'fixture AppImage',
  ])
  assert.match(stdout, new RegExp(`Verified packaged Production Curate journey for ubuntu-x64 at ${COMMIT}`))

  await assert.rejects(
    execFileAsync(process.execPath, [
      verifierPath,
      resultPath,
      'f'.repeat(40),
      'ubuntu-x64',
      'appimage',
    ]),
    /result did not come from the expected commit/,
  )
})
