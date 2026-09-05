import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'packages/deck-kernel/src/deck-kernel.ts')
const outputPath = resolve(root, 'build/generated/deck-kernel.js')
const source = (await readFile(sourcePath, 'utf8')) + '\n' + (await readFile(resolve(root, 'packages/deck-kernel/src/native-kernel.ts'), 'utf8'))
const javascript = stripTypeScriptTypes(source, { mode: 'strip' })

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  `/* Generated from packages/deck-kernel/src/deck-kernel.ts. Do not edit. */\n${javascript}`,
  'utf8',
)
