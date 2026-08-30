import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  defaultPreferences,
  loadPreferencesFile,
  parsePreferences,
} from '../apps/linux/preferences.mjs'

test('preference parsing accepts the bounded theme schema', () => {
  assert.deepEqual(parsePreferences(JSON.stringify({
    schemaVersion: 2,
    theme: 'dark',
    interfaceScale: 1.25,
    artboardZoom: 0.5,
  })), { theme: 'dark', interfaceScale: 1.25, artboardZoom: 0.5 })
})

test('preference parsing migrates version one to System theme', () => {
  assert.deepEqual(parsePreferences(JSON.stringify({
    schemaVersion: 1,
    interfaceScale: 1.25,
    artboardZoom: 0.5,
  })), { theme: 'system', interfaceScale: 1.25, artboardZoom: 0.5 })
})

test('preference parsing rejects extra keys and out-of-range values', () => {
  assert.throws(
    () => parsePreferences(JSON.stringify({
      schemaVersion: 1,
      interfaceScale: 1,
      artboardZoom: 0.35,
      privatePath: '/private',
    })),
    (error) => error.name === 'InvalidPreferences',
  )
  assert.throws(
    () => parsePreferences(JSON.stringify({
      schemaVersion: 1,
      interfaceScale: 9,
      artboardZoom: 0.35,
    })),
    (error) => error.name === 'InvalidPreferences',
  )
  assert.throws(
    () => parsePreferences(JSON.stringify({
      schemaVersion: 2,
      theme: 'sepia',
      interfaceScale: 1,
      artboardZoom: 0.35,
    })),
    (error) => error.name === 'InvalidPreferences',
  )
})

test('a missing preference file starts with clean defaults', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-missing-preferences-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const loaded = await loadPreferencesFile(join(root, 'preferences.json'))
  assert.deepEqual(loaded.preferences, defaultPreferences)
  assert.equal(loaded.recovered, false)
  assert.equal(loaded.warning, null)
})

test('an invalid preference file is quarantined instead of blocking startup', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-invalid-preferences-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'preferences.json')
  await writeFile(path, '{broken')
  const loaded = await loadPreferencesFile(path, { quarantineId: 'test' })
  assert.deepEqual(loaded.preferences, defaultPreferences)
  assert.equal(loaded.recovered, true)
  assert.equal(loaded.quarantinePath, `${path}.invalid-test`)
  assert.match(loaded.warning, /moved aside/)
  assert.equal(await readFile(loaded.quarantinePath, 'utf8'), '{broken')
  await assert.rejects(access(path), (error) => error.code === 'ENOENT')
})
