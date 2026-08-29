import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const focus = await readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8')

test('semantic sequence hosts delegate macOS WebKit focus to a real text-input primitive', () => {
  assert.match(focus, /attachShadow\(\{ mode: 'open', delegatesFocus: true \}\)/)
  assert.match(focus, /const proxy = document\.createElement\('input'\)/)
  assert.match(focus, /proxy\.type = 'text'/)
  assert.match(focus, /proxy\.readOnly = true/)
  assert.match(focus, /slot \{ display: contents; \}/)
  assert.match(focus, /row\.setAttribute\('role', 'button'\)/)
  assert.match(focus, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(focus, /moveSlideByKeyboard\(event, sectionId, slideId\)/)
  assert.match(focus, /node\.focus\(\{ preventScroll: true \}\)/)
})
