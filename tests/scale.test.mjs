import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceTransforms } from '../packages/workspace/src/scale-model.mjs'

const canvas = { width: 2576, height: 1080 }

test('Interface Scale changes chrome without changing artboard transform or export geometry', () => {
  const small = workspaceTransforms({ interfaceScale: 0.8, artboardZoom: 0.5, canvas })
  const large = workspaceTransforms({ interfaceScale: 1.75, artboardZoom: 0.5, canvas })

  assert.notEqual(small.chromeRemPixels, large.chromeRemPixels)
  assert.equal(small.artboardTransform, large.artboardTransform)
  assert.deepEqual(small.exportGeometry, canvas)
  assert.deepEqual(large.exportGeometry, canvas)
})

test('artboard zoom changes projection only and preserves export geometry', () => {
  const fit = workspaceTransforms({ interfaceScale: 1, artboardZoom: 0.25, canvas })
  const close = workspaceTransforms({ interfaceScale: 1, artboardZoom: 1, canvas })

  assert.equal(fit.chromeRemPixels, close.chromeRemPixels)
  assert.notEqual(fit.artboardTransform, close.artboardTransform)
  assert.deepEqual(fit.exportGeometry, close.exportGeometry)
})

test('invalid scale values reject explicitly', () => {
  assert.throws(
    () => workspaceTransforms({ interfaceScale: 1.2, artboardZoom: 1, canvas }),
    /allowed step/,
  )
  assert.throws(
    () => workspaceTransforms({ interfaceScale: 1, artboardZoom: 5, canvas }),
    /between 10% and 400%/,
  )
})
