import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'packages/workspace/app')
const outputRoot = resolve(root, 'build/generated/workspace')
const sourceScriptNames = [
  'workspace-core.js',
  'workspace-plan.js',
  'workspace-visual.js',
  'workspace-handoff.js',
  'workspace.js',
]
const packagedScriptNames = [
  ...sourceScriptNames,
  'workspace-sequence-targets.js',
  'workspace-focus.js',
]

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const sourceIndex = await readFile(resolve(sourceRoot, 'index.html'), 'utf8')
const scriptBlock = sourceScriptNames
  .map((name) => `    <script src="${name}" defer></script>`)
  .join('\n')
if (!sourceIndex.includes(scriptBlock)) {
  throw new Error('Shared workspace script block is missing or out of order')
}
const packagedIndex = sourceIndex.replace(scriptBlock, '    <script src="workspace.js" defer></script>')
await writeFile(resolve(outputRoot, 'index.html'), packagedIndex)

const scripts = await Promise.all(packagedScriptNames.map(async (name) => {
  const source = await readFile(resolve(sourceRoot, name), 'utf8')
  return `/* ${name} */\n${source.trim()}\n`
}))
await writeFile(
  resolve(outputRoot, 'workspace.js'),
  `/* Generated from packages/workspace/app. Do not edit. */\n${scripts.join('\n')}`,
)

const styles = await readFile(resolve(sourceRoot, 'styles.css'), 'utf8')
const hardening = await readFile(resolve(sourceRoot, 'packaged-hardening.css'), 'utf8')
await writeFile(resolve(outputRoot, 'styles.css'), `${styles.trim()}\n\n/* Packaged host hardening */\n${hardening.trim()}\n`)
await writeFile(resolve(outputRoot, 'workbench-mark.svg'), await readFile(resolve(sourceRoot, 'workbench-mark.svg')))

console.log(`Built shared Workbench workspace: ${outputRoot}`)
