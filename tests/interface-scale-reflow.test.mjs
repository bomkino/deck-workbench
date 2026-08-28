import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [styles, workspace, tracer, app, controller] = await Promise.all([
  readFile(new URL('../apps/macos/Resources/Workspace/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Resources/Workspace/workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
])

const layoutSourceEnd = workspace.indexOf('function workspaceTransforms')
const { workspaceLayoutMode } = Function(
  `"use strict"; ${workspace.slice(0, layoutSourceEnd)}; return { workspaceLayoutMode };`,
)()

test('large Interface Scale reflows the roomy workbench instead of clipping it', () => {
  assert.match(styles, /\.workbench \{\s*min-width: 0;/)
  assert.doesNotMatch(styles, /\.workbench \{[^}]*min-width: 70rem/)
  assert.match(styles, /--control-size: 3\.25rem/)
  assert.match(styles, /data-workspace-layout="two-column"[\s\S]+?grid-template-areas:[\s\S]+?"sequence story"[\s\S]+?"stage stage"[\s\S]+?"inspector inspector"/)
  assert.match(styles, /data-workspace-layout="single-column"[\s\S]+?grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(styles, /data-workspace-layout="two-column"\] \.toolbar-actions/)
  assert.match(styles, /width: min\(68rem, calc\(100vw - 8rem\)\)/)
})

test('layout choice preserves four-column working space and reflows at scaled widths', () => {
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1.1 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.5 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.75 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 800, interfaceScale: 1.75 }), 'single-column')
})

test('packaged WebKit journey still measures 175 percent horizontal reachability', () => {
  assert.match(tracer, /interfaceScale = 1\.75;/)
  assert.match(tracer, /document\.documentElement\.getBoundingClientRect\(\)/)
  assert.doesNotMatch(tracer, /requestAnimationFrame/)
  assert.match(tracer, /essentialControlsInsideViewport/)
  assert.match(tracer, /layout1512At175/)
  assert.match(tracer, /documentWidth <= viewportWidth \+ 1/)
  assert.match(tracer, /Interface Scale 175% reflow left essential controls outside the viewport/)
})

test('native shell scales its large controls without feeding scale into artboard geometry', () => {
  assert.match(controller, /@Published private\(set\) var interfaceScale: Double/)
  assert.match(app, /private var shellScale: CGFloat \{ CGFloat\(controller\.interfaceScale\) \}/)
  assert.match(app, /private var toolbarHeight: CGFloat \{ 54 \* shellScale \}/)
  assert.match(app, /Label\("New Deck…", systemImage: "rectangle\.stack\.badge\.plus"\)/)
  assert.match(app, /AdaptiveToolbarLabelStyle\(compact: shellScale >= 1\.5\)/)
  assert.match(app, /\.controlSize\(\.large\)/)
  assert.match(app, /\.font\(\.system\(size: 14 \* shellScale, weight: \.semibold\)\)/)
  assert.match(tracer, /controller\.interfaceScale == 1\.25/)
  assert.doesNotMatch(app, /artboardZoom/)
})
