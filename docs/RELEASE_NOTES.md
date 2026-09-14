# v0.2.1 — clearer optional exports

PSD export now visibly includes its required workbench.md companion, even after writing export was previously turned off. The handoff works with either Figma or InDesign; neither application is required during export. Unsupported canvases disable the PSD option before export while keeping writing, PDFs and media available. The saved PSD preference remains available when returning to a supported canvas.

Production writing is checked against the actual importer before delivery. This catches combined fields that exceed intake limits even when their individual source fields fit; Copy.md remains an independent, complete writing output.

The native package journey covers writing-only export with PSDs off and combined copy at and beyond the import limit, alongside the existing save, Undo, layout, media and PSD checks. No document schema, font, artwork or Adobe-script changes.

# v0.2.0 — starter layouts and production handoff

Starter layouts, editable contents and moodboards, and a production handoff to Photoshop and InDesign.

## Compose and arrange

- **Add Contents / Index** inserts an automatic list of included slide names and page references. Two balanced columns use dotted leaders and wrap long titles; overflow remains reported. Selected exports recalculate the index.
- **Add Moodboard…** creates an editable grid from up to 12 chosen images, or six empty slots. Duplicate it, change its slot count or use **Move to Position…** to place it anywhere in the deck. Displaced images remain shortlisted; originals are untouched.
- The numbered 24-column/12-row grid uses exact starter dimensions at 2576 × 1080 and 1920 × 1080. **Type & colours…** adds installed Head/Sub/Body font choices, paired size/leading steps, alignment and colour roles. Type/palette settings can apply to one slide or the deck; Dark/Light remains per slide. The existing FontBlind v13.0.0 binary pin and native-control typography are retained.
- Canvas gestures ignore click jitter; clicks away from gradient controls select the clicked object. Crop dragging responds promptly when reversed at a boundary. Completed drags remain one Undo step; Escape cancels. The app icon now depicts editable layered slides on a workbench.

## Production handoff

Export adds **Production/workbench.md**, **workbench-production.json** and optional numbered **PSD/Slide 01.psd** files. Writing preserves copy states and records how original fields map into Headline/Subheadline/Body. The manifest binds slide identity/order, copy, warnings and PSD paths/hashes. Copy.md, PDFs and original-media outputs remain available.

Each RGB/8-bit sRGB PSD has **00.Background** and **01.Character**, sharing one embedded artwork source with the chosen image frames, fit, crop masks and guides. Both roles initially contain the complete artwork. The artist creates the cut-out in Photoshop before the separate artwork-only PNG role export. Prototype text, background colours and gradients are not rendered into these PSDs; writing and final composition continue in the destination app. PSD creation requires neither Photoshop, InDesign nor a browser/Node runtime. Native Photoshop checks covered shared-source edits, save/reopen, JPEG orientation and transparent role export. InDesign text import, initial PSD placement and later link refresh remain separate local-script steps.

PSD generation is serial and limited to 1920 × 1080 or 2576 × 1080, 12 placements, 128 MiB combined source bytes and a 768 MiB estimated per-slide working budget. Still-image conversions and source problems are reported. Production writing/manifest/PSDs form one component; failure does not erase separately completed handoff components. See [Known boundaries](KNOWN_LIMITATIONS.md).

Copy replacement leaves generated Contents automatic while updating mapped ordinary and moodboard writing. Existing artwork, notes, field identities and layout survive the replacement and Undo.

## Compatibility and verification

New packages use schema 3. Opening an older package does not itself upgrade it. Before saving starter features or explicit copy states, Workbench verifies internal pre-upgrade recovery data, then raises the reader guard. Older apps reject the upgraded copy; Undo does not downgrade it. Keep an untouched duplicate for old-app use.

Focused checks cover the new state, grid/type, production-copy, schema/recovery and PSD structure contracts. Only an actual same-SHA receipt establishes which checks passed for a package. Native Photoshop inspection complements encoder validation. Large-library performance, exhaustive accessibility and the separate InDesign helper are outside the packaged app check. Published packages, installation and a finished design remain separate outcomes.

# v0.1.3 — native workflow polish (historical)

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
