import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const contract = JSON.parse(
  await readFile(new URL('../packages/bridge-contract/bridge.contract.json', import.meta.url), 'utf8'),
)
const swift = await readFile(new URL('../build/generated/GeneratedBridge.swift', import.meta.url), 'utf8')
const javascript = await readFile(
  new URL('../build/generated/bridge.generated.js', import.meta.url),
  'utf8',
)

test('Swift host and workspace expose exactly the named bridge contract', () => {
  for (const method of contract.methods) {
    assert.match(swift, new RegExp(`case ${method.swiftCase} = ["']${method.name.replace('.', '\\.')}`))
    assert.match(
      javascript,
      new RegExp(`["']${method.javascriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']:`),
    )
    assert.match(javascript, new RegExp(method.name.replace('.', '\\.')))
  }
  assert.equal((swift.match(/^\s+case /gm) ?? []).length, contract.methods.length)
  assert.doesNotMatch(javascript, /readFile|writeFile|deletePath|runShell|querySQL|eval\(/)
})

test('contract contains no generic IPC method', () => {
  const names = contract.methods.map((method) => method.name)
  assert.equal(names.some((name) => /send|dispatch|ipc|filesystem|shell/i.test(name)), false)
  assert.equal(new Set(names).size, names.length)
})
