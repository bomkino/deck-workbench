import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, workspace] = await Promise.all([
  readFile(new URL('../apps/macos/Resources/Workspace/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/workspace.js', import.meta.url), 'utf8'),
])

function ruleFor(selector) {
  const start = styles.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`)
  const end = styles.indexOf('}', start)
  assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`)
  return styles.slice(start, end + 1)
}

test('minimal workspace exposes exactly three authored Pattern choices and stable-ID visual controls', () => {
  const patternSelect = html.slice(
    html.indexOf('<select id="pattern-choice"'),
    html.indexOf('</select>', html.indexOf('<select id="pattern-choice"')),
  )
  assert.equal(patternSelect.match(/<option /g)?.length, 3)
  assert.match(patternSelect, /value="cover">Cover/)
  assert.match(patternSelect, /value="full-bleed-statement">Full-bleed Statement/)
  assert.match(patternSelect, /value="editorial-body">Editorial Body/)
  assert.match(html, /id="pattern-body-block"[^>]+aria-label="Editorial Body Content Block"/)
  assert.match(html, /role="group" aria-label="Align selected Element"/)
  assert.match(html, /id="visual-element"[^>]+aria-label="Composition Element"/)
  assert.match(html, /<fieldset class="crop-controls" disabled>/)
  assert.match(html, /id="composition-layer" aria-label="Active Design Option Composition"/)
})

test('workspace dispatches only named kernel commands and projects canonical text plus honest Asset placeholders', () => {
  for (const commandType of [
    'designOption.applyPattern',
    'element.frame.update',
    'element.crop.update',
    'asset.reference.add',
    'asset.assign',
  ]) {
    assert.match(workspace, new RegExp(`executeStructural\\('${commandType.replace('.', '\\.')}'`))
  }
  assert.match(workspace, /query\(\{ name: 'asset\.catalog', params: \{\} \}\)/)
  assert.match(workspace, /next\.contentBlocks\.find\(\(block\) => block\.id === element\.contentBlockId\)/)
  assert.match(workspace, /next\.mediaAssignments\?\.find\(\(candidate\) => candidate\.role === element\.mediaRole\)/)
  assert.match(workspace, /node\.dataset\.assetResolution = 'placeholder'/)
  assert.match(html, /References are semantic placeholders until a native host resolves authorized media bytes\./)
  assert.doesNotMatch(html, /type="file"/)
  assert.doesNotMatch(workspace, /createObjectURL|readAsDataURL|webkit\.messageHandlers/)
})

test('Composition geometry maps Deck units to artboard percentages independently of Interface Scale', () => {
  assert.match(workspace, /element\.frame\.x \/ next\.canvas\.width/)
  assert.match(workspace, /element\.frame\.y \/ next\.canvas\.height/)
  assert.match(workspace, /element\.frame\.width \/ next\.canvas\.width/)
  assert.match(workspace, /element\.frame\.height \/ next\.canvas\.height/)
  const renderComposition = workspace.slice(
    workspace.indexOf('function renderComposition'),
    workspace.indexOf('function syncVisualControls'),
  )
  assert.doesNotMatch(renderComposition, /interfaceScale|artboardZoom/)
  const layer = ruleFor('#composition-layer')
  assert.match(layer, /position:\s*absolute;/)
  assert.match(layer, /inset:\s*0;/)
  const element = ruleFor('.composition-element')
  assert.match(element, /position:\s*absolute;/)
  assert.match(element, /overflow:\s*hidden;/)
})
