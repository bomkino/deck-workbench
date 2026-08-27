import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { UtilityKernelClient } from '../apps/linux/utility-client.mjs'

class FakeChild extends EventEmitter {
  constructor({ postError = null } = {}) {
    super()
    this.postError = postError
    this.messages = []
    this.killCount = 0
  }

  postMessage(message) {
    if (this.postError) throw this.postError
    this.messages.push(message)
  }

  kill() {
    this.killCount += 1
  }
}

test('utility exit rejects pending work and every later request immediately', { timeout: 1000 }, async () => {
  const child = new FakeChild()
  const client = new UtilityKernelClient(child)
  const pending = client.request('document.query')
  child.emit('exit', 9, null)
  await assert.rejects(pending, (error) => error.name === 'KernelUnavailable' && /code 9/.test(error.message))
  await assert.rejects(client.request('health'), (error) => error.name === 'KernelUnavailable')
})

test('utility error rejects pending work and fences later requests', { timeout: 1000 }, async () => {
  const child = new FakeChild()
  const client = new UtilityKernelClient(child)
  const pending = client.request('document.query')
  child.emit('error', new Error('pipe broke'))
  await assert.rejects(pending, (error) => error.name === 'KernelUnavailable' && /pipe broke/.test(error.message))
  await assert.rejects(client.ready(), (error) => error.name === 'KernelUnavailable')
})

test('synchronous postMessage failure cannot strand a pending promise', { timeout: 1000 }, async () => {
  const child = new FakeChild({ postError: new Error('already closed') })
  const client = new UtilityKernelClient(child)
  await assert.rejects(
    client.request('document.save'),
    (error) => error.name === 'KernelUnavailable' && /already closed/.test(error.message),
  )
  await assert.rejects(client.request('health'), (error) => error.name === 'KernelUnavailable')
})

test('successful utility responses settle exactly the matching request', async () => {
  const child = new FakeChild()
  const client = new UtilityKernelClient(child)
  const pending = client.request('health')
  const [{ requestId }] = child.messages
  child.emit('message', { data: { requestId, ok: true, result: { owner: 'test' } } })
  assert.deepEqual(await pending, { owner: 'test' })
})

test('typed utility failures preserve their name and message', async () => {
  const child = new FakeChild()
  const client = new UtilityKernelClient(child)
  const pending = client.request('document.open')
  const [{ requestId }] = child.messages
  child.emit('message', {
    data: {
      requestId,
      ok: false,
      error: { name: 'JournalCorruption', message: 'bad chain' },
    },
  })
  await assert.rejects(pending, (error) => error.name === 'JournalCorruption' && error.message === 'bad chain')
})

test('shutdown is idempotent and rejects in-flight work before killing the child', async () => {
  const child = new FakeChild()
  const client = new UtilityKernelClient(child)
  const pending = client.request('document.save')
  client.shutdown()
  client.shutdown()
  await assert.rejects(pending, (error) => error.name === 'KernelUnavailable')
  assert.equal(child.killCount, 1)
})
