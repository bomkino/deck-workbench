from pathlib import Path
import json
import re


def replace(path, old, new, expected=1):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} matches, found {count}')
    file.write_text(text.replace(old, new))


def replace_regex(path, pattern, replacement, expected=1):
    file = Path(path)
    text = file.read_text()
    updated, count = re.subn(pattern, replacement, text, flags=re.S)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} regex matches, found {count}')
    file.write_text(updated)


replace(
    'packages/document-store/index.mjs',
    "  let previousHash = ZERO_HASH\n"
    "  let expectedRevision = 1\n"
    "  const hashes = new Set([ZERO_HASH])\n"
    "  const records = []\n"
    "  for (const line of text.split('\\n').filter(Boolean)) {\n",
    "  const lines = text.slice(0, -1).split('\\n')\n"
    "  if (lines.some((line) => line.length === 0)) {\n"
    "    throw failure('JournalCorruption', 'Journal contains a blank record')\n"
    "  }\n\n"
    "  let previousHash = ZERO_HASH\n"
    "  let expectedRevision = 1\n"
    "  const hashes = new Set([ZERO_HASH])\n"
    "  const records = []\n"
    "  for (const line of lines) {\n",
)

replace(
    'packages/document-store/index.mjs',
    "    this.store = store\n"
    "    this.recovery = recovery\n"
    "    this.closed = false\n",
    "    this.store = store\n"
    "    this.recovery = recovery\n"
    "    this.requiresReopen = false\n"
    "    this.closed = false\n",
)

replace(
    'packages/document-store/index.mjs',
    "  #requireOpen() {\n"
    "    if (this.closed) throw failure('KernelUnavailable', 'Deck session is closed')\n"
    "  }\n\n"
    "  query(name, params = {}) {\n"
    "    this.#requireOpen()\n"
    "    return clone(kernelValue(this.kernel.query(this.kernelSession, name, params)))\n"
    "  }\n\n"
    "  async execute(command) {\n"
    "    this.#requireOpen()\n"
    "    const prepared = kernelValue(this.kernel.prepare(this.kernelSession, command))\n"
    "    if (prepared.duplicate === true) {\n"
    "      return {\n"
    "        acknowledgement: clone(prepared.acknowledgement),\n"
    "        projection: this.query('slide.activeProjection', {}),\n"
    "      }\n"
    "    }\n"
    "    return this.#commitPrepared(prepared)\n"
    "  }\n\n"
    "  async undo() {\n"
    "    this.#requireOpen()\n"
    "    return this.#commitPrepared(kernelValue(this.kernel.prepareUndo(this.kernelSession)))\n"
    "  }\n\n"
    "  async redo() {\n"
    "    this.#requireOpen()\n"
    "    return this.#commitPrepared(kernelValue(this.kernel.prepareRedo(this.kernelSession)))\n"
    "  }\n",
    "  #requireOpen() {\n"
    "    if (this.closed) throw failure('KernelUnavailable', 'Deck session is closed')\n"
    "  }\n\n"
    "  #requireWritable() {\n"
    "    this.#requireOpen()\n"
    "    if (this.requiresReopen || this.store.requiresReopen) {\n"
    "      throw failure(\n"
    "        'KernelUnavailable',\n"
    "        'Deck session requires reopen before further mutation',\n"
    "      )\n"
    "    }\n"
    "  }\n\n"
    "  query(name, params = {}) {\n"
    "    this.#requireOpen()\n"
    "    return clone(kernelValue(this.kernel.query(this.kernelSession, name, params)))\n"
    "  }\n\n"
    "  async execute(command) {\n"
    "    this.#requireWritable()\n"
    "    const prepared = kernelValue(this.kernel.prepare(this.kernelSession, command))\n"
    "    if (prepared.duplicate === true) {\n"
    "      return {\n"
    "        acknowledgement: clone(prepared.acknowledgement),\n"
    "        projection: this.query('slide.activeProjection', {}),\n"
    "      }\n"
    "    }\n"
    "    return this.#commitPrepared(prepared)\n"
    "  }\n\n"
    "  async undo() {\n"
    "    this.#requireWritable()\n"
    "    return this.#commitPrepared(kernelValue(this.kernel.prepareUndo(this.kernelSession)))\n"
    "  }\n\n"
    "  async redo() {\n"
    "    this.#requireWritable()\n"
    "    return this.#commitPrepared(kernelValue(this.kernel.prepareRedo(this.kernelSession)))\n"
    "  }\n",
)

replace(
    'packages/document-store/index.mjs',
    "  async #commitPrepared(prepared) {\n"
    "    await this.store.appendDurably(prepared)\n"
    "    const acknowledgement = kernelValue(this.kernel.commit(this.kernelSession, prepared))\n"
    "    return {\n"
    "      acknowledgement: clone(acknowledgement),\n"
    "      projection: this.query('slide.activeProjection', {}),\n"
    "    }\n"
    "  }\n",
    "  async #commitPrepared(prepared) {\n"
    "    try {\n"
    "      await this.store.appendDurably(prepared)\n"
    "    } catch (error) {\n"
    "      if (this.store.requiresReopen) this.requiresReopen = true\n"
    "      throw error\n"
    "    }\n\n"
    "    let acknowledgement\n"
    "    try {\n"
    "      acknowledgement = kernelValue(this.kernel.commit(this.kernelSession, prepared))\n"
    "    } catch (error) {\n"
    "      this.requiresReopen = true\n"
    "      throw failure(\n"
    "        'KernelUnavailable',\n"
    "        'A durable Deck change could not be applied to live state; close and reopen before editing again',\n"
    "        error,\n"
    "      )\n"
    "    }\n"
    "    return {\n"
    "      acknowledgement: clone(acknowledgement),\n"
    "      projection: this.query('slide.activeProjection', {}),\n"
    "    }\n"
    "  }\n",
)

replace(
    'packages/document-store/index.mjs',
    "  async save() {\n"
    "    this.#requireOpen()\n"
    "    await this.store.saveCheckpoint(this.kernel.serializeSession(this.kernelSession))\n"
    "    return { revision: this.revision, packagePath: this.packagePath }\n"
    "  }\n\n"
    "  async close({ save = true } = {}) {\n"
    "    if (this.closed) return\n"
    "    if (save) await this.save()\n"
    "    await this.store.close()\n"
    "    this.closed = true\n"
    "    this.kernelSession = undefined\n"
    "  }\n",
    "  async save() {\n"
    "    this.#requireWritable()\n"
    "    await this.store.saveCheckpoint(this.kernel.serializeSession(this.kernelSession))\n"
    "    return { revision: this.revision, packagePath: this.packagePath }\n"
    "  }\n\n"
    "  async close({ save = true } = {}) {\n"
    "    if (this.closed) return\n"
    "    let pendingError\n"
    "    if (save && !this.requiresReopen && !this.store.requiresReopen) {\n"
    "      try {\n"
    "        await this.save()\n"
    "      } catch (error) {\n"
    "        pendingError = error\n"
    "      }\n"
    "    }\n"
    "    try {\n"
    "      await this.store.close()\n"
    "    } catch (error) {\n"
    "      pendingError ??= error\n"
    "    }\n"
    "    if (this.store.closed) {\n"
    "      this.closed = true\n"
    "      this.kernelSession = undefined\n"
    "    }\n"
    "    if (pendingError) throw pendingError\n"
    "  }\n",
)

replace(
    'packages/support-bundle/index.mjs',
    "  let previousHash = ZERO_HASH\n"
    "  let expectedRevision = 1\n"
    "  const hashes = new Set([ZERO_HASH])\n"
    "  for (const line of text.split('\\n').filter(Boolean)) {\n",
    "  const lines = text.length === 0 ? [] : text.slice(0, -1).split('\\n')\n"
    "  if (lines.some((line) => line.length === 0)) {\n"
    "    return { status: 'invalid', reason: 'blank-record' }\n"
    "  }\n\n"
    "  let previousHash = ZERO_HASH\n"
    "  let expectedRevision = 1\n"
    "  const hashes = new Set([ZERO_HASH])\n"
    "  for (const line of lines) {\n",
)

replace(
    'apps/macos/Sources/PitchDeckDocumentStore.swift',
    '        let lines = text.split(separator: "\\n", omittingEmptySubsequences: true)\n'
    '        var previousHash = zeroHash\n',
    '        let recordText = text.dropLast()\n'
    '        guard !recordText.isEmpty else {\n'
    '            throw WorkbenchFailure(name: "JournalCorruption", message: "Journal contains a blank record")\n'
    '        }\n'
    '        let lines = recordText.split(separator: "\\n", omittingEmptySubsequences: false)\n'
    '        guard lines.allSatisfy({ !$0.isEmpty }) else {\n'
    '            throw WorkbenchFailure(name: "JournalCorruption", message: "Journal contains a blank record")\n'
    '        }\n'
    '        var previousHash = zeroHash\n',
)

Path('apps/linux/utility-client.mjs').write_text("""import { randomUUID } from 'node:crypto'

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
""")

Path('apps/linux/preferences.mjs').write_text("""import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export const interfaceScaleSteps = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])
export const defaultPreferences = Object.freeze({ interfaceScale: 1, artboardZoom: 0.35 })

function defaults() {
  return { ...defaultPreferences }
}

function invalid(message) {
  return Object.assign(new Error(message), { name: 'InvalidPreferences' })
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export function parsePreferences(source) {
  let value
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw invalid(`Preferences are not valid JSON: ${error.message}`)
  }
  const keys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : []
  if (
    JSON.stringify(keys) !== JSON.stringify(['artboardZoom', 'interfaceScale', 'schemaVersion'])
    || value.schemaVersion !== 1
    || !interfaceScaleSteps.includes(value.interfaceScale)
    || !Number.isFinite(value.artboardZoom)
    || value.artboardZoom < 0.1
    || value.artboardZoom > 4
  ) {
    throw invalid('Preferences are invalid or unsupported')
  }
  return { interfaceScale: value.interfaceScale, artboardZoom: value.artboardZoom }
}

export async function loadPreferencesFile(path, { quarantineId = randomUUID() } = {}) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { preferences: defaults(), recovered: false, quarantinePath: null, warning: null }
    }
    return {
      preferences: defaults(),
      recovered: true,
      quarantinePath: null,
      warning: `Preferences could not be read; defaults restored: ${error.message}`,
    }
  }

  try {
    return {
      preferences: parsePreferences(source),
      recovered: false,
      quarantinePath: null,
      warning: null,
    }
  } catch (error) {
    const quarantinePath = `${path}.invalid-${quarantineId}`
    try {
      await rename(path, quarantinePath)
      await syncDirectory(dirname(path))
      return {
        preferences: defaults(),
        recovered: true,
        quarantinePath,
        warning: `${error.message}; invalid file moved aside`,
      }
    } catch (quarantineError) {
      return {
        preferences: defaults(),
        recovered: true,
        quarantinePath: null,
        warning: `${error.message}; invalid file could not be moved aside: ${quarantineError.message}`,
      }
    }
  }
}
""")

replace(
    'apps/linux/main.mjs',
    "import { UtilityKernelClient } from './utility-client.mjs'\n",
    "import { UtilityKernelClient } from './utility-client.mjs'\n"
    "import { defaultPreferences, interfaceScaleSteps, loadPreferencesFile } from './preferences.mjs'\n",
)
replace(
    'apps/linux/main.mjs',
    "const interfaceScaleSteps = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])\n",
    "",
)
replace(
    'apps/linux/main.mjs',
    "let preferences = { interfaceScale: 1, artboardZoom: 0.35 }\n",
    "let preferences = { ...defaultPreferences }\n",
)
replace_regex(
    'apps/linux/main.mjs',
    r"async function loadPreferences\(\) \{.*?\n\}\n\nasync function persistPreferences",
    "async function loadPreferences() {\n"
    "  const loaded = await loadPreferencesFile(preferencesPath())\n"
    "  preferences = loaded.preferences\n"
    "  if (loaded.warning) process.stderr.write(`InvalidPreferences: ${loaded.warning}\\n`)\n"
    "}\n\n"
    "async function persistPreferences",
)
replace(
    'apps/linux/main.mjs',
    "    await writeDurably(destination, pdf)\n",
    "    await writeAtomically(destination, pdf)\n",
)

Path('tests/journal-record-boundary.test.mjs').write_text("""import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  PitchDeckDocumentStore,
  WorkbenchFailure,
  canonicalJSON,
  sha256,
  validateJournal,
} from '../packages/document-store/index.mjs'
import { createSupportReport } from '../packages/support-bundle/index.mjs'

const ZERO_HASH = '0'.repeat(64)

function record() {
  const value = { operation: 'command', revision: 1, previousHash: ZERO_HASH }
  return { ...value, recordHash: sha256(canonicalJSON(value)) }
}

function line(value = record()) {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}

test('journal validation rejects a newline as an empty physical record', () => {
  assert.throws(
    () => validateJournal(Buffer.from('\n')),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'JournalCorruption'
      && /blank record/.test(error.message),
  )
})

test('journal validation rejects blank records inside an otherwise valid hash chain', () => {
  assert.throws(
    () => validateJournal(Buffer.concat([line(), Buffer.from('\n')])),
    (error) => error.name === 'JournalCorruption' && /blank record/.test(error.message),
  )
})

test('journal validation still accepts one strict newline-terminated record', () => {
  const validated = validateJournal(line())
  assert.equal(validated.records.length, 1)
  assert.equal(validated.lastRevision, 1)
  assert.equal(validated.headHash, record().recordHash)
})

test('support evidence reports a blank record instead of silently skipping it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-blank-support-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const deckPath = join(root, 'Private.pitchdeck')
  await mkdir(join(deckPath, 'attachments'), { recursive: true })
  await mkdir(join(deckPath, 'recovery'), { recursive: true })
  const checkpoint = Buffer.from('{}')
  const journalRecord = record()
  await writeFile(join(deckPath, 'checkpoint.json'), checkpoint)
  await writeFile(join(deckPath, 'journal.ndjson'), Buffer.concat([line(journalRecord), Buffer.from('\n')]))
  await writeFile(join(deckPath, 'manifest.json'), JSON.stringify({
    format: 'pitchdog.deck-package',
    schemaVersion: 1,
    deckId: 'private',
    title: 'private',
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:01Z',
    checkpointRevision: 0,
    checkpointHash: createHash('sha256').update(checkpoint).digest('hex'),
    journalHeadHash: journalRecord.recordHash,
    canvasPreset: 'pitchdog.16x9',
  }))
  const thirdPartyPath = join(root, 'THIRD_PARTY.md')
  await writeFile(thirdPartyPath, [
    '| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |',
    '|---|---|---|---|---|---|---|',
    '| Electron | 44.0.0 | local | MIT | Linux | Runtime | None |',
  ].join('\n'))

  const report = await createSupportReport({
    deckPath,
    thirdPartyPath,
    commitSha: '0'.repeat(40),
    appVersion: '0.0.0',
    platform: 'linux',
    architecture: 'x64',
  })
  assert.deepEqual(report.document.journal, { status: 'invalid', reason: 'blank-record' })
})

test('macOS journal parsing preserves physical empty lines for rejection', async () => {
  const source = await readFile(resolve('apps/macos/Sources/PitchDeckDocumentStore.swift'), 'utf8')
  assert.match(source, /omittingEmptySubsequences: false/)
  assert.match(source, /Journal contains a blank record/)
  assert.doesNotMatch(source, /text\.split\(separator: "\\n", omittingEmptySubsequences: true\)/)
})

test('the document-store contract exposes the same zero hash used by strict parsing', () => {
  assert.equal(PitchDeckDocumentStore.zeroHash, ZERO_HASH)
})
""")

Path('tests/utility-client-lifecycle.test.mjs').write_text("""import assert from 'node:assert/strict'
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
""")

Path('tests/durable-session-fencing.test.mjs').write_text("""import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import {
  DurableDeckSession,
  WorkbenchFailure,
  validateJournal,
} from '../packages/document-store/index.mjs'

const source = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel

function seed(prefix = 'fence') {
  return {
    deckId: `${prefix}-deck`,
    sectionId: `${prefix}-section`,
    slideId: `${prefix}-slide`,
    blockId: `${prefix}-headline`,
    title: 'Fence proof',
    initialHeadline: 'Before',
  }
}

function command(target, text, commandId = 'fence-command') {
  return {
    commandId,
    expectedRevision: 0,
    type: 'content.update',
    payload: {
      slideId: target.slideId,
      blockId: target.blockId,
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'ui', label: 'Durability fence proof' },
    issuedAt: '2026-08-27T00:00:00Z',
  }
}

async function fixture(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), `deck-workbench-${prefix}-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, packagePath: join(root, 'Fence.pitchdeck') }
}

test('a durable append followed by live commit failure fences mutation until reopen', async (t) => {
  const paths = await fixture(t, 'commit-fence')
  const target = seed('commit-fence')
  const faultingKernel = new Proxy(kernel, {
    get(object, property) {
      if (property === 'commit') {
        return () => ({
          ok: false,
          error: { name: 'KernelUnavailable', message: 'injected live commit failure' },
        })
      }
      const value = Reflect.get(object, property)
      return typeof value === 'function' ? value.bind(object) : value
    },
  })
  const session = await DurableDeckSession.create({
    packagePath: paths.packagePath,
    kernel: faultingKernel,
    seed: target,
  })

  await assert.rejects(
    session.execute(command(target, 'Durable but not live')),
    (error) => error.name === 'KernelUnavailable' && /close and reopen/.test(error.message),
  )
  assert.equal(session.query('slide.activeProjection').headline.plainText, 'Before')
  const journalBefore = await readFile(join(paths.packagePath, 'journal.ndjson'))
  assert.equal(validateJournal(journalBefore).lastRevision, 1)
  await assert.rejects(
    session.execute(command(target, 'Must not fork', 'second-command')),
    (error) => error.name === 'KernelUnavailable' && /requires reopen/.test(error.message),
  )
  assert.deepEqual(await readFile(join(paths.packagePath, 'journal.ndjson')), journalBefore)
  await session.close()

  const reopened = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(reopened.revision, 1)
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'Durable but not live')
  await reopened.close()
})

test('an interrupted durable append can close without stranding the writer lock', async (t) => {
  const paths = await fixture(t, 'append-fence')
  const target = seed('append-fence')
  const session = await DurableDeckSession.create({
    packagePath: paths.packagePath,
    kernel,
    seed: target,
  })
  session.store.appendDurably = async () => {
    session.store.requiresReopen = true
    throw new WorkbenchFailure('CheckpointWriteFailure', 'injected interrupted append')
  }
  await assert.rejects(
    session.execute(command(target, 'Not durable')),
    (error) => error.name === 'CheckpointWriteFailure',
  )
  await session.close()

  const reopened = await DurableDeckSession.open({ packagePath: paths.packagePath, kernel })
  assert.equal(reopened.revision, 0)
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'Before')
  await reopened.close()
})
""")

Path('tests/preferences-recovery.test.mjs').write_text("""import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  defaultPreferences,
  loadPreferencesFile,
  parsePreferences,
} from '../apps/linux/preferences.mjs'

test('preference parsing accepts only the bounded schema', () => {
  assert.deepEqual(parsePreferences(JSON.stringify({
    schemaVersion: 1,
    interfaceScale: 1.25,
    artboardZoom: 0.5,
  })), { interfaceScale: 1.25, artboardZoom: 0.5 })
})

test('preference parsing rejects extra keys and out-of-range values', () => {
  assert.throws(
    () => parsePreferences(JSON.stringify({
      schemaVersion: 1,
      interfaceScale: 1,
      artboardZoom: 0.35,
      privatePath: '/private',
    })),
    (error) => error.name === 'InvalidPreferences',
  )
  assert.throws(
    () => parsePreferences(JSON.stringify({
      schemaVersion: 1,
      interfaceScale: 9,
      artboardZoom: 0.35,
    })),
    (error) => error.name === 'InvalidPreferences',
  )
})

test('a missing preference file starts with clean defaults', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-missing-preferences-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const loaded = await loadPreferencesFile(join(root, 'preferences.json'))
  assert.deepEqual(loaded.preferences, defaultPreferences)
  assert.equal(loaded.recovered, false)
  assert.equal(loaded.warning, null)
})

test('an invalid preference file is quarantined instead of blocking startup', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-invalid-preferences-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'preferences.json')
  await writeFile(path, '{broken')
  const loaded = await loadPreferencesFile(path, { quarantineId: 'test' })
  assert.deepEqual(loaded.preferences, defaultPreferences)
  assert.equal(loaded.recovered, true)
  assert.equal(loaded.quarantinePath, `${path}.invalid-test`)
  assert.match(loaded.warning, /moved aside/)
  assert.equal(await readFile(loaded.quarantinePath, 'utf8'), '{broken')
  await assert.rejects(access(path), (error) => error.code === 'ENOENT')
})
""")

Path('tests/linux-host-hardening.test.mjs').write_text("""import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8')

test('Linux PDF export publishes through the existing atomic durable writer', () => {
  const start = source.indexOf('async function exportOnePagePDF')
  const end = source.indexOf('async function presentPDFExport', start)
  const exportSource = source.slice(start, end)
  assert.match(exportSource, /await writeAtomically\(destination, pdf\)/)
  assert.doesNotMatch(exportSource, /await writeDurably\(destination, pdf\)/)
})

test('Linux startup loads bounded preferences through the recovery adapter', () => {
  assert.match(source, /loadPreferencesFile\(preferencesPath\(\)\)/)
  assert.match(source, /preferences = loaded\.preferences/)
  assert.match(source, /InvalidPreferences:/)
  assert.match(source, /\.\/preferences\.mjs/)
})
""")

Path('scripts/verify-repository.mjs').write_text("""import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${result.stdout}${result.stderr}`)
  }
  return result.stdout
}

const tracked = run('git', ['ls-files', '-z'], 'tracked-file listing').split('\0').filter(Boolean)
const forbiddenNames = new Set(['.DS_Store', 'Thumbs.db', '.env'])
const forbiddenRoots = ['artifacts/', 'build/', 'node_modules/']
for (const path of tracked) {
  assert.equal(forbiddenNames.has(path.split('/').at(-1)), false, `forbidden tracked file: ${path}`)
  assert.equal(forbiddenRoots.some((root) => path.startsWith(root)), false, `generated output is tracked: ${path}`)
}

for (const path of tracked.filter((candidate) => extname(candidate) === '.json')) {
  JSON.parse(await readFile(path, 'utf8'))
}
for (const path of tracked.filter((candidate) => /\.(?:mjs|cjs|js)$/.test(candidate))) {
  run(process.execPath, ['--check', path], `JavaScript syntax: ${path}`)
}
for (const path of tracked.filter((candidate) => candidate.endsWith('.sh'))) {
  run('bash', ['-n', path], `shell syntax: ${path}`)
}

const workflowNames = new Set()
for (const path of tracked.filter((candidate) => /^\.github\/workflows\/.*\.ya?ml$/.test(candidate))) {
  const source = await readFile(path, 'utf8')
  const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  assert.ok(name, `workflow has no name: ${path}`)
  assert.equal(workflowNames.has(name), false, `duplicate workflow name: ${name}`)
  workflowNames.add(name)
  assert.equal(name === 'Source snapshot' || name.startsWith('Workbench fix orchestrator'), false, `temporary workflow remains: ${path}`)
  for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
    const reference = match[1]
    if (reference.startsWith('./')) continue
    assert.match(reference, /^[^@]+@[a-f0-9]{40}$/, `action is not pinned to a full commit: ${path}: ${reference}`)
  }
}

for (const path of tracked.filter((candidate) => candidate.endsWith('.md'))) {
  const source = await readFile(path, 'utf8')
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    target = target.split(/\s+['"]/)[0]
    if (!target || target.startsWith('#') || /^[a-z][a-z+.-]*:/i.test(target)) continue
    target = target.split('#')[0].split('?')[0]
    if (!target) continue
    const destination = resolve(dirname(path), decodeURIComponent(target))
    await stat(destination).catch(() => {
      throw new Error(`broken relative Markdown link: ${path} -> ${target}`)
    })
  }
}

const packageJSON = JSON.parse(await readFile('package.json', 'utf8'))
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
assert.equal(packageJSON.dependencies.electron, '44.0.0')
assert.equal(lock.packages[''].dependencies.electron, packageJSON.dependencies.electron)
assert.equal(packageJSON.scripts.verify, 'npm test && npm run verify:source && npm run verify:repository')
assert.match(await readFile('THIRD_PARTY.md', 'utf8'), /\| Electron \| 44\.0\.0 \|/)

const staged = run('git', ['ls-files', '--stage'], 'tracked modes')
for (const path of tracked.filter((candidate) => candidate.endsWith('.sh'))) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(staged, new RegExp(`^100755 [a-f0-9]+ 0\\t${escaped}$`, 'm'), `shell script is not executable: ${path}`)
}

console.log(`Repository verification passed (${tracked.length} tracked files)`)
""")

package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['scripts'] = {
    'generate': package['scripts']['generate'],
    'install:electron': package['scripts']['install:electron'],
    'build:linux': package['scripts']['build:linux'],
    'verify:linux': package['scripts']['verify:linux'],
    'test': package['scripts']['test'],
    'verify:source': 'node scripts/verify-source.mjs',
    'verify:repository': 'node scripts/verify-repository.mjs',
    'verify': 'npm test && npm run verify:source && npm run verify:repository',
}
package_path.write_text(json.dumps(package, indent=2) + '\n')

replace(
    '.github/workflows/dw-g01-linux.yml',
    "      - run: npm test\n"
    "      - run: node scripts/verify-source.mjs\n",
    "      - run: npm run verify\n",
    expected=2,
)
replace(
    '.github/workflows/dw-t00-macos.yml',
    "    runs-on: ubuntu-latest\n",
    "    runs-on: ubuntu-24.04\n"
    "    timeout-minutes: 10\n",
)
replace(
    '.github/workflows/dw-t00-macos.yml',
    "      - run: npm test\n"
    "      - run: node scripts/verify-source.mjs\n",
    "      - run: npm ci --ignore-scripts\n"
    "      - run: npm run verify\n",
    expected=2,
)

document_path = Path('docs/architecture/DOCUMENT_AND_RECOVERY.md')
document_text = document_path.read_text()
journal_marker = "```\n\n## Acknowledgement order\n"
journal_rule = (
    "```\n\n"
    "Every non-empty journal is newline-terminated and contains exactly one JSON object per physical line. "
    "Blank lines are corruption. Readers must reject them rather than silently filtering evidence.\n\n"
    "## Acknowledgement order\n"
)
if document_text.count(journal_marker) != 1:
    raise SystemExit('DOCUMENT_AND_RECOVERY journal marker mismatch')
document_text = document_text.replace(journal_marker, journal_rule)
failure_marker = "If append/fsync fails, live state remains unchanged and the user sees a named persistence error.\n"
failure_rule = (
    failure_marker
    + "\nIf the durable append succeeds but the live kernel commit cannot complete, the session is fenced against "
    "further mutation. Read-only projection remains available; Close releases the writer lock without overwriting "
    "the durable tail; reopen replays the journal before editing resumes.\n"
)
if document_text.count(failure_marker) != 1:
    raise SystemExit('DOCUMENT_AND_RECOVERY failure marker mismatch')
document_path.write_text(document_text.replace(failure_marker, failure_rule))

readme_path = Path('README.md')
readme = readme_path.read_text()
verify_marker = "```sh\nnpm run verify\n```\n"
verify_text = (
    verify_marker
    + "\nThis single gate regenerates contracts, runs the full test suite, checks the source contract, validates "
    "JavaScript and shell syntax, verifies relative documentation links, enforces full-SHA GitHub Action pins, "
    "reconciles dependency notices and rejects tracked build clutter.\n"
)
if readme.count(verify_marker) != 1:
    raise SystemExit('README verify marker mismatch')
readme_path.write_text(readme.replace(verify_marker, verify_text))

execution_path = Path('docs/implementation/EXECUTION_INDEX.md')
execution = execution_path.read_text()
milestone_marker = "- `DW-W10`: privacy-safe support-report seam source-ready.\n"
milestone_text = (
    milestone_marker
    + "- Repository hardening: strict journal record boundaries, durable/live-state fencing, dead utility-process "
    "rejection, recoverable Linux preferences, atomic Linux PDF publication and one canonical repository "
    "verification gate.\n"
)
if execution.count(milestone_marker) != 1:
    raise SystemExit('EXECUTION_INDEX milestone mismatch')
execution_path.write_text(execution.replace(milestone_marker, milestone_text))

release_path = Path('docs/03-build/RELEASE_DEFINITION.md')
release = release_path.read_text().rstrip()
release += """

## Repository integrity gate

Every promoted source tree must pass `npm run verify`. The gate regenerates shared contracts, runs all tests, checks source invariants, validates JavaScript and shell syntax, resolves relative documentation links, enforces full-commit GitHub Action pins, reconciles Electron notices and rejects tracked build output. Platform package journeys run this gate before packaging.
"""
release_path.write_text(release + '\n')

Path('docs/evidence/WORKBENCH-FIX-2026-08-27.md').write_text("""# Workbench hardening receipt — 2026-08-27

## Repaired failure classes

- blank physical journal records can no longer disappear during validation;
- a durable append followed by live-kernel commit failure fences mutation until replay;
- Close releases the writer lock after an interrupted session instead of stranding the package;
- dead Linux utility processes reject pending and future requests instead of hanging;
- malformed Linux preferences are quarantined and defaults restored;
- Linux PDF replacement uses the atomic durable writer;
- `npm run verify` is the canonical source, syntax, documentation, action-pin and repository-hygiene gate.

## Promotion evidence

The temporary hardening workflow publishes this tree only after portable verification, the exact Ubuntu x86-64 tarball/Arch/AppImage journey and the native macOS 26 arm64 packaged journey pass. Canonical workflows rerun on the published branch and on `main`.
""")

workflows = Path('.github/workflows')
for path in workflows.glob('*.y*ml'):
    source = path.read_text()
    if re.search(r'^name:\s*Source snapshot\s*$', source, flags=re.M):
        path.unlink()
    elif re.search(r'^name:\s*Workbench fix orchestrator', source, flags=re.M):
        path.unlink()

Path('scripts/apply-workbench-fix.py').unlink()
