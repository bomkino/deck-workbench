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
assert.equal(checkpoint.revision, 22)
assert.equal(records.length, 22)
assert.deepEqual(records.map((record) => record.revision), Array.from({ length: 22 }, (_, index) => index + 1))
assert.deepEqual(records.map((record) => record.operation), [
  ...Array(9).fill('command'),
  'undo', 'redo',
  ...Array(3).fill('command'),
  'undo', 'undo', 'undo', 'undo',
  'redo', 'redo', 'redo', 'redo',
])
const commandRecords = records.filter((record) => record.operation === 'command')
assert.deepEqual(commandRecords.map((record) => record.command.type), [
  'section.add',
  'slide.add',
  'section.move',
  'slide.move',
  'section.rename',
  'slide.intent.set',
  'deck.rename',
  'content.add',
  'content.update',
  'content.remove',
  'slide.remove',
  'section.remove',
])
assert.equal(commandRecords[8].command.source.kind, 'keyboard')
assert.equal(records[9].operation, 'undo')
assert.equal(records[10].operation, 'redo')
assert.equal(records[0].previousHash, '0'.repeat(64))
for (let index = 1; index < records.length; index += 1) {
  assert.equal(records[index].previousHash, records[index - 1].recordHash)
}
assert.equal(manifest.journalHeadHash, records.at(-1).recordHash)
assert.equal(createResult.revision, 14)
assert.equal(createResult.journalReplayRevision, 14)
assert.equal(createResult.deckTitle, 'The Hill')
assert.equal(createResult.renamedSectionTitle, 'Act II')
assert.equal(createResult.slideIntent, 'editorial-body')
assert.equal(createResult.bodyOriginalText, 'A body block that survives design.')
assert.equal(createResult.bodyText, 'A body block.\n\nThat survives design.')
assert.deepEqual(createResult.bodyParagraphs, ['A body block.', '', 'That survives design.'])
assert.equal(createResult.keyboardCommitRevision, 9)
assert.equal(createResult.keyboardUndoRevision, 10)
assert.equal(createResult.keyboardRedoRevision, 11)
assert.equal(createResult.keyboardFocusRetained, true)
assert.equal(createResult.compositionCommitIgnored, true)
assert.equal(createResult.dirtyUndoReservedForText, true)
assert.equal(createResult.bodyRemoved, true)
assert.equal(createResult.structuralRemoval, true)
assert.equal(createResult.removedSectionId, createResult.sectionIds[0])
assert.equal(createResult.removedSlideId, createResult.openingSlideIds[1])
assert.equal(createResult.crashRecoveryRevision, 14)
assert.equal(createResult.closedBeforeReopen, true)
assert.equal(createResult.sectionIds.length, 2)
assert.equal(createResult.openingSlideIds.length, 2)
assert.equal(reopenResult.reopenedRevision, 14)
assert.equal(reopenResult.undoSectionRevision, 15)
assert.equal(reopenResult.undoSlideRevision, 16)
assert.equal(reopenResult.undoContentRevision, 17)
assert.equal(reopenResult.undoParagraphUpdateRevision, 18)
assert.equal(reopenResult.redoParagraphUpdateRevision, 19)
assert.equal(reopenResult.redoContentRevision, 20)
assert.equal(reopenResult.redoSlideRevision, 21)
assert.equal(reopenResult.redoSectionRevision, 22)
assert.equal(reopenResult.deckTitle, 'The Hill')
assert.equal(reopenResult.renamedSectionTitle, 'Act II')
assert.equal(reopenResult.slideIntent, 'editorial-body')
assert.equal(reopenResult.bodyOriginalText, createResult.bodyOriginalText)
assert.equal(reopenResult.bodyText, createResult.bodyText)
assert.deepEqual(reopenResult.bodyParagraphs, createResult.bodyParagraphs)
assert.equal(reopenResult.paragraphsPreservedAfterReopen, true)
assert.equal(reopenResult.keyboardFocusRetained, true)
assert.equal(reopenResult.bodyBlockId, createResult.bodyBlockId)
assert.equal(reopenResult.bodyRemovedAfterRedo, true)
assert.equal(reopenResult.structuralRemovalAfterRedo, true)
assert.deepEqual(reopenResult.sectionIds, createResult.sectionIds)
assert.deepEqual(reopenResult.openingSlideIds, createResult.openingSlideIds)

assert.equal(checkpoint.deck.sections.length, 1)
assert.equal(checkpoint.deck.sections[0].id, createResult.sectionIds[1])
assert.deepEqual(checkpoint.deck.sections[0].slides.map((slide) => slide.id), [createResult.openingSlideIds[0]])

const sectionRemoval = checkpoint.undoStack.at(-1)
assert.equal(sectionRemoval.forward.type, 'section.remove')
assert.equal(sectionRemoval.forward.payload.sectionId, createResult.removedSectionId)
assert.equal(sectionRemoval.inverse.type, 'section.insert')
assert.equal(sectionRemoval.inverse.payload.section.id, createResult.removedSectionId)
assert.equal(sectionRemoval.inverse.payload.afterSectionId, null)

const slideRemoval = checkpoint.undoStack.at(-2)
assert.equal(slideRemoval.forward.type, 'slide.remove')
assert.equal(slideRemoval.forward.payload.slideId, createResult.removedSlideId)
assert.equal(slideRemoval.inverse.type, 'slide.insert')
assert.equal(slideRemoval.inverse.payload.sectionId, createResult.sectionIds[1])
assert.equal(slideRemoval.inverse.payload.slide.id, createResult.removedSlideId)
assert.equal(slideRemoval.inverse.payload.afterSlideId, createResult.openingSlideIds[0])

const contentRemoval = checkpoint.undoStack.at(-3)
assert.equal(contentRemoval.forward.type, 'content.remove')
assert.equal(contentRemoval.forward.payload.blockId, createResult.bodyBlockId)
assert.equal(contentRemoval.inverse.type, 'content.insert')
assert.equal(contentRemoval.inverse.payload.block.id, createResult.bodyBlockId)

const paragraphUpdate = checkpoint.undoStack.at(-4)
assert.equal(paragraphUpdate.forward.type, 'content.set')
assert.equal(paragraphUpdate.forward.payload.blockId, createResult.bodyBlockId)
assert.deepEqual(
  paragraphUpdate.forward.payload.value.content.map((paragraph) => paragraph.content.map((node) => node.text).join('')),
  createResult.bodyParagraphs,
)
assert.equal(paragraphUpdate.inverse.type, 'content.set')
assert.deepEqual(
  paragraphUpdate.inverse.payload.value.content.map((paragraph) => paragraph.content.map((node) => node.text).join('')),
  [createResult.bodyOriginalText],
)

console.log('Keyboard-complete paragraph Story edit, explicit removal, replay and stable undo/redo verified')
