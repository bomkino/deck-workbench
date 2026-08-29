import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/bridge.generated.js', import.meta.url), 'utf8')

function bridgeHarness({ failFirstPost = false, timeoutMs = 10_000 } = {}) {
  const posted = []
  let shouldFail = failFirstPost
  let cancelledRefreshes = 0
  const context = {
    __DECK_BRIDGE_TIMEOUT_MS: timeoutMs,
    crypto: { randomUUID: (() => { let index = 0; return () => `request-${++index}` })() },
    Error,
    Map,
    Promise,
    Set,
    Number,
    console,
    setTimeout,
    clearTimeout,
    deckWorkbench: {
      cancelScheduledRefresh() {
        cancelledRefreshes += 1
      },
    },
    webkit: {
      messageHandlers: {
        deckWorkbench: {
          postMessage(message) {
            if (shouldFail) {
              shouldFail = false
              throw new Error('post failed')
            }
            posted.push(structuredClone(message))
          },
        },
      },
    },
  }
  context.globalThis = context
  vm.runInNewContext(source, context)
  return { context, posted, cancelledRefreshes: () => cancelledRefreshes }
}

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0))

test('generated macOS bridge cancels stale hydration and admits one request at a time without response re-entry', async () => {
  const { context, posted, cancelledRefreshes } = bridgeHarness()
  const first = context.deckBridge.query({ name: 'story.document', params: {} })
  const second = context.deckBridge.execute({ command: { type: 'content.update' } })
  const third = context.deckBridge.undo()

  assert.equal(cancelledRefreshes(), 3)
  assert.deepEqual(posted.map((request) => request.method), ['deck.query'])

  context.__deckBridgeReceive({ requestId: posted[0].requestId, ok: true, result: { revision: 1 } })
  assert.deepEqual(posted.map((request) => request.method), ['deck.query'])
  assert.deepEqual(await first, { revision: 1 })
  await nextTurn()
  assert.deepEqual(posted.map((request) => request.method), ['deck.query', 'deck.execute'])

  context.__deckBridgeReceive({ requestId: posted[1].requestId, ok: true, result: { revision: 2 } })
  assert.deepEqual(posted.map((request) => request.method), ['deck.query', 'deck.execute'])
  assert.deepEqual(await second, { revision: 2 })
  await nextTurn()
  assert.deepEqual(posted.map((request) => request.method), ['deck.query', 'deck.execute', 'deck.undo'])

  context.__deckBridgeReceive({ requestId: posted[2].requestId, ok: true, result: { revision: 3 } })
  assert.deepEqual(await third, { revision: 3 })
})

test('a synchronous post failure rejects that request and continues the queue', async () => {
  const { context, posted } = bridgeHarness({ failFirstPost: true })
  const failed = context.deckBridge.query({ name: 'story.document', params: {} })
  const next = context.deckBridge.undo()

  await assert.rejects(failed, /post failed/)
  assert.deepEqual(posted.map((request) => request.method), ['deck.undo'])
  context.__deckBridgeReceive({ requestId: posted[0].requestId, ok: true, result: { revision: 1 } })
  assert.deepEqual(await next, { revision: 1 })
})

test('a bounded request timeout identifies the exact seam and fences pending and future work', async () => {
  const { context, posted } = bridgeHarness({ timeoutMs: 5 })
  const active = context.deckBridge.query({ name: 'story.document', params: {} })
  const queued = context.deckBridge.execute({ command: { type: 'content.update' } })
  const results = await Promise.allSettled([active, queued])

  assert.deepEqual(posted.map((request) => request.method), ['deck.query'])
  for (const result of results) {
    assert.equal(result.status, 'rejected')
    assert.equal(result.reason.name, 'BridgeTimeout')
    assert.match(result.reason.message, /deck\.query:story\.document/)
  }
  await assert.rejects(
    context.deckBridge.redo(),
    (error) => error.name === 'BridgeTimeout' && /deck\.query:story\.document/.test(error.message),
  )
})
