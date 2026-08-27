import { readFileSync } from 'node:fs'

const [resultPath, label = 'Linux package'] = process.argv.slice(2)
if (!resultPath) throw new Error('Journey result path is required')

const result = JSON.parse(readFileSync(resultPath, 'utf8'))
if (result.schemaVersion !== 1) throw new Error(`${label}: unsupported packaged journey result`)
if (result.ok !== true) throw new Error(`${label}: packaged journey reported a failed assertion`)

const lifecycle = result.processLifecycle ?? {}
if (!Number.isInteger(lifecycle.createProcessId)
  || !Number.isInteger(lifecycle.reopenProcessId)
  || typeof lifecycle.createInstanceId !== 'string'
  || typeof lifecycle.reopenInstanceId !== 'string'
  || lifecycle.createInstanceId.length < 1
  || lifecycle.reopenInstanceId.length < 1
  || lifecycle.createInstanceId === lifecycle.reopenInstanceId
  || lifecycle.distinctProcesses !== true) {
  throw new Error(`${label}: full application process relaunch was not proved`)
}

const checks = result.checks ?? {}
if (checks.utilityOwner !== 'electron-utility-process') throw new Error(`${label}: kernel did not run in the utility process`)
if (checks.exactBridge !== true) throw new Error(`${label}: typed bridge parity failed`)
if (checks.rendererNodeRequire !== 'undefined' || checks.rendererNodeProcess !== 'undefined') {
  throw new Error(`${label}: renderer privilege isolation failed`)
}
if (checks.rendererNetworkBlocked !== true) throw new Error(`${label}: renderer network policy failed`)

const expectedHeadlines = {
  initialHeadline: 'Untitled Story',
  editedHeadline: 'Linux Story Traced',
  undoneHeadline: 'Untitled Story',
  redoneHeadline: 'Linux Story Traced',
  reopenedHeadline: 'Linux Story Traced',
  reopenedUndoHeadline: 'Linux Story Traced',
  reopenedRedoHeadline: 'Linux Story Traced',
}
for (const [field, expected] of Object.entries(expectedHeadlines)) {
  if (checks[field] !== expected) throw new Error(`${label}: ${field} mismatch`)
}

if (!Number.isInteger(checks.reopenedUndoDepth) || checks.reopenedUndoDepth < 1) {
  throw new Error(`${label}: reopened undo history is unavailable`)
}
if (checks.savedRevision !== 11 || checks.reopenSavedRevision !== 13 || checks.finalRevision !== 13) {
  throw new Error(`${label}: saved revision sequence mismatch`)
}
if (checks.reopenedUndoDepth !== 9 || checks.finalUndoDepth !== 9) {
  throw new Error(`${label}: structured Story undo history mismatch`)
}
if (checks.reopenedStoryRevision !== 11
  || checks.reopenedSectionOrder?.length !== 2
  || checks.reopenedOpeningSlideOrder?.length !== 2
  || checks.reopenedBodyText !== 'A body block.\n\nThat survives design.'
  || checks.reopenedUndoBodyText !== 'A body block that survives design.'
  || checks.reopenedRedoBodyText !== 'A body block.\n\nThat survives design.') {
  throw new Error(`${label}: structured Story replay or history mismatch`)
}
if (checks.interfaceScale !== 1.25 || checks.artboardZoom !== 0.5
  || checks.persistedInterfaceScale !== 1.25 || checks.persistedArtboardZoom !== 0.5) {
  throw new Error(`${label}: Interface Scale/artboard zoom persistence or independence failed`)
}
if (!Number.isInteger(checks.pdfBytes) || checks.pdfBytes < 100 || !/^[a-f0-9]{64}$/.test(checks.pdfSHA256 ?? '')) {
  throw new Error(`${label}: PDF evidence is invalid`)
}

console.log(`Verified ${label} two-process journey`)
