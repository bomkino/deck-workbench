import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspace = await readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8')
const planWorkspace = await readFile(new URL('../packages/workspace/app/workspace-plan.js', import.meta.url), 'utf8')
const pureSource = workspace.slice(0, workspace.indexOf('const elements'))
const { PLAN_FORMAT, PLAN_VERSION, parsePlanMetadata, serializePlanMetadata, planRecordForSlide, planReadiness, visualStyleFromIntent } = Function(
  `"use strict"; ${pureSource}; return { PLAN_FORMAT, PLAN_VERSION, parsePlanMetadata, serializePlanMetadata, planRecordForSlide, planReadiness, visualStyleFromIntent };`,
)()

function slide(overrides = {}) {
  return {
    id: 'slide-1',
    intent: 'full-bleed-overlay',
    contentBlocks: [
      { id: 'headline-1', semanticKey: 'cover.headline', role: 'headline', plainText: 'Everything is fine.' },
    ],
    ...overrides,
  }
}

const section = { id: 'part-1', title: 'Opening' }

test('schema-1 Slides receive conservative Plan defaults without migration', () => {
  const metadata = parsePlanMetadata(slide())
  assert.equal(metadata.format, PLAN_FORMAT)
  assert.equal(metadata.version, PLAN_VERSION)
  assert.equal(metadata.internalTitle, 'Everything is fine.')
  assert.equal(metadata.purpose, 'Unreviewed')
  assert.equal(metadata.textPresence, 'visible')
  assert.equal(metadata.copyFieldStates.headline, 'present')
  assert.equal(metadata.copyFieldStates.subheadline, 'unreviewed')
})

test('legacy undecided Slides resolve to Full Bleed without mutating their schema-1 intent', () => {
  const source = slide({ intent: 'undecided' })
  const record = planRecordForSlide(source, section)
  assert.equal(visualStyleFromIntent(source.intent), 'full-bleed')
  assert.equal(record.visualStyle, 'full-bleed')
  assert.equal(source.intent, 'undecided')
  assert.equal(planReadiness(record).state, 'review')
  assert.equal(planReadiness(record).issues.every((issue) => issue.severity === 'warning'), true)
})

test('legacy copy outside the Headline still defaults Text presence truthfully', () => {
  const metadata = parsePlanMetadata(slide({
    intent: 'undecided',
    contentBlocks: [
      { id: 'body-1', semanticKey: 'workbench.copy.body', role: 'body', plainText: 'Body only — 東京' },
    ],
  }))
  assert.equal(metadata.internalTitle, 'Untitled Slide')
  assert.equal(metadata.purpose, 'Unreviewed')
  assert.equal(metadata.textPresence, 'visible')
  assert.deepEqual(metadata.copyFieldStates, {
    headline: 'unreviewed',
    subheadline: 'unreviewed',
    body: 'present',
  })
})

test('new Slides persist Full Bleed instead of an undecided placeholder', () => {
  const addSlideSource = planWorkspace.slice(
    planWorkspace.indexOf('async function addSlide()'),
    planWorkspace.indexOf('async function renameSection'),
  )
  assert.match(addSlideSource, /intent: 'full-bleed'/)
  assert.doesNotMatch(addSlideSource, /intent: 'undecided'/)
})

test('reserved Plan block round-trips intentional blanks, no-text state and stable repeaters', () => {
  const sourceSlide = slide()
  const metadata = {
    internalTitle: 'Comparable projects',
    purpose: 'Position the project without suggesting imitation.',
    lifecycle: 'included',
    textPresence: 'no-on-slide-text',
    contentPattern: 'repeater',
    copyFieldStates: { headline: 'intentionally-blank', subheadline: 'intentionally-blank', body: 'intentionally-blank' },
    supportingItems: [
      { id: 'bear', title: 'The Bear', caption: 'Pressure chamber.', link: 'https://example.com/bear' },
      { id: 'dogs', title: 'Reservation Dogs', caption: 'Community and grief.', link: '' },
    ],
    mediaSlotCount: 2,
    textHint: 'left',
  }
  const serialized = serializePlanMetadata(metadata, sourceSlide)
  const withBlock = slide({
    contentBlocks: [
      ...sourceSlide.contentBlocks,
      { id: 'plan-1', semanticKey: 'workbench.plan.v1', role: 'workbench-plan', plainText: serialized },
    ],
  })
  assert.deepEqual(parsePlanMetadata(withBlock).supportingItems.map((item) => item.id), ['bear', 'dogs'])
  assert.equal(parsePlanMetadata(withBlock).textPresence, 'no-on-slide-text')
  assert.equal(planReadiness(planRecordForSlide(withBlock, section)).state, 'ready')
})

test('neutral defaults leave truthful copy warnings without blocking Plan progression', () => {
  const unplanned = planRecordForSlide(slide(), section)
  assert.equal(planReadiness(unplanned).state, 'review')
  assert.deepEqual(planReadiness(unplanned).issues, [
    { severity: 'warning', message: '2 copy fields remain unreviewed' },
  ])
})
