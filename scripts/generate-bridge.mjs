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
  const queue = []
  const boundedMethods = new Set([
    'deck.execute', 'deck.query', 'deck.undo', 'deck.redo',
    'ui.setInterfaceScale', 'ui.setArtboardZoom', 'ui.getPreferences'
  ])
  const boundedTimeoutMs = Number.isFinite(globalThis.__DECK_BRIDGE_TIMEOUT_MS)
    ? Math.max(1, Number(globalThis.__DECK_BRIDGE_TIMEOUT_MS))
    : 10_000
  let activeRequestId = null
  let scheduledPump = null
  let fencedError = null

  function nextRequestId() {
    return globalThis.crypto?.randomUUID?.() ?? \`request-\${Date.now()}-\${Math.random()}\`
  }

  function requestLabel(method, payload) {
    if (method === 'deck.query') return \`deck.query:\${payload?.name ?? 'unknown'}\`
    if (method === 'deck.execute') return \`deck.execute:\${payload?.command?.type ?? 'unknown'}\`
    return method
  }

  function bridgeError(name, message) {
    return Object.assign(new Error(message), { name })
  }

  function clearPendingTimer(request) {
    if (request?.timeoutId !== null && request?.timeoutId !== undefined) {
      globalThis.clearTimeout(request.timeoutId)
    }
  }

  function fence(error) {
    if (fencedError) return
    fencedError = error
    if (scheduledPump !== null) {
      globalThis.clearTimeout(scheduledPump)
      scheduledPump = null
    }
    activeRequestId = null
    queue.length = 0
    for (const request of pending.values()) {
      clearPendingTimer(request)
      request.reject(error)
    }
    pending.clear()
  }

  function schedulePump() {
    if (fencedError || scheduledPump !== null || activeRequestId !== null || queue.length === 0) return
    scheduledPump = globalThis.setTimeout(() => {
      scheduledPump = null
      pump()
    }, 0)
  }

  function pump() {
    if (fencedError || activeRequestId !== null || queue.length === 0) return
    const request = queue.shift()
    activeRequestId = request.requestId
    try {
      globalThis.webkit.messageHandlers.${contract.handler}.postMessage(request)
    } catch (error) {
      const pendingRequest = pending.get(request.requestId)
      pending.delete(request.requestId)
      activeRequestId = null
      clearPendingTimer(pendingRequest)
      pendingRequest?.reject(error)
      schedulePump()
    }
  }

  function invoke(method, payload) {
    globalThis.deckWorkbench?.cancelScheduledRefresh?.()
    if (fencedError) return Promise.reject(fencedError)
    const requestId = nextRequestId()
    const label = requestLabel(method, payload)
    return new Promise((resolve, reject) => {
      const timeoutId = boundedMethods.has(method)
        ? globalThis.setTimeout(() => {
            if (!pending.has(requestId)) return
            fence(bridgeError('BridgeTimeout', \`Timed out waiting for \${label}\`))
          }, boundedTimeoutMs)
        : null
      pending.set(requestId, { resolve, reject, timeoutId, label })
      queue.push({ method, requestId, payload })
      schedulePump()
    })
  }

  const bridge = Object.freeze({
${methods}
  })

  globalThis.deckBridge = bridge
  globalThis.__deckBridgeReceive = (response) => {
    const request = pending.get(response.requestId)
    if (!request || fencedError) return
    pending.delete(response.requestId)
    clearPendingTimer(request)
    if (activeRequestId === response.requestId) activeRequestId = null
    if (response.ok) request.resolve(response.result)
    else request.reject(Object.assign(new Error(response.error?.message ?? 'Bridge request failed'), response.error))
    schedulePump()
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
