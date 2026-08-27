# DW-W01-R05 — Story accessibility audit

Scope: the SwiftUI/AppKit shell and minimal DOM Editorial Spine at the packaged
R04 boundary. Method: AppKit Accessibility Auditor checklist plus direct source,
WebKit DOM-contract and extracted-artifact review.

## Findings

### P0 — Blocker

None found in source. Native buttons, selects and textareas remain keyboard
operable; Story and Sequence mutations have keyboard callers; the live durability
message already has `role=status`.

### P1 — High

1. **Current Slide was visual-only.** The accent border did not expose selection to
   assistive technology. The selected Slide button now has `aria-current=page`.
2. **Sequence reorder was undiscoverable.** Focused Slide and Section controls now
   expose `Alt+ArrowUp Alt+ArrowDown` through `aria-keyshortcuts`.
3. **Pending structural work was not announced.** The Editorial Spine root now
   exposes `aria-busy=true` until acknowledgement/projection or failure recovery.
4. **Three failure paths erased their status immediately.** Structural, content and
   history catches now rerender first, then write the error into the live status so
   it remains available for announcement and sighted inspection.

### P2 — Medium / low

- The SwiftUI document title and status now expose explicit label/value pairs.
- Artboard zoom now uses the concrete accessible name `Artboard Zoom`.
- Actual VoiceOver wording, full keyboard focus order, Voice Control names, Switch
  Control scan order, Increase Contrast and larger-scale clipping still require an
  interactive macOS session. DOM attributes are evidence of intent, not substitutes
  for assistive-technology observation.

## Patch-ready changes applied

- `workspace.js`: busy/current/shortcut semantics and durable error announcement.
- `index.html`: explicit Artboard Zoom label.
- `DeckWorkbenchApp.swift`: Document and Document status label/value semantics.
- packaged tracer: query the real WebKit DOM for these attributes without adding a
  bridge method or filesystem authority.

## Manual acceptance checklist

### VoiceOver

- Launch the exact extracted app, create/open a Deck, enable VoiceOver and traverse
  toolbar → Sequence → Story → Visual Stage → Inspector.
- Expect the selected Slide to be announced as current, Section groups and Slide
  buttons to expose reorder shortcuts, and no duplicated or ambiguous control names.
- Trigger one rejected/stale operation in a debug fixture; expect its error to remain
  in the live status and be announced once.

### Keyboard

- With Full Keyboard Access enabled, use Tab and Shift–Tab through native toolbar,
  Sequence actions, Section groups, Slide buttons, Story fields and Inspector.
- Expect no focus trap. Option–Arrow moves only the directly focused Section group
  or Slide button; child Rename/Move/Remove buttons must not bubble a reorder.
- Expect focus to return to the same stable Section/Slide identity after rerender.

### State, Voice Control and Switch Control

- Confirm disabled controls are announced disabled before a document exists and
  while a structural command is pending.
- Say visible control names with Voice Control; expect unique activation targets.
- Scan with Switch Control; expect visual reading order and access to all native
  buttons/selects/textareas plus the focusable Section reorder groups.

### Display accommodations

- Check light/dark appearance, Increase Contrast, Reduce Transparency and Interface
  Scale 175%. Expect current state to remain perceivable and essential text/actions
  not to clip.

## Expected outcome and regression risk

Expected behavior is unchanged except for accessibility semantics, retained error
status and assistive discoverability. Regression risk is low: the only interaction
change is preserving an existing failure message after rerender. Manual acceptance
is still required before calling R05 accessibility-integrated.

## DW-W01-R05-A source-hardening addendum

### Findings closed in source

| Priority | Finding | Resolution |
|---|---|---|
| P1 | Native Undo and Redo were enabled for every open document, even when the projected history said the action was unavailable. A keyboard or Voice Control user could invoke an impossible action and receive an avoidable failure alert. | `DeckSessionController` now publishes `canUndo` and `canRedo` from the acknowledged Slide projection after create, open, execute, undo and redo; close resets both. Native menu items bind to those exact states. |
| P1 | The durability/error status had an implicit status role but did not require whole-message announcement. | The status is explicitly polite and atomic, so a changing typed name/message is presented as one update. |
| P2 | Native toolbar names differed from their menu equivalents, and a Sequence Slide relied on concatenated descendant text for its accessible name. | Native toolbar/menu labels now match exactly. Each Slide button exposes `Slide <number>: <headline-or-intent>`, preserving visible words for Voice Control. |

The packaged tracer now queries the bundled WebKit document for the initial
non-busy state, polite/atomic live status and exact selected-Slide name. Portable
source tests verify native history-state binding and matching native command names.

### Remaining interactive acceptance gate

- With Full Keyboard Access enabled, traverse the native document controls and the
  complete WebKit control order using Tab and Shift-Tab. Expected: disabled Undo or
  Redo is skipped/announced unavailable, no focus trap, and focus remains visible.
- With VoiceOver enabled, read the Sequence, Story status and selected Slide, then
  perform one edit, one reorder, Undo and Redo. Expected: `Slide 2: …` is announced
  current, the durability status is spoken once per completed change, and native
  history item availability matches the visible state.
- Dismiss an injected native error alert using keyboard and VoiceOver. Expected:
  focus returns to a useful control in the same window and the persistent status
  retains the typed failure.
- Exercise Voice Control and Switch Control once. Expected: matching visible names
  activate native controls without ambiguous targets; all required WebKit controls
  remain reachable in reading order.
- Repeat at Interface Scale 150% and 175%, Increase Contrast and Reduce
  Transparency. Expected: essential actions and focus rings remain visible and no
  state depends on color alone.

These outcomes require an interactive macOS session with the real assistive
technologies and hardware-key event routing. Source assertions and synthetic DOM
events deliberately do not close that gate. Regression risk is low: no Deck
command, bridge authority, journal rule or document schema changed.

## DW-W01-R05-A Interface Scale reflow addendum

### P0 finding closed in source

The prior `70rem` workbench minimum and fixed four-column Editorial Spine scaled to
approximately 1,960 CSS pixels at Interface Scale 175%, before the column minima
were considered. Essential Story and Inspector controls therefore could leave a
representative laptop viewport.

The workbench now has no scaled minimum width. At laptop widths the Editorial Spine
reflows into Sequence/Story followed by full-width Stage and Inspector rows; at
narrow widths it becomes one column. Toolbar controls wrap, the Inspector changes
from four-column chrome to a bounded grid, and the artboard width is viewport
bounded while retaining its canvas aspect ratio and independent zoom transform.

The packaged WebKit journey applies 175%, forces a synchronous layout read, and requires the
document width plus Add Section, Add Slide, Headline, Commit headline and Slide
intent bounds to remain inside the horizontal viewport. This directly covers
reachability geometry; the remaining manual gate is visual quality, clipping,
VoiceOver order and focus-ring visibility with 150%/175%, Increase Contrast and
Reduce Transparency enabled.

The first reflow draft used only a fixed viewport breakpoint. Review rejected that
as insufficient because 1,440- and 1,512-pixel laptop viewports can still overflow
when rem units grow at 150%/175%. The production `workspaceLayoutMode` now compares
the viewport with the actual scaled rem minima: below the four-column requirement
it selects two columns; below the two-column requirement it selects one. Portable
tests and the packaged WebKit contract require two-column mode at both laptop widths
and both large scale settings.

Interface Scale is also published through the macOS controller. The native document
command strip derives button font, spacing, padding, divider height and minimum
height from the same preference; it never reads artboard zoom. The packaged tracer
requires the bridge-updated value to reach the controller. Visual native clipping
and AX order remain part of the interactive gate.
