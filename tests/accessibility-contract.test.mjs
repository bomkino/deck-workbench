import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, workspace] = await Promise.all([
  readFile(new URL('../apps/macos/Resources/Workspace/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/workspace.js', import.meta.url), 'utf8'),
])

test('Editorial Spine exposes selected, shortcut, busy and live-status semantics', () => {
  assert.match(html, /id="save-state" role="status" aria-live="polite" aria-atomic="true"/)
  assert.match(html, /class="workbench"[^>]+aria-busy="false"/)
  assert.match(html, /id="artboard-zoom"[^>]+aria-label="Artboard Zoom"/)
  assert.match(workspace, /setAttribute\('aria-busy', 'true'\)/)
  assert.match(workspace, /setAttribute\('aria-current', 'page'\)/)
  assert.equal(workspace.match(/setAttribute\('aria-keyshortcuts', 'Alt\+ArrowUp Alt\+ArrowDown'\)/g)?.length, 2)
  assert.match(workspace, /move\.dataset\.direction = 'up'/)
  assert.match(workspace, /move\.dataset\.direction = 'down'/)
  assert.match(workspace, /Move Slide \$\{slideNumber\} down/)
  assert.match(workspace, /Move \$\{section\.title\} down/)
  assert.match(workspace, /`Slide \$\{slideNumber\}: \$\{slide\.headline\?\.plainText \|\| slide\.intent\}`/)
  assert.equal(
    workspace.match(/renderProjection\(projection\)\n    elements\.saveState\.textContent = `\$\{error\.name \?\? 'Error'\}: \$\{error\.message\}`/g)?.length,
    3,
  )
})
