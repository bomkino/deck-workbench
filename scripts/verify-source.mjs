import assert from 'node:assert/strict'
import { readFile, readlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { verifyWorkspaceFontHostRoutes, verifyWorkspaceTypeAssets } from './verify-workspace-type-assets.mjs'

const required = [
  'apps/macos/Info.plist',
  'apps/macos/Sources/DeckWorkbenchApp.swift',
  'apps/macos/Sources/DeckKernelHost.swift',
  'apps/macos/Sources/PitchDeckDocumentStore.swift',
  'apps/macos/Sources/BridgeCoordinator.swift',
  'apps/macos/Sources/WorkspaceSchemeHandler.swift',
  'apps/linux/main.mjs',
  'packages/workspace/app/index.html',
  'packages/workspace/app/styles.css',
  'packages/workspace/app/workspace-core.js',
  'packages/workspace/app/workspace-plan.js',
  'packages/workspace/app/workspace-curate.js',
  'packages/workspace/app/workspace-visual.js',
  'packages/workspace/app/workspace-handoff.js',
  'packages/workspace/app/workspace.js',
  'packages/deck-kernel/src/deck-kernel.ts',
  'packages/bridge-contract/bridge.contract.json',
  'scripts/build-workspace.mjs',
  'scripts/build-macos.sh',
  'scripts/build-macos-icon.sh',
  'scripts/verify-packaged-macos.sh',
  'scripts/verify-story-tracer-output.mjs',
  'scripts/verify-workspace-type-assets.mjs',
  'scripts/linux/runtime-package.json',
  '.github/workflows/dw-g01-linux.yml',
  '.github/workflows/dw-t00-macos.yml',
  'THIRD_PARTY.md',
  'LICENSE',
]

const contents = new Map(await Promise.all(required.map(async (path) => [path, await readFile(path, 'utf8')])))
const packageJSON = JSON.parse(await readFile('package.json', 'utf8'))
const bridge = JSON.parse(contents.get('packages/bridge-contract/bridge.contract.json'))
const nativeSource = [...contents.entries()]
  .filter(([path]) => path.endsWith('.swift'))
  .map(([, value]) => value)
  .join('\n')
const workspaceHTML = contents.get('packages/workspace/app/index.html')
const workspaceStyles = contents.get('packages/workspace/app/styles.css')
const workspaceCore = contents.get('packages/workspace/app/workspace-core.js')
const workspacePlan = contents.get('packages/workspace/app/workspace-plan.js')
const workspaceCurate = contents.get('packages/workspace/app/workspace-curate.js')
const workspaceVisual = contents.get('packages/workspace/app/workspace-visual.js')
const workspaceBoot = contents.get('packages/workspace/app/workspace.js')
const workspaceAll = [workspaceCore, workspacePlan, workspaceCurate, workspaceVisual, contents.get('packages/workspace/app/workspace-handoff.js'), workspaceBoot].join('\n')
const kernel = contents.get('packages/deck-kernel/src/deck-kernel.ts')

await verifyWorkspaceTypeAssets({
  workspaceRoot: resolve('packages/workspace/app'),
  legalRoot: resolve('legal'),
  nativePhosphorPath: resolve('apps/macos/Resources/Fonts/Phosphor.ttf'),
})
verifyWorkspaceFontHostRoutes({
  styles: workspaceStyles,
  linuxSource: contents.get('apps/linux/main.mjs'),
  macSource: contents.get('apps/macos/Sources/WorkspaceSchemeHandler.swift'),
})

assert.deepEqual(packageJSON.dependencies, { electron: '44.0.0' })
assert.equal(packageJSON.version, '0.0.1')
assert.equal(JSON.parse(contents.get('scripts/linux/runtime-package.json')).version, packageJSON.version)
assert.equal(packageJSON.devDependencies, undefined)
assert.equal(
  packageJSON.scripts.generate,
  'node scripts/generate-bridge.mjs && node scripts/build-kernel.mjs && node scripts/build-workspace.mjs',
)
assert.match(contents.get('LICENSE'), /GNU AFFERO GENERAL PUBLIC LICENSE/)
assert.match(contents.get('apps/macos/Info.plist'), /<string>26\.0<\/string>/)
assert.match(contents.get('apps/macos/Info.plist'), /dog\.pitch\.deck/)
assert.match(contents.get('apps/macos/Info.plist'), /<key>CFBundleShortVersionString<\/key>\s*<string>0\.0\.1<\/string>/)
assert.match(contents.get('apps/macos/Info.plist'), /<key>CFBundleIconFile<\/key>\s*<string>DeckWorkbench\.icns<\/string>/)
assert.match(contents.get('scripts/build-macos-icon.sh'), /iconutil -c icns/)
assert.match(workspaceHTML, /connect-src 'none'/)
assert.match(workspaceHTML, /img-src 'self' pitchdog-asset:/)
assert.match(workspaceHTML, /object-src 'none'/)
assert.equal(workspaceHTML.match(/data-phase="(?:plan|curate|assemble|handoff)"/g)?.length, 4)
assert.match(workspaceHTML, /id="sequence-list"/)
assert.match(workspaceHTML, /id="plan-form"/)
assert.match(workspaceHTML, /id="artboard"/)
assert.match(workspaceHTML, /id="handoff-list"/)
assert.match(workspaceHTML, /id="media-focus-owner"/)
assert.match(workspaceHTML, /id="primary-tray"/)
assert.doesNotMatch(workspaceHTML, /type="file"/)
assert.doesNotMatch(nativeSource, /URLSession|NWConnection|Network\.framework/)
assert.doesNotMatch(nativeSource, /runShell|querySQL|openArbitraryURL|genericIPC/)
assert.equal(bridge.methods.length, 10)
assert.equal(new Set(bridge.methods.map((method) => method.name)).size, 10)
assert.match(contents.get('THIRD_PARTY.md'), /\| Electron \| 44\.0\.0 \|/)
assert.match(kernel, /'content\.remove'/)
assert.match(workspaceCore, /PLAN_BLOCK_ROLE = 'workbench-plan'/)
assert.match(workspaceCore, /PLAN_BLOCK_KEY = 'workbench\.plan\.v1'/)
assert.match(workspacePlan, /type: 'content\.add'/)
assert.match(workspacePlan, /type: 'content\.update'/)
assert.match(workspacePlan, /type: 'slide\.intent\.set'/)
assert.match(workspacePlan, /executeStructural\('section\.remove'/)
assert.match(workspaceVisual, /executeStructural\('designOption\.applyPattern'/)
assert.match(workspaceVisual, /executeStructural\('element\.frame\.update'/)
assert.match(workspaceVisual, /executeStructural\('element\.crop\.update'/)
assert.match(workspaceCurate, /name: 'media\.roots'/)
assert.match(workspaceCurate, /name: 'media\.assets'/)
assert.match(workspaceCurate, /executeCurateCommand\('curate\.projectJudgment\.set'/)
assert.match(workspaceCurate, /executeCurateCommand\('curate\.slideDecision\.set'/)
assert.match(workspaceCurate, /executeCurateCommand\('curate\.findMore\.set'/)
assert.match(workspaceCurate, /calculateCurateVirtualWindow/)
assert.doesNotMatch(workspaceAll, /createObjectURL|readAsDataURL|webkit\.messageHandlers/)
assert.match(workspaceBoot, /window\.deckWorkbench = Object\.freeze/)
assert.match(workspaceBoot, /exportFrame\(mode = 'native'\)/)
assert.match(workspaceBoot, /finishExport\(token\)/)
assert.match(contents.get('scripts/build-workspace.mjs'), /packages\/workspace\/app/)
assert.match(contents.get('scripts/build-workspace.mjs'), /build\/generated\/workspace/)
assert.match(contents.get('scripts/build-macos.sh'), /build\/generated\/workspace\/index\.html/)
assert.equal(await readlink('apps/macos/Resources/Workspace'), '../../../build/generated/workspace')

for (const workflowPath of ['.github/workflows/dw-g01-linux.yml', '.github/workflows/dw-t00-macos.yml']) {
  const workflow = contents.get(workflowPath)
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/)
  assert.equal(workflow.match(/ref: \$\{\{ env\.EXPECTED_SHA \}\}/g)?.length, 2)
  assert.equal(workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/g)?.length, 2)
  assert.match(workflow, /name: deck-workbench-[^\n]*\$\{\{ env\.EXPECTED_SHA \}\}/)
}

const mapperStart = workspaceCore.indexOf('function richText(value)')
const mapperEnd = workspaceCore.indexOf('\nfunction storyShortcut', mapperStart)
assert.ok(mapperStart >= 0 && mapperEnd > mapperStart)
const richText = Function(`"use strict"; ${workspaceCore.slice(mapperStart, mapperEnd)}; return richText`)()
assert.deepEqual(richText('First\r\n\rThird'), {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
    { type: 'paragraph', content: [] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
  ],
})

console.log('Source contract verification passed')
