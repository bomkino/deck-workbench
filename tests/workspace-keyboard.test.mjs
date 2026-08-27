import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspace = await readFile(new URL('../apps/macos/Resources/Workspace/workspace.js', import.meta.url), 'utf8')
const shortcutStart = workspace.indexOf('function storyShortcut(event, dirty)')
const shortcutEnd = workspace.indexOf('\nfunction setBusy', shortcutStart)
assert.ok(shortcutStart >= 0 && shortcutEnd > shortcutStart)
const storyShortcut = Function(
  `"use strict"; ${workspace.slice(shortcutStart, shortcutEnd)}; return storyShortcut`,
)()

function key(overrides = {}) {
  return {
    key: 'Enter',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  }
}

test('Story keyboard policy commits with primary-modifier Enter and respects IME composition', () => {
  assert.equal(storyShortcut(key(), true), 'commit')
  assert.equal(storyShortcut(key({ metaKey: false, ctrlKey: true }), true), 'commit')
  assert.equal(storyShortcut(key({ isComposing: true }), true), null)
  assert.equal(storyShortcut(key({ altKey: true }), true), null)
})

test('Story keyboard policy routes clean-field history but leaves dirty text undo native', () => {
  assert.equal(storyShortcut(key({ key: 'z' }), false), 'undo')
  assert.equal(storyShortcut(key({ key: 'Z', shiftKey: true }), false), 'redo')
  assert.equal(storyShortcut(key({ key: 'z' }), true), null)
  assert.equal(storyShortcut(key({ key: 'x' }), false), null)
})
