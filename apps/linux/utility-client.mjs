import { randomUUID } from 'node:crypto'

function kernelUnavailable(message, cause = undefined) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    name: 'KernelUnavailable',
  })
}

export class UtilityKernelClient {
  #child
  #pending = new Map()
  #stoppedError = null

  constructor(child) {
    this.#child = child
    child.on('message', (response) => this.#receive(response?.data ?? response))
    child.once('error', (error) => {
      this.#stop(kernelUnavailable(`Deck kernel utility failed: ${error.message}`, error))
    })
    child.once('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${String(code)}`
      this.#stop(kernelUnavailable(`Deck kernel utility exited (${detail})`))
    })
  }

  async ready() {
    return this.request('health')
  }

  request(operation, payload = {}) {
    if (this.#stoppedError) return Promise.reject(this.#stoppedError)
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject })
      try {
        this.#child.postMessage({ requestId, operation, payload })
      } catch (error) {
        this.#stop(kernelUnavailable(`Deck kernel request could not be sent: ${error.message}`, error))
      }
    })
  }

  shutdown() {
    if (this.#stoppedError) return
    this.#stop(kernelUnavailable('Deck kernel utility stopped'))
    try {
      this.#child.kill()
    } catch {
      // The child may already have terminated between the state check and kill.
    }
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

  #stop(error) {
    if (this.#stoppedError) return
    this.#stoppedError = error
    this.#rejectAll(error)
  }

  #rejectAll(error) {
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
}
