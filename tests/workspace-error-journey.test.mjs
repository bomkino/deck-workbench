import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [workspace, core] = await Promise.all([
  readFile(new URL('../packages/workspace/app/workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
])

test('boot distinguishes an expected empty session from a visible load failure', () => {
  assert.match(workspace, /catch \(error\) \{[\s\S]*error\?\.name === 'DocumentUnavailable'[\s\S]*includes\('DocumentUnavailable:'\)[\s\S]*setStatus\(message\)/)
  assert.match(core, /if \(projection\) updateWorkspaceDraftStatus\(\)/)
  assert.match(core, /if \(elements\.saveState\.textContent !== message\)/)
  assert.match(workspace, /unsaved Slide draft/)
  assert.doesNotMatch(core, /Durable and projected/)
})
