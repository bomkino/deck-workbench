import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8')

test('Linux PDF export publishes through the existing atomic durable writer', () => {
  const start = source.indexOf('async function exportOnePagePDF')
  const end = source.indexOf('async function presentPDFExport', start)
  const exportSource = source.slice(start, end)
  assert.match(exportSource, /await writeAtomically\(destination, pdf\)/)
  assert.doesNotMatch(exportSource, /await writeDurably\(destination, pdf\)/)
})

test('Linux startup loads bounded preferences through the recovery adapter', () => {
  assert.match(source, /loadPreferencesFile\(preferencesPath\(\)\)/)
  assert.match(source, /preferences = loaded\.preferences/)
  assert.match(source, /InvalidPreferences:/)
  assert.match(source, /\.\/preferences\.mjs/)
})
