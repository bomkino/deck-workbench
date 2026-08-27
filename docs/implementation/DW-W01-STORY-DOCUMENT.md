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

## DW-W01-R01 — Paragraph-preserving Story fields

The dependency-free textarea caller maps normalized line endings to canonical
semantic paragraphs before `content.update`:

- every LF-delimited line becomes one `paragraph`;
- a blank line becomes an empty `paragraph` and is not collapsed;
- `plainText` joins paragraphs with LF, so edit and projection are symmetric;
- undo retains the complete prior rich-text value and redo retains the complete
  multiline value through the existing `content.set` history operation.

Exact packaged extension:

```text
add one single-paragraph body
→ update it through the real workspace converter to three paragraphs, including an empty middle paragraph
→ remove Content, Slide and empty Section
→ save, close and reopen
→ undo the three removals and verify exact paragraph JSON
→ undo the paragraph update and recover the original single paragraph
→ redo the paragraph update and recover all three paragraph boundaries
→ redo all three removals
```

This slice does not add marks, lists, headings, HTML, structured paste, editor
dependencies or a second mutation path.

## DW-W01-R02 — Story field keyboard semantics

Story fields use macOS primary-modifier conventions without stealing local text
editing:

- Command–Enter commits the focused Story field through `content.update` with
  `source.kind = keyboard`;
- Control–Enter provides parity for the shared workspace without changing Mac
  semantics;
- composing input never commits;
- Command–Z on a dirty field remains browser-native text undo;
- Command–Z / Command–Shift–Z on a clean field use durable Deck undo/redo;
- after acknowledgement and projection rerender, focus returns to the field found
  by stable Content Block identity, not to a discarded DOM node.

The packaged journey dispatches actual cancelable `KeyboardEvent` instances to the
body textarea, proves composition and dirty-undo are not intercepted, commits the
multiline value, undoes/redoes it, and verifies focus after all three durable
operations. Button and keyboard callers still share the same typed bridge and
kernel history seam.

## DW-W01-R03 — Sequence keyboard reorder

A focused Slide row uses Option–Up and Option–Down to reorder through the existing
`slide.move` command. The caller calculates only stable Slide, Section and neighbor
IDs; no DOM position or array index crosses the bridge. At a Section boundary, Up
moves the Slide to the preceding Section's end and Down moves it to the following
Section's start. A missing neighbor is an uncancelled no-op.

After acknowledgement, Sequence is queried again and focus is restored to the row
with the same stable Slide ID. The command records `source.kind = keyboard`; no
keyboard-only command or mutation path exists.

Exact packaged extension:

```text
focus the first Slide in the later Section
→ Option–Up moves it into the preceding empty Section
→ retain focus by stable Slide ID
→ Option–Down moves it back to the later Section's start
→ retain focus and original order
→ save, close, reopen and replay both durable slide.move records
```

Drag-and-drop, multi-selection and broad Sequence navigation remain deferred.
