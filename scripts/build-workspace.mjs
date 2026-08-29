import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'packages/workspace/app')
const outputRoot = resolve(root, 'build/generated/workspace')
const scriptNames = [
  'workspace-core.js',
  'workspace-plan.js',
  'workspace-visual.js',
  'workspace-handoff.js',
  'workspace.js',
]

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const sourceIndex = await readFile(resolve(sourceRoot, 'index.html'), 'utf8')
const scriptBlock = scriptNames
  .map((name) => `    <script src="${name}" defer></script>`)
  .join('\n')
if (!sourceIndex.includes(scriptBlock)) {
  throw new Error('Shared workspace script block is missing or out of order')
}
const packagedIndex = sourceIndex.replace(scriptBlock, '    <script src="workspace.js" defer></script>')
await writeFile(resolve(outputRoot, 'index.html'), packagedIndex)

const scripts = await Promise.all(scriptNames.map(async (name) => {
  const source = await readFile(resolve(sourceRoot, name), 'utf8')
  return `/* ${name} */\n${source.trim()}\n`
}))
await writeFile(
  resolve(outputRoot, 'workspace.js'),
  `/* Generated from packages/workspace/app. Do not edit. */\n${scripts.join('\n')}`,
)

for (const name of ['styles.css', 'workbench-mark.svg']) {
  await writeFile(resolve(outputRoot, name), await readFile(resolve(sourceRoot, name)))
}

console.log(`Built shared Workbench workspace: ${outputRoot}`)
