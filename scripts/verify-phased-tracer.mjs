import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'artifacts/phased-workbench-preview')

await execFileAsync(process.execPath, [resolve(root, 'scripts/build-phased-tracer.mjs')], { cwd: root })

const bootstrap = await readFile(resolve(output, 'bootstrap.mjs'), 'utf8')
assert.match(bootstrap, /from '\.\/workflow-model\.mjs'/)
assert.doesNotMatch(bootstrap, /\.\.\/\.\.\/packages\/workflow-model/)

for (const file of await walk(output)) {
  if (!['.js', '.mjs'].includes(extname(file))) continue
  await execFileAsync(process.execPath, ['--check', file])
}

const port = 8139
const server = spawn(process.execPath, ['serve.mjs'], {
  cwd: output,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitFor(`http://127.0.0.1:${port}/`)
  for (const path of [
    '/',
    '/bootstrap.mjs',
    '/workflow-model.mjs',
    '/fixture.mjs',
    '/fragments/plan.html',
    '/fragments/curate.html',
    '/fragments/assemble.html',
    '/fragments/handoff.html',
    '/styles/base.css',
    '/styles/assemble.css',
    '/preview-manifest.json',
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    assert.equal(response.status, 200, `${path} should be served from the standalone preview`)
  }
} finally {
  server.kill('SIGTERM')
}

console.log('Self-contained phased preview verified')

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

async function waitFor(url) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
  }
  throw new Error(`Preview server did not become ready: ${url}`)
}
