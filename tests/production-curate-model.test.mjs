import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXISTING_PRIMARY_STATUSES,
  FIND_MORE_STATES,
  PROJECT_ASSET_REVIEWS,
  curateSlotManifest,
  primarySlotKeys,
  reconcileCurateSlots,
} from '../packages/workflow-model/index.mjs'

test('fixed Curate slots preserve legacy primary assignment compatibility', () => {
  const slide = { visualStyle: 'triptych', contentPattern: 'simple-copy', mediaSlotCount: 3 }
  assert.deepEqual(curateSlotManifest(slide), [
    { key: 'primary:1', assignmentRole: 'primary', kind: 'primary', ordinal: 0 },
    { key: 'primary:2', assignmentRole: 'primary:2', kind: 'primary', ordinal: 1 },
    { key: 'primary:3', assignmentRole: 'primary:3', kind: 'primary', ordinal: 2 },
  ])
  assert.deepEqual(primarySlotKeys(slide), ['primary:1', 'primary:2', 'primary:3'])
})

test('Repeater slot identity follows Supporting Item IDs through reorder', () => {
  const slide = {
    visualStyle: 'gallery',
    contentPattern: 'repeater',
    mediaSlotCount: 3,
    supportingItems: [
      { id: 'bear', title: 'The Bear' },
      { id: 'dogs', title: 'Reservation Dogs' },
      { id: 'us', title: 'This Is Us' },
    ],
  }
  const original = curateSlotManifest(slide)
  const reordered = curateSlotManifest({
    ...slide,
    supportingItems: [slide.supportingItems[2], slide.supportingItems[0], slide.supportingItems[1]],
  })
  assert.deepEqual(original.map((slot) => slot.key), [
    'item:bear:media',
    'item:dogs:media',
    'item:us:media',
  ])
  assert.deepEqual(reordered.map((slot) => slot.key), [
    'item:us:media',
    'item:bear:media',
    'item:dogs:media',
  ])
  assert.deepEqual(new Set(original.map((slot) => slot.assignmentRole)), new Set(reordered.map((slot) => slot.assignmentRole)))
})

test('slot reconciliation retains exact role matches and emits restorable unplaced decisions', () => {
  const previousSlots = curateSlotManifest({
    visualStyle: 'triptych',
    contentPattern: 'simple-copy',
    mediaSlotCount: 3,
  })
  const nextSlots = curateSlotManifest({
    visualStyle: 'full-bleed',
    contentPattern: 'simple-copy',
    mediaSlotCount: 1,
  })
  const result = reconcileCurateSlots({
    previousSlots,
    nextSlots,
    reason: 'visual-style-change',
    assignments: [
      { id: 'assignment-one', role: 'primary', assetReferenceId: 'asset-one' },
      { id: 'assignment-two', role: 'primary:2', assetReferenceId: 'asset-two' },
      { id: 'assignment-three', role: 'primary:3', assetReferenceId: 'asset-three' },
      { id: 'background', role: 'background', assetReferenceId: 'asset-background' },
    ],
  })
  assert.deepEqual(result.retained.map((assignment) => assignment.id), ['assignment-one', 'background'])
  assert.deepEqual(result.unplaced, [
    {
      assetReferenceId: 'asset-two',
      state: 'unplaced',
      assignmentId: 'assignment-two',
      previousSlotKey: 'primary:2',
      previousAssignmentRole: 'primary:2',
      reason: 'visual-style-change',
    },
    {
      assetReferenceId: 'asset-three',
      state: 'unplaced',
      assignmentId: 'assignment-three',
      previousSlotKey: 'primary:3',
      previousAssignmentRole: 'primary:3',
      reason: 'visual-style-change',
    },
  ])
})

test('Supporting Item removal receives its precise propagation reason', () => {
  const previousSlots = curateSlotManifest({
    visualStyle: 'gallery',
    contentPattern: 'repeater',
    supportingItems: [{ id: 'bear' }, { id: 'dogs' }],
  })
  const nextSlots = curateSlotManifest({
    visualStyle: 'gallery',
    contentPattern: 'repeater',
    supportingItems: [{ id: 'bear' }],
  })
  const result = reconcileCurateSlots({
    previousSlots,
    nextSlots,
    assignments: [
      { id: 'assignment-bear', role: 'item:bear:media', assetReferenceId: 'asset-bear' },
      { id: 'assignment-dogs', role: 'item:dogs:media', assetReferenceId: 'asset-dogs' },
    ],
  })
  assert.equal(result.unplaced[0].reason, 'supporting-item-removed')
  assert.equal(result.unplaced[0].previousSlotKey, 'item:dogs:media')
})

test('project judgment and Find More vocabularies remain explicit and disjoint', () => {
  assert.deepEqual(PROJECT_ASSET_REVIEWS, ['unreviewed', 'keep', 'maybe', 'reject'])
  assert.deepEqual(FIND_MORE_STATES, ['not-needed', 'needed', 'resolved', 'waived'])
  assert.deepEqual(EXISTING_PRIMARY_STATUSES, ['none', 'temporary', 'usable', 'approved'])
})
