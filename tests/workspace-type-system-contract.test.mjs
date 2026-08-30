import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { verifyWorkspaceFontHostRoutes, verifyWorkspaceTypeAssets } from '../scripts/verify-workspace-type-assets.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const [html, styles, core, plan, sequenceTargets, visual, workspace, handoff, linuxHost, macHost, macBridge] = await Promise.all([
  readFile(resolve(repositoryRoot, 'packages/workspace/app/index.html'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/styles.css'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace-core.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace-plan.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace-sequence-targets.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace-visual.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'packages/workspace/app/workspace-handoff.js'), 'utf8'),
  readFile(resolve(repositoryRoot, 'apps/linux/main.mjs'), 'utf8'),
  readFile(resolve(repositoryRoot, 'apps/macos/Sources/WorkspaceSchemeHandler.swift'), 'utf8'),
  readFile(resolve(repositoryRoot, 'apps/macos/Sources/BridgeCoordinator.swift'), 'utf8'),
])

function declarations(source) {
  return Object.fromEntries(source.split(';').map((entry) => {
    const separator = entry.indexOf(':')
    return separator < 0 ? null : [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]
  }).filter(Boolean))
}

function cssRules(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    declarations: declarations(match[2]),
  })).filter((rule) => rule.selectors.every((selector) => !selector.startsWith('@')))
}

const rules = cssRules(styles)

function styleFor(selector) {
  const matching = rules.filter((rule) => rule.selectors.includes(selector))
  assert.ok(matching.length > 0, `No CSS rule applies to ${selector}`)
  return Object.assign({}, ...matching.map((rule) => rule.declarations))
}

function numericAttributes(source) {
  const attributes = new Map()
  for (const match of source.matchAll(/([:\w-]+)(?:\s*=\s*(["'])([\s\S]*?)\2)?/g)) {
    attributes.set(match[1], match[3] ?? '')
  }
  return attributes
}

function elements(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))]
    .map((match) => ({ attributes: numericAttributes(match[1]), content: match[2] }))
}

function numericEntityCodePoint(source) {
  const hexadecimal = source.match(/&#x([\da-f]+);/i)?.[1]
  assert.ok(hexadecimal, `Expected a hexadecimal numeric entity in ${source}`)
  return Number.parseInt(hexadecimal, 16)
}

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`)
  const next = source.indexOf(`function ${nextName}`, start + name.length)
  const end = source.lastIndexOf('\n', next) + 1
  assert.ok(start >= 0 && next > start && end > start, `Cannot extract ${name}`)
  return source.slice(start, end)
}

function maxRemPixels(value, scale) {
  const match = value.match(/^max\(([\d.]+)rem,\s*([\d.]+)px\)$/)
  assert.ok(match, `Expected a rem size with a physical pixel floor, received ${value}`)
  return Math.max(Number(match[1]) * 16 * scale, Number(match[2]))
}

test('pitch.dog v13 faces and public UI roles own deliberate typography metrics', () => {
  const faces = [...styles.matchAll(/@font-face\s*\{([^{}]+)\}/g)].map((match) => {
    const face = declarations(match[1])
    const path = face.src.match(/url\(["']\.\/([^"']+)["']\)/)?.[1]
    assert.ok(path, `Font face has no packaged relative source: ${face.src}`)
    return [path, face]
  })
  assert.equal(faces.length, 8)
  const byPath = new Map(faces)
  const expectedFaces = new Map([
    ['fonts/v13/pd-head.woff2', { family: '"PD Head"', weight: '265 900', style: 'normal', display: 'block' }],
    ['fonts/v13/pd-head-alt.woff2', { family: '"PD Head Alt"', weight: '265 900', style: 'normal', display: 'block' }],
    ['fonts/v13/pd-body-roman.woff2', { family: '"PD Body"', weight: '100 900', style: 'normal', display: 'block' }],
    ['fonts/v13/pd-body-italic.woff2', { family: '"PD Body"', weight: '100 900', style: 'italic', display: 'block' }],
    ['fonts/v13/pd-body-alt-roman.woff2', { family: '"PD Body Alt"', weight: '100 900', style: 'normal', display: 'block' }],
    ['fonts/v13/pd-body-alt-italic.woff2', { family: '"PD Body Alt"', weight: '100 900', style: 'italic', display: 'block' }],
    ['fonts/v13/pd-eyebrow-site.woff2', { family: '"PD Eyebrow"', weight: '100 900', style: 'normal', display: 'block' }],
    ['icons/phosphor/Phosphor.woff2', { family: '"Phosphor"', weight: '400', style: 'normal', display: 'block' }],
  ])
  assert.deepEqual(new Set(byPath.keys()), new Set(expectedFaces.keys()))
  for (const [path, expected] of expectedFaces) {
    const face = byPath.get(path)
    assert.equal(face['font-family'], expected.family, `${path} family`)
    assert.equal(face['font-weight'], expected.weight, `${path} weight range`)
    assert.equal(face['font-style'], expected.style, `${path} posture`)
    assert.equal(face['font-display'], expected.display, `${path} loading policy`)
  }
  assert.equal(byPath.get('fonts/v13/pd-eyebrow-site.woff2')['font-stretch'], '87.5%')
  assert.match(styles, /html:not\(\[data-fonts-ready="true"\]\) \.workbench \{ visibility: hidden; \}/)
  assert.match(workspace, /await loadWorkbenchFonts\(\)[\s\S]+?document\.documentElement\.dataset\.fontsReady = 'true'/)

  const root = styleFor(':root')
  assert.equal(root['font-family'], 'var(--font-body)')
  assert.equal(root['font-synthesis'], 'none')
  assert.match(root['--font-head'], /^"PD Head".+serif$/)
  assert.match(root['--font-body'], /^"PD Body".+sans-serif$/)
  assert.match(root['--font-eyebrow'], /^"PD Eyebrow".+monospace$/)

  const roles = [
    { selector: 'button', defaultPixels: 15, smallPixels: 12, weight: '600', lineHeight: '1.1' },
    { selector: 'input', defaultPixels: 16, smallPixels: 13, weight: '400', lineHeight: '1.25' },
    { selector: 'label > span', defaultPixels: 14, smallPixels: 12, weight: '600', lineHeight: '1.22' },
    { selector: '.eyebrow', defaultPixels: 12, smallPixels: 11, weight: '500', lineHeight: '1.25' },
  ]
  for (const role of roles) {
    const style = styleFor(role.selector)
    assert.equal(maxRemPixels(style['font-size'], 1), role.defaultPixels, `${role.selector} default size`)
    assert.equal(maxRemPixels(style['font-size'], 0.8), role.smallPixels, `${role.selector} 80% size floor`)
    assert.equal(style['font-weight'], role.weight, `${role.selector} weight`)
    assert.equal(style['line-height'], role.lineHeight, `${role.selector} line height`)
  }
  assert.equal(styleFor('button')['font-family'], 'var(--font-body)')
  assert.equal(styleFor('input')['font-family'], 'var(--font-body)')
  assert.equal(styleFor('.eyebrow')['font-family'], 'var(--font-eyebrow)')
  assert.equal(styleFor('.plan-empty-title')['font-family'], 'var(--font-head)')

  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]) {
    assert.ok(maxRemPixels(root['--control-size'], scale) >= 44, `control floor failed at ${scale}`)
  }
})

test('Interface Scale cannot leak rem-based chrome geometry into the authored artboard', () => {
  const isArtboardSelector = (selector) => selector.startsWith('.artboard')
    || selector === '#semantic-fallback'
    || selector === '#artboard-headline'
    || selector === '#composition-layer'
    || selector.startsWith('.composition-')
  const artboardRules = rules.filter((rule) => rule.selectors.some(isArtboardSelector))
  assert.ok(artboardRules.length >= 9, 'Expected the full artboard styling surface')
  for (const rule of artboardRules) {
    for (const [property, value] of Object.entries(rule.declarations)) {
      assert.doesNotMatch(value, /(?:^|[^\w-])[\d.]+rem\b/, `${rule.selectors.join(', ')} ${property} scales with chrome rems`)
      assert.doesNotMatch(value, /var\(--(?:interface-scale|space-|control-)/, `${rule.selectors.join(', ')} ${property} consumes a chrome token`)
    }
  }
  assert.equal(styleFor('.artboard')['font-size'], '16px')
  assert.equal(styleFor('#artboard-headline')['font-size'], '72px')
  assert.equal(styleFor('.composition-text')['font-size'], '43.2px')
  assert.equal(styleFor('.composition-text[data-content-role="body"]')['font-size'], '24px')
})

test('native and Linux export modes preserve one authored artboard with uniform geometry', async () => {
  const artboard = styleFor('.artboard')
  const width = Number.parseFloat(artboard.width)
  const height = width * 1080 / 2576
  assert.equal(width, 1088)
  assert.equal(artboard.height, 'var(--artboard-base-height, 456.149068px)')

  const nativeExport = styleFor('html[data-workspace-export="native"] #artboard')
  const linuxExport = styleFor('html[data-workspace-export="linux"] #artboard')
  const value = (declaration) => declaration.replace(/\s*!important$/, '')
  assert.equal(value(nativeExport.width), artboard.width)
  assert.equal(value(nativeExport.height), artboard.height)
  assert.equal(value(nativeExport.transform), 'none')
  assert.equal(value(linuxExport.width), artboard.width)
  assert.equal(value(linuxExport.height), artboard.height)
  assert.equal(value(linuxExport.transform), 'scale(var(--linux-export-scale, 0.89485873))')
  assert.match(linuxHost, /@page \{ size: \$\{pageWidthCSS\} \$\{pageHeightCSS\}; margin: 0; \}/)
  assert.match(linuxHost, /pageSize: \{ width: Math\.round\(pageWidthMm \* 1000\), height: Math\.round\(pageHeightMm \* 1000\) \}/)

  const exportStart = workspace.indexOf('  async exportFrame(')
  const exportEnd = workspace.indexOf('  async tracerEditHeadline', exportStart)
  assert.ok(exportStart >= 0 && exportEnd > exportStart)
  const exportSource = workspace.slice(exportStart, exportEnd)
  const exportState = { overflow: 0 }
  const initialExportProjection = {
    composition: { elements: [] },
    canvas: {
      id: 'cinemascope-2576x1080',
      width: 2576,
      height: 1080,
      pageWidthMm: 257.6,
      pageHeightMm: 108,
    },
  }
  const expectedExportFrame = (token) => ({
    token,
    x: 8,
    y: 12,
    width,
    height,
    canvasPresetId: 'cinemascope-2576x1080',
    canvasWidth: 2576,
    canvasHeight: 1080,
    pageWidthMm: 257.6,
    pageHeightMm: 108,
  })
  let exportLayoutReads = 0
  const documentState = {
    documentElement: {
      dataset: {},
      getBoundingClientRect() {
        exportLayoutReads += 1
        return { x: 0, y: 0, width: 0, height: 0 }
      },
    },
    fonts: { ready: Promise.resolve() },
  }
  const exportFrameState = { x: 8, y: 12, width, height }
  const exportElements = {
    workbench: { inert: false },
    artboard: { getBoundingClientRect: () => ({ ...exportFrameState }) },
  }
  const harness = Function(
    'compositionOverflowCountForProjection', 'initialProjection', 'document', 'elements',
    `"use strict";
      let projection = initialProjection;
      let workspaceExportSession = null;
      let workspaceExportPreparing = false;
      let workspaceExportSequence = 0;
      let activePhase = 'handoff';
      let renderCount = 0;
      let renderFailure = null;
      function renderAll() {
        renderCount += 1;
        if (renderFailure) {
          const failure = renderFailure;
          renderFailure = null;
          throw failure;
        }
      }
      const api = Object.freeze({${workspace.slice(exportStart, exportEnd)}});
      return {
        api,
        state: () => ({ activePhase, workspaceExportSession, workspaceExportPreparing, renderCount }),
        setProjection: (next) => { projection = next; },
        setRenderFailure: (failure) => { renderFailure = failure; },
      };
    `,
  )(
    () => exportState.overflow,
    initialExportProjection,
    documentState,
    exportElements,
  )
  await assert.rejects(harness.api.exportFrame('screen'), RangeError)

  let resolvePendingFonts
  documentState.fonts.ready = new Promise((resolveReady) => { resolvePendingFonts = resolveReady })
  const pendingExport = harness.api.exportFrame()
  assert.equal(harness.state().workspaceExportPreparing, true)
  assert.deepEqual(await harness.api.exportFrame('linux'), { error: 'ExportBusy' })
  resolvePendingFonts()
  assert.deepEqual(await pendingExport, expectedExportFrame('1'))
  assert.equal(harness.state().workspaceExportPreparing, false)
  assert.equal(harness.state().workspaceExportSession.token, '1')
  assert.deepEqual(harness.api.finishExport('1'), { finished: true })

  let resolveStaleFonts
  documentState.fonts.ready = new Promise((resolveReady) => { resolveStaleFonts = resolveReady })
  const staleExport = harness.api.exportFrame()
  harness.setProjection({ composition: { elements: [] }, revision: 2 })
  resolveStaleFonts()
  assert.deepEqual(await staleExport, { error: 'ExportStale' })
  assert.equal(harness.state().workspaceExportPreparing, false)
  assert.equal(harness.state().workspaceExportSession, null)
  harness.setProjection(initialExportProjection)

  documentState.fonts.ready = Promise.reject(new Error('font load failed'))
  await assert.rejects(harness.api.exportFrame(), /font load failed/)
  assert.equal(harness.state().workspaceExportPreparing, false)
  documentState.fonts.ready = Promise.resolve()

  harness.setRenderFailure(new Error('render failed'))
  await assert.rejects(harness.api.exportFrame(), /render failed/)
  assert.equal(harness.state().workspaceExportPreparing, false)
  assert.equal(harness.state().workspaceExportSession, null)
  assert.equal(harness.state().activePhase, 'handoff')
  assert.equal(exportElements.workbench.inert, false)
  assert.deepEqual(documentState.documentElement.dataset, {})

  exportFrameState.width = 0
  await assert.rejects(harness.api.exportFrame(), /Slide export frame is invalid/)
  assert.equal(harness.state().workspaceExportSession, null)
  assert.equal(harness.state().activePhase, 'handoff')
  assert.equal(exportElements.workbench.inert, false)
  assert.deepEqual(documentState.documentElement.dataset, {})
  exportFrameState.width = width

  exportState.overflow = 2
  assert.deepEqual(await harness.api.exportFrame(), { error: 'CompositionOverflow', overflowCount: 2 })
  assert.equal(harness.state().workspaceExportPreparing, false)
  assert.deepEqual(documentState.documentElement.dataset, {})
  assert.equal(harness.state().activePhase, 'handoff')

  exportState.overflow = 0
  assert.deepEqual(await harness.api.exportFrame(), expectedExportFrame('4'))
  assert.equal(documentState.documentElement.dataset.workspaceExport, 'native')
  assert.equal(harness.state().workspaceExportSession.token, '4')
  assert.equal(harness.state().activePhase, 'assemble')
  assert.deepEqual(await harness.api.exportFrame('linux'), { error: 'ExportBusy' })
  assert.deepEqual(harness.api.finishExport('wrong-token'), { finished: false })
  assert.equal(harness.state().activePhase, 'assemble')
  assert.deepEqual(harness.api.finishExport('4'), { finished: true })
  assert.deepEqual(documentState.documentElement.dataset, {})
  assert.equal(harness.state().activePhase, 'handoff')
  assert.deepEqual(await harness.api.exportFrame('linux'), expectedExportFrame('5'))
  assert.equal(documentState.documentElement.dataset.workspaceExport, 'linux')
  assert.deepEqual(harness.api.finishExport('5'), { finished: true })
  assert.equal(harness.state().renderCount, 10)
  assert.equal(exportLayoutReads, 7)
  assert.match(exportSource, /await \(document\.fonts\?\.ready/)
  assert.match(exportSource, /document\.documentElement\.getBoundingClientRect\(\)/)
  assert.match(exportSource, /projection !== exportProjection/)
  assert.doesNotMatch(exportSource, /requestAnimationFrame/)

  const macExport = macBridge.slice(macBridge.indexOf('func writeOnePagePDF'), macBridge.indexOf('func invokeForTracer'))
  assert.match(macExport, /return await deckWorkbench\.exportFrame\(\)/)
  assert.match(macExport, /configuration\.rect = CGRect\(x: x, y: y, width: width, height: height\)/)
  assert.match(macExport, /return deckWorkbench\.finishExport\(token\)/)
  assert.match(macExport, /try await finishExport\(\)/)
  assert.match(macExport, /ExportCleanupFailed/)
  assert.doesNotMatch(macExport, /try\? await finishExport\(\)/)
  assert.doesNotMatch(macExport, /evaluateJavaScript\("deckWorkbench\.finishExport/)
  const linuxExportHost = linuxHost.slice(linuxHost.indexOf('async function exportOnePagePDF'), linuxHost.indexOf('async function presentPDFExport'))
  assert.match(linuxExportHost, /deckWorkbench\.exportFrame\('linux'\)/)
  assert.match(linuxExportHost, /removeInsertedCSS\(cssKey\)[\s\S]*deckWorkbench\.finishExport/)
  assert.match(linuxExportHost, /cleanupFailures\.push/)
  assert.ok(
    linuxExportHost.indexOf('if (cleanupFailures.length)') < linuxExportHost.indexOf('if (operationFailure) throw operationFailure'),
    'Linux must surface cleanup failure before a primary operation failure can hide it',
  )
})

test('static and generated icon controls expose names while Phosphor glyphs stay decorative', () => {
  const buttons = elements(html, 'button')
  const expectations = new Map([['undo', 0xe038], ['redo', 0xe036]])
  for (const [id, codePoint] of expectations) {
    const button = buttons.find((candidate) => candidate.attributes.get('id') === id)
    assert.ok(button, `Missing ${id} button`)
    const label = id[0].toUpperCase() + id.slice(1)
    assert.equal(button.attributes.get('aria-label'), label)
    assert.equal(button.attributes.get('title'), label)
    assert.ok(button.attributes.get('class').split(/\s+/).includes('icon-button'))
    const span = elements(button.content, 'span')
    assert.equal(span.length, 1)
    assert.ok(span[0].attributes.get('class').split(/\s+/).includes('phosphor-icon'))
    assert.equal(span[0].attributes.get('aria-hidden'), 'true')
    assert.equal(numericEntityCodePoint(span[0].content), codePoint)
  }

  const iconStart = core.indexOf('const PHOSPHOR_GLYPH_ENTITIES')
  const iconEnd = core.indexOf('\nconst elements =', iconStart)
  assert.ok(iconStart >= 0 && iconEnd > iconStart)
  const { phosphorIconMarkup, setPhosphorIconButton } = Function(
    `"use strict"; ${core.slice(iconStart, iconEnd)}; return { phosphorIconMarkup, setPhosphorIconButton };`,
  )()
  const iconCodePoints = { arrowUp: 0xe08e, arrowDown: 0xe03e, trashSimple: 0xe4a8 }
  for (const [name, codePoint] of Object.entries(iconCodePoints)) {
    const [span] = elements(phosphorIconMarkup(name), 'span')
    assert.equal(span.attributes.get('aria-hidden'), 'true')
    assert.equal(numericEntityCodePoint(span.content), codePoint)
  }
  assert.throws(() => phosphorIconMarkup('made-up'), RangeError)

  class FakeElement {
    constructor(tagName = 'span') {
      this.tagName = tagName
      this.attributes = new Map()
      this.children = []
      this.dataset = {}
      this.classNames = new Set()
      this.classList = { add: (...names) => names.forEach((name) => this.classNames.add(name)) }
      this.innerHTML = ''
      this.textContent = ''
      this.title = ''
      this.type = ''
    }
    set className(value) { this.classNames = new Set(value.split(/\s+/).filter(Boolean)) }
    get className() { return [...this.classNames].join(' ') }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
    addEventListener() {}
    append(...children) { this.children.push(...children) }
    replaceChildren(...children) { this.children = [...children] }
  }

  const title = new FakeElement('strong')
  const tools = new FakeElement('span')
  const row = new FakeElement('div')
  row.querySelector = (selector) => selector === '[data-section-title]' ? title : selector === '.section-tools' ? tools : null
  const renderSection = Function(
    'document', 'sequenceItemId', 'sequenceControlPlans', 'setPhosphorIconButton', 'moveSection', 'removeSection',
    `"use strict"; ${functionSource(sequenceTargets, 'updateSectionSequenceRow', 'createSlideSequenceEntry')}; return updateSectionSequenceRow;`,
  )(
    { createElement: (tagName) => new FakeElement(tagName) },
    (kind, id) => `${kind}-${id}`,
    () => ({ up: Object.freeze({}), down: Object.freeze({}) }),
    setPhosphorIconButton,
    () => {},
    () => {},
  )
  const section = { id: 'section-a', title: 'Opening', slides: [] }
  renderSection(row, section, { sections: [section, { id: 'section-b', title: 'Close', slides: [] }] })
  const [rename, up, down, remove] = tools.children
  assert.equal(rename.textContent, 'Rename')
  for (const [button, label, codePoint] of [
    [up, 'Move Opening up', iconCodePoints.arrowUp],
    [down, 'Move Opening down', iconCodePoints.arrowDown],
    [remove, 'Remove empty Section Opening', iconCodePoints.trashSimple],
  ]) {
    assert.equal(button.type, 'button')
    assert.ok(button.classNames.has('icon-button'))
    assert.equal(button.attributes.get('aria-label'), label)
    assert.equal(button.title, label)
    assert.equal(numericEntityCodePoint(button.innerHTML), codePoint)
  }
})

function focusHarness({ phaseHidden = false, phaseRect, targetRect, scale = 1 }) {
  const frames = []
  const scrolls = []
  const focusCalls = []
  const document = { activeElement: null }
  const phase = {
    getAttribute: (name) => name === 'aria-hidden' ? String(phaseHidden) : null,
    getBoundingClientRect: () => phaseRect,
  }
  const target = {
    focus(options) {
      focusCalls.push(options)
      document.activeElement = target
    },
    closest: () => phase,
    getBoundingClientRect: () => targetRect,
    scrollIntoView: (options) => scrolls.push(options),
  }
  const focusPlanControl = Function(
    'requestAnimationFrame', 'document', 'interfaceScale',
    `"use strict"; ${functionSource(plan, 'focusPlanControl', 'savePlanDraftById')}; return focusPlanControl;`,
  )((callback) => frames.push(callback), document, scale)
  return { focusPlanControl, target, frames, scrolls, focusCalls }
}

test('focus reveal focuses immediately and scrolls only controls outside the active phase', () => {
  const phaseRect = { top: 0, right: 1000, bottom: 800, left: 0 }
  const inside = focusHarness({ phaseRect, targetRect: { top: 100, right: 700, bottom: 150, left: 100 }, scale: 1.75 })
  assert.equal(inside.focusPlanControl(inside.target), true)
  assert.deepEqual(inside.focusCalls, [{ preventScroll: true }])
  assert.equal(inside.scrolls.length, 0)
  inside.frames.splice(0).forEach((frame) => frame())
  assert.equal(inside.scrolls.length, 0)

  const clipped = focusHarness({ phaseRect, targetRect: { top: 770, right: 700, bottom: 830, left: 100 }, scale: 1.75 })
  assert.equal(clipped.focusPlanControl(clipped.target), true)
  assert.equal(clipped.scrolls.length, 0, 'focus itself must not jump the scroller')
  clipped.frames.splice(0).forEach((frame) => frame())
  assert.deepEqual(clipped.scrolls, [{ block: 'center', inline: 'nearest' }])

  const hidden = focusHarness({ phaseHidden: true, phaseRect, targetRect: { top: 900, right: 700, bottom: 950, left: 100 } })
  hidden.focusPlanControl(hidden.target)
  hidden.frames.splice(0).forEach((frame) => frame())
  assert.equal(hidden.scrolls.length, 0)
  assert.equal(hidden.focusPlanControl(null), false)
})

test('composition rendering preserves authored text roles and announces actual frame overflow', async () => {
  const compositionElementLabel = Function(
    `"use strict"; ${functionSource(visual, 'compositionElementLabel', 'renderComposition')}; return compositionElementLabel;`,
  )()
  const compositionLayer = {
    children: [],
    replaceChildren() { this.children = [] },
    append(node) { this.children.push(node) },
  }
  const elementsState = {
    compositionLayer,
    semanticFallback: { hidden: false },
    assemblyOverflowState: { hidden: true, textContent: '' },
  }
  let scheduled = 0
  const renderComposition = Function(
    'document', 'elements', 'scheduleCompositionOverflowCheck', 'compositionElementLabel',
    `"use strict"; ${functionSource(visual, 'renderComposition', 'scheduleCompositionOverflowCheck')}; return renderComposition;`,
  )(
    { createElement: () => ({ dataset: {}, style: {}, attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, value) } }) },
    elementsState,
    () => { scheduled += 1 },
    compositionElementLabel,
  )
  const frame = { x: 100, y: 50, width: 500, height: 250 }
  const projectionFixture = {
    canvas: { width: 1000, height: 500 },
    contentBlocks: [{ id: 'body-block', role: 'body', plainText: 'Canonical body' }],
    composition: { elements: [
      { id: 'body-node', kind: 'text', contentBlockId: 'body-block', contentRole: 'headline', frame },
      { id: 'subhead-node', kind: 'text', contentBlockId: 'missing', contentRole: 'subheadline', frame },
      { id: 'caption-node', kind: 'text', contentBlockId: 'missing', contentSlot: 'caption', frame },
      { id: 'plain-node', kind: 'text', contentBlockId: 'missing', frame },
    ] },
  }
  renderComposition(projectionFixture)
  assert.equal(elementsState.semanticFallback.hidden, true)
  assert.equal(scheduled, 1)
  assert.deepEqual(compositionLayer.children.map((node) => node.dataset.contentRole), ['body', 'subheadline', 'caption', 'text'])
  assert.deepEqual(compositionLayer.children[0].style, {
    left: '10%', top: '10%', width: '50%', height: '50%', zIndex: '1',
  })

  const overflowStatus = elements(html, 'p').find((element) => element.attributes.get('id') === 'assembly-overflow-state')
  assert.ok(overflowStatus)
  assert.equal(overflowStatus.attributes.get('role'), 'status')
  assert.equal(overflowStatus.attributes.get('aria-live'), 'polite')

  const measuredOverflows = [false, true, false, true]
  let appendedSurface = null
  class MeasuredNode {
    constructor() {
      this.children = []
      this.dataset = {}
      this.style = {}
      this.attributes = new Map()
      this.clientWidth = 100
      this.clientHeight = 100
      this.scrollWidth = 100
      this.scrollHeight = 100
      this.removed = false
      this._className = ''
    }
    set className(value) {
      this._className = value
      if (value.split(/\s+/).includes('composition-element') && measuredOverflows.shift()) this.scrollWidth = 104
    }
    get className() { return this._className }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
    append(...nodes) { this.children.push(...nodes) }
    querySelectorAll(selector) {
      if (selector !== '.composition-element') return []
      return this.children.filter((node) => node.className.split(/\s+/).includes('composition-element'))
    }
    remove() { this.removed = true }
  }
  const preflightDocument = {
    createElement: () => new MeasuredNode(),
    body: { append(node) { appendedSurface = node } },
  }
  const preflight = Function(
    'document', 'compositionElementLabel',
    `"use strict"; ${functionSource(visual, 'appendCompositionElements', 'scheduleCompositionOverflowCheck')}; return { compositionOverflowNodes, compositionOverflowCountForProjection };`,
  )(preflightDocument, compositionElementLabel)
  assert.equal(preflight.compositionOverflowCountForProjection(null), 0)
  assert.equal(preflight.compositionOverflowCountForProjection(projectionFixture), 2)
  assert.ok(appendedSurface?.removed, 'preflight measurement surface must always be removed')

  const nodes = [
    { scrollWidth: 101, clientWidth: 100, scrollHeight: 100, clientHeight: 100 },
    { scrollWidth: 104, clientWidth: 100, scrollHeight: 100, clientHeight: 100 },
    { scrollWidth: 100, clientWidth: 100, scrollHeight: 105, clientHeight: 100 },
  ]
  let fontReady
  const ready = new Promise((resolveReady) => { fontReady = resolveReady })
  const frames = []
  const overflowElements = {
    compositionLayer: { querySelectorAll: () => nodes },
    assemblyOverflowState: { hidden: true, textContent: '' },
  }
  const scheduleOverflow = Function(
    'requestAnimationFrame', 'document', 'elements', 'compositionOverflowNodes', 'canvasReviewMessage',
    `"use strict"; ${functionSource(visual, 'scheduleCompositionOverflowCheck', 'syncVisualControls')}; return scheduleCompositionOverflowCheck;`,
  )((callback) => frames.push(callback), { fonts: { ready } }, overflowElements, preflight.compositionOverflowNodes, () => '')
  scheduleOverflow(projectionFixture)
  assert.equal(overflowElements.assemblyOverflowState.hidden, true, 'measurement waits for layout')
  frames.splice(0).forEach((frameCallback) => frameCallback())
  assert.equal(overflowElements.assemblyOverflowState.hidden, false)
  assert.match(overflowElements.assemblyOverflowState.textContent, /^2 authored elements exceed the composition frame\./)
  nodes.forEach((node) => {
    node.scrollWidth = node.clientWidth
    node.scrollHeight = node.clientHeight
  })
  fontReady()
  await ready
  await Promise.resolve()
  assert.equal(overflowElements.assemblyOverflowState.hidden, true)
  assert.equal(overflowElements.assemblyOverflowState.textContent, '')
})

test('composition overflow is a visible Handoff state and a real PDF barrier', async () => {
  const status = elements(html, 'p').find((element) => element.attributes.get('id') === 'handoff-export-state')
  assert.ok(status)
  assert.equal(status.attributes.get('role'), 'status')
  assert.equal(status.attributes.get('aria-live'), 'polite')

  const handoffElements = {
    exportPDF: { textContent: '', disabled: false, title: '', dataset: {}, addEventListener() {}, setAttribute() {} },
    handoffExportState: { hidden: true, textContent: '' },
    handoffSummary: { innerHTML: '' },
    handoffList: { innerHTML: '', addEventListener() {} },
  }
  const projection = { slide: { internalTitle: 'Overflow proof' }, headline: { plainText: 'Overflow proof' } }
  const overflowState = { count: 2 }
  const renderStart = handoff.indexOf('function renderHandoff')
  assert.ok(renderStart >= 0)
  const renderHandoff = Function(
    'elements', 'projection', 'compositionOverflowCountForProjection', 'planRecords', 'planReadiness',
    'summaryChip', 'escapeAttribute', 'escapeHTML',
    `"use strict"; ${handoff.slice(renderStart)}; return renderHandoff;`,
  )(
    handoffElements,
    projection,
    () => overflowState.count,
    () => [],
    () => ({ state: 'ready', issues: [] }),
    (count, label) => `${count}:${label}`,
    String,
    String,
  )
  renderHandoff()
  assert.equal(handoffElements.handoffExportState.hidden, false)
  assert.match(handoffElements.handoffExportState.textContent, /^2 active-Slide elements exceed the authored frame\./)
  assert.equal(handoffElements.exportPDF.disabled, true)
  assert.equal(handoffElements.exportPDF.title, 'Fix active-Slide composition overflow before export')

  const callbacks = {}
  handoffElements.handoffList.addEventListener = (type, callback) => { callbacks[type] = callback }
  handoffElements.exportPDF.addEventListener = (type, callback) => { callbacks[type] = callback }
  const effects = { exports: 0, renders: 0, handoffRenders: 0, busy: [], statuses: [] }
  let resolveExport
  const exportCompletion = new Promise((resolve) => { resolveExport = resolve })
  const bindHandoffEvents = Function(
    'elements', 'projection', 'compositionOverflowCountForProjection', 'renderHandoff', 'setStatus',
    'setBusy', 'window', 'renderAll', 'refreshWorkspace', 'focusPlanControl',
    `"use strict"; ${functionSource(handoff, 'bindHandoffEvents', 'renderHandoff')}; return bindHandoffEvents;`,
  )(
    handoffElements,
    projection,
    () => overflowState.count,
    () => { effects.handoffRenders += 1; renderHandoff() },
    (message) => effects.statuses.push(message),
    (message) => effects.busy.push(message),
    { deckBridge: { async exportPDF() { effects.exports += 1; await exportCompletion } } },
    () => { effects.renders += 1 },
    async () => null,
    () => {},
  )
  bindHandoffEvents()
  await callbacks.click()
  assert.equal(effects.exports, 0)
  assert.equal(effects.busy.length, 0)
  assert.equal(effects.handoffRenders, 1)
  assert.deepEqual(effects.statuses, ['CompositionOverflow: Fix the active Slide before PDF export'])

  overflowState.count = 0
  const firstExport = callbacks.click()
  await Promise.resolve()
  await callbacks.click()
  assert.equal(effects.exports, 1)
  assert.equal(handoffElements.exportPDF.dataset.exporting, 'true')
  resolveExport()
  await firstExport
  assert.equal(effects.renders, 1)
  assert.deepEqual(effects.busy, ['Preparing PDF export…'])
  assert.equal(effects.statuses.at(-1), 'PDF exported')
})

test('source, generated workspace, and both packaged hosts share one verified font route graph', async () => {
  const sourceAssets = await verifyWorkspaceTypeAssets({
    workspaceRoot: resolve(repositoryRoot, 'packages/workspace/app'),
    legalRoot: resolve(repositoryRoot, 'legal'),
    nativePhosphorPath: resolve(repositoryRoot, 'apps/macos/Resources/Fonts/Phosphor.ttf'),
  })
  const generatedAssets = await verifyWorkspaceTypeAssets({
    workspaceRoot: resolve(repositoryRoot, 'build/generated/workspace'),
    legalRoot: resolve(repositoryRoot, 'legal'),
  })
  assert.deepEqual(generatedAssets.fontAssetPaths, sourceAssets.fontAssetPaths)
  const hosts = verifyWorkspaceFontHostRoutes({ styles, linuxSource: linuxHost, macSource: macHost })
  assert.deepEqual(hosts.routes, sourceAssets.fontAssetPaths.map((path) => `/${path}`).sort())
})
