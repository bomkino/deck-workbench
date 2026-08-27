# DW-W01 — Story Document

## First bounded slice

Extend the integrated DW-T00 path without introducing a second mutation route:

```text
native create
→ add Section
→ add Slide with canonical headline
→ reorder Section by stable ID
→ move Slide across Sections by stable ID
→ rename Section
→ set Slide intent
→ rename Deck
→ add role-keyed semantic Content Block
→ save and quit
→ explicitly close the host session
→ reopen
→ undo and redo the move through durable history
```

## Commands

- `section.add`
- `section.move`
- `section.rename`
- `section.remove` (D01-B empty-only)
- `slide.add`
- `slide.move`
- `slide.intent.set`
- `slide.remove` (D01-B explicit-only)
- `deck.rename`
- `content.add`
- `content.update`
- `content.remove` (D01-A only)

All Story commands use the existing command envelope, non-mutating prepare, append/fsync-before-commit acknowledgement, hash-chained journal, idempotency map and semantic undo/redo stacks.

## Projection

`story.document` is a named, read-only Editorial Spine projection. It returns only the ordered Story structure and headline summaries needed by the minimal workspace; it is not a generic state dump.

## Acceptance for this slice

- caller-first structural commands use stable entity IDs and stable neighbor IDs rather than array indices as identity;
- invalid target, anchor or duplicate identity rejects atomically;
- the minimal Sequence rail renders all Sections and Slides;
- native controls can add a Section, add a Slide, select a Slide and move an item up;
- packaged automation creates and reorders two Sections/two Slides through the typed WebView bridge;
- restart replay reaches revision 8 before checkpoint save;
- packaged quit/reopen preserves structure/metadata/content and Content Block undo/redo reaches revisions 9/10;
- a stale manifest head over a valid fsynced journal tail is repaired and replayed to revision 8;
- explicit close checkpoints the Deck, clears host ownership and clears the workspace projection before the reopen process;
- the final app artifact remains arm64-only, ad-hoc signed, extracted and exact-SHA verified;
- all DW-T00 tests and packaged journey remain green.

## Explicitly deferred

- cascading Section/Slide removal and rich-editor schema breadth;
- drag-and-drop interaction;
- crash-injection matrix beyond the recovery behavior already proven;
- Garuda parity, editor dependencies and export breadth.

This slice may be called packaged on macOS after its exact journey passes. It must not be called the complete integrated DW-W01 ticket because the execution index requires broader Story behavior and Mac/Garuda parity.

## DW-W01-D01 — Story deletion semantics

### Design It Twice

**Design A — explicit conservative removal.** `content.remove` removes one named,
non-headline Content Block. Undo stores the full Block and its stable predecessor
anchor. Section and Slide removal remain unavailable until their empty/last-item
rules are proven separately. This keeps destructive scope small and preserves the
existing `slide.activeProjection` headline contract.

**Design B — cascading subtree removal.** Section and Slide removal may delete
descendants in one command while history stores the full removed subtree. This is
faster for bulk cleanup, but increases accidental-loss risk, journal size and policy
surface around last Section/Slide behavior.

### D01-A selection

Use Design A for the next causal slice. Prove this exact journey before exposing any
Section or Slide removal:

```text
add body Content Block
→ remove it by stable SlideID + ContentBlockID
→ save and close
→ reopen
→ undo restores same identity and order
→ redo removes it again
```

Public `content.remove` rejects headline removal, missing identities and stale
revisions atomically. Internal history operations remain capable of removing a
newly-added headline while undoing `content.add`; command policy does not leak into
history replay. Section/Slide cascading and last-item rules stay deferred to
`DW-W01-D01-B`.

### D01-B selection — explicit only

The recommended conservative policy is now binding:

- `slide.remove` removes exactly one stable Slide and rejects removal of the Deck's
  final Slide;
- removing the final Slide inside one Section is allowed when another Deck Slide
  remains, leaving that Section empty;
- `section.remove` removes only an empty Section and rejects removal of the Deck's
  final Section;
- neither command cascades;
- undo retains the complete entity, owning Section identity and stable predecessor
  anchor so identity and order survive save/close/reopen.

Exact packaged journey:

```text
remove body Content Block
→ remove one Slide
→ remove one now-empty Section
→ save and close
→ reopen with one Section and one Slide
→ undo Section, Slide and Content removals
→ verify original identities/order/content
→ redo all three removals
```

Invalid non-empty Section removal and last-Section/last-Slide removal are atomic
no-ops with explicit errors. Cascading deletion stays outside DW-W01.
