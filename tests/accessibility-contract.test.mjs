import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, core, plan] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-plan.js', import.meta.url), 'utf8'),
])

test('phased workspace exposes busy, selected, shortcut and live-status semantics', () => {
  assert.match(html, /id="save-state" role="status" aria-live="polite" aria-atomic="true"/)
  assert.match(html, /class="workbench"[^>]+aria-busy="false"/)
  assert.match(html, /id="artboard-zoom"[^>]+aria-label="Artboard Zoom"/)
  assert.equal(html.match(/data-phase="(?:plan|curate|assemble|handoff)"/g)?.length, 4)
  assert.match(core, /setAttribute\('aria-busy', 'true'\)/)
  assert.match(plan, /setAttribute\('aria-current', 'page'\)/)
  assert.equal(plan.match(/setAttribute\('aria-keyshortcuts', 'Alt\+ArrowUp Alt\+ArrowDown'\)/g)?.length, 2)
  assert.match(plan, /move\.dataset\.direction = direction/)
  assert.match(plan, /Move Slide \$\{pageNumber\} \$\{direction\}/)
  assert.match(plan, /Move \$\{section\.title\} \$\{direction\}/)
  assert.match(plan, /`Slide \$\{pageNumber\}: \$\{slide\.headline\?\.plainText \|\| slide\.intent\}`/)
})
