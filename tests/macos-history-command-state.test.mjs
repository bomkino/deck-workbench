import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
])

test('native history commands expose the projected undo and redo availability', () => {
  assert.match(controller, /@Published private\(set\) var canUndo = false/)
  assert.match(controller, /@Published private\(set\) var canRedo = false/)
  assert.match(controller, /canUndo = history\["canUndo"\] as\? Bool == true/)
  assert.match(controller, /canRedo = history\["canRedo"\] as\? Bool == true/)
  assert.match(controller, /canUndo = false\n\s+canRedo = false\n\s+status = "Deck closed"/)
  assert.match(app, /Button\("Undo"\)[\s\S]+?\.disabled\(!controller\.canUndo\)/)
  assert.match(app, /Button\("Redo"\)[\s\S]+?\.disabled\(!controller\.canRedo\)/)
})

test('native toolbar command names match their menu equivalents', () => {
  for (const label of ['Open Deck…', 'Close Deck', 'Export Review PDF…']) {
    assert.equal(app.match(new RegExp(`Button\\("${label}"`, 'g'))?.length, 2)
  }
})
