import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const focus = await readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8')

test('semantic sequence targets are explicitly tabbable before macOS WebKit focus restoration', () => {
  assert.match(focus, /function makeWorkspaceNodeFocusable\(node\)/)
  assert.match(focus, /node\.matches\?\.\('\[data-slide-id\], \[data-section-id\]'\)\) node\.tabIndex = 0/)
  assert.match(focus, /function ensureSequenceKeyboardFocusability\(\)/)
  assert.match(focus, /querySelectorAll\('\[data-slide-id\], \[data-section-id\]'\)/)
  assert.match(focus, /node\.focus\(\{ preventScroll: true \}\)/)
})
