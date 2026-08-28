import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, mark, linuxHost, schemeHandler, macBuild, macIconBuild, macInfo, linuxIcon] = await Promise.all([
  readFile(new URL('../apps/macos/Resources/Workspace/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/workbench-mark.svg', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/WorkspaceSchemeHandler.swift', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-macos.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-macos-icon.sh', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Info.plist', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/deck-workbench.svg', import.meta.url), 'utf8'),
])

test('static workspace actions cannot accidentally submit or reload the editor', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0])
  assert.ok(buttons.length >= 14)
  for (const button of buttons) {
    assert.match(button, /\btype="button"/, `missing explicit button type: ${button}`)
  }
})

test('every baseline control exposes at least a 44 pixel target at every Interface Scale step', () => {
  const root = styles.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(root, /--control-size:\s*max\(3\.25rem, 44px\)/)
  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]) {
    assert.ok(Math.max(3.25 * 16 * scale, 44) >= 44)
  }
  assert.match(styles, /font-size: calc\(16px \* var\(--interface-scale\)\)/)
  assert.match(styles, /min-height: var\(--control-size\)/)
  assert.match(styles, /--icon-size: 1\.375rem/)
  assert.doesNotMatch(styles, /min-height:\s*2\.(?:5|65)rem/)
  assert.match(styles, /input\[type="range"\][\s\S]+?min-height: var\(--control-size\)/)
  assert.match(styles, /\.move-sequence,[\s\S]+?width: var\(--control-size\);[\s\S]+?min-height: var\(--control-size\);/)
})

test('frequent interactions use restrained interruptible feedback and accessible fallbacks', () => {
  assert.doesNotMatch(styles, /transition:\s*all\b/)
  assert.match(styles, /--ease-out: cubic-bezier\(0\.23, 1, 0\.32, 1\)/)
  assert.match(styles, /button:enabled:active \{\s*transform: scale\(0\.98\)/)
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styles, /@media \(forced-colors: active\)/)
})

test('the pitch.dog mark is one sparse vector poem and ships through every host', () => {
  assert.match(html, /rel="icon" href="workbench-mark\.svg" type="image\/svg\+xml"/)
  assert.match(html, /class="brand-mark" src="workbench-mark\.svg"/)
  assert.match(mark, /viewBox="0 0 256 256"/)
  assert.match(mark, /fill="#dcebf2"/)
  assert.match(mark, /stroke="#151513"/)
  assert.match(mark, /stroke="#ff6847"/)
  assert.doesNotMatch(mark, /<(?:filter|linearGradient|radialGradient|mask)\b/)
  assert.equal(linuxIcon, mark)
  assert.match(linuxHost, /\['\/workbench-mark\.svg', 'workbench-mark\.svg'\]/)
  assert.match(linuxHost, /'workbench-mark\.svg': 'image\/svg\+xml'/)
  assert.match(schemeHandler, /"workbench-mark\.svg"/)
  assert.match(schemeHandler, /name\.hasSuffix\("\.svg"\) \{ return "image\/svg\+xml" \}/)
  assert.match(macBuild, /workbench-mark\.svg/)
  assert.match(macBuild, /build-macos-icon\.sh/)
  assert.match(macIconBuild, /icon_512x512@2x\.png 1024/)
  assert.match(macIconBuild, /iconutil -c icns/)
  assert.match(macInfo, /<key>CFBundleIconFile<\/key>\s*<string>DeckWorkbench\.icns<\/string>/)
  assert.match(macInfo, /<key>CFBundleTypeIconFile<\/key>\s*<string>DeckWorkbench\.icns<\/string>/)
})

test('Stage owns a scaled layout footprint, a genuine Fit control, and decorative brand silence', () => {
  assert.match(html, /id="fit-artboard"[^>]+aria-label="Fit Artboard to Stage"/)
  assert.match(html, /id="stage-scroll"[\s\S]+?id="artboard-shell"[\s\S]+?id="artboard"/)
  assert.match(html, /class="brand-mark"[^>]+role="presentation"[^>]+aria-hidden="true"/)
  assert.match(styles, /\.artboard-shell \{[\s\S]+?position: relative;/)
  assert.match(styles, /\.artboard \{[\s\S]+?width: 1088px;[\s\S]+?transform-origin: top left;/)
  assert.doesNotMatch(styles, /\.artboard \{[\s\S]+?width: min\(68rem/)
})

test('the hierarchy is editorial rather than a generic dashboard card grid', () => {
  assert.match(html, /01 \/ Sequence/)
  assert.match(html, /02 \/ Story/)
  assert.match(html, /03 \/ Stage/)
  assert.match(html, /04 \/ Inspector/)
  assert.match(styles, /border-bottom: 2px solid var\(--rule\)/)
  assert.match(styles, /background-image: radial-gradient\(circle/)
  assert.doesNotMatch(styles, /border-radius:\s*(?:0\.)?[5-9]\d?rem/)
})
