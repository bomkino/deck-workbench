import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

const FORMAT = 'pitchdog.workbench-media-grants'
const SCHEMA_VERSION = 1

function failure(name, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { name })
}

function key(deckId, rootId) {
  return `${deckId}\u0000${rootId}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function validateRecord(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || typeof value.deckId !== 'string'
    || typeof value.rootId !== 'string'
    || typeof value.authorizedPath !== 'string'
    || !isAbsolute(value.authorizedPath)
    || typeof value.rootDevice !== 'string'
    || typeof value.rootInode !== 'string'
    || !value.fileIdentities
    || typeof value.fileIdentities !== 'object'
    || Array.isArray(value.fileIdentities)
  ) {
    throw failure('InvalidMediaGrantStore', 'A stored media Root grant is invalid')
  }
  return {
    deckId: value.deckId,
    rootId: value.rootId,
    authorizedPath: resolve(value.authorizedPath),
    rootDevice: value.rootDevice,
    rootInode: value.rootInode,
    fileIdentities: Object.fromEntries(Object.entries(value.fileIdentities).flatMap(([assetId, identity]) => {
      if (
        typeof assetId !== 'string'
        || !identity
        || typeof identity !== 'object'
        || typeof identity.device !== 'string'
        || typeof identity.inode !== 'string'
      ) return []
      return [[assetId, { device: identity.device, inode: identity.inode }]]
    })),
  }
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeAtomically(path, bytes) {
  const parent = dirname(path)
  const temporary = `${path}.tmp-${randomUUID()}`
  await mkdir(parent, { recursive: true })
  let handle
  try {
    handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    )
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, path)
    await syncDirectory(parent)
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw failure('MediaGrantWriteFailure', 'Media Root authorization could not be saved', error)
  }
}

export class MediaGrantStore {
  static async open(path) {
    const store = new MediaGrantStore(path)
    await store.#load()
    return store
  }

  #path
  #records = new Map()

  constructor(path) {
    this.#path = resolve(path)
  }

  get(deckId, rootId) {
    const value = this.#records.get(key(deckId, rootId))
    return value ? clone(value) : null
  }

  list(deckId) {
    return [...this.#records.values()]
      .filter((record) => record.deckId === deckId)
      .map(clone)
  }

  async set(record) {
    const validated = validateRecord(record)
    const recordKey = key(validated.deckId, validated.rootId)
    const previous = this.#records.get(recordKey)
    this.#records.set(recordKey, validated)
    try {
      await this.#persist()
    } catch (error) {
      if (previous) this.#records.set(recordKey, previous)
      else this.#records.delete(recordKey)
      throw error
    }
    return clone(validated)
  }

  async release(deckId, rootId) {
    const recordKey = key(deckId, rootId)
    const previous = this.#records.get(recordKey)
    if (!previous) return false
    this.#records.delete(recordKey)
    try {
      await this.#persist()
    } catch (error) {
      this.#records.set(recordKey, previous)
      throw error
    }
    return true
  }

  async #load() {
    let source
    try {
      source = await readFile(this.#path, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw failure('InvalidMediaGrantStore', 'Media Root authorization store could not be read', error)
    }
    try {
      const value = JSON.parse(source)
      if (value?.format !== FORMAT || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.records)) {
        throw new Error('unsupported media grant store')
      }
      for (const candidate of value.records) {
        const record = validateRecord(candidate)
        this.#records.set(key(record.deckId, record.rootId), record)
      }
    } catch (error) {
      const quarantine = `${this.#path}.invalid-${randomUUID()}`
      await rename(this.#path, quarantine).catch(() => {})
      this.#records.clear()
      throw failure(
        'InvalidMediaGrantStore',
        'Media Root authorization store was invalid and has been moved aside',
        error,
      )
    }
  }

  async #persist() {
    const value = {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      records: [...this.#records.values()].sort((left, right) =>
        left.deckId.localeCompare(right.deckId) || left.rootId.localeCompare(right.rootId)),
    }
    await writeAtomically(this.#path, `${JSON.stringify(value, null, 2)}\n`)
  }
}

export const mediaGrantContract = Object.freeze({ format: FORMAT, schemaVersion: SCHEMA_VERSION })
