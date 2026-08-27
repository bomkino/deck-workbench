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
→ save, close and reopen
→ undo both moves to their intermediate and original orders
→ redo both moves to the same intermediate and final orders
```

Drag-and-drop, multi-selection and broad Sequence navigation remain deferred.

## DW-W01-R04 — Sequence Section keyboard reorder

Each Section heading group is keyboard-focusable and uses the same unmodified
Option–Up / Option–Down policy as Slide rows. The caller maps direction to the
existing `section.move` payload with a stable Section ID and stable predecessor
anchor. Boundary directions with no destination remain uncancelled.

After durable acknowledgement, the Story projection is requeried and focus returns
to the Section group with the same ID. While a structural command is pending,
Section groups are removed from the tab order and marked disabled to prevent a
second command from using stale projection state.

Exact packaged extension:

```text
focus the later Section
→ Option–Up moves it before the preceding Section
→ retain focus by stable Section ID
→ Option–Down restores the original order
→ retain focus
→ save, close and reopen
→ undo Section down/up, Slide down/up and paragraph update in stack order
→ redo the same history in forward order
```

This adds no Section-selection model, drag behavior or alternate structural seam.

## DW-W01-R05 — Story accessibility source pass

The packaged WebKit DOM now exposes current Slide state, reorder shortcuts, root
busy state and a retained live error message. The SwiftUI shell exposes explicit
Document and Document status label/value pairs. These changes do not alter Deck
semantics, revisions or bridge authority.

The packaged tracer verifies the actual bundled DOM attributes. This supports a
**source-ready accessibility** claim only. Full Keyboard Access focus order,
VoiceOver announcements, Voice Control, Switch Control, Increase Contrast and
large-scale clipping remain an interactive macOS acceptance gate documented in
`docs/evidence/DW-W01-R05-ACCESSIBILITY-AUDIT.md`.

## DW-W01-R06 — Bidirectional Sequence controls

Visible Sequence controls now expose every valid Up and Down move for Sections and
Slides. They call the same stable-ID movement planners and dispatch the existing
`section.move` / `slide.move` commands; no DOM index crosses the bridge and no
pointer-only mutation path exists.

At a Section boundary, a Slide control moves to the preceding Section's end or the
following Section's start exactly like Option–Arrow. Boundary directions with no
valid move are omitted. After acknowledgement and Sequence rerender, focus moves to
the same Section or Slide identity while the selected Slide projection is preserved.

Exact packaged extension:

```text
click Slide Down, then Up
→ verify stable Slide order and focus after each durable acknowledgement
click Section Down, then Up
→ verify stable Section order and focus after each durable acknowledgement
save, close and reopen
→ undo and redo all four visible-control moves through the same history seam
```

Drag-and-drop, multi-selection and arbitrary pointer geometry remain deferred.

## DW-W01-R07 — Native command failure presentation

Every user-triggered native document action—New, Open, Save, Close, Undo, Redo and
PDF export—runs through one shell-owned presentation seam. A non-cancellation
failure updates the persistent document status and presents a native SwiftUI alert
with the typed failure name and message. User cancellation remains quiet.

This changes no document command, bridge method or durability rule. The packaged
tracer injects a missing-document open through the same presentation seam before
the normal native create journey and requires `MissingAttachment` to be retained
for the UI rather than discarded.

The packaged controller result plus compiled alert binding support a source-ready
native error-presentation claim. Interactive wording and focus return after alert
dismissal remain part of the R05-A macOS accessibility acceptance pass.

## DW-W01-R05-A — Accessibility source hardening

The macOS controller mirrors the current projection's `history.canUndo` and
`history.canRedo` into native command availability after every session transition.
This keeps Command-Z, Shift-Command-Z, menu discovery and assistive control state
aligned with the same semantic history used by the WebKit workspace. Closing a Deck
clears both states.

The Editorial Spine status is a polite atomic live region, and selected Slide
buttons have explicit names using the visible Slide number and headline or intent.
Native toolbar labels exactly match their menu equivalents. The packaged DOM check
and causal source tests cover these contracts without a new bridge or mutation
path.

R05-A remains source-ready, not accessibility-integrated, until the exact packaged
app passes the interactive Full Keyboard Access, VoiceOver, Voice Control, Switch
Control and large-interface checklist in the evidence audit.

At representative laptop widths, Interface Scale 150% and 175% use a responsive
Editorial Spine instead of multiplying a fixed page minimum. Sequence and Story
remain side by side when space permits; Stage and Inspector reflow below them, then
all panes stack at narrow widths. The packaged WebKit journey measures 175%
horizontal reachability for the document and essential Story controls. Artboard
zoom, canvas units, semantic Deck content and export geometry are unchanged.

Layout selection is scale-aware rather than breakpoint-only: the production planner
compares viewport width with the four- and two-column rem minima after applying the
chosen Interface Scale. Causal checks cover 1,440 and 1,512 pixels at 150% and 175%.
The SwiftUI document command strip observes the same published preference for its
font, spacing, padding and minimum height.

The tracer intentionally owns one SwiftUI `Window`, not a `WindowGroup`. A shared
controller and bridge sink are therefore single-window by construction. Future
multi-document work must move controller/store/workspace ownership inside each
scene before enabling additional windows.
