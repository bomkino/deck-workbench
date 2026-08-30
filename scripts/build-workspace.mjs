import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'packages/workspace/app')
const outputRoot = resolve(root, 'build/generated/workspace')
const sourceScriptNames = [
  'workspace-core.js',
  'workspace-plan.js',
  'workspace-curate.js',
  'workspace-visual.js',
  'workspace-handoff.js',
  'workspace.js',
]
const packagedScriptNames = [
  ...sourceScriptNames,
  'workspace-sequence-targets.js',
  'workspace-focus.js',
]
const fontFiles = Object.freeze([
  ['pd-head.woff2', 270176, '528dd6d9d5d79265f4e3589523a250cd652110d1380e87a0252bca9489da50e9'],
  ['pd-head-alt.woff2', 276308, 'bf4db03493580a52e3e01cb6aec2fe791da8e7293d6083e2c567c3bb3f0b927a'],
  ['pd-body-roman.woff2', 171820, '433a1b69a8e8a903478b978c198b879824541dc9eb62db959058ae37a250819f'],
  ['pd-body-italic.woff2', 218976, '6bd35c9ad364e585ca5667c1df74f892eebbe32237005ba926b54ffa61df8a78'],
  ['pd-body-alt-roman.woff2', 169540, '4ae6044273de9010d1a9660001319c34a4a8ece764279bb7f1e0f81f01dca85b'],
  ['pd-body-alt-italic.woff2', 179020, '9f59a7f058ba824e0b3e2760204c0c70b7cfb2f61956a460b730e486b1209285'],
  ['pd-eyebrow-site.woff2', 916908, '24aeaf1bfb45a874fe807c8138fc0d815b499b1834e8291c2dc46bb5fc32b7a3'],
])
const iconFiles = Object.freeze([
  ['Phosphor.woff2', 147380, 'c2ea45ea05ff5c7df1936770c104725f2a68f43fd343f35f3da23a30b27de32a'],
])

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

const outputFontRoot = resolve(outputRoot, 'fonts/v13')
await mkdir(outputFontRoot, { recursive: true })
for (const [name, expectedBytes, expectedSHA256] of fontFiles) {
  const bytes = await readFile(resolve(sourceRoot, 'fonts/v13', name))
  const actualSHA256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== expectedBytes || actualSHA256 !== expectedSHA256) {
    throw new Error(`Pinned pitch.dog v13 font identity mismatch: ${name}`)
  }
  await writeFile(resolve(outputFontRoot, name), bytes)
}

const outputIconRoot = resolve(outputRoot, 'icons/phosphor')
await mkdir(outputIconRoot, { recursive: true })
for (const [name, expectedBytes, expectedSHA256] of iconFiles) {
  const bytes = await readFile(resolve(sourceRoot, 'icons/phosphor', name))
  const actualSHA256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== expectedBytes || actualSHA256 !== expectedSHA256) {
    throw new Error(`Pinned Phosphor icon font identity mismatch: ${name}`)
  }
  await writeFile(resolve(outputIconRoot, name), bytes)
}

console.log(`Built shared Workbench workspace: ${outputRoot}`)
