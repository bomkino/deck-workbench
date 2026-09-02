import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { settleRuntimeViewport } from '../apps/linux/runtime-viewport.mjs'

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
  assert.match(styles, /\.plan-phase\.is-active \.plan-editor \{ visibility: visible; \}/)
  const control = styles.match(/--control-size:\s*max\(([\d.]+)rem,\s*([\d.]+)px\)/)
  assert.ok(control)
  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75]) {
    assert.ok(Math.max(Number(control[1]) * 16 * scale, Number(control[2])) >= 44)
  }
  assert.match(styles, /data-workspace-layout="two-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence map" "editor editor"/)
  assert.match(styles, /data-workspace-layout="single-column"\] \.plan-phase \{[\s\S]+?grid-template-areas: "sequence" "map" "editor"/)
  assert.match(styles, /@media \(max-height: 760px\)[\s\S]+?plan-phase:has\(#plan-empty:not\(\[hidden\]\)\) \.sequence-heading \{ min-height: 0;[\s\S]+?padding-block: var\(--space-1\)/)
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
  const assembleActivation = tracer.indexOf("await enterPhaseForSlide('assemble', secondSlideId)")
  const artboardMeasurement = tracer.indexOf("document.querySelector('#artboard').getBoundingClientRect()")
  assert.notEqual(assembleActivation, -1)
  assert.notEqual(artboardMeasurement, -1)
  assert.ok(
    assembleActivation < artboardMeasurement,
    'the Assemble phase must be visible before artboard geometry is measured',
  )
  assert.match(tracer, /artboardWidth > 1 && artboardHeight > 1 && shellWidth > 1 && shellHeight > 1/)
  assert.match(tracer, /abs\(artboardWidth - expectedWidth\) <= 1/)
  assert.match(tracer, /abs\(\(artboardWidth \/ artboardHeight\) - canvasAspectRatio\) <= 0\.01/)
  assert.match(tracer, /abs\(height - firstArtboardHeight\) <= 1/)
  assert.match(tracer, /essentialControlSelectors = \['#add-section', '#add-slide', '#slide-intent', '#headline', '#save-plan'\]/)
  assert.match(tracer, /scrollIntoView\(\{ block: 'center', inline: 'nearest' \}\)/)
  assert.match(tracer, /rect\.left >= -1[\s\S]+?rect\.top >= -1[\s\S]+?rect\.right <= document\.documentElement\.clientWidth \+ 1[\s\S]+?rect\.bottom <= document\.documentElement\.clientHeight \+ 1/)
  assert.match(tracer, /essentialControlReachability\.count == 5/)
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

test('packaged Electron journey settles real compact viewports before inspecting fonts and geometry', async () => {
  assert.match(linuxHost, /label: 'mac-post-toolbar-proxy', width: 1180, height: 605/)
  assert.match(linuxHost, /label: 'compact-desktop', width: 1280, height: 720/)
  assert.match(linuxHost, /runtimeUIScales = Object\.freeze\(\[1, 1\.25, 1\.5, 1\.75\]\)/)
  assert.match(linuxHost, /settleRuntimeViewport\(\{/)
  assert.ok(
    linuxHost.indexOf('await settleRuntimeViewport({')
      < linuxHost.indexOf('await globalThis.deckBridge.setInterfaceScale'),
    'runtime viewport must settle before scale geometry is inspected',
  )
  assert.match(linuxHost, /await document\.fonts\.ready/)
  assert.match(linuxHost, /createDeckFullyVisible/)
  assert.match(linuxHost, /mediaScrollFitsVirtualCard/)
  assert.match(linuxHost, /noToolbarHorizontalClipping/)
  assert.match(linuxHost, /introFullyVisible/)
  assert.match(linuxHost, /artboardMajorityInitiallyVisible/)
  assert.match(linuxHost, /documentScrollLeft/)
  assert.match(linuxHost, /bodyScrollLeft/)
  assert.match(linuxHost, /phaseWorkspaces: scrollEvidence\(phaseWorkspaces\)/)
  assert.match(linuxHost, /const curateView = await activate\('curate'\)/)
  assert.match(linuxHost, /owner\.scrollWidth <= owner\.clientWidth \+ 1/)
  assert.match(linuxHost, /owner\.scrollLeft = 0/)
  const documentInspection = linuxHost.slice(
    linuxHost.indexOf('async function inspectDocumentRuntimeUI'),
    linuxHost.indexOf('async function presentRuntimePhaseForScreenshot'),
  )
  assert.doesNotMatch(documentInspection, /view\.scrollTop\s*=\s*0/)
  assert.match(linuxHost, /captureRuntimeUIScreenshot/)
  assert.match(linuxHost, /Runtime UI assertion evidence:/)

  const observations = [
    { width: 1179, height: 605 },
    { width: 1180, height: 604 },
    { width: 1180, height: 605 },
  ]
  const delays = []
  const settled = await settleRuntimeViewport({
    requestedViewport: { width: 1180, height: 605 },
    readViewport: async () => observations.shift(),
    delay: async (milliseconds) => delays.push(milliseconds),
  })
  assert.deepEqual(settled, {
    attempts: 3,
    viewport: { width: 1180, height: 605 },
  })
  assert.deepEqual(delays, [25, 25])

  let timeoutReads = 0
  await assert.rejects(
    settleRuntimeViewport({
      requestedViewport: { width: 1180, height: 605 },
      readViewport: async () => {
        timeoutReads += 1
        return { width: 1179, height: 604 }
      },
      delay: async () => {},
      maxAttempts: 2,
    }),
    { name: 'RuntimeUISetupFailed', message: /observed 1179x604/ },
  )
  assert.equal(timeoutReads, 2)
})

test('native shell scales its controls without feeding scale into artboard geometry', () => {
  assert.match(controller, /@Published private\(set\) var interfaceScale: Double/)
  assert.match(app, /private var shellScale: CGFloat \{ CGFloat\(controller\.interfaceScale\) \}/)
  assert.match(app, /private var toolbarHeight: CGFloat \{ max\(44, 54 \* shellScale\) \}/)
  assert.match(app, /\.frame\(minWidth: 44, minHeight: 44\)/)
  assert.doesNotMatch(app, /artboardZoom/)
})
