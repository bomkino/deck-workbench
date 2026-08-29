import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../build/generated/bridge.generated.js', import.meta.url), 'utf8')

function bridgeHarness({ failFirstPost = false } = {}) {
  const posted = []
  let shouldFail = failFirstPost
  const context = {
    crypto: { randomUUID: (() => { let index = 0; return () => `request-${++index}` })() },
    Error,
    Map,
    Promise,
    console,
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
  return { context, posted }
}

test('generated macOS bridge posts typed requests immediately and settles matching responses', async () => {
  const { context, posted } = bridgeHarness()
  const first = context.deckBridge.query({ name: 'story.document', params: {} })
  const second = context.deckBridge.execute({ command: { type: 'content.update' } })
  const third = context.deckBridge.undo()

  assert.deepEqual(posted.map((request) => request.method), ['deck.query', 'deck.execute', 'deck.undo'])

  context.__deckBridgeReceive({ requestId: posted[1].requestId, ok: true, result: { revision: 2 } })
  context.__deckBridgeReceive({ requestId: posted[0].requestId, ok: true, result: { revision: 1 } })
  context.__deckBridgeReceive({ requestId: posted[2].requestId, ok: true, result: { revision: 3 } })

  assert.deepEqual(await first, { revision: 1 })
  assert.deepEqual(await second, { revision: 2 })
  assert.deepEqual(await third, { revision: 3 })
})

test('a synchronous post failure rejects only that request and cannot strand later work', async () => {
  const { context, posted } = bridgeHarness({ failFirstPost: true })
  const failed = context.deckBridge.query({ name: 'story.document', params: {} })
  const next = context.deckBridge.undo()

  await assert.rejects(failed, /post failed/)
  assert.deepEqual(posted.map((request) => request.method), ['deck.undo'])
  context.__deckBridgeReceive({ requestId: posted[0].requestId, ok: true, result: { revision: 1 } })
  assert.deepEqual(await next, { revision: 1 })
})

test('typed bridge failures preserve their name and message', async () => {
  const { context, posted } = bridgeHarness()
  const request = context.deckBridge.redo()
  context.__deckBridgeReceive({
    requestId: posted[0].requestId,
    ok: false,
    error: { name: 'HistoryUnavailable', message: 'Nothing to redo' },
  })
  await assert.rejects(
    request,
    (error) => error.name === 'HistoryUnavailable' && error.message === 'Nothing to redo',
  )
})
