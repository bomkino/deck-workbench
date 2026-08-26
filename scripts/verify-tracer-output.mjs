import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [documentPath, createPath, reopenPath, pdfPath] = process.argv.slice(2)
const [manifest, checkpoint, journalText, createResult, reopenResult, pdf] = await Promise.all([
  readFile(`${documentPath}/manifest.json`, 'utf8').then(JSON.parse),
  readFile(`${documentPath}/checkpoint.json`, 'utf8').then(JSON.parse),
  readFile(`${documentPath}/journal.ndjson`, 'utf8'),
  readFile(createPath, 'utf8').then(JSON.parse),
  readFile(reopenPath, 'utf8').then(JSON.parse),
  readFile(pdfPath),
])

const records = journalText.trim().split('\n').map(JSON.parse)
assert.equal(manifest.format, 'pitchdog.deck-package')
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.canvasPreset, 'cinemascope-2576x1080')
assert.equal(checkpoint.format, 'pitchdog.deck-checkpoint')
assert.equal(checkpoint.revision, 4)
assert.equal(records.length, 4)
assert.deepEqual(records.map((record) => record.revision), [1, 2, 3, 4])
assert.deepEqual(records.map((record) => record.operation), ['command', 'undo', 'redo', 'undo'])
assert.equal(records[0].previousHash, '0'.repeat(64))
for (let index = 1; index < records.length; index += 1) {
  assert.equal(records[index].previousHash, records[index - 1].recordHash)
}
assert.equal(manifest.journalHeadHash, records.at(-1).recordHash)
assert.equal(createResult.revision, 3)
assert.equal(createResult.headline, 'A hill that refuses to be scenery')
assert.equal(createResult.interfaceScale, 1.25)
assert.equal(createResult.artboardZoom, 0.5)
assert.equal(reopenResult.reopenedRevision, 3)
assert.equal(reopenResult.reopenedHeadline, 'A hill that refuses to be scenery')
assert.equal(reopenResult.undoRevision, 4)
assert.equal(reopenResult.undoHeadline, 'Untitled Story')
assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')

console.log('Tracer document, history, hash chain and PDF outputs verified')
