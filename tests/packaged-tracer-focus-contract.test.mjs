import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)

test('generated macOS acceptance harness verifies semantic Sequence identity and real keyboard mutation', async () => {
  await execFileAsync(process.execPath, ['scripts/build-packaged-tracer.mjs'])
  const generated = await readFile(new URL('../build/generated/PackagedTracer.swift', import.meta.url), 'utf8')
  assert.match(generated, /const sequenceOwner = document\.querySelector\('#sequence-focus-owner'\)/)
  assert.match(generated, /focusSequenceTarget\(\{ kind: 'slide', id: openingSlideId \}\)/)
  assert.match(generated, /focusSequenceTarget\(\{ kind: 'section', id: openingSectionId \}\)/)
  assert.match(generated, /sequenceFocusState\(\)/)
  assert.match(generated, /semanticSequenceIdentity/)
  assert.match(generated, /sequenceOwner\.getAttribute\('aria-activedescendant'\)/)
  assert.match(generated, /sequenceOwner\.dispatchEvent\(moveUp\)/)
  assert.match(generated, /sequenceOwner\.dispatchEvent\(moveSectionUp\)/)
  assert.match(generated, /sectionRole"\] as\? String == "treeitem"/)
  assert.doesNotMatch(generated, /waitForSequenceFocus|waitForSectionFocus|waitForSectionIdentityFocus/)
  assert.doesNotMatch(generated, /document\.activeElement === (?:button|row)/)
  assert.doesNotMatch(generated, /requestAnimationFrame\(\(\) => resolve\(\)\)/)
})
