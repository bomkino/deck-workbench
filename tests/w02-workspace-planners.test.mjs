import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspace = await readFile(
  new URL('../apps/macos/Resources/Workspace/workspace.js', import.meta.url),
  'utf8',
)
const pureSource = workspace.slice(0, workspace.indexOf('const elements'))
const {
  W02_PATTERN_IDS,
  patternApplyPlan,
  elementAlignPlan,
  imageCropPlan,
  assetAssignmentPlan,
} = Function(
  `"use strict"; ${pureSource}; return { W02_PATTERN_IDS, patternApplyPlan, elementAlignPlan, imageCropPlan, assetAssignmentPlan };`,
)()

const projection = {
  slide: { id: 'slide-1', intent: 'cover' },
  headline: { id: 'headline-1' },
  contentBlocks: [
    { id: 'headline-1', semanticKey: 'cover.headline', role: 'headline', plainText: 'Canonical Story' },
    { id: 'body-1', semanticKey: 'story.body.one', role: 'body', plainText: 'First body' },
    { id: 'body-2', semanticKey: 'story.body.two', role: 'body', plainText: 'Second body' },
  ],
  canvas: { width: 2576, height: 1080 },
  designOption: { id: 'option-1', name: 'Editorial Body' },
  composition: {
    id: 'option-1:composition',
    elements: [
      {
        id: 'element-text',
        kind: 'text',
        contentBlockId: 'headline-1',
        frame: { x: 160, y: 140, width: 1050, height: 240 },
      },
      {
        id: 'element-image',
        kind: 'image',
        mediaRole: 'primary',
        crop: { x: 0, y: 0, width: 1, height: 1 },
        frame: { x: 1376, y: 0, width: 1200, height: 1080 },
      },
    ],
  },
  mediaAssignments: [{
    id: 'assignment-1',
    role: 'primary',
    assetReference: { id: 'asset-1', label: 'Hill', mediaKind: 'image' },
  }],
}

test('workspace exposes exactly the three W02 Patterns and binds repeated roles by stable Content Block ID', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(W02_PATTERN_IDS)), [
    'cover',
    'full-bleed-statement',
    'editorial-body',
  ])
  assert.deepEqual(
    JSON.parse(JSON.stringify(patternApplyPlan(projection, 'editorial-body', 'option-2', 'body-2'))),
    {
      slideId: 'slide-1',
      designOptionId: 'option-2',
      patternId: 'editorial-body',
      patternVersion: 1,
      contentBindings: { headline: 'headline-1', body: 'body-2' },
    },
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(patternApplyPlan(projection, 'cover', 'option-3', 'body-1'))),
    {
      slideId: 'slide-1',
      designOptionId: 'option-3',
      patternId: 'cover',
      patternVersion: 1,
      contentBindings: { headline: 'headline-1' },
    },
  )
  assert.equal(patternApplyPlan(projection, 'editorial-body', 'option-4', 'body-missing'), null)
  assert.equal(patternApplyPlan(projection, 'unknown', 'option-5', 'body-1'), null)
})

test('alignment plans use stable identities and Deck geometry only', () => {
  const left = elementAlignPlan(projection, 'element-text', 'left')
  const center = elementAlignPlan(projection, 'element-text', 'center')
  const right = elementAlignPlan(projection, 'element-text', 'right')

  assert.equal(left.slideId, 'slide-1')
  assert.equal(left.designOptionId, 'option-1')
  assert.equal(left.elementId, 'element-text')
  assert.equal(left.frame.x, 0)
  assert.equal(center.frame.x, 763)
  assert.equal(right.frame.x, 1526)
  assert.deepEqual(JSON.parse(JSON.stringify(center.frame)), {
    x: 763,
    y: 140,
    width: 1050,
    height: 240,
  })
  assert.equal('interfaceScale' in center, false)
  assert.equal(elementAlignPlan(projection, 'element-missing', 'left'), null)
})

test('crop and Asset assignment plans preserve Image and assignment identities', () => {
  const crop = imageCropPlan(projection, 'element-image', {
    x: '0.1',
    y: '0.2',
    width: '0.7',
    height: '0.6',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), {
    slideId: 'slide-1',
    designOptionId: 'option-1',
    elementId: 'element-image',
    crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  })
  assert.equal(imageCropPlan(projection, 'element-text', crop.crop), null)
  assert.equal(imageCropPlan(projection, 'element-image', { x: 0.8, y: 0, width: 0.3, height: 1 }), null)

  assert.deepEqual(
    JSON.parse(JSON.stringify(assetAssignmentPlan(projection, 'asset-2', 'assignment-new'))),
    {
      slideId: 'slide-1',
      mediaAssignmentId: 'assignment-1',
      role: 'primary',
      assetReferenceId: 'asset-2',
    },
  )
  const unassigned = { ...projection, mediaAssignments: [] }
  assert.equal(assetAssignmentPlan(unassigned, 'asset-2', 'assignment-new').mediaAssignmentId, 'assignment-new')
})
