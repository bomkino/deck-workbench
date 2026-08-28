import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const journeyVerifierPath = new URL('../scripts/linux/verify-linux-journey-result.mjs', import.meta.url)
const runtimePackage = JSON.parse(await readFile(new URL('../scripts/linux/runtime-package.json', import.meta.url), 'utf8'))

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
  readFile(new URL('../.github/workflows/dw-g01-linux.yml', import.meta.url), 'utf8'),
])

test('Linux package pins and notices the exact Electron production runtime', () => {
  assert.equal(packageJSON.dependencies.electron, '44.0.0')
  assert.equal(packageJSON.version, '0.0.1')
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
  assert.match(journeyVerifier, /Interface Scale\/artboard zoom persistence or independence failed/)
  assert.match(journeyVerifier, /full application process relaunch was not proved/)
  assert.match(journeyVerifier, /createInstanceId/)
  assert.match(journeyVerifier, /reopenInstanceId/)
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
      interfaceScale: 1.25,
      artboardZoom: 0.5,
      persistedInterfaceScale: 1.25,
      persistedArtboardZoom: 0.5,
      pdfBytes: 1024,
      pdfSHA256: 'a'.repeat(64),
    },
  }

  try {
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage'])

    result.processLifecycle.reopenInstanceId = result.processLifecycle.createInstanceId
    await writeFile(resultPath, `${JSON.stringify(result)}\n`)
    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(journeyVerifierPath), resultPath, 'test AppImage']),
      /full application process relaunch was not proved/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
