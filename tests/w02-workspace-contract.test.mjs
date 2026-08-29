import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, core, curate, visual] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-curate.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-visual.js', import.meta.url), 'utf8'),
])
const workspace = `${core}\n${curate}\n${visual}`

function ruleFor(selector) {
  const start = styles.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`)
  const end = styles.indexOf('}', start)
  assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`)
  return styles.slice(start, end + 1)
}

test('Assemble phase retains exactly three authored Pattern starters and stable-ID controls', () => {
  const start = html.indexOf('<select id="pattern-choice"')
  const patternSelect = html.slice(start, html.indexOf('</select>', start))
  assert.equal(patternSelect.match(/<option /g)?.length, 3)
  assert.match(patternSelect, /value="cover">Cover/)
  assert.match(patternSelect, /value="full-bleed-statement">Full-bleed Statement/)
  assert.match(patternSelect, /value="editorial-body">Editorial Body/)
  assert.match(html, /id="pattern-body-block"/)
  assert.match(html, /role="group" aria-label="Align selected Element"/)
  assert.match(html, /id="visual-element"/)
  assert.match(html, /<fieldset class="crop-controls" disabled>/)
  assert.match(html, /id="composition-layer" aria-label="Active Assembly Composition"/)
})

test('shared workspace dispatches named kernel commands and keeps Assets semantic', () => {
  for (const commandType of ['designOption.applyPattern', 'element.frame.update', 'element.crop.update']) {
    assert.match(visual, new RegExp(`executeStructural\\('${commandType.replace('.', '\\.')}'`))
  }
  for (const commandType of ['curate.projectJudgment.set', 'curate.slideDecision.set', 'curate.findMore.set']) {
    assert.match(curate, new RegExp(`executeCurateCommand\\('${commandType.replaceAll('.', '\\.')}'`))
  }
  assert.match(curate, /name: 'media\.assets'/)
  assert.match(curate, /name: 'media\.roots'/)
  assert.match(visual, /next\.contentBlocks\.find\(\(block\) => block\.id === element\.contentBlockId\)/)
  assert.match(visual, /next\.mediaAssignments\?\.find\(\(candidate\) => candidate\.role === element\.mediaRole\)/)
  assert.doesNotMatch(html, /type="file"/)
  assert.doesNotMatch(workspace, /createObjectURL|readAsDataURL|webkit\.messageHandlers/)
})

test('Composition geometry maps Deck units to artboard percentages independently of Interface Scale', () => {
  assert.match(visual, /element\.frame\.x \/ next\.canvas\.width/)
  assert.match(visual, /element\.frame\.y \/ next\.canvas\.height/)
  assert.match(visual, /element\.frame\.width \/ next\.canvas\.width/)
  assert.match(visual, /element\.frame\.height \/ next\.canvas\.height/)
  const renderComposition = visual.slice(visual.indexOf('function renderComposition'), visual.indexOf('function syncVisualControls'))
  assert.doesNotMatch(renderComposition, /interfaceScale|artboardZoom/)
  assert.match(ruleFor('#composition-layer'), /position:\s*absolute;/)
  assert.match(ruleFor('.composition-element'), /position:\s*absolute;/)
})
