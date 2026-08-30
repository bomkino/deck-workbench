import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [styles, workspace, tracer, app, controller, linuxHost] = await Promise.all([
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
])

const layoutSourceEnd = workspace.indexOf('function workspaceTransforms')
const { workspaceLayoutMode } = Function(
  `"use strict"; ${workspace.slice(0, layoutSourceEnd)}; return { workspaceLayoutMode };`,
)()

test('large Interface Scale reflows the phased workspace instead of clipping it', () => {
  assert.match(styles, /\.workbench \{ min-width: 0;/)
  const control = styles.match(/--control-size:\s*max\(([\d.]+)rem,\s*([\d.]+)px\)/)
  assert.ok(control)
  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]) {
    assert.ok(Math.max(Number(control[1]) * 16 * scale, Number(control[2])) >= 44)
  }
  assert.match(styles, /data-workspace-layout="two-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence map" "editor editor"/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence" "map" "editor"/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.curate-phase \{[\s\S]+?grid-template-areas: "wall" "queue" "brief" "tray";[\s\S]+?grid-template-rows: minmax\(45rem, auto\) minmax\(24rem, auto\) minmax\(24rem, auto\) minmax\(32rem, auto\)/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.curate-tray \{[\s\S]+?grid-template-rows: repeat\(4, minmax\(7rem, auto\)\)/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.stage-scroll \{[\s\S]+?overflow: visible/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.handoff-review \{ overflow: visible; \}/)
  assert.match(styles, /\.artboard-shell \{ position: relative;/)
  assert.match(styles, /\.artboard \{[\s\S]+?width: 1088px/)
})

test('layout choice preserves roomy desktop Plan and reflows at scaled widths', () => {
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1 }), 'four-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1512, interfaceScale: 1.1 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1180, interfaceScale: 1.25 }), 'single-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.25 }), 'two-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.5 }), 'single-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 1440, interfaceScale: 1.75 }), 'single-column')
  assert.equal(workspaceLayoutMode({ viewportWidth: 800, interfaceScale: 1.75 }), 'single-column')
})

test('packaged WebKit journey still measures 175 percent reachability and independent artboard geometry', () => {
  assert.match(tracer, /interfaceScale = 1\.75;/)
  assert.match(tracer, /document\.documentElement\.getBoundingClientRect\(\)/)
  assert.match(tracer, /essentialControlsInsideViewport/)
  assert.match(tracer, /layout1512At175/)
  assert.match(tracer, /scaleReflow\["layout1440At150"\] as\? String == "single-column"/)
  assert.match(tracer, /scaleReflow\["layout1512At150"\] as\? String == "single-column"/)
  assert.match(tracer, /scaleReflow\["layout1440At175"\] as\? String == "single-column"/)
  assert.match(tracer, /scaleReflow\["layout1512At175"\] as\? String == "single-column"/)
  assert.match(tracer, /targetSizesByScale/)
  assert.match(tracer, /artboardWidthsByScale/)
  assert.match(tracer, /documentWidth <= viewportWidth \+ 1/)
})

test('packaged Electron journey measures real compact viewports after fonts settle', () => {
  assert.match(linuxHost, /label: 'mac-post-toolbar-proxy', width: 1180, height: 605/)
  assert.match(linuxHost, /label: 'compact-desktop', width: 1280, height: 720/)
  assert.match(linuxHost, /runtimeUIScales = Object\.freeze\(\[1, 1\.25, 1\.5, 1\.75\]\)/)
  assert.match(linuxHost, /await document\.fonts\.ready/)
  assert.match(linuxHost, /createDeckFullyVisible/)
  assert.match(linuxHost, /mediaScrollFitsVirtualCard/)
  assert.match(linuxHost, /noToolbarHorizontalClipping/)
  assert.match(linuxHost, /introFullyVisible/)
  assert.match(linuxHost, /artboardMajorityInitiallyVisible/)
  assert.match(linuxHost, /captureRuntimeUIScreenshot/)
})

test('native shell scales its controls without feeding scale into artboard geometry', () => {
  assert.match(controller, /@Published private\(set\) var interfaceScale: Double/)
  assert.match(app, /private var shellScale: CGFloat \{ CGFloat\(controller\.interfaceScale\) \}/)
  assert.match(app, /private var toolbarHeight: CGFloat \{ max\(44, 54 \* shellScale\) \}/)
  assert.match(app, /\.frame\(minWidth: 44, minHeight: 44\)/)
  assert.doesNotMatch(app, /artboardZoom/)
})
