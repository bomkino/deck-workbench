import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, mark, linuxHost, schemeHandler, macBuild, workspaceBuild, macIconBuild, macInfo, linuxIcon] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workbench-mark.svg', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/WorkspaceSchemeHandler.swift', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-macos.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-workspace.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-macos-icon.sh', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Info.plist', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/deck-workbench.svg', import.meta.url), 'utf8'),
])

test('every static shared-workspace action declares its button behaviour explicitly', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0])
  assert.ok(buttons.length > 0)
  for (const button of buttons) assert.match(button, /\btype="(?:button|submit)"/, `missing explicit button type: ${button}`)
})

test('every baseline control retains at least a 44 pixel target at every Interface Scale step', () => {
  const root = styles.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(root, /--control-size:\s*max\(3\.25rem, 44px\)/)
  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]) assert.ok(Math.max(3.25 * 16 * scale, 44) >= 44)
  assert.match(styles, /font-size: calc\(16px \* var\(--interface-scale\)\)/)
  assert.match(styles, /button, input, select, textarea, \.slide-row, \.section-row \{ min-height: var\(--control-size\); \}/)
  assert.doesNotMatch(styles, /min-height:\s*2\.(?:5|65)rem/)
})

test('frequent interactions avoid ambient motion and expose reduced-motion behaviour', () => {
  assert.doesNotMatch(styles, /transition:\s*all\b/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(styles, /animation:\s*[^;]+infinite/)
})

test('the pitch.dog mark ships from the shared workspace through every host', () => {
  assert.match(html, /rel="icon" href="workbench-mark\.svg" type="image\/svg\+xml"/)
  assert.match(html, /class="brand-mark" src="workbench-mark\.svg"/)
  assert.match(mark, /viewBox="0 0 256 256"/)
  assert.match(mark, /fill="#dcebf2"/)
  assert.match(mark, /stroke="#151513"/)
  assert.match(mark, /stroke="#ff6847"/)
  assert.doesNotMatch(mark, /<(?:filter|linearGradient|radialGradient|mask)\b/)
  assert.equal(linuxIcon, mark)
  assert.match(linuxHost, /\['\/workbench-mark\.svg', 'workbench-mark\.svg'\]/)
  assert.match(schemeHandler, /"workbench-mark\.svg"/)
  assert.match(macBuild, /build\/generated\/workspace\/workbench-mark\.svg/)
  assert.match(workspaceBuild, /packages\/workspace\/app/)
  assert.match(macBuild, /build-macos-icon\.sh/)
  assert.match(macIconBuild, /iconutil -c icns/)
  assert.match(macInfo, /<key>CFBundleIconFile<\/key>\s*<string>DeckWorkbench\.icns<\/string>/)
})

test('Stage owns a scaled footprint, genuine Fit control and decorative brand silence', () => {
  assert.match(html, /id="fit-artboard"[^>]+aria-label="Fit Artboard to Stage"/)
  assert.match(html, /id="stage-scroll"[\s\S]+?id="artboard-shell"[\s\S]+?id="artboard"/)
  assert.match(html, /class="brand-mark"[^>]+role="presentation"[^>]+aria-hidden="true"/)
  assert.match(styles, /\.artboard-shell \{ position: relative;/)
  assert.match(styles, /\.artboard \{[\s\S]+?width: 1088px;[\s\S]+?transform-origin: 0 0;/)
})

test('hierarchy is four task-specific mini-apps rather than a generic dashboard', () => {
  assert.match(html, /01 \/ Plan/)
  assert.match(html, /02 \/ Curate/)
  assert.match(html, /03 \/ Assemble/)
  assert.match(html, /04 \/ Handoff/)
  assert.match(styles, /border-bottom: 2px solid var\(--rule\)/)
  assert.match(styles, /radial-gradient\(circle at 50% 40%/)
  assert.doesNotMatch(styles, /border-radius:\s*(?:0\.)?[5-9]\d?rem/)
})
