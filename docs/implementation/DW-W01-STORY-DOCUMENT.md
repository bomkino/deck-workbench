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
- `slide.add`
- `slide.move`
- `slide.intent.set`
- `deck.rename`
- `content.add`
- `content.update`

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

- Content Block removal and rich-editor schema breadth;
- drag-and-drop interaction;
- crash-injection matrix beyond the recovery behavior already proven;
- Garuda parity, editor dependencies and export breadth.

This slice may be called packaged on macOS after its exact journey passes. It must not be called the complete integrated DW-W01 ticket because the execution index requires broader Story behavior and Mac/Garuda parity.
