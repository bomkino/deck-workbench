import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const journeyVerifierPath = new URL('../scripts/linux/verify-linux-journey-result.mjs', import.meta.url)
const runtimePackage = JSON.parse(await readFile(new URL('../scripts/linux/runtime-package.json', import.meta.url), 'utf8'))
const runtimeUIViewports = [
  { label: 'mac-post-toolbar-proxy', width: 1180, height: 605 },
  { label: 'compact-desktop', width: 1280, height: 720 },
]
const runtimeUIScales = [1, 1.25, 1.5, 1.75]
const representativeRuntimeUIViewport = { width: 1440, height: 900 }

function runtimeUIRect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

function runtimeUIToolbar(viewport, selector = '.toolbar') {
  return {
    selector,
    present: true,
    fits: true,
    clientWidth: viewport.width,
    scrollWidth: viewport.width,
    rect: runtimeUIRect(0, 0, viewport.width, 64),
    children: [],
  }
}

function runtimeUIScrollOwner(viewport) {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    clientWidth: viewport.width,
    scrollWidth: viewport.width,
  }
}

function runtimeUIScrollOwners(viewport, includeActivePhase = false) {
  const owners = {
    document: runtimeUIScrollOwner(viewport),
    body: runtimeUIScrollOwner(viewport),
    workbench: runtimeUIScrollOwner(viewport),
    phaseWorkspaces: runtimeUIScrollOwner(viewport),
  }
  if (includeActivePhase) owners.activePhase = runtimeUIScrollOwner(viewport)
  return owners
}

function runtimeUIConfiguration(viewport, scale) {
  return {
    requestedViewport: viewport,
    viewport: { width: viewport.width, height: viewport.height },
    scale,
    layout: scale === 1.75 ? 'single-column' : 'two-column',
    fontsReady: true,
    fontsLoaded: true,
    fontLoads: ['PD Head', 'PD Head Alt', 'PD Body', 'PD Body Alt', 'PD Eyebrow', 'Phosphor']
      .map((family) => ({ family, faceCount: 1, check: true })),
    computedFamilies: {
      body: '"PD Body", sans-serif',
      head: '"PD Head", sans-serif',
      eyebrow: '"PD Eyebrow", sans-serif',
      icon: 'Phosphor',
    },
    exactViewport: true,
  }
}

function runtimeUICase(viewport, scale, kind) {
  const configuration = runtimeUIConfiguration(viewport, scale)
  if (kind === 'cold') {
    const geometry = {
      createDeckRect: runtimeUIRect(400, 390, 170, 48),
      openDeckRect: runtimeUIRect(590, 390, 170, 48),
      createDeckFullyVisible: true,
      openDeckFullyVisible: true,
      toolbar: runtimeUIToolbar(viewport),
      toolbarFitsHorizontally: true,
      scrollOwners: runtimeUIScrollOwners(viewport, true),
      documentScrollTop: 0,
      documentScrollLeft: 0,
      bodyScrollTop: 0,
      bodyScrollLeft: 0,
    }
    return { viewport, scale, configuration, geometry, ok: true }
  }

  const geometry = {
    curate: {
      mediaScrollHeight: 320,
      virtualCardHeight: 240,
      mediaScrollFitsVirtualCard: true,
      maxBadgeCard: {
        copyClientWidth: 210,
        copyScrollWidth: 210,
        copyClientHeight: 132,
        copyScrollHeight: 132,
        badgesClientWidth: 194,
        badgesScrollWidth: 194,
        everyBadgeFits: true,
        copyInsideCard: true,
        noClipping: true,
      },
      maxBadgeCardFits: true,
      toolbars: [
        runtimeUIToolbar(viewport),
        runtimeUIToolbar(viewport, '.media-toolbar'),
        runtimeUIToolbar(viewport, '.media-source-bar'),
        runtimeUIToolbar(viewport, '.media-action-bar'),
      ],
      noToolbarHorizontalClipping: true,
      scroll: runtimeUIScrollOwner(viewport),
    },
    handoff: {
      introRect: runtimeUIRect(0, 64, viewport.width, 180),
      copyRect: runtimeUIRect(24, 150, viewport.width - 48, 60),
      introNotClipped: true,
      introFullyVisible: true,
      globalToolbar: runtimeUIToolbar(viewport),
      scroll: runtimeUIScrollOwner(viewport),
    },
    assemble: {
      artboardVisibleRatio: 0.72,
      artboardMajorityInitiallyVisible: true,
      toolbars: [runtimeUIToolbar(viewport), runtimeUIToolbar(viewport, '.stage-toolbar')],
      noToolbarHorizontalClipping: true,
      scroll: runtimeUIScrollOwner(viewport),
    },
    scrollOwners: runtimeUIScrollOwners(viewport),
    documentScrollTop: 0,
    documentScrollLeft: 0,
    bodyScrollTop: 0,
    bodyScrollLeft: 0,
  }
  return { viewport, scale, configuration, geometry, ok: true }
}

function runtimeUIPolishEvidence() {
  const trigger = runtimeUIRect(48, 120, 180, 44)
  const toolbar = runtimeUIRect(0, 0, 1440, 96)
  const phaseWorkspaces = runtimeUIRect(0, 96, 1440, 804)
  const status = runtimeUIRect(1180, 24, 220, 44)
  const handoffView = runtimeUIRect(0, 96, 1440, 804)
  const handoffContainer = runtimeUIRect(980, 620, 360, 180)
  const handoffButton = runtimeUIRect(1020, 700, 280, 44)
  const disclosure = (overlayRect) => ({
    triggerBefore: trigger,
    triggerOpen: trigger,
    triggerAfter: trigger,
    overlayRect,
    triggerStable: true,
    overlayInsideViewport: true,
    viewportPositioned: true,
    noOuterScrollDrift: true,
  })
  return {
    viewport: representativeRuntimeUIViewport,
    scale: 1,
    disclosures: {
      projectReview: disclosure(runtimeUIRect(48, 170, 360, 240)),
      findMore: disclosure(runtimeUIRect(980, 420, 360, 260)),
    },
    icons: {
      items: ['undo', 'redo'].map((buttonId, index) => ({
        buttonId,
        buttonRect: runtimeUIRect(1100 + index * 52, 24, 44, 44),
        iconRect: runtimeUIRect(1111 + index * 52, 35, 22, 22),
        centerDelta: { x: 0, y: 0 },
        phosphorBound: true,
        centeredAndUnclipped: true,
      })),
      centeredAndUnclipped: true,
    },
    zoom: {
      zoom95: {
        labelRect: runtimeUIRect(1100, 120, 48, 24),
        fitRect: runtimeUIRect(1160, 110, 80, 44),
      },
      zoom100: {
        labelRect: runtimeUIRect(1100, 120, 48, 24),
        fitRect: runtimeUIRect(1160, 110, 80, 44),
      },
      stable: true,
    },
    longStatus: {
      before: { toolbarRect: toolbar, phaseWorkspacesRect: phaseWorkspaces, statusRect: status },
      long: {
        toolbarRect: toolbar,
        phaseWorkspacesRect: phaseWorkspaces,
        statusRect: status,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      stable: true,
    },
    longHandoffButton: {
      before: {
        viewRect: handoffView,
        containerRect: handoffContainer,
        buttonRect: handoffButton,
      },
      long: {
        viewRect: handoffView,
        containerRect: handoffContainer,
        buttonRect: handoffButton,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      stable: true,
    },
    ok: true,
  }
}

function runtimeUIEvidence() {
  return {
    schemaVersion: 1,
    viewports: runtimeUIViewports,
    scales: runtimeUIScales,
    cold: runtimeUIViewports.flatMap((viewport) => runtimeUIScales
      .map((scale) => runtimeUICase(viewport, scale, 'cold'))),
    document: runtimeUIViewports.flatMap((viewport) => runtimeUIScales
      .map((scale) => runtimeUICase(viewport, scale, 'document'))),
    polish: runtimeUIPolishEvidence(),
    canvasPresets: canvasPresetEvidence(),
    screenshots: [
      'ui-cold-1180x605-175.png',
      'ui-assemble-1180x605-175.png',
      'ui-handoff-1180x605-175.png',
      'ui-curate-1180x605-175.png',
      'ui-plan-light-1440x900-100.png',
      'ui-curate-light-1440x900-100.png',
      'ui-assemble-light-1440x900-100.png',
      'ui-handoff-light-1440x900-100.png',
      'ui-plan-dark-1440x900-100.png',
      'ui-curate-dark-1440x900-100.png',
      'ui-assemble-dark-1440x900-100.png',
      'ui-handoff-dark-1440x900-100.png',
      'canvas-landscape-light-1440x900.png',
      'canvas-landscape-dark-1440x900.png',
      'canvas-square-light-1440x900.png',
      'canvas-square-dark-1440x900.png',
      'canvas-portrait-light-1440x900.png',
      'canvas-portrait-dark-1440x900.png',
    ].map((file, index) => {
      const bytes = runtimeUIScreenshotBytes(index)
      return {
        file,
        width: file.includes('1440x900') ? 1440 : 1180,
        height: file.includes('1440x900') ? 900 : 605,
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }),
    ok: true,
  }
}

function canvasPresetEvidence() {
  return {
    cases: [
      ['widescreen-1920x1080', 1920, 1080, 192, 108, 'canvas-landscape.pdf'],
      ['square-2160x2160', 2160, 2160, 216, 216, 'canvas-square.pdf'],
      ['a4-portrait', 2480, 3508, 210, 297, 'canvas-portrait.pdf'],
    ].map(([id, width, height, pageWidthMm, pageHeightMm, file], index) => {
      const bytes = canvasPresetPDFBytes(index)
      return {
        canvas: { id, width, height, pageWidthMm, pageHeightMm },
        designOption: { pattern: { canvasPresetId: id }, canvasReviewRequired: false },
        pdf: {
          file,
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      }
    }),
    screenshots: [],
    ok: true,
  }
}

function canvasPresetPDFBytes(index) {
  const bytes = Buffer.alloc(128, index + 31)
  Buffer.from('%PDF-1.7\n').copy(bytes)
  return bytes
}

function runtimeUIScreenshotBytes(index) {
  const bytes = Buffer.alloc(128, index + 1)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  return bytes
}

const [
  packageJSON,
  lockJSON,
  notices,
  buildScript,
  archScript,
  appImageBuildScript,
  appImageFetchScript,
  appImageRuntimeLicense,
  verifyScript,
  journeyVerifier,
  linuxMain,
  workflow,
] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../package-lock.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../THIRD_PARTY.md', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/build-linux-x64.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/build-arch-package.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/build-appimage.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/fetch-appimage-tools.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/legal/appimage-type2-runtime-LICENSE', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/verify-packaged-linux.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/verify-linux-journey-result.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/dw-g01-linux.yml', import.meta.url), 'utf8'),
])

test('Linux package pins and notices the exact Electron production runtime', () => {
  assert.equal(packageJSON.dependencies.electron, '44.0.0')
  assert.equal(packageJSON.version, '0.0.5')
  assert.equal(lockJSON.version, packageJSON.version)
  assert.equal(runtimePackage.version, packageJSON.version)
  assert.equal(lockJSON.packages['node_modules/electron'].version, '44.0.0')
  assert.match(notices, /\| Electron \| 44\.0\.0 \|/)
  assert.match(buildScript, /electron: '44\.0\.0'/)
  assert.match(buildScript, /version,/)
  assert.match(buildScript, /exact-SHA Linux packaging requires a clean working tree/)
  assert.match(archScript, /exact-SHA Arch packaging requires a clean working tree/)
  for (const sourceGate of [buildScript, archScript, appImageBuildScript]) {
    assert.match(sourceGate, /diff --quiet --exit-code/)
    assert.match(sourceGate, /diff --cached --quiet --exit-code/)
    assert.match(sourceGate, /ls-files --others --exclude-standard/)
  }
})

test('AppImage tool and embedded runtime have immutable content pins and shipped notices', () => {
  assert.match(notices, /\| appimagetool \| 1\.9\.1/)
  assert.match(notices, /\| AppImage type-2 runtime \| 20251108/)
  assert.match(appImageFetchScript, /releases\/download\/\$\{APPIMAGETOOL_VERSION\}\/appimagetool-x86_64\.AppImage/)
  assert.match(appImageFetchScript, /ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0/)
  assert.match(appImageFetchScript, /releases\/download\/\$\{RUNTIME_VERSION\}\/runtime-x86_64/)
  assert.match(appImageFetchScript, /2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d/)
  assert.equal(appImageFetchScript.includes('/continuous/'), false)
  assert.match(appImageRuntimeLicense, /MIT License/)
  assert.match(appImageRuntimeLicense, /musl libc/)
  assert.match(appImageRuntimeLicense, /libfuse/)
  assert.match(appImageRuntimeLicense, /squashfuse/)
})

test('AppImage packaging is normalized, reproducibility-checked and preserves sandboxing', () => {
  assert.match(appImageBuildScript, /SOURCE_DATE_EPOCH/)
  assert.match(appImageBuildScript, /--runtime-file "\$RUNTIME"/)
  assert.match(appImageBuildScript, /--mksquashfs-opt=-processors/)
  assert.match(appImageBuildScript, /--mksquashfs-opt=1/)
  assert.match(appImageBuildScript, /prepare_appdir "\$APPDIR"/)
  assert.match(appImageBuildScript, /prepare_appdir "\$REPRODUCIBILITY_APPDIR"/)
  assert.match(appImageBuildScript, /appimagetool mutates its source AppDir/)
  assert.match(appImageBuildScript, /find "\$appdir" -exec touch -h/)
  assert.match(appImageBuildScript, /cmp --silent "\$APPIMAGE" "\$REPRODUCIBILITY_COPY"/)
  assert.match(appImageBuildScript, /exact-SHA AppImage packaging requires a clean working tree/)
  assert.equal(appImageBuildScript.includes('--no-sandbox'), false)
  assert.equal(verifyScript.includes('--no-sandbox'), false)
})

test('Ubuntu package gate verifies an extracted x86-64 artifact without disabling sandbox', () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/)
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  assert.match(workflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/)
  assert.match(workflow, /xvfb/)
  assert.match(workflow, /npm run install:electron/)
  assert.equal(workflow.includes('--no-sandbox'), false)
  assert.equal(verifyScript.includes('--no-sandbox'), false)
  assert.match(verifyScript, /ELF 64-bit\.\*x86-64/)
  assert.match(verifyScript, /LICENSES\.chromium\.html/)
  assert.match(verifyScript, /\.pkg\.tar\.zst/)
  assert.match(verifyScript, /--appimage-extract/)
  assert.match(verifyScript, /APPIMAGE_EXTRACT_AND_RUN=1/)
  assert.match(verifyScript, /--run-packaged-tracer-create/)
  assert.match(verifyScript, /--run-packaged-tracer-reopen/)
  assert.match(journeyVerifier, /kernel did not run in the utility process/)
  assert.match(journeyVerifier, /appearance, Interface Scale, or artboard zoom persistence failed/)
  assert.match(journeyVerifier, /full application process relaunch was not proved/)
  assert.match(journeyVerifier, /createInstanceId/)
  assert.match(journeyVerifier, /reopenInstanceId/)
  assert.match(linuxMain, /inspectRuntimeUIPolishStability/)
  assert.match(linuxMain, /captureRepresentativeRuntimeUIScreenshots/)
  assert.match(linuxMain, /waitForRuntimeVisualState/)
  assert.match(linuxMain, /RuntimeUIStateTimeout/)
  assert.match(linuxMain, /`ui-\$\{phase\}-\$\{theme\}-1440x900-100\.png`/)
  assert.match(workflow, /deck-workbench-dw-g01-ui-evidence-/)
  assert.match(workflow, /artifacts\/evidence\/linux\/journey\/journey-result\.json/)
  assert.match(workflow, /artifacts\/evidence\/linux\/journey\/ui-\*-1440x900-100\.png/)
  assert.match(workflow, /artifacts\/evidence\/linux\/journey\/canvas-\*-1440x900\.png/)
  assert.match(verifyScript, /Pages:\[\[:space:\]\]\+1/)
})

test('journey evidence accepts distinct process instances and rejects a reused instance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deck-appimage-journey-'))
  const resultPath = join(directory, 'journey-result.json')
  const result = {
    schemaVersion: 1,
    ok: true,
    processLifecycle: {
      createProcessId: 101,
      reopenProcessId: 102,
      createInstanceId: 'create-instance',
      reopenInstanceId: 'reopen-instance',
      distinctProcesses: true,
    },
    checks: {
      utilityOwner: 'electron-utility-process',
      exactBridge: true,
      rendererNodeRequire: 'undefined',
      rendererNodeProcess: 'undefined',
      rendererNetworkBlocked: true,
      initialHeadline: 'Untitled Story',
      editedHeadline: 'Linux Story Traced',
      undoneHeadline: 'Untitled Story',
      redoneHeadline: 'Linux Story Traced',
      reopenedHeadline: 'Linux Story Traced',
      reopenedUndoHeadline: 'Linux Story Traced',
      reopenedRedoHeadline: 'Linux Story Traced',
      reopenedUndoDepth: 9,
      finalRevision: 13,
      finalUndoDepth: 9,
      savedRevision: 11,
      reopenSavedRevision: 13,
      reopenedStoryRevision: 11,
      reopenedSectionOrder: ['section-two', 'section-one'],
      reopenedOpeningSlideOrder: ['slide-one', 'slide-two'],
      reopenedBodyText: 'A body block.\n\nThat survives design.',
      reopenedUndoBodyText: 'A body block that survives design.',
      reopenedRedoBodyText: 'A body block.\n\nThat survives design.',
      theme: 'dark',
      interfaceScale: 1.25,
      artboardZoom: 0.5,
      persistedTheme: 'dark',
      persistedInterfaceScale: 1.25,
      persistedArtboardZoom: 0.5,
      runtimeUI: runtimeUIEvidence(),
      pdfBytes: 1024,
      pdfSHA256: 'a'.repeat(64),
    },
  }

  try {
    await Promise.all(result.checks.runtimeUI.screenshots
      .map((screenshot, index) => writeFile(
        join(directory, screenshot.file),
        runtimeUIScreenshotBytes(index),
      )))
    await Promise.all(result.checks.runtimeUI.canvasPresets.cases
      .map((entry, index) => writeFile(
        join(directory, entry.pdf.file),
        canvasPresetPDFBytes(index),
      )))
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage'])

    result.processLifecycle.reopenInstanceId = result.processLifecycle.createInstanceId
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /full application process relaunch was not proved/,
    )

    result.processLifecycle.reopenInstanceId = 'reopen-instance'
    result.checks.runtimeUI.cold[0].geometry.createDeckFullyVisible = false
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /runtime UI cold actions or toolbar clip/,
    )

    result.checks.runtimeUI.cold[0].geometry.createDeckFullyVisible = true
    result.checks.runtimeUI.document[0].geometry.curate.maxBadgeCard.copyScrollWidth = 211.5
    result.checks.runtimeUI.document[0].geometry.curate.maxBadgeCardFits = false
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /runtime UI Curate geometry clips/,
    )

    result.checks.runtimeUI.document[0].geometry.curate.maxBadgeCard.copyScrollWidth = 210
    result.checks.runtimeUI.document[0].geometry.curate.maxBadgeCardFits = true
    result.checks.runtimeUI.document[0].geometry.handoff.scroll.scrollLeft = 1
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /runtime UI Handoff scroll ownership drifted/,
    )

    result.checks.runtimeUI.document[0].geometry.handoff.scroll.scrollLeft = 0
    result.checks.runtimeUI.document[0].geometry.scrollOwners.workbench.scrollWidth += 2
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /runtime UI document scroll ownership drifted/,
    )

    result.checks.runtimeUI.document[0].geometry.scrollOwners.workbench.scrollWidth -= 2
    result.checks.runtimeUI.polish.disclosures.findMore.overlayInsideViewport = false
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /runtime UI polish stability evidence failed/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
