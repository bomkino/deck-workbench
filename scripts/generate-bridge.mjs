import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const contractPath = resolve(root, 'packages/bridge-contract/bridge.contract.json')
const outputRoot = resolve(root, 'build/generated')
const contract = JSON.parse(await readFile(contractPath, 'utf8'))

if (contract.schemaVersion !== 1 || !Array.isArray(contract.methods)) {
  throw new Error('Unsupported bridge contract')
}

const names = new Set()
const javascriptNames = new Set()
for (const method of contract.methods) {
  if (!/^(deck|ui)\.[A-Za-z][A-Za-z0-9]*$/.test(method.name)) {
    throw new Error(`Invalid bridge method: ${method.name}`)
  }
  if (names.has(method.name) || javascriptNames.has(method.javascriptName)) {
    throw new Error(`Duplicate bridge method: ${method.name}`)
  }
  names.add(method.name)
  javascriptNames.add(method.javascriptName)
}

const swiftCases = contract.methods
  .map((method) => `    case ${method.swiftCase} = ${JSON.stringify(method.name)}`)
  .join('\n')

const swift = `// Generated from packages/bridge-contract/bridge.contract.json. Do not edit.
import Foundation

enum BridgeMethod: String, CaseIterable {
${swiftCases}
}

enum BridgeContract {
    static let schemaVersion = ${contract.schemaVersion}
    static let messageHandler = ${JSON.stringify(contract.handler)}
    static let methodNames = Set(BridgeMethod.allCases.map(\\.rawValue))
}
`

const methods = contract.methods
  .map(
    (method) =>
      `  ${JSON.stringify(method.javascriptName)}: (payload = {}) => invoke(${JSON.stringify(method.name)}, payload)`,
  )
  .join(',\n')

const javascript = `/* Generated from packages/bridge-contract/bridge.contract.json. Do not edit. */
(() => {
  const pending = new Map()

  function nextRequestId() {
    return globalThis.crypto?.randomUUID?.() ?? \`request-\${Date.now()}-\${Math.random()}\`
  }

  function invoke(method, payload) {
    const requestId = nextRequestId()
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      globalThis.webkit.messageHandlers.${contract.handler}.postMessage({ method, requestId, payload })
    })
  }

  const bridge = Object.freeze({
${methods}
  })

  globalThis.deckBridge = bridge
  globalThis.__deckBridgeReceive = (response) => {
    const request = pending.get(response.requestId)
    if (!request) return
    pending.delete(response.requestId)
    if (response.ok) request.resolve(response.result)
    else request.reject(Object.assign(new Error(response.error?.message ?? 'Bridge request failed'), response.error))
  }
})()
`

const declarations = `// Generated from packages/bridge-contract/bridge.contract.json. Do not edit.
export type BridgePayload = Readonly<Record<string, unknown>>
export interface DeckBridge {
${contract.methods.map((method) => `  ${method.javascriptName}(payload?: BridgePayload): Promise<unknown>`).join('\n')}
}
declare global { interface Window { deckBridge: DeckBridge } }
`

await mkdir(outputRoot, { recursive: true })
await Promise.all([
  writeFile(resolve(outputRoot, 'GeneratedBridge.swift'), swift, 'utf8'),
  writeFile(resolve(outputRoot, 'bridge.generated.js'), javascript, 'utf8'),
  writeFile(resolve(outputRoot, 'bridge.generated.d.ts'), declarations, 'utf8'),
])
