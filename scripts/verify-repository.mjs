import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${result.stdout}${result.stderr}`)
  }
  return result.stdout
}

const tracked = run('git', ['ls-files', '-z'], 'tracked-file listing')
  .split('\0')
  .filter(Boolean)

const forbiddenNames = new Set(['.DS_Store', 'Thumbs.db', '.env'])
const forbiddenRoots = ['artifacts/', 'build/', 'node_modules/']
for (const path of tracked) {
  assert.equal(
    forbiddenNames.has(path.split('/').at(-1)),
    false,
    `forbidden tracked file: ${path}`,
  )
  assert.equal(
    forbiddenRoots.some((root) => path.startsWith(root)),
    false,
    `generated output is tracked: ${path}`,
  )
}

for (const path of tracked.filter((candidate) => extname(candidate) === '.json')) {
  JSON.parse(await readFile(path, 'utf8'))
}

for (const path of tracked.filter((candidate) => /\.(?:mjs|cjs|js)$/.test(candidate))) {
  run(process.execPath, ['--check', path], `JavaScript syntax: ${path}`)
}

for (const path of tracked.filter((candidate) => candidate.endsWith('.sh'))) {
  run('bash', ['-n', path], `shell syntax: ${path}`)
}

const workflowNames = new Set()
for (const path of tracked.filter((candidate) => /^\.github\/workflows\/.*\.ya?ml$/.test(candidate))) {
  const source = await readFile(path, 'utf8')
  const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  assert.ok(name, `workflow has no name: ${path}`)
  assert.equal(workflowNames.has(name), false, `duplicate workflow name: ${name}`)
  workflowNames.add(name)
  assert.doesNotMatch(name, /^(?:Source snapshot|Workbench fix|Workbench publisher)/, `temporary workflow remains: ${path}`)

  for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
    const reference = match[1]
    if (reference.startsWith('./')) continue
    assert.match(
      reference,
      /^[^@]+@[a-f0-9]{40}$/,
      `action is not pinned to a full commit: ${path}: ${reference}`,
    )
  }
}

for (const path of tracked.filter((candidate) => candidate.endsWith('.md'))) {
  const source = await readFile(path, 'utf8')
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    target = target.split(/\s+['"]/)[0]
    if (!target || target.startsWith('#') || /^[a-z][a-z+.-]*:/i.test(target)) continue
    target = target.split('#')[0].split('?')[0]
    if (!target) continue

    const destination = resolve(dirname(path), decodeURIComponent(target))
    await stat(destination).catch(() => {
      throw new Error(`broken relative Markdown link: ${path} -> ${target}`)
    })
  }
}

const packageJSON = JSON.parse(await readFile('package.json', 'utf8'))
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
assert.equal(packageJSON.dependencies.electron, '44.0.0')
assert.equal(packageJSON.version, '0.0.6')
assert.equal(lock.version, packageJSON.version)
assert.equal(lock.packages[''].version, packageJSON.version)
assert.equal(lock.packages[''].dependencies.electron, packageJSON.dependencies.electron)
assert.equal(
  packageJSON.scripts.verify,
  'npm test && npm run verify:source && npm run verify:repository && npm run verify:phased-preview',
)
assert.match(await readFile('THIRD_PARTY.md', 'utf8'), /\| Electron \| 44\.0\.0 \|/)

const stagedEntries = run('git', ['ls-files', '--stage', '-z'], 'tracked modes')
  .split('\0')
  .filter(Boolean)
const modes = new Map()
for (const entry of stagedEntries) {
  const match = entry.match(/^(\d{6}) [a-f0-9]+ \d+\t([\s\S]+)$/)
  assert.ok(match, `could not parse tracked mode entry: ${entry}`)
  modes.set(match[2], match[1])
}
for (const path of tracked.filter((candidate) => candidate.endsWith('.sh'))) {
  assert.equal(modes.get(path), '100755', `shell script is not executable: ${path}`)
}

console.log(`Repository verification passed (${tracked.length} tracked files)`)
