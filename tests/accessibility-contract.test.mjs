import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, core, plan, focus, sequenceTargets, styles, hardening] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-plan.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-focus.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-sequence-targets.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/packaged-hardening.css', import.meta.url), 'utf8'),
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
  assert.match(plan, /Move \$\{lifecycleLabel\}: \$\{displayLabel\} \$\{direction\}/)
  assert.match(plan, /'Skipped Slide'/)
  assert.match(plan, /'Cut Bin Slide'/)
  assert.match(sequenceTargets, /Move \$\{lifecycleLabel\}: \$\{displayLabel\} \$\{direction\}/)
  assert.match(plan, /Move \$\{section\.title\} \$\{direction\}/)
  assert.match(plan, /`Slide \$\{pageNumber\}: \$\{slide\.headline\?\.plainText \|\| slide\.intent\}`/)
  assert.match(plan, /const successor = elements\.deckMap\.querySelector[\s\S]*if \(successor\) successor\.focus[\s\S]*else elements\.planFilter\.focus/)
  assert.match(plan, /const interactionGeneration = typeof workspaceInteractionGeneration === 'number'[\s\S]*const interactionUnchanged =[\s\S]*if \(interactionUnchanged\)/)
  assert.match(plan, /const nextAction = saved[\s\S]*lifecycle === 'included' \? 'restore' : 'skip'/)
  assert.doesNotMatch(html, /id="slide-lifecycle"/)
  assert.match(focus, /semanticMapTargetForNode[\s\S]*mapSlideId: card\.dataset\.mapSlideId, mapAction: action\.dataset\.mapAction/)
  assert.match(focus, /renderDeckMapWithFocusPreservation[\s\S]*restoreWorkspaceFocus\(target\)/)
  assert.match(focus, /document\.addEventListener\('focusin'[\s\S]*if \(target\) \{[\s\S]*rememberWorkspaceFocus\(target\)[\s\S]*workspaceExpectedFocus = null[\s\S]*cancelWorkspaceFocusLease\(\)/)
  assert.doesNotMatch(styles, /(?:is-skipped|data-lifecycle="skipped")[^\n]*opacity/)
  assert.doesNotMatch(hardening, /data-lifecycle="skipped"[\s\S]{0,120}opacity/)
})
