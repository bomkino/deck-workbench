import { resolve } from 'node:path'
import { DocumentSessionActor } from './document-session-actor.mjs'
import { SerialOperationQueue } from './serial-operation-queue.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
await import(resolve(repositoryRoot, 'build/generated/deck-kernel.js'))

const kernel = globalThis.DeckKernel
if (!kernel) throw new Error('Generated Deck kernel did not expose DeckKernel')

const { DurableDeckSession } = await import(
  resolve(repositoryRoot, 'packages/document-store/index.mjs')
)

const operationQueue = new SerialOperationQueue()

function failure(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : 'KernelUnavailable',
    message: typeof error?.message === 'string' ? error.message : String(error),
  }
}

const documents = new DocumentSessionActor({ Session: DurableDeckSession, kernel })

async function dispatch(operation, payload) {
  switch (operation) {
    case 'health':
      return { ready: true, owner: 'electron-utility-process' }
    default:
      return documents.dispatch(operation, payload)
  }
}

process.parentPort.on('message', (event) => {
  const request = event?.data ?? event
  if (!request || typeof request.requestId !== 'string' || typeof request.operation !== 'string') return
  void operationQueue.run(async () => {
    try {
      const result = await dispatch(request.operation, request.payload ?? {})
      process.parentPort.postMessage({ requestId: request.requestId, ok: true, result })
    } catch (error) {
      process.parentPort.postMessage({ requestId: request.requestId, ok: false, error: failure(error) })
    }
  })
})
