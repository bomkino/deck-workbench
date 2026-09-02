import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const parserSource = await readFile(new URL('../packages/workspace/app/workspace-writing-import.js', import.meta.url), 'utf8')
const fixture = await readFile(new URL('./fixtures/workbench-writing-import-v1.md', import.meta.url), 'utf8')
const context = vm.createContext({ TextEncoder })
vm.runInContext(parserSource, context, { filename: 'workspace-writing-import.js' })
const parser = context.WorkbenchWritingImport

test('strict Workbench Markdown preserves realistic copy, order, states, Canvas and reserved escapes', () => {
  const result = parser.parse(fixture.replaceAll('\n', '\r\n'))

  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.normalizedSource, fixture)
  assert.equal(result.deck.format, 'workbench-markdown/1')
  assert.equal(result.deck.title, 'Aurora’s Field Notes — 東京')
  assert.equal(result.deck.canvas, 'widescreen-1920x1080')
  assert.deepEqual(JSON.parse(JSON.stringify(result.counts)), {
    parts: 2,
    slides: 3,
    present: 5,
    intentionallyBlank: 2,
    unreviewed: 2,
  })
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.deck.parts.map((part) => ({
      title: part.title,
      slides: part.slides.map((slide) => slide.title),
    })))),
    [
      { title: 'Arrival', slides: ['First Light', 'The Pause'] },
      { title: 'Return', slides: ['What Remains'] },
    ],
  )
  assert.equal(result.deck.parts[0].slides[0].copies.headline.value, 'Light arrives — quietly.')
  assert.equal(
    result.deck.parts[0].slides[0].copies.body.value,
    'Read the [field notes](https://example.test/notes).\n\nThen listen.\nPurpose: this is visible copy, not metadata.',
  )
  assert.equal(result.deck.parts[0].slides[1].copies.headline.state, 'intentionally-blank')
  assert.equal(result.deck.parts[0].slides[1].copies.headline.value, '')
  assert.equal(result.deck.parts[0].slides[1].copies.body.state, 'unreviewed')
  assert.equal(result.deck.parts[1].slides[0].copies.subheadline.state, 'intentionally-blank')
})

test('structural escaping removes exactly one slash, including an original slash before a reserved marker', () => {
  const escapedTopLevel = fixture.replace(
    'Purpose: this is visible copy, not metadata.',
    'Purpose: this is visible copy, not metadata.\n\\# Deck remains visible.\n\\Format: remains visible.',
  )
  const once = parser.parse(escapedTopLevel)
  assert.equal(once.ok, true, JSON.stringify(once.errors))
  assert.match(once.deck.parts[0].slides[0].copies.body.value, /\n# Deck remains visible\.\nFormat: remains visible\.$/)

  const originalSlash = fixture.replace(
    'Purpose: this is visible copy, not metadata.',
    'Purpose: this is visible copy, not metadata.\n\\\\## Part: original slash remains.',
  )
  const twice = parser.parse(originalSlash)
  assert.equal(twice.ok, true, JSON.stringify(twice.errors))
  assert.match(twice.deck.parts[0].slides[0].copies.body.value, /\n\\## Part: original slash remains\.$/)
})

test('missing Canvas warns and defaults, while supplied unsupported Canvas blocks', () => {
  const missing = parser.parse(fixture.replace('Canvas: widescreen-1920x1080\n', ''))
  assert.equal(missing.ok, true)
  assert.equal(missing.deck.canvas, 'cinemascope-2576x1080')
  assert.match(missing.warnings[0].message, /defaulted/)

  const invalid = parser.parse(fixture.replace('Canvas: widescreen-1920x1080', 'Canvas: panorama'))
  assert.equal(invalid.ok, false)
  assert.match(invalid.errors.find((entry) => /Canvas/.test(entry.message)).message, /Unsupported Canvas/)
  assert.equal(invalid.errors.find((entry) => /Canvas/.test(entry.message)).line, 5)
})

test('duplicate and unknown fields, enums, Version and malformed hierarchy are line-numbered errors', () => {
  const cases = [
    [fixture.replace('Title: Aurora’s Field Notes — 東京', 'Title: One\nTitle: Two'), /Duplicate Title field/],
    [fixture.replace('Canvas: widescreen-1920x1080', 'Canvas: widescreen-1920x1080\nOwner: nobody'), /Unknown top-level field/],
    [fixture.replace('Style: undecided', 'Style: magic'), /Unknown Style/],
    [fixture.replace('Content pattern: simple-copy', 'Content pattern: invention'), /Unknown Content pattern/],
    [fixture.replace('Format: workbench-markdown\/1', 'Format: workbench-markdown/1\nVersion: 1'), /requires Format only/],
    [fixture.replace('## Part: Arrival', '### Slide: Orphan\n\n## Part: Arrival'), /Slide appears before Part/],
    [fixture.replace('#### Headline', '##### Headline'), /Malformed hierarchy/],
    [fixture.replace('\\Purpose: this is visible copy, not metadata.', 'Purpose: this was not escaped.'), /Content is not allowed|Duplicate Purpose|Copy appears outside/],
  ]

  for (const [source, pattern] of cases) {
    const result = parser.parse(source)
    assert.equal(result.ok, false, pattern.source)
    assert.ok(result.errors.every((entry) => Number.isInteger(entry.line) && entry.line > 0))
    assert.ok(result.errors.some((entry) => pattern.test(entry.message)), `${pattern}: ${JSON.stringify(result.errors)}`)
  }
})

test('missing structure, invalid copy states and copy outside fields block import', () => {
  const cases = [
    [fixture.replace('Title: Aurora’s Field Notes — 東京\n', ''), /Missing Deck title/],
    [fixture.replace('## Part: Arrival\n', ''), /Slide appears before Part/],
    [fixture.replace('### Slide: First Light', 'Copy before a Slide\n### Slide: First Light'), /Copy appears outside/],
    [fixture.replace('State: present\nLight arrives — quietly.', 'State: present'), /present but has no copy/],
    [fixture.replace('State: unreviewed', 'State: unreviewed\nUnexpected copy'), /Content is not allowed/],
    [fixture.replace('State: intentionally-blank', 'State: invented'), /Unknown copy State/],
  ]
  for (const [source, pattern] of cases) {
    const result = parser.parse(source)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((entry) => pattern.test(entry.message)), `${pattern}: ${JSON.stringify(result.errors)}`)
  }
})

test('named input, field, Part and Slide bounds fail closed', () => {
  const oversized = parser.parse(`${fixture}\n${'x'.repeat(parser.limits.inputBytes)}`)
  assert.equal(oversized.ok, false)
  assert.ok(oversized.errors.some((entry) => /byte limit/.test(entry.message)))

  const longTitle = parser.parse(fixture.replace('Aurora’s Field Notes — 東京', 'x'.repeat(parser.limits.deckTitleCharacters + 1)))
  assert.ok(longTitle.errors.some((entry) => /Deck title exceeds/.test(entry.message)))

  const tooManyParts = parser.parse(fixture + '\n' + Array.from(
    { length: parser.limits.partCount },
    (_, index) => `## Part: Extra ${index}\n\nPurpose: bounded\n`,
  ).join('\n'))
  assert.ok(tooManyParts.errors.some((entry) => /Part count exceeds/.test(entry.message)))

  const slide = fixture.slice(fixture.indexOf('### Slide: First Light'), fixture.indexOf('### Slide: The Pause'))
  const tooManySlides = parser.parse(fixture + '\n' + Array.from(
    { length: parser.limits.slideCount },
    (_, index) => slide.replace('### Slide: First Light', `### Slide: Extra ${index}`),
  ).join('\n'))
  assert.ok(tooManySlides.errors.some((entry) => /Slide count exceeds/.test(entry.message)))
})
