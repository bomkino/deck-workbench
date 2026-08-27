import { randomUUID } from 'node:crypto'

export class UtilityKernelClient {
  #child
  #pending = new Map()

  constructor(child) {
    this.#child = child
    child.on('message', (response) => this.#receive(response?.data ?? response))
    child.on('exit', (code) => {
      this.#rejectAll(Object.assign(new Error(`Deck kernel utility exited (${String(code)})`), {
        name: 'KernelUnavailable',
      }))
    })
  }

  async ready() {
    return this.request('health')
  }

  request(operation, payload = {}) {
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject })
      this.#child.postMessage({ requestId, operation, payload })
    })
  }

  shutdown() {
    this.#rejectAll(Object.assign(new Error('Deck kernel utility stopped'), { name: 'KernelUnavailable' }))
    this.#child.kill()
  }

  #receive(response) {
    const pending = this.#pending.get(response?.requestId)
    if (!pending) return
    this.#pending.delete(response.requestId)
    if (response.ok) {
      pending.resolve(response.result)
      return
    }
    pending.reject(Object.assign(new Error(response.error?.message ?? 'Deck kernel request failed'), {
      name: response.error?.name ?? 'KernelUnavailable',
    }))
  }

  #rejectAll(error) {
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
}
