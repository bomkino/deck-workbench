import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [focus, verifier] = await Promise.all([
  readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/verify-packaged-macos.sh', import.meta.url), 'utf8'),
])

test('production focus restoration remains semantic and does not inject test-only proxies', () => {
  assert.match(focus, /function scheduleWorkspaceFocusLease\(target\)/)
  assert.match(focus, /restoreWorkspaceFocus\(focus, \{ lease: true \}\)/)
  assert.match(focus, /node\.focus\(\)/)
  assert.doesNotMatch(focus, /attachShadow|sequence-focus-proxy|Object\.defineProperty\(node, 'focus'/)
})

test('packaged macOS keyboard journey enables and restores the standard keyboard UI mode', () => {
  assert.match(verifier, /defaults read NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /defaults write NSGlobalDomain AppleKeyboardUIMode -int 3/)
  assert.match(verifier, /defaults delete NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /trap cleanup EXIT/)
  assert.match(verifier, /packaged accessibility journey/)
})
