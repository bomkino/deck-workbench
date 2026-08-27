import { resolve } from 'node:path'

function unavailable() {
  return Object.assign(new Error('No Deck document is open'), { name: 'DocumentUnavailable' })
}

export class DocumentSessionActor {
  #Session
  #kernel
  #session = null

  constructor({ Session, kernel }) {
    this.#Session = Session
    this.#kernel = kernel
  }

  async dispatch(operation, payload = {}) {
    switch (operation) {
      case 'document.create':
        return this.#replaceWith(async () => this.#Session.create({
          packagePath: payload.packagePath,
          kernel: this.#kernel,
          seed: payload.seed,
        }))
      case 'document.open':
        if (
          this.#session
          && resolve(this.#session.packagePath) === resolve(payload.packagePath)
        ) {
          return this.#session.query('slide.activeProjection')
        }
        return this.#replaceWith(async () => this.#Session.open({
          packagePath: payload.packagePath,
          kernel: this.#kernel,
        }))
      case 'document.query':
        return this.#required().query(payload.name, payload.params ?? {})
      case 'document.execute':
        return this.#required().execute(payload.command)
      case 'document.undo':
        return this.#required().undo()
      case 'document.redo':
        return this.#required().redo()
      case 'document.save':
        await this.#required().save()
        return { revision: this.#session.revision }
      case 'document.close':
        if (!this.#session) return { closed: false }
        await this.#session.close()
        this.#session = null
        return { closed: true }
      default:
        throw Object.assign(new Error(`Unknown utility operation: ${operation}`), { name: 'InvalidCommand' })
    }
  }

  #required() {
    if (!this.#session) throw unavailable()
    return this.#session
  }

  async #replaceWith(openStaged) {
    // Opening/replay must finish before the current writer is disturbed. A failed
    // target therefore cannot clear the currently projected Deck or its history.
    const staged = await openStaged()
    try {
      await this.#session?.close()
    } catch (error) {
      await staged.close({ save: false }).catch(() => {})
      throw error
    }
    this.#session = staged
    return staged.query('slide.activeProjection')
  }
}
