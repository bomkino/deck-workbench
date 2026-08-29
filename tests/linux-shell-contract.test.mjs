import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

import { bridgeChannel, readBridgeContract } from '../apps/linux/bridge-contract.mjs'
import { DocumentSessionActor } from '../apps/linux/document-session-actor.mjs'
import { performNativeAction } from '../apps/linux/native-action.mjs'
import { SerialOperationQueue } from '../apps/linux/serial-operation-queue.mjs'
import { DurableDeckSession, validateJournal } from '../packages/document-store/index.mjs'

const root = resolve(import.meta.dirname, '..')

test('Linux preload exposes exactly the typed bridge contract without a generic API', async () => {
  const contract = await readBridgeContract()
  const preload = await readFile(resolve(root, 'apps/linux/preload.cjs'), 'utf8')
  const exposed = [...preload.matchAll(/^\s{2}([a-z][A-Za-z0-9]*): \(payload/gm)].map((match) => match[1])

  assert.deepEqual(exposed, contract.methods.map((method) => method.javascriptName))
  assert.equal(preload.includes("contextBridge.exposeInMainWorld('deckBridge'"), true)
  assert.equal(preload.includes('ipcRenderer.send('), false)
  assert.equal(preload.includes('ipcRenderer.sendSync('), false)
  assert.equal(preload.includes('require(\'node:fs\')'), false)
})

test('Linux bridge channels remain named and method-specific', async () => {
  const contract = await readBridgeContract()
  assert.deepEqual(
    contract.methods.map((method) => bridgeChannel(method.name)),
    contract.methods.map((method) => `deck-workbench:${method.name}`),
  )
  assert.equal(new Set(contract.methods.map((method) => method.name)).size, contract.methods.length)
})

test('Linux BrowserWindow contract denies renderer privileges', async () => {
  const source = await readFile(resolve(root, 'apps/linux/main.mjs'), 'utf8')
  assert.match(source, /nodeIntegration:\s*false/)
  assert.match(source, /contextIsolation:\s*true/)
  assert.match(source, /sandbox:\s*true/)
  assert.match(source, /setPermissionRequestHandler\([^]*callback\(false\)/)
  assert.match(source, /utilityProcess\.fork\(kernelUtilityPath/)
  assert.match(source, /event\.senderFrame !== mainWindow\.webContents\.mainFrame/)
  assert.match(source, /event\.senderFrame\.url !== 'pitchdog-ui:\/\/workspace\/index\.html'/)
  assert.match(source, /appendSwitch\('disable-background-networking'\)/)
  assert.match(source, /webRequest\.onBeforeRequest/)
  assert.equal(source.includes('net.fetch('), false)

  const createWindow = source.slice(
    source.indexOf('async function createWindow'),
    source.indexOf('async function invokeInWorkspace'),
  )
  assert.ok(
    createWindow.indexOf('mainWindow = window') < createWindow.indexOf("await window.loadURL('pitchdog-ui://workspace/index.html')"),
    'the workspace window must be trusted before its first boot-time bridge call',
  )
  assert.match(createWindow, /if \(mainWindow === window\) mainWindow = null/)
})

test('utility FIFO admits one concurrent revision and leaves a replayable journal', async (t) => {
  const generatedKernel = await readFile(resolve(root, 'build/generated/deck-kernel.js'), 'utf8')
  const context = vm.createContext({ console })
  vm.runInContext(generatedKernel, context, { filename: 'deck-kernel.js' })
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'deck-workbench-utility-fifo-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const packagePath = join(temporaryRoot, 'FIFO.pitchdeck')
  const seed = {
    deckId: 'fifo-deck',
    sectionId: 'fifo-section',
    slideId: 'fifo-slide',
    blockId: 'fifo-headline',
    title: 'FIFO',
    initialHeadline: 'Before',
  }
  const session = await DurableDeckSession.create({ packagePath, kernel: context.DeckKernel, seed })
  const command = (commandId, text) => ({
    commandId,
    expectedRevision: 0,
    type: 'content.update',
    payload: {
      slideId: seed.slideId,
      blockId: seed.blockId,
      value: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
    source: { kind: 'ui', label: 'FIFO proof' },
    issuedAt: '2026-08-27T00:00:00Z',
  })
  const queue = new SerialOperationQueue()
  const outcomes = await Promise.allSettled([
    queue.run(() => session.execute(command('fifo-a', 'First'))),
    queue.run(() => session.execute(command('fifo-b', 'Second'))),
  ])

  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'rejected'])
  assert.equal(outcomes[1].reason.name, 'StaleRevision')
  const journal = validateJournal(await readFile(join(packagePath, 'journal.ndjson')))
  assert.equal(journal.records.length, 1)
  assert.equal(journal.lastRevision, 1)
  await session.close()

  const reopened = await DurableDeckSession.open({ packagePath, kernel: context.DeckKernel })
  assert.equal(reopened.query('slide.activeProjection').headline.plainText, 'First')
  assert.equal(reopened.query('history.summary').undoDepth, 1)
})

test('failed target replay leaves the current document and history writable', async (t) => {
  const generatedKernel = await readFile(resolve(root, 'build/generated/deck-kernel.js'), 'utf8')
  const context = vm.createContext({ console })
  vm.runInContext(generatedKernel, context, { filename: 'deck-kernel.js' })
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'deck-workbench-staged-open-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const currentPath = join(temporaryRoot, 'Current.pitchdeck')
  const corruptPath = join(temporaryRoot, 'Corrupt.pitchdeck')
  const seed = (prefix) => ({
    deckId: `${prefix}-deck`,
    sectionId: `${prefix}-section`,
    slideId: `${prefix}-slide`,
    blockId: `${prefix}-headline`,
    title: prefix,
    initialHeadline: `${prefix} headline`,
  })
  const update = (target, commandId, text) => ({
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
    source: { kind: 'ui', label: 'Staged open proof' },
    issuedAt: '2026-08-27T00:00:00Z',
  })

  const actor = new DocumentSessionActor({ Session: DurableDeckSession, kernel: context.DeckKernel })
  const currentSeed = seed('current')
  await actor.dispatch('document.create', { packagePath: currentPath, seed: currentSeed })
  assert.equal(
    (await actor.dispatch('document.open', { packagePath: currentPath })).headline.plainText,
    'current headline',
    'same-package open must query the owned session instead of contending on its writer lock',
  )

  const corruptSeed = seed('corrupt')
  const corrupt = await DurableDeckSession.create({
    packagePath: corruptPath,
    kernel: context.DeckKernel,
    seed: corruptSeed,
  })
  await corrupt.execute(update(corruptSeed, 'corrupt-command', 'Durable before corruption'))
  await corrupt.close()
  const journalPath = join(corruptPath, 'journal.ndjson')
  await writeFile(journalPath, Buffer.concat([await readFile(journalPath), Buffer.from('{partial')]))

  await assert.rejects(
    actor.dispatch('document.open', { packagePath: corruptPath }),
    (error) => error.name === 'JournalCorruption',
  )
  assert.equal(
    (await actor.dispatch('document.query', { name: 'slide.activeProjection' })).headline.plainText,
    'current headline',
  )
  const committed = await actor.dispatch('document.execute', {
    command: update(currentSeed, 'current-command', 'Current still writable'),
  })
  assert.equal(committed.projection.headline.plainText, 'Current still writable')
  assert.equal(
    (await actor.dispatch('document.query', { name: 'history.summary' })).undoDepth,
    1,
  )
  await actor.dispatch('document.close')
})

test('native actions keep cancellation quiet and present typed failures once', async () => {
  const presented = []
  const present = async (failure) => presented.push(failure)

  assert.equal(await performNativeAction(async () => 'saved', present), 'saved')
  assert.equal(await performNativeAction(async () => {
    throw Object.assign(new Error('cancelled'), { name: 'JobCancelled' })
  }, present), undefined)
  assert.equal(presented.length, 0)

  assert.equal(await performNativeAction(async () => {
    throw Object.assign(new Error('Journal fsync failed'), { name: 'CheckpointWriteFailure' })
  }, present), undefined)
  assert.deepEqual(presented, [{ name: 'CheckpointWriteFailure', message: 'Journal fsync failed' }])
})

test('every asynchronous native menu action uses the shared failure presenter', async () => {
  const source = await readFile(resolve(root, 'apps/linux/main.mjs'), 'utf8')
  const menu = source.slice(source.indexOf('function installMenu()'), source.indexOf('async function closeDocument()'))
  for (const label of [
    'New Deck…', 'Open Deck…', 'Save', 'Close Deck', 'Export PDF…',
    'Undo Deck Change', 'Redo Deck Change',
  ]) {
    const line = menu.split('\n').find((candidate) => candidate.includes(`label: '${label}'`))
    assert.match(line ?? '', /performNativeAction\(.+presentNativeFailure/)
  }
  assert.match(menu, /setInterfaceScaleFromMenu\(value\), presentNativeFailure/)
  assert.match(source, /status\.textContent =/)
  assert.match(source, /dialog\.showMessageBox\(mainWindow/)
  assert.match(source, /async function flushWorkspaceDrafts\(\)[\s\S]*deckWorkbench\.saveDrafts\(\)/)
  assert.match(menu, /label: 'Save'[\s\S]*performNativeAction\(saveDocument, presentNativeFailure\)/)
  assert.match(source, /async function closeDocument\(\) \{[\s\S]*await flushWorkspaceDrafts\(\)[\s\S]*document\.close/)
  assert.match(source, /async function presentPDFExport\(\)[\s\S]*showSaveDialog[\s\S]*if \(result\.canceled[\s\S]*await flushWorkspaceDrafts\(\)[\s\S]*exportOnePagePDF/)
  assert.match(source, /app\.on\('before-quit'[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*document\.close/)
  assert.match(source, /window\.on\('close'[\s\S]*event\.preventDefault\(\)[\s\S]*flushWorkspaceDrafts\(\)[\s\S]*window\.close\(\)/)
})

test('packaged tracer exposes deterministic create and fresh-process reopen phases', async () => {
  const source = await readFile(resolve(root, 'apps/linux/main.mjs'), 'utf8')
  assert.match(source, /--run-packaged-tracer-create/)
  assert.match(source, /--run-packaged-tracer-reopen/)
  assert.match(source, /journey-create-result\.json/)
  assert.match(source, /createProcessId: createResult\.processId/)
  assert.match(source, /reopenProcessId: process\.pid/)
  assert.match(source, /createInstanceId: createResult\.processInstanceId/)
  assert.match(source, /reopenInstanceId: processInstanceId/)
  assert.match(source, /requireDistinctProcess && !result\.processLifecycle\.distinctProcesses/)
  for (const command of [
    'section.add', 'slide.add', 'section.move', 'slide.move',
    'section.rename', 'slide.intent.set', 'content.add', 'content.update',
  ]) {
    assert.match(source, new RegExp(`'${command.replace('.', '\\.')}'`))
  }
  assert.match(source, /reopenedUndoBodyText/)
  assert.match(source, /reopenedRedoBodyText/)
})
