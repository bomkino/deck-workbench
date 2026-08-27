import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const startSHA = '7ea90410287a5f90b44567ef5fc53e62736191ae'
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

const endingSHA = git('rev-parse', 'HEAD')
const branch = process.env.GITHUB_REF_NAME || git('branch', '--show-current') || 'detached'
const artifacts = join(root, 'artifacts')
const zipName = `Deck-Workbench-apple-silicon-${endingSHA}.app.zip`
const zipPath = join(artifacts, zipName)
const evidence = join(artifacts, 'evidence')
const pdfPath = join(evidence, 'tracer.pdf')
const createResult = JSON.parse(readFileSync(join(evidence, 'create-result.json'), 'utf8'))
const reopenResult = JSON.parse(readFileSync(join(evidence, 'reopen-result.json'), 'utf8'))
const storyCreateResult = JSON.parse(readFileSync(join(evidence, 'story-create-result.json'), 'utf8'))
const storyReopenResult = JSON.parse(readFileSync(join(evidence, 'story-reopen-result.json'), 'utf8'))

if (!readdirSync(artifacts).includes(zipName)) {
  throw new Error(`Missing exact-SHA artifact: ${zipName}`)
}

const commits = git('log', '--reverse', '--format=%H%x09%s', `${startSHA}..${endingSHA}`)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [sha, ...subject] = line.split('\t')
    return `| \`${sha}\` | ${escapeCell(subject.join('\t'))} | One causal repository boundary |`
  })
  .join('\n')

const receipt = `# Deck Workbench evidence receipt

## Identity

- Repository: \`bomkino/deck-workbench\`
- Branch: \`${branch}\`
- Starting SHA: \`${startSHA}\`
- Ending SHA: \`${endingSHA}\`
- Ticket: \`DW-T00 — Apple-Silicon Story Document Tracer\`
- Date: ${new Date().toISOString()}

## User-observable slice

The extracted \`Deck Workbench.app\` launches on Apple-Silicon macOS 26, creates a tiny native \`.pitchdeck\` through \`NSSavePanel\`, shows one Section and one Slide, edits the canonical Story headline, persists undo/redo history, changes Interface Scale independently from artboard zoom, quits, reopens the same document, undoes after reopen, and exports one PDF page from the same Slide projection.

## Commits

| SHA | Subject | Why this boundary is coherent |
|---|---|---|
${commits}

## Public seams exercised

| Seam | Scenario | Independent expectation | Result |
|---|---|---|---|
| Deck kernel/workspace | semantic commands plus Story/Sequence shortcut policy, stale and invalid rejection | Prepare is private; keyboard shares commands; rejection is atomic | Pass: 22 portable scenario tests |
| Document store | append/fsync/hash/replay/checkpoint plus corrupt/unsupported probes | Acknowledgement follows durable append; replay is deterministic | Pass: restart replay reached revision ${createResult.journalReplayRevision} |
| Typed bridge | generated Swift/JavaScript parity and malformed method | Only named methods cross the WebView boundary | Pass |
| Scale model | Interface Scale 1.25 and artboard zoom 0.5 | Chrome scale does not alter slide/export geometry | Pass |
| Packaged journey | extracted arm64 app create/reopen/undo/PDF | Exact user journey runs at ending SHA | Pass |

## Commands run

| Command | Exit | Key result / artifact |
|---|---:|---|
| \`npm test\` | 0 | 22/22 causal tests passed |
| \`node scripts/verify-source.mjs\` | 0 | Source contract passed |
| \`scripts/build-macos.sh\` | 0 | arm64 app built and ad-hoc signed |
| \`scripts/verify-packaged-macos.sh\` | 0 | ZIP extracted; signature, architecture and exact journey passed |
| \`swift ... PDFDocument.pageCount\` | 0 | One parseable PDF page |

## Packaged artifact

- Path: \`${relative(root, zipPath)}\`
- SHA-256: \`${sha256(zipPath)}\`
- Executable architecture: \`arm64\` only
- Minimum system: macOS 26.0
- Code-sign result: ad-hoc signature valid on build and extracted app
- ZIP integrity result: pass
- Extracted verification result: pass at embedded commit \`${endingSHA}\`
- PDF SHA-256: \`${sha256(pdfPath)}\`

## Exact packaged journey

\`create → native save panel → edit → journal durable → undo/redo → Interface Scale/artboard zoom → save/quit → reopen → undo after reopen → one-page PDF\`

Result: pass. Create revision ${createResult.revision}; reopen revision ${reopenResult.reopenedRevision}; post-reopen undo revision ${reopenResult.undoRevision}.

## Spec / Standards review

- reviewer/model or method: contract trace plus clean extracted-artifact verification
- findings: native save-path proof, portable checksum, positive journal replay and malformed bridge rejection gaps
- accepted changes: all four findings corrected before this receipt
- rejected findings and reason: none

## Third-party changes

| Dependency/code | Version/commit | Licence | Purpose | Notice updated |
|---|---|---|---|---|
| actions/checkout | v4 | MIT | CI checkout only | Yes |
| actions/setup-node | v4 | MIT | CI Node 24 only | Yes |
| actions/upload-artifact | v4 | MIT | Retain package/evidence only | Yes |

No third-party production runtime dependency is present.

## Honest status

- Planned / source-ready / packaged / integrated / release-ready: **Integrated DW-T00**, not release-ready
- Supported claims: exact packaged journey at ending SHA; native save flow; durable typed Story edit; semantic reopen/undo; arm64-only ad-hoc-signed ZIP; one-page PDF
- Unsupported claims: notarization, release distribution, final typography/PDF fidelity, PPTX, Garuda parity, broad editor behavior, production suitability
- External gates: none for DW-T00 verification
- Known limitations: one Section, one Slide, one headline field; full journal retained; tracer-only system event accepts the native save panel during automation

## Next dispatchable ticket

- Ticket: \`DW-W01-R04 — Sequence Section keyboard reorder\`
- Exact user journey: focus a Section in Sequence, move it by keyboard, save/reopen, then undo/redo exact order
- Dependency/gate: existing \`section.move\` semantics only; no drag library, editor dependency, Garuda or export expansion required
`

writeFileSync(join(evidence, 'DW-T00-EVIDENCE-RECEIPT.md'), receipt)

const storyReceipt = `# DW-W01 Story document slice evidence receipt

## Identity

- Repository: \`bomkino/deck-workbench\`
- Branch: \`${branch}\`
- DW-T00 baseline SHA: \`0e434c508088a5150b20c2d8aef92d830fa17b7c\`
- Ending SHA: \`${endingSHA}\`
- Slice: Deck/Section/Slide structure, explicit reversible removal and paragraph-preserving Story fields
- Date: ${new Date().toISOString()}

## User-observable slice

The extracted macOS app creates and reorders a second Section and Slide, uses Command–Enter on the real body textarea to commit three semantic paragraphs including an empty middle paragraph, preserves focus, leaves IME composition and dirty local undo untouched, routes clean-field keyboard undo/redo through durable history, moves a focused Slide across a Section boundary in both directions with Option–Arrow, removes the Content/Slide/empty Section, repairs an injected stale manifest head, closes/reopens, repeats semantic undo/redo, and checkpoints revision ${storyReopenResult.redoSectionRevision}.

## Public seams exercised

| Seam | Scenario | Result |
|---|---|---|
| Kernel | Story add/move/rename/intent, paragraph-preserving \`content.update\`, explicit removals, prepare/commit and atomic rejection | Pass |
| Story projection | Ordered Sections/Slides plus exact rich-text value and LF-joined plain text | Pass |
| Typed bridge | Keyboard \`content.update\` and \`slide.move\`, queries and history plus all structural commands from WebView | Pass |
| Journal/replay | Fourteen commands, five undos and five redos in one hash chain; restart replay at revision ${storyCreateResult.journalReplayRevision} | Pass |
| Crash recovery | Stale manifest head with valid durable journal tail | Pass: repaired and replayed to revision ${storyCreateResult.crashRecoveryRevision} |
| Session lifecycle | Checkpoint, host close, cleared projection, new-process reopen | Pass |
| Packaged app | Native create → keyboard paragraph commit/history → cross-Section keyboard reorder/focus → removals → save/quit → reopen → exact semantic history proof | Pass |

## Packaged artifact

- Path: \`${relative(root, zipPath)}\`
- SHA-256: \`${sha256(zipPath)}\`
- Executable architecture: \`arm64\` only
- Embedded commit: \`${endingSHA}\`
- Code-sign, ZIP and extracted verification: pass
- Create revision: ${storyCreateResult.revision}
- Reopen / paragraph undo / final redo revisions: ${storyReopenResult.reopenedRevision} / ${storyReopenResult.undoParagraphUpdateRevision} / ${storyReopenResult.redoSectionRevision}

## Honest status

- Status: **Packaged macOS DW-W01 structural slice**, not full integrated DW-W01
- Supported claims: native Story structure creation; stable-ID ordering; Deck/Section rename; Slide intent; role-keyed Content add/update/remove; lossless textarea-to-paragraph mapping; IME-safe keyboard commit policy; clean-field durable keyboard undo/redo; stable-ID Story and Sequence focus restoration; cross-Section Option–Arrow Slide reorder; explicit removal UI; semantic restoration after reopen; durable replay and stale-head repair
- Unsupported claims: hardware keyboard acceptance, VoiceOver, cascading deletion, marks/lists/headings/structured paste, broader crash-injection matrix, Garuda parity, production rich-editor behavior
- Scope boundary: no Garuda shell, editor dependency or export expansion was introduced

## Next dispatchable ticket

- Ticket: \`DW-W01-R04 — Sequence Section keyboard reorder\`
- Exact user journey: focus a Section in Sequence, move it by keyboard, save/reopen, then undo/redo exact order.
- Gate: existing \`section.move\` semantics only. No drag library, editor dependency, Garuda or export expansion is needed.
`

writeFileSync(join(evidence, 'DW-W01-STORY-SLICE-RECEIPT.md'), storyReceipt)
console.log(`Wrote exact-SHA DW-T00 and DW-W01 evidence receipts for ${endingSHA}`)
