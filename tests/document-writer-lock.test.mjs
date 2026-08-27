import assert from 'node:assert/strict'
import { once } from 'node:events'
import { open as openFile, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'

import {
  DurableDeckSession,
  WorkbenchFailure,
  documentStoreContract,
} from '../packages/document-store/index.mjs'

const kernelSource = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(kernelSource, context, { filename: 'deck-kernel.js' })
const kernel = context.DeckKernel
const storeModuleURL = new URL('../packages/document-store/index.mjs', import.meta.url).href

function seed() {
  return {
    deckId: 'deck-writer-lock-0000-4000-8000-000000000001',
    sectionId: 'section-writer-lock-4000-8000-000000000001',
    slideId: 'slide-writer-lock-4000-8000-000000000001',
    blockId: 'block-writer-lock-4000-8000-000000000001',
    title: 'Writer Lock Deck',
    initialHeadline: 'One writer only',
  }
}

function command(revision, text, commandId) {
  return {
    commandId,
    expectedRevision: revision,
    type: 'content.update',
    payload: {
      slideId: seed().slideId,
      blockId: seed().blockId,
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'cli', label: 'writer-lock fault proof' },
    issuedAt: '2026-08-27T04:00:00Z',
  }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-writer-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packagePath = join(root, 'Writer-Lock.pitchdeck')
  const owner = await DurableDeckSession.create({ packagePath, kernel, seed: seed() })
  return { root, packagePath, owner }
}

function childProgram(packagePath, body) {
  return `
    import { PitchDeckDocumentStore } from ${JSON.stringify(storeModuleURL)}
    const packagePath = ${JSON.stringify(packagePath)}
    ${body}
  `
}

async function runChild(program) {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', program], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
  const [code, signal] = await once(child, 'close')
  return { code, signal, stdout: stdout.trim(), stderr: stderr.trim() }
}

test('one lock protocol excludes a second session and a second process without semantic mutation', async (t) => {
  const { packagePath, owner } = await fixture(t)
  const lockPath = join(packagePath, documentStoreContract.writerLockFile)
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  const manifestBefore = await readFile(join(packagePath, 'manifest.json'))
  const checkpointBefore = await readFile(join(packagePath, 'checkpoint.json'))
  const journalBefore = await readFile(join(packagePath, 'journal.ndjson'))

  assert.equal(lock.format, documentStoreContract.writerLockFormat)
  assert.equal(lock.schemaVersion, 1)
  assert.equal(typeof lock.ownerToken, 'string')
  assert.equal(typeof lock.processId, 'number')
  assert.equal(typeof lock.createdAt, 'string')
  await assert.rejects(
    DurableDeckSession.open({ packagePath, kernel }),
    (error) => error instanceof WorkbenchFailure && error.name === 'DocumentBusy',
  )

  const contender = await runChild(childProgram(packagePath, `
    try {
      await PitchDeckDocumentStore.open(packagePath)
      console.log('UnexpectedSuccess')
    } catch (error) {
      console.log(error.name)
    }
  `))
  assert.equal(contender.code, 0, contender.stderr)
  assert.equal(contender.stdout, 'DocumentBusy')
  assert.deepEqual(await readFile(join(packagePath, 'manifest.json')), manifestBefore)
  assert.deepEqual(await readFile(join(packagePath, 'checkpoint.json')), checkpointBefore)
  assert.deepEqual(await readFile(join(packagePath, 'journal.ndjson')), journalBefore)

  await owner.close({ save: false })
  const next = await DurableDeckSession.open({ packagePath, kernel })
  await next.close({ save: false })
})

test('normal child-process exit releases its lock, but a killed writer leaves an explicit stale lock', async (t) => {
  const { packagePath, owner } = await fixture(t)
  await owner.close({ save: false })

  const normalExit = await runChild(childProgram(packagePath, `
    await PitchDeckDocumentStore.open(packagePath)
    console.log('opened-with-exit-cleanup')
  `))
  assert.equal(normalExit.code, 0, normalExit.stderr)
  assert.equal(normalExit.stdout, 'opened-with-exit-cleanup')
  const afterNormalExit = await DurableDeckSession.open({ packagePath, kernel })
  await afterNormalExit.close({ save: false })

  const killed = spawn(process.execPath, ['--input-type=module', '--eval', childProgram(packagePath, `
    await PitchDeckDocumentStore.open(packagePath)
    console.log('LOCKED')
    setInterval(() => {}, 60_000)
  `)], { stdio: ['ignore', 'pipe', 'pipe'] })
  killed.stdout.setEncoding('utf8')
  let output = ''
  for await (const chunk of killed.stdout) {
    output += chunk
    if (output.includes('LOCKED')) break
  }
  assert.match(output, /LOCKED/)
  killed.kill('SIGKILL')
  await once(killed, 'close')

  const lockPath = join(packagePath, documentStoreContract.writerLockFile)
  const staleBefore = await readFile(lockPath)
  await assert.rejects(
    DurableDeckSession.open({ packagePath, kernel }),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'DocumentBusy'
      && /explicit recovery/.test(error.message),
  )
  assert.deepEqual(await readFile(lockPath), staleBefore)
})

test('an ambiguous journal fsync failure fences the writer until explicit reopen', async (t) => {
  const { root, packagePath, owner } = await fixture(t)
  const probePath = join(root, 'file-handle-probe')
  await writeFile(probePath, '')
  const probe = await openFile(probePath, 'r')
  const fileHandlePrototype = Object.getPrototypeOf(probe)
  await probe.close()
  const originalSync = fileHandlePrototype.sync
  let injected = false
  fileHandlePrototype.sync = async function injectedJournalSyncFailure() {
    if (!injected) {
      injected = true
      throw Object.assign(new Error('injected ambiguous fsync failure'), { code: 'EIO' })
    }
    return originalSync.call(this)
  }
  try {
    await assert.rejects(
      owner.execute(command(0, 'possibly durable', 'ambiguous-fsync-command')),
      (error) => error instanceof WorkbenchFailure
        && error.name === 'CheckpointWriteFailure'
        && /ambiguous fsync failure/.test(error.message),
    )
  } finally {
    fileHandlePrototype.sync = originalSync
  }

  assert.equal(owner.revision, 0, 'live kernel must remain uncommitted')
  await assert.rejects(
    owner.execute(command(0, 'must be fenced', 'fenced-command')),
    (error) => error instanceof WorkbenchFailure
      && error.name === 'KernelUnavailable'
      && /requires reopen/.test(error.message),
  )
  await owner.close({ save: false })

  const recovered = await DurableDeckSession.open({ packagePath, kernel })
  assert.equal(recovered.revision, 1)
  assert.equal(recovered.query('slide.activeProjection').headline.plainText, 'possibly durable')
  await recovered.close({ save: false })
})

test('macOS store uses the same exclusive lock entry and controller releases it only after save', async () => {
  const [store, controller, tracer] = await Promise.all([
    readFile(new URL('../apps/macos/Sources/PitchDeckDocumentStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
    readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
  ])
  assert.match(store, /\.deck-workbench-writer\.lock/)
  assert.match(store, /pitchdog\.deck-writer-lock/)
  assert.match(store, /O_WRONLY \| O_CREAT \| O_EXCL \| O_NOFOLLOW/)
  assert.match(store, /name: "DocumentBusy"/)
  assert.match(store, /func close\(\) throws/)
  assert.match(store, /deinit/)
  assert.match(store, /catch \{\s*requiresReopen = true\s*throw WorkbenchFailure\(name: "CheckpointWriteFailure", message: "Journal append or fsync failed:/)
  assert.match(controller, /try save\(\)[\s\S]*try store\.close\(\)[\s\S]*self\.store = nil/)
  assert.match(controller, /let candidateKernel = try DeckKernelHost\(kernelURL: kernelURL\)/)
  assert.match(controller, /try candidateKernel\.replay\(record\)/)
  assert.match(controller, /try activate\([\s\S]*kernel: candidateKernel/)
  assert.match(tracer, /"concurrentWriterFailure": busyName/)
  assert.match(tracer, /"failedOpenPreservedLiveSession": true/)
})
