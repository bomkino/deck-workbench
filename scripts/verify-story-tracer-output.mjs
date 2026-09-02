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
assert.equal(checkpoint.revision, 49)
assert.equal(records.length, 49)
assert.deepEqual(records.map((record) => record.revision), Array.from({ length: 49 }, (_, index) => index + 1))
assert.deepEqual(records.map((record) => record.operation), [
  ...Array(9).fill('command'),
  'undo', 'redo',
  ...Array(12).fill('command'),
  ...Array(13).fill('undo'),
  ...Array(13).fill('redo'),
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
  'designOption.createFromPlan',
  'slide.move',
  'slide.move',
  'section.move',
  'section.move',
  'slide.move',
  'slide.move',
  'section.move',
  'section.move',
  'content.remove',
  'slide.remove',
  'section.remove',
])
assert.equal(commandRecords[8].command.source.kind, 'keyboard')
assert.equal(commandRecords[9].command.source.kind, 'ui')
assert.equal(commandRecords[10].command.source.kind, 'keyboard')
assert.equal(commandRecords[11].command.source.kind, 'keyboard')
assert.equal(commandRecords[12].command.source.kind, 'keyboard')
assert.equal(commandRecords[13].command.source.kind, 'keyboard')
assert.equal(commandRecords[14].command.source.kind, 'ui')
assert.equal(commandRecords[15].command.source.kind, 'ui')
assert.equal(commandRecords[16].command.source.kind, 'ui')
assert.equal(commandRecords[17].command.source.kind, 'ui')
assert.equal(records[9].operation, 'undo')
assert.equal(records[10].operation, 'redo')
assert.equal(records[0].previousHash, '0'.repeat(64))
for (let index = 1; index < records.length; index += 1) {
  assert.equal(records[index].previousHash, records[index - 1].recordHash)
}
assert.equal(manifest.journalHeadHash, records.at(-1).recordHash)
assert.equal(createResult.revision, 23)
assert.equal(createResult.journalReplayRevision, 23)
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
assert.equal(createResult.assemblyCreationRevision, 12)
assert.equal(typeof createResult.assemblyDesignOptionId, 'string')
assert.ok(createResult.assemblyDesignOptionId.length > 0)
assert.equal(createResult.sequenceMoveUpRevision, 13)
assert.equal(createResult.sequenceMoveDownRevision, 14)
assert.equal(createResult.sequenceKeyboardFocusRetained, true)
assert.equal(createResult.sectionMoveUpRevision, 15)
assert.equal(createResult.sectionMoveDownRevision, 16)
assert.equal(createResult.sectionKeyboardFocusRetained, true)
assert.equal(createResult.controlSlideMoveDownRevision, 17)
assert.equal(createResult.controlSlideMoveUpRevision, 18)
assert.equal(createResult.controlSectionMoveDownRevision, 19)
assert.equal(createResult.controlSectionMoveUpRevision, 20)
assert.equal(createResult.sequenceControlFocusRetained, true)
assert.equal(createResult.compositionCommitIgnored, true)
assert.equal(createResult.dirtyUndoReservedForText, true)
assert.equal(createResult.bodyRemoved, true)
assert.equal(createResult.structuralRemoval, true)
assert.equal(createResult.removedSectionId, createResult.sectionIds[0])
assert.equal(createResult.removedSlideId, createResult.openingSlideIds[1])
assert.equal(createResult.crashRecoveryRevision, 23)
assert.equal(createResult.closedBeforeReopen, true)
assert.equal(createResult.sectionIds.length, 2)
assert.equal(createResult.openingSlideIds.length, 2)
assert.equal(reopenResult.reopenedRevision, 23)
assert.equal(reopenResult.undoSectionRevision, 24)
assert.equal(reopenResult.undoSlideRevision, 25)
assert.equal(reopenResult.undoContentRevision, 26)
assert.equal(reopenResult.undoControlSectionMoveUpRevision, 27)
assert.equal(reopenResult.undoControlSectionMoveDownRevision, 28)
assert.equal(reopenResult.undoControlSlideMoveUpRevision, 29)
assert.equal(reopenResult.undoControlSlideMoveDownRevision, 30)
assert.equal(reopenResult.undoSectionMoveDownRevision, 31)
assert.equal(reopenResult.undoSectionMoveUpRevision, 32)
assert.equal(reopenResult.undoSequenceMoveDownRevision, 33)
assert.equal(reopenResult.undoSequenceMoveUpRevision, 34)
assert.equal(reopenResult.undoAssemblyRevision, 35)
assert.equal(reopenResult.undoParagraphUpdateRevision, 36)
assert.equal(reopenResult.redoParagraphUpdateRevision, 37)
assert.equal(reopenResult.redoAssemblyRevision, 38)
assert.equal(reopenResult.redoSequenceMoveUpRevision, 39)
assert.equal(reopenResult.redoSequenceMoveDownRevision, 40)
assert.equal(reopenResult.redoSectionMoveUpRevision, 41)
assert.equal(reopenResult.redoSectionMoveDownRevision, 42)
assert.equal(reopenResult.redoControlSlideMoveDownRevision, 43)
assert.equal(reopenResult.redoControlSlideMoveUpRevision, 44)
assert.equal(reopenResult.redoControlSectionMoveDownRevision, 45)
assert.equal(reopenResult.redoControlSectionMoveUpRevision, 46)
assert.equal(reopenResult.redoContentRevision, 47)
assert.equal(reopenResult.redoSlideRevision, 48)
assert.equal(reopenResult.redoSectionRevision, 49)
assert.equal(reopenResult.assemblyDesignOptionId, createResult.assemblyDesignOptionId)
assert.equal(reopenResult.assemblyUndoRedoStable, true)
assert.equal(reopenResult.deckTitle, 'The Hill')
assert.equal(reopenResult.renamedSectionTitle, 'Act II')
assert.equal(reopenResult.slideIntent, 'editorial-body')
assert.equal(reopenResult.bodyOriginalText, createResult.bodyOriginalText)
assert.equal(reopenResult.bodyText, createResult.bodyText)
assert.deepEqual(reopenResult.bodyParagraphs, createResult.bodyParagraphs)
assert.equal(reopenResult.paragraphsPreservedAfterReopen, true)
assert.equal(reopenResult.keyboardFocusRetained, true)
assert.equal(reopenResult.sequenceKeyboardFocusRetained, true)
assert.equal(reopenResult.sectionKeyboardFocusRetained, true)
assert.equal(reopenResult.sequenceControlFocusRetained, true)
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

const controlSectionMoveUp = checkpoint.undoStack.at(-4)
assert.equal(controlSectionMoveUp.forward.type, 'section.move')
assert.equal(controlSectionMoveUp.forward.payload.sectionId, createResult.sectionIds[0])
assert.equal(controlSectionMoveUp.forward.payload.afterSectionId, null)
assert.equal(controlSectionMoveUp.inverse.type, 'section.move')
assert.equal(controlSectionMoveUp.inverse.payload.afterSectionId, createResult.sectionIds[1])

const controlSectionMoveDown = checkpoint.undoStack.at(-5)
assert.equal(controlSectionMoveDown.forward.type, 'section.move')
assert.equal(controlSectionMoveDown.forward.payload.sectionId, createResult.sectionIds[0])
assert.equal(controlSectionMoveDown.forward.payload.afterSectionId, createResult.sectionIds[1])
assert.equal(controlSectionMoveDown.inverse.type, 'section.move')
assert.equal(controlSectionMoveDown.inverse.payload.afterSectionId, null)

const controlSlideMoveUp = checkpoint.undoStack.at(-6)
assert.equal(controlSlideMoveUp.forward.type, 'slide.move')
assert.equal(controlSlideMoveUp.forward.payload.slideId, createResult.openingSlideIds[0])
assert.equal(controlSlideMoveUp.forward.payload.targetSectionId, createResult.sectionIds[1])
assert.equal(controlSlideMoveUp.forward.payload.afterSlideId, null)
assert.equal(controlSlideMoveUp.inverse.type, 'slide.move')
assert.equal(controlSlideMoveUp.inverse.payload.afterSlideId, createResult.openingSlideIds[1])

const controlSlideMoveDown = checkpoint.undoStack.at(-7)
assert.equal(controlSlideMoveDown.forward.type, 'slide.move')
assert.equal(controlSlideMoveDown.forward.payload.slideId, createResult.openingSlideIds[0])
assert.equal(controlSlideMoveDown.forward.payload.targetSectionId, createResult.sectionIds[1])
assert.equal(controlSlideMoveDown.forward.payload.afterSlideId, createResult.openingSlideIds[1])
assert.equal(controlSlideMoveDown.inverse.type, 'slide.move')
assert.equal(controlSlideMoveDown.inverse.payload.afterSlideId, null)

const sectionMoveDown = checkpoint.undoStack.at(-8)
assert.equal(sectionMoveDown.forward.type, 'section.move')
assert.equal(sectionMoveDown.forward.payload.sectionId, createResult.sectionIds[1])
assert.equal(sectionMoveDown.forward.payload.afterSectionId, createResult.sectionIds[0])
assert.equal(sectionMoveDown.inverse.type, 'section.move')
assert.equal(sectionMoveDown.inverse.payload.afterSectionId, null)

const sectionMoveUp = checkpoint.undoStack.at(-9)
assert.equal(sectionMoveUp.forward.type, 'section.move')
assert.equal(sectionMoveUp.forward.payload.sectionId, createResult.sectionIds[1])
assert.equal(sectionMoveUp.forward.payload.afterSectionId, null)
assert.equal(sectionMoveUp.inverse.type, 'section.move')
assert.equal(sectionMoveUp.inverse.payload.afterSectionId, createResult.sectionIds[0])

const sequenceMoveDown = checkpoint.undoStack.at(-10)
assert.equal(sequenceMoveDown.forward.type, 'slide.move')
assert.equal(sequenceMoveDown.forward.payload.slideId, createResult.openingSlideIds[0])
assert.equal(sequenceMoveDown.forward.payload.targetSectionId, createResult.sectionIds[1])
assert.equal(sequenceMoveDown.forward.payload.afterSlideId, null)
assert.equal(sequenceMoveDown.inverse.type, 'slide.move')
assert.equal(sequenceMoveDown.inverse.payload.targetSectionId, createResult.sectionIds[0])
assert.equal(sequenceMoveDown.inverse.payload.afterSlideId, null)

const sequenceMoveUp = checkpoint.undoStack.at(-11)
assert.equal(sequenceMoveUp.forward.type, 'slide.move')
assert.equal(sequenceMoveUp.forward.payload.slideId, createResult.openingSlideIds[0])
assert.equal(sequenceMoveUp.forward.payload.targetSectionId, createResult.sectionIds[0])
assert.equal(sequenceMoveUp.forward.payload.afterSlideId, null)
assert.equal(sequenceMoveUp.inverse.type, 'slide.move')
assert.equal(sequenceMoveUp.inverse.payload.targetSectionId, createResult.sectionIds[1])
assert.equal(sequenceMoveUp.inverse.payload.afterSlideId, null)

const assemblyCreation = checkpoint.undoStack.at(-12)
assert.equal(assemblyCreation.forward.type, 'designOption.insert')
assert.equal(assemblyCreation.forward.payload.slideId, createResult.openingSlideIds[1])
assert.equal(assemblyCreation.forward.payload.designOption.id, createResult.assemblyDesignOptionId)
assert.equal(assemblyCreation.inverse.type, 'designOption.remove')
assert.equal(assemblyCreation.inverse.payload.slideId, createResult.openingSlideIds[1])
assert.equal(assemblyCreation.inverse.payload.designOptionId, createResult.assemblyDesignOptionId)

const paragraphUpdate = checkpoint.undoStack.at(-13)
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

console.log('Keyboard and visible-control Story reorder, explicit removal, replay and stable undo/redo verified')
