import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
])

test('macOS View menu exposes all Interface Scale steps through the shared preference seam', () => {
  assert.match(app, /CommandGroup\(after: \.toolbar\)/)
  assert.match(app, /Menu\("Interface Scale"\)/)
  assert.match(app, /ForEach\(DeckSessionController\.interfaceScaleSteps/)
  assert.match(app, /controller\.setInterfaceScale\(value\)/)
  assert.match(controller, /static let interfaceScaleSteps: \[Double\] = \[0\.8, 0\.9, 1, 1\.1, 1\.25, 1\.5, 1\.75\]/)
})

test('macOS Interface Scale shortcuts adjust UI preference without touching artboard zoom', () => {
  assert.match(app, /keyboardShortcut\("-", modifiers: \[\.command, \.option, \.shift\]\)/)
  assert.match(app, /keyboardShortcut\("=", modifiers: \[\.command, \.option, \.shift\]\)/)
  assert.match(app, /keyboardShortcut\("0", modifiers: \[\.command, \.option, \.shift\]\)/)
  assert.match(controller, /func stepInterfaceScale\(_ offset: Int\)/)
  const stepStart = controller.indexOf('func stepInterfaceScale')
  const nextMethod = controller.indexOf('\n    func ', stepStart + 1)
  assert.doesNotMatch(controller.slice(stepStart, nextMethod), /artboardZoom/)
})
