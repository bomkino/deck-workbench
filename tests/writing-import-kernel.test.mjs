import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import { DurableDeckSession, WorkbenchFailure } from '../packages/document-store/index.mjs'
import { seedWritingImport, validateWritingImport } from '../apps/linux/writing-import.mjs'

const kernelSource = await readFile(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8')
const parserSource = await readFile(new URL('../packages/workspace/app/workspace-writing-import.js', import.meta.url), 'utf8')
const fixture = await readFile(new URL('./fixtures/workbench-writing-import-v1.md', import.meta.url), 'utf8')
const context = vm.createContext({ console, TextEncoder })
vm.runInContext(kernelSource, context, { filename: 'deck-kernel.js' })
vm.runInContext(parserSource, context, { filename: 'workspace-writing-import.js' })
const kernel = context.DeckKernel
const imported = context.WorkbenchWritingImport.parse(fixture).deck

function deterministicIDs(prefix) {
  let count = 0
  return () => `${prefix}-${String(++count).padStart(4, '0')}`
}

function semantics(story) {
  return {
    deckTitle: story.deckTitle,
    sections: story.sections.map((section) => ({
      title: section.title,
      purpose: section.purpose,
      slides: section.slides.map((slide) => ({
        intent: slide.intent,
        blocks: slide.contentBlocks.map((block) => ({
          role: block.role,
          semanticKey: block.semanticKey,
          text: block.plainText,
        })),
      })),
    })),
  }
}

test('writing import creates one canonical revision-zero checkpoint and reopens with stable IDs and exact semantics', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-writing-import-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packagePath = join(root, 'Imported.pitchdeck')
  const seed = seedWritingImport(imported, deterministicIDs('first'))
  let session = await DurableDeckSession.create({ packagePath, kernel, seed, now: new Date('2026-09-02T00:00:00Z') })

  assert.equal(session.revision, 0)
  const checkpointBytes = await readFile(join(packagePath, 'checkpoint.json'))
  const checkpoint = JSON.parse(checkpointBytes)
  assert.equal(checkpoint.revision, 0)
  assert.deepEqual(checkpoint.undoStack, [])
  assert.deepEqual(checkpoint.redoStack, [])
  assert.deepEqual(checkpoint.processedCommands, {})
  assert.equal((await readFile(join(packagePath, 'journal.ndjson'))).length, 0)

  const storyBefore = session.query('story.document')
  const idsBefore = storyBefore.sections.flatMap((section) => [
    section.id,
    ...section.slides.flatMap((slide) => [slide.id, ...slide.contentBlocks.map((block) => block.id)]),
  ])
  assert.equal(new Set(idsBefore).size, idsBefore.length)
  assert.equal(session.query('deck.summary').canvas.id, 'widescreen-1920x1080')
  assert.equal(storyBefore.sections[0].slides[0].intent, 'full-bleed')
  assert.equal(storyBefore.sections[0].slides[0].contentBlocks[0].role, 'headline')
  assert.equal(storyBefore.sections[0].slides[0].contentBlocks.at(-1).role, 'workbench-plan')
  const firstPlan = JSON.parse(storyBefore.sections[0].slides[0].contentBlocks.at(-1).plainText)
  assert.equal(firstPlan.format, 'pitchdog.workbench-plan')
  assert.equal(firstPlan.version, 1)
  assert.equal(firstPlan.internalTitle, 'First Light')
  assert.equal(firstPlan.purpose, 'Open on the landscape')
  assert.deepEqual(firstPlan.copyFieldStates, {
    headline: 'present',
    subheadline: 'unreviewed',
    body: 'present',
  })
  assert.equal(
    storyBefore.sections[0].slides[0].contentBlocks.find((block) => block.role === 'body').plainText,
    'Read the [field notes](https://example.test/notes).\n\nThen listen.\nPurpose: this is visible copy, not metadata.',
  )
  assert.deepEqual(
    storyBefore.sections[0].slides[1].contentBlocks.map((block) => block.role),
    ['headline', 'subheadline', 'workbench-plan'],
  )

  await session.close()
  session = await DurableDeckSession.open({ packagePath, kernel })
  const storyAfter = session.query('story.document')
  assert.equal(session.query('deck.summary').canvas.id, 'widescreen-1920x1080')
  const idsAfter = storyAfter.sections.flatMap((section) => [
    section.id,
    ...section.slides.flatMap((slide) => [slide.id, ...slide.contentBlocks.map((block) => block.id)]),
  ])
  assert.deepEqual(idsAfter, idsBefore)
  assert.deepEqual(semantics(storyAfter), semantics(storyBefore))
  await session.close({ save: false })

  const secondPath = join(root, 'Imported Again.pitchdeck')
  const second = await DurableDeckSession.create({
    packagePath: secondPath,
    kernel,
    seed: seedWritingImport(imported, deterministicIDs('second')),
  })
  const secondStory = second.query('story.document')
  assert.deepEqual(semantics(secondStory), semantics(storyBefore))
  assert.notEqual(secondStory.sections[0].id, storyBefore.sections[0].id)
  assert.notEqual(secondStory.sections[0].slides[0].id, storyBefore.sections[0].slides[0].id)
  await second.close({ save: false })
})

test('native payload validation rejects malformed and over-bound input before filesystem creation', async (t) => {
  assert.throws(() => validateWritingImport({ ...imported, canvas: 'unknown' }), /canvas is unsupported/)
  assert.throws(() => validateWritingImport({ ...imported, extra: true }), /unknown field extra/)
  assert.throws(() => validateWritingImport({
    ...imported,
    parts: imported.parts.map((part, index) => index === 0 ? {
      ...part,
      slides: part.slides.map((slide, slideIndex) => slideIndex === 0 ? { ...slide, style: 'unknown' } : slide),
    } : part),
  }), /Style is unsupported/)
  assert.throws(() => validateWritingImport({ ...imported, title: 'x'.repeat(241) }), /exceeds 240/)

  const root = await mkdtemp(join(tmpdir(), 'deck-workbench-writing-refusal-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packagePath = join(root, 'Existing.pitchdeck')
  const existing = await DurableDeckSession.create({
    packagePath,
    kernel,
    seed: seedWritingImport(imported, deterministicIDs('existing')),
  })
  await existing.close({ save: false })
  const before = await readFile(join(packagePath, 'checkpoint.json'))
  await assert.rejects(
    DurableDeckSession.create({ packagePath, kernel, seed: seedWritingImport(imported, deterministicIDs('refused')) }),
    (error) => error instanceof WorkbenchFailure && /already exists/.test(error.message),
  )
  assert.deepEqual(await readFile(join(packagePath, 'checkpoint.json')), before)
})
