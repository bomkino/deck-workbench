import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const contractPath = resolve(repositoryRoot, 'packages/bridge-contract/bridge.contract.json')

function assertBridgeContract(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.methods)) {
    throw new Error('Unsupported bridge contract')
  }

  const names = new Set()
  const javascriptNames = new Set()
  for (const method of value.methods) {
    if (!/^(deck|ui)\.[A-Za-z][A-Za-z0-9]*$/.test(method?.name ?? '')) {
      throw new Error(`Invalid bridge method: ${String(method?.name)}`)
    }
    if (!/^[a-z][A-Za-z0-9]*$/.test(method?.javascriptName ?? '')) {
      throw new Error(`Invalid JavaScript bridge name: ${String(method?.javascriptName)}`)
    }
    if (names.has(method.name) || javascriptNames.has(method.javascriptName)) {
      throw new Error(`Duplicate bridge method: ${method.name}`)
    }
    names.add(method.name)
    javascriptNames.add(method.javascriptName)
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    methods: Object.freeze(value.methods.map((method) => Object.freeze({ ...method }))),
  })
}

export async function readBridgeContract() {
  return assertBridgeContract(JSON.parse(await readFile(contractPath, 'utf8')))
}

export function bridgeChannel(methodName) {
  return `deck-workbench:${methodName}`
}
