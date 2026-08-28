import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, mark, linuxHost, schemeHandler, macBuild, linuxIcon] = await Promise.all([
  readFile(new URL('../apps/macos/Resources/Workspace/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/workbench-mark.svg', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/WorkspaceSchemeHandler.swift', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-macos.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/deck-workbench.svg', import.meta.url), 'utf8'),
])

test('static workspace actions cannot accidentally submit or reload the editor', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0])
  assert.ok(buttons.length >= 14)
  for (const button of buttons) {
    assert.match(button, /\btype="button"/, `missing explicit button type: ${button}`)
  }
})

test('every baseline control exposes a 52 pixel target that scales with Interface Scale', () => {
  const root = styles.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const size = Number(root.match(/--control-size:\s*([\d.]+)rem/)?.[1])
  assert.ok(Number.isFinite(size))
  assert.ok(size >= 3.25, `control target is only ${size}rem`)
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
