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
assert.equal(checkpoint.revision, 11)
assert.equal(records.length, 11)
assert.deepEqual(records.map((record) => record.revision), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
assert.deepEqual(records.map((record) => record.operation), [
  'command', 'command', 'command', 'command', 'command', 'command', 'command', 'command', 'command', 'undo', 'redo',
])
assert.deepEqual(records.slice(0, 9).map((record) => record.command.type), [
  'section.add',
  'slide.add',
  'section.move',
  'slide.move',
  'section.rename',
  'slide.intent.set',
  'deck.rename',
  'content.add',
  'content.remove',
])
assert.equal(records[0].previousHash, '0'.repeat(64))
for (let index = 1; index < records.length; index += 1) {
  assert.equal(records[index].previousHash, records[index - 1].recordHash)
}
assert.equal(manifest.journalHeadHash, records.at(-1).recordHash)
assert.equal(createResult.revision, 9)
assert.equal(createResult.journalReplayRevision, 9)
assert.equal(createResult.deckTitle, 'The Hill')
assert.equal(createResult.renamedSectionTitle, 'Act II')
assert.equal(createResult.slideIntent, 'editorial-body')
assert.equal(createResult.bodyText, 'A body block that survives design.')
assert.equal(createResult.bodyRemoved, true)
assert.equal(createResult.crashRecoveryRevision, 9)
assert.equal(createResult.closedBeforeReopen, true)
assert.equal(createResult.sectionIds.length, 2)
assert.equal(createResult.openingSlideIds.length, 2)
assert.equal(reopenResult.reopenedRevision, 9)
assert.equal(reopenResult.undoRevision, 10)
assert.equal(reopenResult.redoRevision, 11)
assert.equal(reopenResult.deckTitle, 'The Hill')
assert.equal(reopenResult.renamedSectionTitle, 'Act II')
assert.equal(reopenResult.slideIntent, 'editorial-body')
assert.equal(reopenResult.bodyText, 'A body block that survives design.')
assert.equal(reopenResult.bodyBlockId, createResult.bodyBlockId)
assert.equal(reopenResult.bodyRemovedAfterRedo, true)
assert.deepEqual(reopenResult.sectionIds, createResult.sectionIds)
assert.deepEqual(reopenResult.openingSlideIds, createResult.openingSlideIds)

const finalBlocks = checkpoint.deck.sections[1].slides[1].contentBlocks
assert.equal(finalBlocks.length, 1)
assert.equal(finalBlocks.some((block) => block.id === createResult.bodyBlockId), false)
const removalHistory = checkpoint.undoStack.at(-1)
assert.equal(removalHistory.forward.type, 'content.remove')
assert.equal(removalHistory.forward.payload.blockId, createResult.bodyBlockId)
assert.equal(removalHistory.inverse.type, 'content.insert')
assert.equal(removalHistory.inverse.payload.block.id, createResult.bodyBlockId)
assert.equal(removalHistory.inverse.payload.afterBlockId, finalBlocks[0].id)

console.log('Story structure, durable Content removal, stable undo identity and replay outputs verified')
