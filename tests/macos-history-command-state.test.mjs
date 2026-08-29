import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller, workspaceView] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/WorkspaceWebView.swift', import.meta.url), 'utf8'),
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

test('native toolbar keeps command names equal to their menu equivalents', () => {
  for (const label of ['Open Deck…', 'Close Deck', 'Export Review PDF…']) {
    assert.equal(app.match(new RegExp(`^\\s*Button\\("${label}"`, 'gm'))?.length, 1)
    assert.equal(app.match(new RegExp(`^\\s*Label\\("${label}"`, 'gm'))?.length, 1)
  }
})

test('native toolbar becomes icon-led before scaled labels can clip', () => {
  assert.match(app, /private struct AdaptiveToolbarLabelStyle: LabelStyle/)
  assert.match(app, /if !compact \{\s+configuration\.title/)
  assert.match(app, /AdaptiveToolbarLabelStyle\(compact: shellScale >= 1\.5\)/)
  assert.match(app, /\.controlSize\(\.large\)/)
})

test('native save and termination flush renderer-owned Slide drafts first', () => {
  assert.match(app, /applicationShouldTerminate[\s\S]*controller\?\.closeDocument\(\)[\s\S]*reply\(toApplicationShouldTerminate: true\)/)
  assert.match(app, /@NSApplicationDelegateAdaptor\(WorkbenchAppDelegate\.self\)/)
  assert.match(controller, /func saveFromUser\(\) async throws[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*try save\(\)/)
  assert.match(controller, /func closeDocument\(\) async throws[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*try save\(\)/)
  assert.match(controller, /func presentNewDocument[\s\S]*guard await response[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*createDocument/)
  assert.match(controller, /func presentOpenDocument[\s\S]*guard await response[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*openDocument/)
  assert.match(controller, /func presentPDFExport[\s\S]*guard await response[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*writeOnePagePDF/)
  assert.match(app, /Button\("Close Deck"\)[\s\S]*\.keyboardShortcut\("w"\)/)
  assert.match(workspaceView, /WorkbenchWindowCloseGuard[\s\S]*button\.action = #selector\(requestClose\(_:\)\)/)
  assert.match(workspaceView, /requestClose[\s\S]*try await controller\.closeDocument\(\)[\s\S]*forwardClose\(\)/)
  assert.match(workspaceView, /restoreOriginalAction\(\)[\s\S]*window = nil[\s\S]*closeButton = nil/)
})
