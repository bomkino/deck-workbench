# Canonical glossary and command vocabulary

Use the Workbench Constitution as the binding domain definition. This document adds command payload expectations for implementation.

## Stable identities

Every durable entity uses a stable UUID or equivalent opaque identifier. Display order, titles, filenames and array indices are never identity.

```text
DeckID
SectionID
SlideID
ContentBlockID
MediaAssignmentID
DesignOptionID
CompositionID
ElementID
PatternID + PatternVersion
AssetReferenceID
CommandID
```

## Command envelope

```ts
interface CommandEnvelope<TType extends string, TPayload> {
  commandId: string
  expectedRevision: number
  type: TType
  payload: TPayload
  source: {
    kind: 'ui' | 'keyboard' | 'cli' | 'mcp' | 'migration'
    label?: string
  }
  issuedAt: string
}
```

The host may enrich journal metadata, but it may not reinterpret command meaning.

## Required initial commands

```text
deck.rename
section.add
section.rename
section.move
section.remove
slide.add
slide.move
slide.intent.set
slide.remove
content.add
content.update
content.remove
asset.reference.add
asset.availability.set
asset.assign
designOption.applyPattern
designOption.duplicate
designOption.rename
designOption.activate
element.text.detach
element.frame.update
element.crop.update
element.override.set
element.override.clear
designSystem.token.update
font.availability.set
preflight.acknowledge
```

## T00 command subset

The Apple-Silicon tracer needs only:

```text
section.add
slide.add
content.update
```

Undo and redo are session operations producing durable history records. The initial fixture may ship with one Section and one Slide so the user path begins immediately.

## Prepared change

The kernel prepares a change without mutating live state:

```ts
interface PreparedChange {
  commandId: string
  baseRevision: number
  nextRevision: number
  nextState: DeckState
  inverse: HistoryOperation
  projectionHints: ProjectionHint[]
  journalPayload: JournalOperation
}
```

The native host appends and fsyncs `journalPayload`. Only after durability succeeds may the host commit `nextState` and acknowledge the workspace.

## Query surface

Queries are read-only and do not advance revision:

```text
deck.summary
story.section
story.slide
story.document
slide.designOptions
slide.activeProjection
history.summary
preflight.list
export.plan
```

Avoid a generic query language or raw state dump across the privilege boundary. Create a new named projection when a real caller needs one.

`story.document` is the bounded ordered Editorial Spine projection: Deck identity/title, revision, Section identity/title, and each Slide identity/intent/headline summary. It is not a raw checkpoint and does not expose history payloads or host paths.

## Content removal

`content.remove` accepts stable `slideId` and `blockId` identities. It removes only a
non-headline Content Block. Its history inverse retains the complete Block plus its
stable predecessor anchor so undo restores the same identity and order after reopen.

## Structural removal

`slide.remove` accepts one stable `slideId`. It is rejected when the Deck contains
only one Slide. Its inverse retains the full Slide, source Section identity and
stable predecessor anchor.

`section.remove` accepts one stable `sectionId`. It is rejected unless the Section
is empty, and it may not remove the Deck's final Section. Its inverse retains the
complete empty Section and stable predecessor anchor. Neither command cascades.

## Plain-text Story field mapping

The minimal DOM editor maps normalized LF-delimited textarea input to canonical
rich-text JSON before dispatching `content.update`. Every line becomes one
`paragraph`; a blank line becomes an empty `paragraph`. The projection joins those
paragraphs with LF for textarea display. This is a lossless paragraph boundary
mapping, not a claim of broad rich-editor behavior.

Keyboard commits use the same `content.update` envelope with
`source.kind = keyboard`. Keyboard undo/redo remains the same durable history
operation; no keyboard-only mutation vocabulary exists. Local uncommitted text undo
stays inside the focused editor until its value matches the acknowledged projection.

Focused Sequence Slide rows use Option–Up / Option–Down to dispatch the existing
`slide.move` command with `source.kind = keyboard`. Boundary moves target the
preceding Section's end or following Section's start using stable IDs. Focus is
reacquired by Slide ID after projection; unavailable directions remain uncancelled.
