import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [plan, workspace] = await Promise.all([
  readFile(new URL('../packages/workspace/app/workspace-plan.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace.js', import.meta.url), 'utf8'),
])

const deltaStart = plan.indexOf('function planDraftDelta')
const deltaEnd = plan.indexOf('\nfunction planDraftIsDirty', deltaStart)
assert.ok(deltaStart >= 0 && deltaEnd > deltaStart)
const { planDraftDelta, restorePlanDraft } = Function(
  `"use strict"; ${plan.slice(deltaStart, deltaEnd)}; return { planDraftDelta, restorePlanDraft };`,
)()

function snapshot(overrides = {}) {
  return {
    internalTitle: 'Opening',
    partId: 'part-a',
    purpose: 'Introduce the world',
    lifecycle: 'included',
    textPresence: 'visible',
    contentPattern: 'simple-copy',
    visualStyle: 'image-text',
    copies: {
      headline: { state: 'present', value: 'A story begins' },
      subheadline: { state: 'unreviewed', value: '' },
      body: { state: 'present', value: 'First body' },
    },
    supportingItems: [],
    ...overrides,
  }
}

test('Plan draft deltas preserve only dirty fields across canonical refreshes', () => {
  const baseline = snapshot()
  const current = snapshot({
    purpose: 'Introduce the people and stakes',
    copies: { ...baseline.copies, body: { state: 'present', value: 'Working body' } },
  })
  const delta = planDraftDelta(baseline, current)
  assert.deepEqual(delta, {
    purpose: 'Introduce the people and stakes',
    copies: { body: { state: 'present', value: 'Working body' } },
  })

  const refreshed = snapshot({
    internalTitle: 'Opening image',
    copies: { ...baseline.copies, headline: { state: 'present', value: 'A better beginning' } },
  })
  const restored = restorePlanDraft(refreshed, delta)
  assert.equal(restored.internalTitle, 'Opening image')
  assert.equal(restored.copies.headline.value, 'A better beginning')
  assert.equal(restored.purpose, 'Introduce the people and stakes')
  assert.equal(restored.copies.body.value, 'Working body')
})

test('Plan owns per-Slide dirty state and native lifecycle save uses the same writer', () => {
  assert.match(plan, /const planDraftDeltas = new Map\(\)/)
  assert.match(plan, /function renderPlanEditor\(\) \{\n\s+captureCurrentPlanDraft\(\)/)
  assert.match(plan, /elements\.planForm\.addEventListener\('input', captureCurrentPlanDraft\)/)
  assert.match(plan, /async function savePlanDraftById[\s\S]*const saved = await executeBatch\(prepared\.operations, requestedSlideId\)[\s\S]*if \(!saved\) return false[\s\S]*planDraftDeltas\.delete\(slideId\)/)
  assert.match(plan, /async function saveAllPlanDrafts\(\)[\s\S]*savePlanDraftById\(slideId\)/)
  assert.match(workspace, /async function saveWorkspaceDrafts\(\)[\s\S]*saveAllPlanDrafts\(\)[\s\S]*saveAllCurateFindMoreDrafts\(\)/)
  assert.match(workspace, /saveDrafts: saveWorkspaceDrafts/)
  assert.match(workspace, /clearProjectionAndInvalidateRefresh[\s\S]*clearPlanDrafts\(\)/)
})
