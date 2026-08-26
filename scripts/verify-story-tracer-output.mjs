import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [documentPath, createPath, reopenPath] = process.argv.slice(2)
const [manifest, checkpoint, journalText, createResult, reopenResult] = await Promise.all([
  readFile(`${documentPath}/manifest.json`, 'utf8').then(JSON.parse),
  readFile(`${documentPath}/checkpoint.json`, 'utf8').then(JSON.parse),
  readFile(`${documentPath}/journal.ndjson`, 'utf8'),
  readFile(createPath, 'utf8').then(JSON.parse),
  readFile(reopenPath, 'utf8').then(JSON.parse),
])

const records = journalText.trim().split('\n').map(JSON.parse)
assert.equal(manifest.format, 'pitchdog.deck-package')
assert.equal(manifest.schemaVersion, 1)
assert.equal(checkpoint.format, 'pitchdog.deck-checkpoint')
assert.equal(checkpoint.revision, 8)
assert.equal(records.length, 8)
assert.deepEqual(records.map((record) => record.revision), [1, 2, 3, 4, 5, 6, 7, 8])
assert.deepEqual(records.map((record) => record.operation), [
  'command', 'command', 'command', 'command', 'command', 'command', 'undo', 'redo',
])
assert.deepEqual(records.slice(0, 6).map((record) => record.command.type), [
  'section.add',
  'slide.add',
  'section.move',
  'slide.move',
  'section.rename',
  'slide.intent.set',
])
assert.equal(records[0].previousHash, '0'.repeat(64))
for (let index = 1; index < records.length; index += 1) {
  assert.equal(records[index].previousHash, records[index - 1].recordHash)
}
assert.equal(manifest.journalHeadHash, records.at(-1).recordHash)
assert.equal(createResult.revision, 6)
assert.equal(createResult.journalReplayRevision, 6)
assert.equal(createResult.renamedSectionTitle, 'Act II')
assert.equal(createResult.slideIntent, 'editorial-body')
assert.equal(createResult.sectionIds.length, 2)
assert.equal(createResult.openingSlideIds.length, 2)
assert.equal(reopenResult.reopenedRevision, 6)
assert.equal(reopenResult.undoRevision, 7)
assert.equal(reopenResult.redoRevision, 8)
assert.equal(reopenResult.renamedSectionTitle, 'Act II')
assert.equal(reopenResult.slideIntent, 'editorial-body')
assert.deepEqual(reopenResult.sectionIds, createResult.sectionIds)
assert.deepEqual(reopenResult.openingSlideIds, createResult.openingSlideIds)

console.log('Story Sections, Slides, ordering, history and replay outputs verified')
