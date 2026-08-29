import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'apps/macos/Sources/PackagedTracer.swift')
const outputPath = resolve(root, 'build/generated/PackagedTracer.swift')
let source = await readFile(sourcePath, 'utf8')

function replaceRequired(search, replacement, label) {
  const count = source.split(search).length - 1
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`)
  source = source.replace(search, replacement)
}

function replaceAllRequired(search, replacement, expected, label) {
  const count = source.split(search).length - 1
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`)
  source = source.split(search).join(replacement)
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`${label}: start marker is missing`)
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw new Error(`${label}: end marker is missing`)
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`${label}: start marker is ambiguous`)
  }
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

replaceBetween(
  "            const findSequenceSlide = () => [...document.querySelectorAll('#sequence-list [data-slide-id]')]",
  '            for (let attempt = 0; attempt < 100 && !findSequenceSlide(); attempt += 1) {',
  `            const sequenceList = document.querySelector('#sequence-list');
            const sequenceOwner = document.querySelector('#sequence-focus-owner');
            const findSequenceSlide = () => [...document.querySelectorAll('#sequence-list [data-slide-id]')]
              .find((item) => item.dataset.slideId === openingSlideId);
            const waitForSemanticSequenceFocus = async (kind, id) => {
              for (let attempt = 0; attempt < 20; attempt += 1) {
                const item = kind === 'slide'
                  ? [...document.querySelectorAll('#sequence-list [data-slide-id]')]
                    .find((candidate) => candidate.dataset.slideId === id)
                  : [...document.querySelectorAll('#sequence-list [data-section-id]')]
                    .find((candidate) => candidate.dataset.sectionId === id);
                const focus = sequenceFocusState();
                if (
                  sequenceList
                  && sequenceOwner
                  && item
                  && focus.kind === kind
                  && focus.id === id
                  && focus.ownerFocused === true
                  && sequenceOwner.getAttribute('aria-activedescendant') === item.id
                ) return true;
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
              }
              return false;
            };
`,
  'semantic Slide focus helper',
)

replaceRequired(
  '            sequenceSlide.focus();',
  "            if (!focusSequenceTarget({ kind: 'slide', id: openingSlideId })) throw new Error('Sequence composite could not focus the opening Slide');",
  'initial Slide semantic focus',
)
replaceRequired(
  '            sequenceSlide.dispatchEvent(moveUp);',
  '            sequenceOwner.dispatchEvent(moveUp);',
  'Slide move-up dispatch',
)
replaceRequired(
  '            findSequenceSlide().dispatchEvent(moveDown);',
  '            sequenceOwner.dispatchEvent(moveDown);',
  'Slide move-down dispatch',
)
replaceAllRequired(
  'await waitForSequenceFocus();',
  "await waitForSemanticSequenceFocus('slide', openingSlideId);",
  4,
  'Slide semantic focus waits',
)

replaceBetween(
  "            const findSequenceSection = () => [...document.querySelectorAll('#sequence-list [data-section-id]')]",
  '            const sequenceSection = findSequenceSection();',
  `            const findSequenceSection = () => [...document.querySelectorAll('#sequence-list [data-section-id]')]
              .find((row) => row.dataset.sectionId === openingSectionId);
`,
  'semantic Section focus helper',
)
replaceRequired(
  '            sequenceSection.focus();',
  "            if (!focusSequenceTarget({ kind: 'section', id: openingSectionId })) throw new Error('Sequence composite could not focus the Opening Part');",
  'initial Section semantic focus',
)
replaceRequired(
  '            sequenceSection.dispatchEvent(moveSectionUp);',
  '            sequenceOwner.dispatchEvent(moveSectionUp);',
  'Section move-up dispatch',
)
replaceRequired(
  '            findSequenceSection().dispatchEvent(moveSectionDown);',
  '            sequenceOwner.dispatchEvent(moveSectionDown);',
  'Section move-down dispatch',
)
replaceAllRequired(
  'await waitForSectionFocus();',
  "await waitForSemanticSequenceFocus('section', openingSectionId);",
  2,
  'Section semantic focus waits',
)

replaceBetween(
  '            const waitForSectionIdentityFocus = async (sectionId) => {',
  "            const sectionDownControl = findSectionMoveControl(secondSectionId, 'down');",
  '',
  'legacy Section identity focus helper',
)
replaceAllRequired(
  'await waitForSectionIdentityFocus(secondSectionId);',
  "await waitForSemanticSequenceFocus('section', secondSectionId);",
  2,
  'control Section semantic focus waits',
)
replaceRequired(
  '              accessibility["sectionRole"] as? String == "group",',
  '              accessibility["sectionRole"] as? String == "treeitem",',
  'Section accessibility role',
)

if (/waitForSequenceFocus|waitForSectionFocus|waitForSectionIdentityFocus/.test(source)) {
  throw new Error('Generated packaged tracer still contains a legacy row-focus poll')
}
if (/document\.activeElement === (?:button|row)/.test(source)) {
  throw new Error('Generated packaged tracer still asserts transient row DOM focus')
}
if (!source.includes("sequenceOwner.getAttribute('aria-activedescendant')")) {
  throw new Error('Generated packaged tracer does not verify the stable Sequence owner')
}

await mkdir(resolve(root, 'build/generated'), { recursive: true })
await writeFile(outputPath, `// Generated from PackagedTracer.swift with the semantic Sequence focus contract. Do not edit.\n${source}`)
console.log(`Built semantic packaged tracer: ${outputPath}`)
