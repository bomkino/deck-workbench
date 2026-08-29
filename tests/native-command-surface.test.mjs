import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller, coordinator] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/BridgeCoordinator.swift', import.meta.url), 'utf8'),
])

test('native document commands surface failures instead of discarding them', () => {
  assert.doesNotMatch(app, /try\?/)
  assert.ok((app.match(/controller\.perform/g) ?? []).length >= 12)
  assert.match(app, /\.alert\(item: \$controller\.presentedFailure\)/)
  assert.match(controller, /failure\.name != "JobCancelled"/)
  assert.match(controller, /status = failure\.errorDescription/)
  assert.match(controller, /presentedFailure = PresentedWorkbenchFailure/)
})

test('native controller retains the draft sink without retaining itself', () => {
  assert.match(controller, /private var workspace: WorkspaceProjectionSink\?/)
  assert.doesNotMatch(controller, /private weak var workspace/)
  assert.match(coordinator, /private unowned let controller: DeckSessionController/)
})
