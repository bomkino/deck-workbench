import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const focus = await readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8')

test('semantic Slide rows avoid macOS native-button focus policy without losing keyboard activation', () => {
  assert.match(focus, /function replaceNativeSlideButton\(button, sectionId\)/)
  assert.match(focus, /const row = document\.createElement\('div'\)/)
  assert.match(focus, /row\.setAttribute\('role', 'button'\)/)
  assert.match(focus, /row\.tabIndex = 0/)
  assert.match(focus, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(focus, /moveSlideByKeyboard\(event, sectionId, slideId\)/)
  assert.match(focus, /node\.focus\(\{ preventScroll: true \}\)/)
})
