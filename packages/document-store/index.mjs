import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
} from 'node:fs'
import {
  mkdir,
  lstat,
  open as openFile,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'

const PACKAGE_FORMAT = 'pitchdog.deck-package'
const CHECKPOINT_FORMAT = 'pitchdog.deck-checkpoint'
const SCHEMA_VERSION = 1
const ZERO_HASH = '0'.repeat(64)
const WRITER_LOCK_FILE = '.deck-workbench-writer.lock'
const WRITER_LOCK_FORMAT = 'pitchdog.deck-writer-lock'
const heldWriterLocks = new Map()
let installedExitCleanup = false

export class WorkbenchFailure extends Error {
  constructor(name, message, options) {
    super(message, options)
    this.name = name
  }
}

function failure(name, message, cause) {
  return new WorkbenchFailure(name, message, cause ? { cause } : undefined)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
}

export function canonicalJSON(value) {
  return Buffer.from(JSON.stringify(sorted(value)), 'utf8')
}

function prettyJSON(value) {
  return Buffer.from(JSON.stringify(sorted(value), null, 2), 'utf8')
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function iso8601(now) {
  return (now instanceof Date ? now : new Date(now)).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function requiredObject(value, description) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('UnsupportedSchema', `${description} is invalid or unsupported`)
  }
  return value
}

function checkpointMetadata(checkpointBytes) {
  let checkpoint
  try {
    checkpoint = requiredObject(JSON.parse(checkpointBytes.toString('utf8')), 'Checkpoint schema')
  } catch (error) {
    if (error instanceof WorkbenchFailure) throw error
    throw failure('UnsupportedSchema', 'Checkpoint schema is invalid or unsupported', error)
  }

  const deck = checkpoint.deck
  const canvas = deck?.canvasPreset
  if (
    checkpoint.format !== CHECKPOINT_FORMAT
    || checkpoint.schemaVersion !== SCHEMA_VERSION
    || !Number.isSafeInteger(checkpoint.revision)
    || checkpoint.revision < 0
    || !deck
    || typeof deck.deckId !== 'string'
    || deck.deckId.length === 0
    || typeof deck.title !== 'string'
    || !canvas
    || typeof canvas.id !== 'string'
    || canvas.id.length === 0
  ) {
    throw failure('UnsupportedSchema', 'Checkpoint schema is invalid or unsupported')
  }

  return {
    deckId: deck.deckId,
    title: deck.title,
    revision: checkpoint.revision,
    canvasPreset: canvas.id,
  }
}

function validateManifest(value) {
  const manifest = requiredObject(value, 'manifest.json')
  if (manifest.format !== PACKAGE_FORMAT || manifest.schemaVersion !== SCHEMA_VERSION) {
    throw failure('UnsupportedSchema', 'Only .pitchdeck package schema 1 is supported')
  }
  if (
    typeof manifest.deckId !== 'string'
    || typeof manifest.title !== 'string'
    || typeof manifest.createdAt !== 'string'
    || typeof manifest.updatedAt !== 'string'
    || !Number.isSafeInteger(manifest.checkpointRevision)
    || manifest.checkpointRevision < 0
    || !/^[a-f0-9]{64}$/.test(manifest.checkpointHash)
    || !/^[a-f0-9]{64}$/.test(manifest.journalHeadHash)
    || typeof manifest.canvasPreset !== 'string'
  ) {
    throw failure('UnsupportedSchema', 'manifest.json is invalid or unsupported')
  }
  return clone(manifest)
}

function isContained(root, candidate) {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}

async function safePackageRoot(packagePath) {
  try {
    const entry = await lstat(packagePath)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('not a real directory')
    return await realpath(packagePath)
  } catch (error) {
    throw failure('MissingAttachment', 'Selected .pitchdeck package does not exist', error)
  }
}

async function assertSafeDirectory(path, root) {
  let entry
  let resolved
  try {
    entry = await lstat(path)
    resolved = await realpath(path)
  } catch (error) {
    throw failure('JournalCorruption', `Package directory is missing or unsafe: ${basename(path)}`, error)
  }
  if (entry.isSymbolicLink() || !entry.isDirectory() || !isContained(root, resolved)) {
    throw failure('JournalCorruption', `Package directory is not a contained real directory: ${basename(path)}`)
  }
  return resolved
}

async function assertRegularEntry(path, root) {
  let entry
  let resolved
  try {
    entry = await lstat(path)
    resolved = await realpath(path)
  } catch (error) {
    throw failure('MissingAttachment', `Missing required package entry: ${basename(path)}`, error)
  }
  if (entry.isSymbolicLink() || !entry.isFile() || !isContained(root, resolved)) {
    throw failure('JournalCorruption', `Package entry is not a contained regular file: ${basename(path)}`)
  }
}

async function readRequired(path, root) {
  let handle
  try {
    if (root) await assertRegularEntry(path, root)
    handle = await openFile(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const entry = await handle.stat()
    if (!entry.isFile()) throw new Error('not a regular file')
    return await handle.readFile()
  } catch (error) {
    if (error instanceof WorkbenchFailure) throw error
    throw failure('MissingAttachment', `Missing required package entry: ${basename(path)}`, error)
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function syncDirectory(path) {
  let handle
  try {
    handle = await openFile(path, constants.O_RDONLY)
    await handle.sync()
  } finally {
    await handle?.close()
  }
}

async function writeDurable(data, destination, root) {
  const parent = dirname(destination)
  await mkdir(parent, { recursive: true })
  if (root) {
    await assertSafeDirectory(parent, root)
    try {
      await assertRegularEntry(destination, root)
    } catch (error) {
      if (error.name !== 'MissingAttachment') throw error
    }
  }
  const temporary = join(parent, `.${basename(destination)}.tmp-${randomUUID()}`)
  let handle
  try {
    handle = await openFile(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    )
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, destination)
    await syncDirectory(parent)
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function writerLockPayload(ownerToken, now) {
  return {
    format: WRITER_LOCK_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    ownerToken,
    processId: process.pid,
    createdAt: iso8601(now),
  }
}

function installExitCleanup() {
  if (installedExitCleanup) return
  installedExitCleanup = true
  process.once('exit', () => {
    for (const lock of heldWriterLocks.values()) {
      try {
        const entry = lstatSync(lock.path)
        if (entry.isSymbolicLink() || !entry.isFile()) continue
        const payload = JSON.parse(readFileSync(lock.path, 'utf8'))
        if (payload.ownerToken !== lock.ownerToken) continue
        unlinkSync(lock.path)
        const directory = openSync(lock.packageRoot, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try { fsyncSync(directory) } finally { closeSync(directory) }
      } catch {
        // A crash or forced termination deliberately leaves a visible stale lock.
      }
    }
  })
}

function registerWriterLock(packageRoot, ownerToken) {
  const path = join(packageRoot, WRITER_LOCK_FILE)
  heldWriterLocks.set(path, { path, packageRoot, ownerToken })
  installExitCleanup()
}

async function createWriterLockEntry(packageRoot, ownerToken, now) {
  const path = join(packageRoot, WRITER_LOCK_FILE)
  let handle
  let created = false
  try {
    await assertSafeDirectory(packageRoot, packageRoot)
    handle = await openFile(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    )
    created = true
    await handle.writeFile(prettyJSON(writerLockPayload(ownerToken, now)))
    await handle.sync()
    await handle.close()
    handle = undefined
    await syncDirectory(packageRoot)
  } catch (error) {
    await handle?.close().catch(() => {})
    if (created) await unlink(path).catch(() => {})
    if (error.code === 'EEXIST') {
      throw failure(
        'DocumentBusy',
        'This Deck already has a writer lock. Close the other writer; a crash-stale lock requires explicit recovery.',
        error,
      )
    }
    if (error instanceof WorkbenchFailure) throw error
    throw failure('CheckpointWriteFailure', `Writer lock acquisition failed: ${error.message}`, error)
  }
}

async function acquireWriterLock(packageRoot, now) {
  const ownerToken = randomUUID()
  await createWriterLockEntry(packageRoot, ownerToken, now)
  registerWriterLock(packageRoot, ownerToken)
  return ownerToken
}

async function readWriterLock(packageRoot) {
  const path = join(packageRoot, WRITER_LOCK_FILE)
  try {
    const data = await readRequired(path, packageRoot)
    const payload = JSON.parse(data.toString('utf8'))
    if (
      payload.format !== WRITER_LOCK_FORMAT
      || payload.schemaVersion !== SCHEMA_VERSION
      || typeof payload.ownerToken !== 'string'
    ) {
      throw new Error('unsupported writer lock')
    }
    return payload
  } catch (error) {
    throw failure('DocumentBusy', 'Writer lock ownership is missing or invalid; refusing package mutation.', error)
  }
}

async function assertWriterLockOwned(packageRoot, ownerToken) {
  const payload = await readWriterLock(packageRoot)
  if (payload.ownerToken !== ownerToken) {
    throw failure('DocumentBusy', 'Another writer owns this Deck; refusing package mutation.')
  }
}

async function releaseWriterLock(packageRoot, ownerToken) {
  const path = join(packageRoot, WRITER_LOCK_FILE)
  await assertWriterLockOwned(packageRoot, ownerToken)
  try {
    await unlink(path)
    await syncDirectory(packageRoot)
    heldWriterLocks.delete(path)
  } catch (error) {
    throw failure('DocumentBusy', `Writer lock release failed: ${error.message}`, error)
  }
}

export function validateJournal(data) {
  if (data.length === 0) {
    return { records: [], headHash: ZERO_HASH, hashes: new Set([ZERO_HASH]), lastRevision: 0 }
  }
  if (data.at(-1) !== 0x0a) {
    throw failure('JournalCorruption', 'Journal has a partial or non-UTF-8 record')
  }
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch (error) {
    throw failure('JournalCorruption', 'Journal has a partial or non-UTF-8 record', error)
  }

  const lines = text.slice(0, -1).split('\n')
  if (lines.some((line) => line.length === 0)) {
    throw failure('JournalCorruption', 'Journal contains a blank record')
  }

  let previousHash = ZERO_HASH
  let expectedRevision = 1
  const hashes = new Set([ZERO_HASH])
  const records = []
  for (const line of lines) {
    let record
    try {
      record = requiredObject(JSON.parse(line), 'Journal record')
    } catch (error) {
      throw failure('JournalCorruption', 'Journal record is malformed', error)
    }
    const recordHash = record.recordHash
    const unhashed = clone(record)
    delete unhashed.recordHash
    if (
      typeof recordHash !== 'string'
      || record.previousHash !== previousHash
      || record.revision !== expectedRevision
    ) {
      throw failure('JournalCorruption', 'Journal hash chain or revision sequence is broken')
    }
    if (sha256(canonicalJSON(unhashed)) !== recordHash) {
      throw failure('JournalCorruption', 'Journal record hash does not match its contents')
    }
    records.push(clone(record))
    hashes.add(recordHash)
    previousHash = recordHash
    expectedRevision += 1
  }
  return { records, headHash: previousHash, hashes, lastRevision: expectedRevision - 1 }
}

export class PitchDeckDocumentStore {
  static zeroHash = ZERO_HASH

  static async create(requestedPath, checkpoint, { now = new Date() } = {}) {
    const packagePath = extname(requestedPath) === '.pitchdeck' ? requestedPath : `${requestedPath}.pitchdeck`
    const checkpointBytes = Buffer.isBuffer(checkpoint) ? checkpoint : prettyJSON(checkpoint)
    const metadata = checkpointMetadata(checkpointBytes)
    const parent = dirname(packagePath)
    const staging = join(parent, `.${basename(packagePath)}.staging-${randomUUID()}`)

    try {
      await lstat(packagePath)
      throw failure('CheckpointWriteFailure', 'A Deck already exists at the selected destination')
    } catch (error) {
      if (error instanceof WorkbenchFailure) throw error
      if (error.code !== 'ENOENT') throw failure('CheckpointWriteFailure', error.message, error)
    }

    try {
      await mkdir(staging, { recursive: false })
      await mkdir(join(staging, 'attachments'))
      await mkdir(join(staging, 'recovery'))
      await writeDurable(checkpointBytes, join(staging, 'checkpoint.json'))
      await writeDurable(Buffer.alloc(0), join(staging, 'journal.ndjson'))
      const timestamp = iso8601(now)
      const manifest = {
        format: PACKAGE_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        deckId: metadata.deckId,
        title: metadata.title,
        createdAt: timestamp,
        updatedAt: timestamp,
        checkpointRevision: metadata.revision,
        checkpointHash: sha256(checkpointBytes),
        journalHeadHash: ZERO_HASH,
        canvasPreset: metadata.canvasPreset,
      }
      await writeDurable(prettyJSON(manifest), join(staging, 'manifest.json'))
      const writerLockToken = randomUUID()
      await createWriterLockEntry(await realpath(staging), writerLockToken, now)
      await syncDirectory(staging)
      await rename(staging, packagePath)
      const packageRoot = await realpath(packagePath)
      registerWriterLock(packageRoot, writerLockToken)
      try {
        await syncDirectory(parent)
      } catch (error) {
        await releaseWriterLock(packageRoot, writerLockToken).catch(() => {})
        throw error
      }
      return new PitchDeckDocumentStore(packagePath, packageRoot, manifest, metadata.revision, writerLockToken)
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      if (error instanceof WorkbenchFailure) throw error
      throw failure('CheckpointWriteFailure', error.message, error)
    }
  }

  static async open(packagePath, { now = new Date() } = {}) {
    const packageRoot = await safePackageRoot(packagePath)
    const writerLockToken = await acquireWriterLock(packageRoot, now)

    try {
      let manifest
      try {
        manifest = validateManifest(JSON.parse((await readRequired(join(packagePath, 'manifest.json'), packageRoot)).toString('utf8')))
      } catch (error) {
        if (error instanceof WorkbenchFailure) throw error
        throw failure('UnsupportedSchema', 'manifest.json is invalid or unsupported', error)
      }

      const currentCheckpoint = await readRequired(join(packagePath, 'checkpoint.json'), packageRoot)
      let checkpoint = currentCheckpoint
      let recoveredPreviousCheckpoint = false
      if (sha256(currentCheckpoint) !== manifest.checkpointHash) {
        const previous = await readRequired(join(packagePath, 'recovery', 'previous-checkpoint.json'), packageRoot)
        if (sha256(previous) !== manifest.checkpointHash) {
          throw failure('JournalCorruption', 'Neither current nor recovery checkpoint matches manifest')
        }
        checkpoint = previous
        recoveredPreviousCheckpoint = true
      }

      const validated = validateJournal(await readRequired(join(packagePath, 'journal.ndjson'), packageRoot))
      if (manifest.checkpointRevision > validated.lastRevision) {
        throw failure('JournalCorruption', 'Checkpoint revision is ahead of journal history')
      }
      const metadata = checkpointMetadata(checkpoint)
      if (metadata.revision !== manifest.checkpointRevision) {
        throw failure('JournalCorruption', 'Checkpoint revision does not match manifest')
      }

      const store = new PitchDeckDocumentStore(
        packagePath,
        packageRoot,
        manifest,
        validated.lastRevision,
        writerLockToken,
      )
      let repairedJournalHead = false
      if (manifest.journalHeadHash !== validated.headHash) {
        if (!validated.hashes.has(manifest.journalHeadHash)) {
          throw failure('JournalCorruption', 'Manifest journal head is not in the valid hash chain')
        }
        const repaired = {
          ...manifest,
          journalHeadHash: validated.headHash,
          updatedAt: iso8601(now),
        }
        try {
          await store.#persistManifest(repaired)
        } catch (error) {
          throw failure('CheckpointWriteFailure', 'Valid journal tail found, but manifest repair failed', error)
        }
        store.manifest = repaired
        repairedJournalHead = true
      }

      return {
        store,
        loaded: {
          checkpoint,
          replayRecords: validated.records.filter((record) => record.revision > manifest.checkpointRevision),
          recoveredPreviousCheckpoint,
          repairedJournalHead,
        },
      }
    } catch (error) {
      try {
        await releaseWriterLock(packageRoot, writerLockToken)
      } catch (releaseError) {
        throw failure(
          'DocumentBusy',
          'Deck open failed and its writer lock could not be released; explicit recovery is required.',
          releaseError,
        )
      }
      throw error
    }
  }

  constructor(packagePath, packageRoot, manifest, currentRevision, writerLockToken) {
    this.packagePath = packagePath
    this.packageRoot = packageRoot
    this.writerLockToken = writerLockToken
    this.manifest = clone(manifest)
    this.currentRevision = currentRevision
    this.requiresReopen = false
    this.closed = false
  }

  get checkpointPath() { return join(this.packagePath, 'checkpoint.json') }
  get journalPath() { return join(this.packagePath, 'journal.ndjson') }
  get manifestPath() { return join(this.packagePath, 'manifest.json') }
  get recoveryPath() { return join(this.packagePath, 'recovery') }
  get previousCheckpointPath() { return join(this.recoveryPath, 'previous-checkpoint.json') }

  async appendDurably(prepared, { now = new Date() } = {}) {
    await this.#requireWriterLock()
    if (this.requiresReopen) {
      throw failure('KernelUnavailable', 'Document session requires reopen after an interrupted durable write')
    }
    if (
      !prepared
      || prepared.ok !== true
      || prepared.duplicate === true
      || prepared.nextRevision !== this.currentRevision + 1
      || !prepared.journalOperation
      || typeof prepared.journalOperation !== 'object'
    ) {
      throw failure('InvalidCommand', 'Prepared change does not continue the document revision')
    }

    const record = {
      ...clone(prepared.journalOperation),
      revision: prepared.nextRevision,
      previousHash: this.manifest.journalHeadHash,
    }
    record.recordHash = sha256(canonicalJSON(record))
    const line = Buffer.concat([canonicalJSON(record), Buffer.from('\n')])

    let handle
    try {
      await assertRegularEntry(this.journalPath, this.packageRoot)
      handle = await openFile(
        this.journalPath,
        constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
      )
      const entry = await handle.stat()
      if (!entry.isFile()) throw new Error('journal is not a regular file')
      await handle.writeFile(line)
      await handle.sync()
      await handle.close()
      handle = undefined
    } catch (error) {
      await handle?.close().catch(() => {})
      this.requiresReopen = true
      throw failure('CheckpointWriteFailure', `Journal append or fsync failed: ${error.message}`, error)
    }

    const nextManifest = {
      ...this.manifest,
      journalHeadHash: record.recordHash,
      updatedAt: iso8601(now),
    }
    try {
      await this.#persistManifest(nextManifest)
    } catch (error) {
      this.requiresReopen = true
      throw failure(
        'CheckpointWriteFailure',
        'Journal is durable but manifest acknowledgement failed; reopen to recover the valid tail',
        error,
      )
    }
    this.manifest = nextManifest
    this.currentRevision = prepared.nextRevision
    return clone(record)
  }

  async saveCheckpoint(checkpoint, { now = new Date() } = {}) {
    await this.#requireWriterLock()
    if (this.requiresReopen) {
      throw failure('KernelUnavailable', 'Document must reopen before checkpointing')
    }
    const checkpointBytes = Buffer.isBuffer(checkpoint) ? checkpoint : prettyJSON(checkpoint)
    const metadata = checkpointMetadata(checkpointBytes)
    if (metadata.revision !== this.currentRevision) {
      throw failure('StaleRevision', 'Checkpoint does not match the durable journal revision')
    }

    try {
      const checkpoint = await readRequired(this.checkpointPath, this.packageRoot)
      await mkdir(this.recoveryPath, { recursive: true })
      await assertSafeDirectory(this.recoveryPath, this.packageRoot)
      await writeDurable(checkpoint, this.previousCheckpointPath, this.packageRoot)
      await writeDurable(checkpointBytes, this.checkpointPath, this.packageRoot)
      const nextManifest = {
        ...this.manifest,
        title: metadata.title,
        checkpointRevision: metadata.revision,
        checkpointHash: sha256(checkpointBytes),
        updatedAt: iso8601(now),
      }
      await this.#persistManifest(nextManifest)
      this.manifest = nextManifest
    } catch (error) {
      this.requiresReopen = true
      if (error instanceof WorkbenchFailure) throw error
      throw failure('CheckpointWriteFailure', error.message, error)
    }
  }

  async #persistManifest(manifest) {
    await this.#requireWriterLock()
    await writeDurable(prettyJSON(manifest), this.manifestPath, this.packageRoot)
  }

  async #requireWriterLock() {
    if (this.closed) throw failure('KernelUnavailable', 'Deck document store is closed')
    await assertWriterLockOwned(this.packageRoot, this.writerLockToken)
  }

  async close() {
    if (this.closed) return
    await releaseWriterLock(this.packageRoot, this.writerLockToken)
    this.closed = true
  }
}

function kernelValue(result) {
  if (result?.ok === false) {
    throw failure(result.error?.name ?? 'KernelUnavailable', result.error?.message ?? 'Deck kernel rejected the operation')
  }
  return result
}

export class DurableDeckSession {
  static async create({ packagePath, kernel, seed, now = new Date() }) {
    const checkpoint = kernelValue(kernel.createInitialCheckpoint(seed))
    const store = await PitchDeckDocumentStore.create(packagePath, checkpoint, { now })
    try {
      const kernelSession = kernelValue(kernel.open(checkpoint))
      return new DurableDeckSession(kernel, kernelSession, store)
    } catch (error) {
      await store.close()
      throw error
    }
  }

  static async open({ packagePath, kernel, now = new Date() }) {
    const { store, loaded } = await PitchDeckDocumentStore.open(packagePath, { now })
    try {
      let checkpoint
      try {
        checkpoint = JSON.parse(loaded.checkpoint.toString('utf8'))
      } catch (error) {
        throw failure('UnsupportedSchema', 'Checkpoint schema is invalid or unsupported', error)
      }
      const kernelSession = kernelValue(kernel.open(checkpoint))
      for (const record of loaded.replayRecords) kernelValue(kernel.replayRecord(kernelSession, record))
      const summary = kernelValue(kernel.query(kernelSession, 'deck.summary', {}))
      if (summary.revision !== store.currentRevision) {
        throw failure('JournalCorruption', 'Kernel replay did not reach durable document revision')
      }
      return new DurableDeckSession(kernel, kernelSession, store, loaded)
    } catch (error) {
      await store.close()
      throw error
    }
  }

  constructor(kernel, kernelSession, store, recovery = undefined) {
    this.kernel = kernel
    this.kernelSession = kernelSession
    this.store = store
    this.recovery = recovery
    this.requiresReopen = false
    this.closed = false
  }

  get packagePath() { return this.store.packagePath }
  get revision() { return this.store.currentRevision }

  #requireOpen() {
    if (this.closed) throw failure('KernelUnavailable', 'Deck session is closed')
  }

  #requireWritable() {
    this.#requireOpen()
    if (this.requiresReopen || this.store.requiresReopen) {
      throw failure(
        'KernelUnavailable',
        'Deck session requires reopen before further mutation',
      )
    }
  }

  query(name, params = {}) {
    this.#requireOpen()
    return clone(kernelValue(this.kernel.query(this.kernelSession, name, params)))
  }

  async execute(command) {
    this.#requireWritable()
    const prepared = kernelValue(this.kernel.prepare(this.kernelSession, command))
    if (prepared.duplicate === true) {
      return {
        acknowledgement: clone(prepared.acknowledgement),
        projection: this.query('slide.activeProjection', {}),
      }
    }
    return this.#commitPrepared(prepared)
  }

  async undo() {
    this.#requireWritable()
    return this.#commitPrepared(kernelValue(this.kernel.prepareUndo(this.kernelSession)))
  }

  async redo() {
    this.#requireWritable()
    return this.#commitPrepared(kernelValue(this.kernel.prepareRedo(this.kernelSession)))
  }

  async #commitPrepared(prepared) {
    try {
      await this.store.appendDurably(prepared)
    } catch (error) {
      if (this.store.requiresReopen) this.requiresReopen = true
      throw error
    }

    let acknowledgement
    try {
      acknowledgement = kernelValue(this.kernel.commit(this.kernelSession, prepared))
    } catch (error) {
      this.requiresReopen = true
      throw failure(
        'KernelUnavailable',
        'A durable Deck change could not be applied to live state; close and reopen before editing again',
        error,
      )
    }
    return {
      acknowledgement: clone(acknowledgement),
      projection: this.query('slide.activeProjection', {}),
    }
  }

  async save() {
    this.#requireWritable()
    await this.store.saveCheckpoint(this.kernel.serializeSession(this.kernelSession))
    return { revision: this.revision, packagePath: this.packagePath }
  }

  async close({ save = true } = {}) {
    if (this.closed) return
    let pendingError
    if (save && !this.requiresReopen && !this.store.requiresReopen) {
      try {
        await this.save()
      } catch (error) {
        pendingError = error
      }
    }
    try {
      await this.store.close()
    } catch (error) {
      pendingError ??= error
    }
    if (this.store.closed) {
      this.closed = true
      this.kernelSession = undefined
    }
    if (pendingError) throw pendingError
  }
}

export const documentStoreContract = Object.freeze({
  packageFormat: PACKAGE_FORMAT,
  checkpointFormat: CHECKPOINT_FORMAT,
  schemaVersion: SCHEMA_VERSION,
  zeroHash: ZERO_HASH,
  writerLockFile: WRITER_LOCK_FILE,
  writerLockFormat: WRITER_LOCK_FORMAT,
})
