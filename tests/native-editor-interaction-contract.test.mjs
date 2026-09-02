import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, workspace, curate, visual] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-curate.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-visual.js', import.meta.url), 'utf8'),
])

test('the editor chrome is a compact three-part toolbar with icon controls and native labels', () => {
  assert.match(html, /class="toolbar-leading-actions"/)
  assert.match(html, /id="toggle-navigator"[^>]*class="icon-button"[^>]*aria-label="Toggle Navigator"/)
  assert.match(html, /id="toggle-inspector"[^>]*class="icon-button"[^>]*aria-label="Toggle Inspector"/)
  assert.match(html, /<summary aria-label="Appearance" title="Appearance">/)
  assert.equal((html.match(/id="toggle-navigator"/g) ?? []).length, 1)
  assert.equal((html.match(/id="toggle-inspector"/g) ?? []).length, 1)
  assert.match(styles, /\.phase-navigation \{[^}]*width: min\(100%, 34rem\);[^}]*border: 1px solid var\(--rule\);/)
  assert.match(styles, /html\[data-workspace-host="macos"\] \.eyebrow \{ display: none; \}/)
})

test('static editor chrome cannot be selected or browser-dragged while editing surfaces remain selectable', () => {
  assert.match(styles, /body \{[^}]*-webkit-user-select: none; user-select: none;/)
  assert.match(styles, /input, textarea, \[contenteditable="true"\], #conversion-prompt-fallback \{ -webkit-user-select: text; user-select: text; \}/)
  assert.match(styles, /img \{ -webkit-user-drag: none; -webkit-user-select: none; user-select: none; \}/)
  for (const tag of html.matchAll(/<img\b[^>]*>/g)) assert.match(tag[0], /draggable="false"/)
  assert.equal((curate.match(/image\.draggable = false/g) ?? []).length, 1)
  assert.equal((visual.match(/image\.draggable = false/g) ?? []).length, 3)
})

test('an unopened native document reports an honest empty session instead of a kernel failure', () => {
  assert.match(workspace, /error\?\.name === 'KernelUnavailable' && errorMessage\.includes\('No Deck is open'\)/)
  assert.match(workspace, /\? 'No document session'/)
})
