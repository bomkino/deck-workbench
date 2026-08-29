import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, controller, tracer] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
])

test('native document commands surface failures instead of discarding them', () => {
  assert.doesNotMatch(app, /try\?/)
  assert.ok((app.match(/controller\.perform/g) ?? []).length >= 12)
  assert.match(app, /\.alert\(item: \$controller\.presentedFailure\)/)
  assert.match(controller, /failure\.name != "JobCancelled"/)
  assert.match(controller, /status = failure\.errorDescription/)
  assert.match(controller, /presentedFailure = PresentedWorkbenchFailure/)
})

test('native sessions require draft flushing unless a headless verifier opts out', () => {
  assert.match(controller, /requiresWorkspaceDraftFlush: Bool = true/)
  assert.match(controller, /guard requiresWorkspaceDraftFlush else \{ return \}/)
  assert.equal((tracer.match(/DeckSessionController\(requiresWorkspaceDraftFlush: false\)/g) ?? []).length, 3)
})
