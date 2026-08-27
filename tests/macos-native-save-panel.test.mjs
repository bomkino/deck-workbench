import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const controller = await readFile(
  new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url),
  'utf8',
)

test('packaged native save flow retries a bounded real panel event without a direct fallback', () => {
  assert.match(controller, /panel\.begin \{ continuation\.resume\(returning: \$0\) \}/)
  assert.match(controller, /for attempt in 1\.\.\.8/)
  assert.match(controller, /guard panel\.isVisible else \{ return \}/)
  assert.match(controller, /CGEvent\(keyboardEventSource: source, virtualKey: 36, keyDown: true\)/)
  assert.doesNotMatch(controller, /performSelector|ok:|createDocument\(at: tracerDestination/)
})
