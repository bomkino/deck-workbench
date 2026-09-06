# v0.1.3 — native workflow polish

A focused finish to the existing native app: safer transitions, a usable deck-review mode, crop zoom, and less repeated media-list work. The slide management and layout features from v0.1.2 remain in place.

## Working flow and visuals

Review deck uses the full working area and hides editing panels. Arrow keys, Space/Shift-Space and Home/End navigate without modifying the deck; Escape returns to editing. The current slide number and title remain visible. Crop zoom (100–400%) and Centre crop retain image framing as separate undoable adjustments. Optional copy fields can be removed in the draft without changing saved copy until confirmation. Layout/curation controls reflow when horizontal space is tight; export options scroll above fixed action buttons and show the actual included slide count.

Search exits preview/comparison. Candidate preview returns to a visible focus; comparison does not leak candidates into a different slide. Image-only selection no longer resets to an invisible text target. Slide notes retain their bound destination when the selected slide changes.

## Saving and document lifecycle

Create/open/close/retry are serialized across suspension points. Late chooser callbacks and Save requests retain document identity. Replacement-copy imports keep the preview and error until acknowledged, with expected-copy conflict checks. Export reserves its operation before flushing, prevents duplicate destination requests and ignores obsolete progress callbacks.

A failure after durable journal append fences the session for recovery/replay instead of permitting new commands from stale in-memory state. New document sessions adopt their file store only after successfully projecting the initial view. Closing and reopening the same native window no longer reuses permanent close approval.

## Performance

File imports use bounded reads and parse off the main actor. Media refresh requests are coalesced. An unchanged catalogue returns no new projection; changed catalogues and source maps arrive together without a main-thread JSON decode. Late scan/refresh callbacks cannot repopulate a switched document. Existing bounded image caches, text-layout reuse and direct live-gradient drawing are retained. No universal speed multiplier is claimed.

## Verification and installation

The published artifact must have the same-SHA native package receipt for core slide/copy/media editing and handoff, plus review navigation, crop zoom/Undo, slide-bound notes, unchanged-catalog reuse, bounded import and serialized document creation. The repository retains meaningful document-kernel checks rather than source-pattern tests.

Requires Apple Silicon and macOS 26+. Quit Workbench, unzip the `.app.zip`, replace Deck Workbench.app in Applications and open it. Ad-hoc signed, not notarized. Existing v0.1.0–v0.1.2 native decks retain their reader schema. Keep an untouched copy of pre-native decks before editing.

Large studio libraries, exhaustive VoiceOver coverage, unusual source formats, removable/cloud-managed volumes and every recovery environment remain outside the synthetic journey. See docs/KNOWN_LIMITATIONS.md. Original media is never intentionally modified.
