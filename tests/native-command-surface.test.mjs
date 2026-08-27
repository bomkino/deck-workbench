import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
])

test('native document commands surface failures instead of discarding them', () => {
  assert.doesNotMatch(app, /try\?/)
  assert.ok((app.match(/controller\.perform/g) ?? []).length >= 12)
  assert.match(app, /\.alert\(item: \$controller\.presentedFailure\)/)
  assert.match(controller, /failure\.name != "JobCancelled"/)
  assert.match(controller, /status = failure\.errorDescription/)
  assert.match(controller, /presentedFailure = PresentedWorkbenchFailure/)
})
