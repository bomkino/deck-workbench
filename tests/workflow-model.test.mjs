import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assemblyIssues,
  copyField,
  createPitchGrid,
  curateIssues,
  gradientStopsForFeather,
  planIssues,
  primarySlotKeys,
  slideReadiness,
  snapValue,
  transitionMediaDecision,
} from '../packages/workflow-model/index.mjs'

function baseSlide(overrides = {}) {
  return {
    id: 'slide-1',
    lifecycle: 'included',
    internalTitle: 'The arrival',
    purpose: 'Establish the family before the rupture.',
    textPresence: 'visible',
    contentPattern: 'simple-copy',
    visualStyle: 'full-bleed-overlay',
    copy: {
      headline: copyField('present', 'Everything is fine.'),
      subheadline: copyField('intentionally-blank'),
      body: copyField('intentionally-blank'),
    },
    mediaSlotCount: 1,
    findMoreMedia: { state: 'not-needed', brief: '' },
    assemblies: [{ id: 'assembly-1', text: { overflow: false, layoutSnapshotState: 'current' } }],
    activeAssemblyId: 'assembly-1',
    ...overrides,
  }
}

test('intentional blanks and no-on-slide-text do not become false copy blockers', () => {
  assert.deepEqual(planIssues(baseSlide()), [])
  const visual = baseSlide({
    textPresence: 'no-on-slide-text',
    contentPattern: 'no-on-slide-text',
    copy: {
      headline: copyField('unreviewed'),
      subheadline: copyField('unreviewed'),
      body: copyField('unreviewed'),
    },
  })
  assert.deepEqual(planIssues(visual), [])
})

test('repeater media slots follow stable item identity rather than array position', () => {
  const slide = baseSlide({
    contentPattern: 'repeater',
    visualStyle: 'triptych',
    supportingItems: [
      { id: 'bear', title: 'The Bear' },
      { id: 'reservation', title: 'Reservation Dogs' },
      { id: 'this-is-us', title: 'This Is Us' },
    ],
  })
  assert.deepEqual(primarySlotKeys(slide), [
    'item:bear:media',
    'item:reservation:media',
    'item:this-is-us:media',
  ])
})

test('media can be promoted and demoted without ambiguous deletion', () => {
  const selected = transitionMediaDecision(null, 'select', 'primary:1')
  assert.deepEqual(selected, { state: 'selected', slotKey: 'primary:1' })
  assert.deepEqual(transitionMediaDecision(selected, 'demote-to-shortlist'), {
    state: 'shortlisted',
    slotKey: null,
  })
  assert.deepEqual(transitionMediaDecision(selected, 'demote-to-alternate'), {
    state: 'alternate',
    slotKey: null,
  })
})

test('readiness reports concrete media and downstream review work', () => {
  const slide = baseSlide({ copyReviewState: 'changed-after-assembly' })
  assert.equal(curateIssues(slide, {}).some((item) => item.code === 'curate.slot:primary:1'), true)
  assert.equal(assemblyIssues(slide).some((item) => item.code === 'assembly.copy-changed'), true)
  assert.deepEqual(slideReadiness(slide, {}), {
    plan: 'ready',
    curate: 'blocked',
    assemble: 'review',
    handoff: 'blocked',
  })
})

test('Pitch Grid preserves the original 24 by 12 geometry and supports deterministic snapping', () => {
  const grid = createPitchGrid()
  assert.equal(grid.columns, 24)
  assert.equal(grid.rows, 12)
  assert.equal(grid.marginX, 96)
  assert.equal(grid.marginY, 64)
  assert.equal(grid.gutterX, 16)
  assert.equal(grid.gutterY, 8)
  assert.equal(grid.cellWidth, 84)
  assert.equal(grid.cellHeight, 72)
  assert.deepEqual(snapValue(101, grid.xLines, 6), { value: 96, snapped: true, guide: 96 })
  assert.deepEqual(snapValue(111, grid.xLines, 6), { value: 111, snapped: false, guide: null })
})

test('gradient feather broadens the transition while preserving bounded ordered stops', () => {
  const tight = gradientStopsForFeather({ feather: 0.1, opacity: 0.8 })
  const broad = gradientStopsForFeather({ feather: 0.9, opacity: 0.8 })
  assert.equal(tight[0].offset, 0)
  assert.equal(tight.at(-1).offset, 1)
  assert.equal(tight.every((stop, index) => index === 0 || stop.offset >= tight[index - 1].offset), true)
  assert.equal(broad[2].offset > tight[2].offset, true)
  assert.equal(broad.every((stop) => stop.opacity >= 0 && stop.opacity <= 1), true)
})


test('source treatment creates Handoff review without treating provisional crop as a problem', () => {
  const selected = { 'asset-1': { state: 'selected', slotKey: 'primary:1', availability: 'available' } }
  assert.equal(slideReadiness(baseSlide({ sourceTreatment: 'crop-provisional' }), selected).handoff, 'ready')
  assert.equal(slideReadiness(baseSlide({ sourceTreatment: 'needs-expansion' }), selected).handoff, 'review')
  assert.equal(assemblyIssues(baseSlide({ sourceTreatment: 'needs-expansion' }))[0].message, 'Source needs expansion')
})
