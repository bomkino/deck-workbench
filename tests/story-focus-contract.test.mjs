import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const focus = await readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8')

test('Story focus is retained by stable Content Block identity while DOM focus remains best-effort', () => {
  assert.match(focus, /let activeStoryFocusBlockId = null/)
  assert.match(focus, /function storyFocusState\(\)/)
  assert.match(focus, /blockId: activeStoryFocusBlockId/)
  assert.match(focus, /activeStoryFocusBlockId = target\.blockId/)
  assert.match(focus, /storyFocusState\(\)\.blockId === target\.blockId/)
  assert.match(focus, /restoreStoryFocus = function restoreStorySemanticFocus\(blockId\)/)
  assert.match(focus, /handleStoryFieldKeydown = function handleStoryFieldKeydownWithSemanticIdentity/)
  assert.match(focus, /rememberWorkspaceFocus\(target\)/)
  assert.doesNotMatch(focus, /return document\.activeElement === field/)
})
