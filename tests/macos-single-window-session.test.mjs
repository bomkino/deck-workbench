import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const app = await readFile(
  new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url),
  'utf8',
)

test('shared document controller is hosted by one intentional macOS window', () => {
  assert.match(app, /Window\("Deck Workbench", id: "main"\)/)
  assert.doesNotMatch(app, /WindowGroup/)
})
