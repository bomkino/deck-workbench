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

test('packaged Slide rows retain one keyed, visibly rendered text control across reorder', () => {
  assert.match(targets, /const sequenceNodeRegistry = new Map\(\)/)
  assert.match(targets, /function createSlideSequenceEntry\(slideId\)/)
  assert.match(targets, /document\.createElement\('textarea'\)/)
  assert.match(targets, /target\.rows = 1/)
  assert.match(targets, /target\.value = 'Slide'/)
  assert.match(targets, /target\.setAttribute\('aria-multiline', 'false'\)/)
  assert.doesNotMatch(targets, /target\.setAttribute\('role', 'button'\)/)
  assert.match(targets, /target\.dataset\.displayValue = displayValue/)
  assert.match(targets, /target\.addEventListener\('beforeinput', preventSequenceTargetMutation\)/)
  assert.match(targets, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(targets, /moveSlideByKeyboard\(event, target\.dataset\.sectionId, target\.dataset\.slideId\)/)
  assert.match(targets, /function protectedSequenceNode\(\)/)
  assert.match(targets, /node !== protectedNode && node\.nextSibling !== reference/)
  assert.match(targets, /renderSequence = renderPersistentSequence/)
  assert.match(build, /'workspace-sequence-targets\.js',[\s\S]*'workspace-focus\.js'/)
  const targetRule = hardening.match(/\.slide-entry > \.slide-focus-target \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.ok(targetRule, 'missing packaged Slide focus-target rule')
  assert.match(targetRule, /min-height: 44px/)
  assert.match(targetRule, /background: transparent/)
  assert.match(targetRule, /color: var\(--ink\)/)
  assert.match(targetRule, /-webkit-text-fill-color: currentColor/)
  assert.match(targetRule, /resize: none/)
  assert.doesNotMatch(targetRule, /opacity:\s*0/)
  assert.match(hardening, /\.slide-focus-target:focus-visible/)
  assert.match(hardening, /\.slide-entry > \.slide-row \{\s*display: none;/)
})

test('packaged macOS keyboard journey enables and restores the standard keyboard UI mode', () => {
  assert.match(verifier, /defaults read NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /defaults write NSGlobalDomain AppleKeyboardUIMode -int 3/)
  assert.match(verifier, /defaults delete NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /trap cleanup EXIT/)
  assert.match(verifier, /packaged accessibility journey/)
})
