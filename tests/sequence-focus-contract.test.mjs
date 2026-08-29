import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const focus = await readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8')

test('semantic sequence hosts explicitly focus their shadow text-input proxy on macOS WebKit', () => {
  assert.match(focus, /attachShadow\(\{ mode: 'open', delegatesFocus: true \}\)/)
  assert.match(focus, /const proxy = document\.createElement\('input'\)/)
  assert.match(focus, /proxy\.readOnly = true/)
  assert.match(focus, /const focusProxy = \(options\) =>/)
  assert.match(focus, /proxy\.focus\(options\)/)
  assert.match(focus, /Object\.defineProperty\(node, 'focus'/)
  assert.match(focus, /row\.setAttribute\('role', 'button'\)/)
  assert.match(focus, /moveSlideByKeyboard\(event, sectionId, slideId\)/)
  assert.match(focus, /document\.activeElement === node/)
})
