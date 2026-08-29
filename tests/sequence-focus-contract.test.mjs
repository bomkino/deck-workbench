import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [focus, targets, verifier, build, hardening] = await Promise.all([
  readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-sequence-targets.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/verify-packaged-macos.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-workspace.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/packaged-hardening.css', import.meta.url), 'utf8'),
])

test('production focus restoration remains semantic and does not inject shadow-DOM test proxies', () => {
  assert.match(focus, /function scheduleWorkspaceFocusLease\(target\)/)
  assert.match(focus, /restoreWorkspaceFocus\(focus, \{ lease: true \}\)/)
  assert.match(focus, /node\.focus\(\)/)
  assert.doesNotMatch(focus, /attachShadow|sequence-focus-proxy|Object\.defineProperty\(node, 'focus'/)
})

test('packaged Slide rows use a rendered 44 pixel text-input focus primitive with button semantics', () => {
  assert.match(targets, /target\.type = 'text'/)
  assert.match(targets, /target\.readOnly = true/)
  assert.match(targets, /target\.setAttribute\('role', 'button'\)/)
  assert.match(targets, /target\.dataset\.slideId = slideId/)
  assert.match(targets, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(targets, /moveSlideByKeyboard\(event, targetSectionId, slideId\)/)
  assert.match(build, /'workspace-sequence-targets\.js',[\s\S]*'workspace-focus\.js'/)
  assert.match(hardening, /\.slide-entry > \.slide-focus-target/)
  assert.match(hardening, /min-height: 44px/)
  assert.match(hardening, /background: transparent/)
  assert.match(hardening, /-webkit-text-fill-color: transparent/)
  assert.doesNotMatch(hardening, /\.slide-focus-target[\s\S]{0,500}opacity:\s*0/)
  assert.match(hardening, /\.slide-focus-target:focus-visible \+ \.slide-row/)
})

test('packaged macOS keyboard journey enables and restores the standard keyboard UI mode', () => {
  assert.match(verifier, /defaults read NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /defaults write NSGlobalDomain AppleKeyboardUIMode -int 3/)
  assert.match(verifier, /defaults delete NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /trap cleanup EXIT/)
  assert.match(verifier, /packaged accessibility journey/)
})
