import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const tests = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs') && (name.includes('kernel') || name === 'visual-core-kernel.test.mjs'))
  .map(name => `tests/${name}`)
const generated = spawnSync(process.execPath, ['scripts/build-kernel.mjs'], { stdio: 'inherit' })
if (generated.status !== 0) process.exit(generated.status ?? 1)
const tested = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' })
process.exit(tested.status ?? 1)
