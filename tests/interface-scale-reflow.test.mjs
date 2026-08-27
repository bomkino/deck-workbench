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

test('large Interface Scale reflows instead of imposing a scaled fixed-width workbench', () => {
  assert.match(styles, /\.workbench \{ min-width: 0;/)
  assert.doesNotMatch(styles, /\.workbench \{[^}]*min-width: 70rem/)
  assert.match(styles, /data-workspace-layout="two-column"[\s\S]+?grid-template-areas:[\s\S]+?"sequence story"[\s\S]+?"stage stage"[\s\S]+?"inspector inspector"/)
  assert.match(styles, /data-workspace-layout="single-column"[\s\S]+?grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(styles, /data-workspace-layout="two-column"\] \.toolbar-actions/)
  assert.match(styles, /width: min\(50rem, calc\(100vw - 6rem\)\)/)
})

test('layout choice accounts for Interface Scale at 1440 and 1512 pixel laptop widths', () => {
  for (const viewportWidth of [1440, 1512]) {
    assert.equal(workspaceLayoutMode({ viewportWidth, interfaceScale: 1.5 }), 'two-column')
    assert.equal(workspaceLayoutMode({ viewportWidth, interfaceScale: 1.75 }), 'two-column')
  }
  assert.equal(workspaceLayoutMode({ viewportWidth: 800, interfaceScale: 1.75 }), 'single-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1 }), 'four-column')
})

test('packaged WebKit journey measures 175 percent horizontal reachability', () => {
  assert.match(tracer, /interfaceScale = 1\.75;/)
  assert.match(tracer, /document\.documentElement\.getBoundingClientRect\(\)/)
  assert.doesNotMatch(tracer, /requestAnimationFrame/)
  assert.match(tracer, /essentialControlsInsideViewport/)
  assert.match(tracer, /layout1512At175/)
  assert.match(tracer, /documentWidth <= viewportWidth \+ 1/)
  assert.match(tracer, /Interface Scale 175% reflow left essential controls outside the viewport/)
})

test('native shell observes Interface Scale without feeding it into artboard geometry', () => {
  assert.match(controller, /@Published private\(set\) var interfaceScale: Double/)
  assert.match(app, /private var shellScale: CGFloat \{ CGFloat\(controller\.interfaceScale\) \}/)
  assert.match(app, /\.font\(\.system\(size: 13 \* shellScale\)\)/)
  assert.match(app, /\.frame\(minHeight: 42 \* shellScale\)/)
  assert.match(tracer, /controller\.interfaceScale == 1\.25/)
  assert.doesNotMatch(app, /artboardZoom/)
})
