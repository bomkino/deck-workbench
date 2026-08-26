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
slide.add
slide.move
slide.intent.set
content.add
content.update
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
slide.designOptions
slide.activeProjection
history.summary
preflight.list
export.plan
```

Avoid a generic query language or raw state dump across the privilege boundary. Create a new named projection when a real caller needs one.
