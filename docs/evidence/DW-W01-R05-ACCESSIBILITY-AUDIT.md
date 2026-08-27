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
