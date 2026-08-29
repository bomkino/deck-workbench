import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [styles, workspace, tracer, app, controller] = await Promise.all([
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
])

const layoutSourceEnd = workspace.indexOf('function workspaceTransforms')
const { workspaceLayoutMode } = Function(
  `"use strict"; ${workspace.slice(0, layoutSourceEnd)}; return { workspaceLayoutMode };`,
)()

test('large Interface Scale reflows the phased workspace instead of clipping it', () => {
  assert.match(styles, /\.workbench \{ min-width: 0;/)
  assert.match(styles, /--control-size: max\(3\.25rem, 44px\)/)
  assert.match(styles, /data-workspace-layout="two-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence editor" "map map"/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence" "map" "editor"/)
  assert.match(styles, /\.artboard-shell \{ position: relative;/)
  assert.match(styles, /\.artboard \{[\s\S]+?width: 1088px/)
})

test('layout choice preserves roomy desktop Plan and reflows at scaled widths', () => {
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1.1 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.5 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 800, interfaceScale: 1.75 }), 'single-column')
})

test('packaged WebKit journey still measures 175 percent reachability and independent artboard geometry', () => {
  assert.match(tracer, /interfaceScale = 1\.75;/)
  assert.match(tracer, /document\.documentElement\.getBoundingClientRect\(\)/)
  assert.match(tracer, /essentialControlsInsideViewport/)
  assert.match(tracer, /layout1512At175/)
  assert.match(tracer, /targetSizesByScale/)
  assert.match(tracer, /artboardWidthsByScale/)
  assert.match(tracer, /documentWidth <= viewportWidth \+ 1/)
})

test('native shell scales its controls without feeding scale into artboard geometry', () => {
  assert.match(controller, /@Published private\(set\) var interfaceScale: Double/)
  assert.match(app, /private var shellScale: CGFloat \{ CGFloat\(controller\.interfaceScale\) \}/)
  assert.match(app, /private var toolbarHeight: CGFloat \{ max\(44, 54 \* shellScale\) \}/)
  assert.match(app, /\.frame\(minWidth: 44, minHeight: 44\)/)
  assert.doesNotMatch(app, /artboardZoom/)
})
