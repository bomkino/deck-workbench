import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspace = await readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8')
const pureSource = workspace.slice(0, workspace.indexOf('const elements'))
const { PLAN_FORMAT, PLAN_VERSION, parsePlanMetadata, serializePlanMetadata, planRecordForSlide, planReadiness } = Function(
  `"use strict"; ${pureSource}; return { PLAN_FORMAT, PLAN_VERSION, parsePlanMetadata, serializePlanMetadata, planRecordForSlide, planReadiness };`,
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
  assert.equal(metadata.purpose, '')
  assert.equal(metadata.copyFieldStates.headline, 'present')
  assert.equal(metadata.copyFieldStates.subheadline, 'unreviewed')
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

test('Plan readiness distinguishes blockers from reviewed intentional absence', () => {
  const unplanned = planRecordForSlide(slide(), section)
  assert.equal(planReadiness(unplanned).state, 'blocked')
  assert.match(planReadiness(unplanned).issues[0].message, /Purpose/)
})
