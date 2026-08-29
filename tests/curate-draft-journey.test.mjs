import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const curate = await readFile(
  new URL('../packages/workspace/app/workspace-curate.js', import.meta.url),
  'utf8',
)

test('Find More owns one draft per Slide until that Slide saves successfully', () => {
  assert.match(curate, /const curateFindMoreDrafts = new Map\(\)/)
  assert.match(curate, /const draft = curateFindMoreDrafts\.get\(selectedSlideId\) \?\? findMore/)
  assert.match(curate, /const value = normalizedFindMoreValue\(\{[\s\S]*brief: elements\.findMoreBrief\.value/)
  assert.match(curate, /if \(findMoreValuesEqual\(value, curateSlideProjection\?\.findMoreMedia\)\) \{\n\s+curateFindMoreDrafts\.delete\(selectedSlideId\)[\s\S]*curateFindMoreDrafts\.set\(selectedSlideId, value\)/)
  assert.match(curate, /const targetSlideId = selectedSlideId[\s\S]*slideId: targetSlideId[\s\S]*if \(result\) \{\n\s+curateFindMoreDrafts\.delete\(targetSlideId\)/)
  assert.match(curate, /async function saveAllCurateFindMoreDrafts\(\)[\s\S]*query\(\{ name: 'curate\.slide', params: \{ slideId \} \}\)[\s\S]*findMoreValuesEqual\(value, current\?\.findMoreMedia\)[\s\S]*executeStructural\('curate\.findMore\.set'[\s\S]*curateFindMoreDrafts\.delete\(slideId\)/)
  assert.match(curate, /function clearCurateState\(\) \{[\s\S]*curateFindMoreDrafts\.clear\(\)/)
  assert.doesNotMatch(curate, /curateFindMoreDirty|curateFindMoreSlideId/)
})
