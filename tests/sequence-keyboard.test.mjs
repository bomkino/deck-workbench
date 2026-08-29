import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspace = await readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8')
const shortcutStart = workspace.indexOf('function sequenceShortcut(event)')
const shortcutEnd = workspace.indexOf('\nfunction blockByRole', shortcutStart)
assert.ok(shortcutStart >= 0 && shortcutEnd > shortcutStart)
const { sequenceShortcut, slideMovePlan, sectionMovePlan, sequenceControlPlans } = Function(
  `"use strict"; ${workspace.slice(shortcutStart, shortcutEnd)}; return { sequenceShortcut, slideMovePlan, sectionMovePlan, sequenceControlPlans }`,
)()

function key(overrides = {}) {
  return {
    key: 'ArrowUp', metaKey: false, ctrlKey: false, shiftKey: false, altKey: true, isComposing: false, ...overrides,
  }
}

const story = {
  sections: [
    { id: 'section-a', slides: [{ id: 'slide-a' }, { id: 'slide-b' }, { id: 'slide-c' }] },
    { id: 'section-b', slides: [] },
    { id: 'section-c', slides: [{ id: 'slide-d' }] },
  ],
}

test('Sequence keyboard policy reserves unmodified Option–Arrow for reordering', () => {
  assert.equal(sequenceShortcut(key()), 'up')
  assert.equal(sequenceShortcut(key({ key: 'ArrowDown' })), 'down')
  assert.equal(sequenceShortcut(key({ altKey: false })), null)
  assert.equal(sequenceShortcut(key({ metaKey: true })), null)
  assert.equal(sequenceShortcut(key({ isComposing: true })), null)
  assert.equal(sequenceShortcut(key({ key: 'Enter' })), null)
})

test('Sequence move planning uses stable IDs within and across Sections', () => {
  assert.deepEqual(slideMovePlan(story, 'section-a', 'slide-c', 'up'), { slideId: 'slide-c', targetSectionId: 'section-a', afterSlideId: 'slide-a' })
  assert.deepEqual(slideMovePlan(story, 'section-a', 'slide-b', 'down'), { slideId: 'slide-b', targetSectionId: 'section-a', afterSlideId: 'slide-c' })
  assert.deepEqual(slideMovePlan(story, 'section-a', 'slide-c', 'down'), { slideId: 'slide-c', targetSectionId: 'section-b', afterSlideId: null })
  assert.deepEqual(slideMovePlan(story, 'section-c', 'slide-d', 'up'), { slideId: 'slide-d', targetSectionId: 'section-b', afterSlideId: null })
  assert.equal(slideMovePlan(story, 'section-a', 'slide-a', 'up'), null)
  assert.equal(slideMovePlan(story, 'section-c', 'slide-d', 'down'), null)
})

test('Sequence Section movement and controls use stable anchors', () => {
  assert.deepEqual(sectionMovePlan(story, 'section-b', 'up'), { sectionId: 'section-b', afterSectionId: null })
  assert.deepEqual(sectionMovePlan(story, 'section-b', 'down'), { sectionId: 'section-b', afterSectionId: 'section-c' })
  assert.deepEqual(sequenceControlPlans(story, 'section-a', 'slide-c'), {
    up: { slideId: 'slide-c', targetSectionId: 'section-a', afterSlideId: 'slide-a' },
    down: { slideId: 'slide-c', targetSectionId: 'section-b', afterSlideId: null },
  })
})
