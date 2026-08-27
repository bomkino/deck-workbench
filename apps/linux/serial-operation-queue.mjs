export class SerialOperationQueue {
  #tail = Promise.resolve()

  run(operation) {
    const result = this.#tail.then(operation)
    this.#tail = result.catch(() => {})
    return result
  }
}
