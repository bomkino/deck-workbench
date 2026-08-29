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

test('Sequence uses one stable visible textarea focus owner and semantic active-descendant identity', () => {
  assert.match(targets, /sequenceFocusOwner = document\.createElement\('textarea'\)/)
  assert.match(targets, /sequenceFocusOwner\.id = 'sequence-focus-owner'/)
  assert.match(targets, /sequenceFocusOwner\.setAttribute\('role', 'tree'\)/)
  assert.match(targets, /sequenceFocusOwner\.setAttribute\('aria-readonly', 'true'\)/)
  assert.match(targets, /sequenceFocusOwner\.setAttribute\('aria-activedescendant', activeNode\.id\)/)
  assert.match(targets, /sequenceFocusOwner\.setAttribute\('aria-owns', ownedIds\.join\(' '\)\)/)
  assert.match(targets, /function focusSequenceTarget\(target, options = \{\}\)/)
  assert.match(targets, /document\.activeElement === sequenceFocusOwner/)
  assert.match(targets, /function sequenceFocusState\(\)/)
})

test('keyed semantic rows retain stable IDs and keyboard reorder acts on the active identity', () => {
  assert.match(targets, /const sequenceNodeRegistry = new Map\(\)/)
  assert.match(targets, /row\.setAttribute\('role', 'treeitem'\)/)
  assert.match(targets, /row\.setAttribute\('aria-level', '2'\)/)
  assert.match(targets, /row\.dataset\.sectionId = section\.id/)
  assert.match(targets, /moveSlideByKeyboard\(event, activeSequenceTarget\.sectionId, activeSequenceTarget\.id\)/)
  assert.match(targets, /moveSectionByKeyboard\(event, activeSequenceTarget\.id\)/)
  assert.match(targets, /event\.key === 'Enter' \|\| event\.key === ' '/)
  assert.match(targets, /renderSequence = renderPersistentSequence/)
  assert.match(build, /'workspace-sequence-targets\.js',[\s\S]*'workspace-focus\.js'/)
})

test('focus restoration preserves semantic Sequence identity across query and reorder', () => {
  assert.match(focus, /sequenceFocusElement\(\)/)
  assert.match(focus, /sequenceFocusState\(\)/)
  assert.match(focus, /focusSequenceTarget\(\{ kind: target\.sequenceKind, id: target\.sequenceId \}\)/)
  assert.match(focus, /restoreWorkspaceFocus\(focus, \{ lease: true \}\)/)
  assert.match(focus, /sequenceKind: 'slide', sequenceId: slideId/)
  assert.match(focus, /sequenceKind: 'section', sequenceId: sectionId/)
  assert.doesNotMatch(focus, /attachShadow|sequence-focus-proxy|Object\.defineProperty\(node, 'focus'/)
})

test('packaged styling exposes the genuine owner and active semantic item', () => {
  assert.match(hardening, /\.sequence-focus-owner \{/)
  assert.match(hardening, /min-height: 44px/)
  assert.match(hardening, /background: var\(--paper\)/)
  assert.match(hardening, /color: var\(--ink\)/)
  assert.match(hardening, /data-sequence-active="true"/)
  assert.match(hardening, /\.sequence-focus-owner:focus-visible \+ \.sequence-list/)
  assert.doesNotMatch(hardening, /slide-focus-target/)
})

test('packaged macOS keyboard journey enables and restores the standard keyboard UI mode', () => {
  assert.match(verifier, /defaults read NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /defaults write NSGlobalDomain AppleKeyboardUIMode -int 3/)
  assert.match(verifier, /defaults delete NSGlobalDomain AppleKeyboardUIMode/)
  assert.match(verifier, /trap cleanup EXIT/)
  assert.match(verifier, /packaged accessibility journey/)
})
