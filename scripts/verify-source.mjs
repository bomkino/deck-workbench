import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const required = [
  'apps/macos/Info.plist',
  'apps/macos/Sources/DeckWorkbenchApp.swift',
  'apps/macos/Sources/DeckKernelHost.swift',
  'apps/macos/Sources/PitchDeckDocumentStore.swift',
  'apps/macos/Sources/BridgeCoordinator.swift',
  'apps/macos/Resources/Workspace/index.html',
  'apps/macos/Resources/Workspace/workspace.js',
  'packages/deck-kernel/src/deck-kernel.ts',
  'packages/bridge-contract/bridge.contract.json',
  'scripts/build-macos.sh',
  'scripts/verify-packaged-macos.sh',
  'scripts/verify-story-tracer-output.mjs',
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
const workspace = contents.get('apps/macos/Resources/Workspace/index.html')
const workspaceJavaScript = contents.get('apps/macos/Resources/Workspace/workspace.js')
const kernel = contents.get('packages/deck-kernel/src/deck-kernel.ts')

assert.equal(packageJSON.dependencies, undefined)
assert.equal(packageJSON.devDependencies, undefined)
assert.match(contents.get('LICENSE'), /GNU AFFERO GENERAL PUBLIC LICENSE/)
assert.match(contents.get('apps/macos/Info.plist'), /<string>26\.0<\/string>/)
assert.match(contents.get('apps/macos/Info.plist'), /dog\.pitch\.deck/)
assert.match(workspace, /connect-src 'none'/)
assert.match(workspace, /object-src 'none'/)
assert.doesNotMatch(nativeSource, /URLSession|NWConnection|Network\.framework/)
assert.doesNotMatch(nativeSource, /runShell|querySQL|openArbitraryURL|genericIPC/)
assert.equal(bridge.methods.length, 10)
assert.equal(new Set(bridge.methods.map((method) => method.name)).size, 10)
assert.match(kernel, /'content\.remove'/)
assert.match(workspaceJavaScript, /executeStructural\('content\.remove'/)
assert.doesNotMatch(workspaceJavaScript, /section\.remove|slide\.remove/)

console.log('Source contract verification passed')
