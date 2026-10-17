# v0.1.1 — native workflow and handoff repair

This release fixes ordinary operations that could reject edits, overwrite another image's adjustments or resurrect undone notes. It retains the Mac-native prototype/handoff direction rather than rebuilding the application again.

## Correctness

Layout picker resets are valid. Frame/crop/fill changes affect only the intended image. Batch arrangement application is reversible and idempotent. Visible slots follow the explicit layout; displaced images remain shortlisted. Cross-slot assignment moves/swaps correctly. Definitively rejected commands no longer hold subsequent valid actions. Acknowledged note drafts clear by generation; notes Undo survives save and reopen.

## Working flow

Chosen-image slots, remove-but-keep-shortlisted, ordered keyboard comparison, natural/folder/date sorting, visible filters and filter-aware focus. Preview uses the working area instead of an oversized fixed sheet. Paste imports through the same parser. Replacement-copy preview explicitly matches slides and preserves their media/layout/notes. Apply Arrangement targets selected slides in one Undo step. Clean Preview, recentering Fit, better gesture cancellation, saved-value inspector synchronization and optional auto-advance. Pending command files can be restored to the matching deck with validation and confirmation.

## Handoff

PDF gradients now retain transparency instead of hiding their source images. Only the gradient overlay is rasterized and cached; copy remains selectable. Canonical Mac media paths no longer reject legitimate directory aliases. The package journey inspects actual visible image pixels, not just embedded image objects.

Copy-only export no longer reads originals. Output resource selection and reports follow the actual requested/delivered components. Completed components can survive an independent failure; cancellation removes staging. Literal copy is protected in editable Markdown. Normal filename extensions survive truncation; spreadsheet-active CSV values are neutralized. Media index includes relative paths, roles, hashes, source notes and unavailable-file status. Generated handoffs are excluded by their own marker, not by excluding their parent media directory.

## Performance

Indexed slide/asset lookup, cached sorted/filtered collections, shared bounded thumbnails, cancelled-work cleanup, reconnect-aware cache identity, one image construction per request and reuse of text layout during translation. No general speed multiplier is claimed. The release artifact includes a synthetic native journey receipt and timing/caching observations.

## Install / limits

Apple Silicon, macOS 26+. Quit the old app, unzip the `.app.zip`, drag Deck Workbench.app into Applications and launch it. It is ad-hoc signed, not notarized. Keep a duplicate of pre-native decks: the first native edit upgrades their reader schema. v0.1.1 retains v0.1.0's schema. Preserve original files and older releases as fallbacks.

The package journey checks core operations and synthetic handoff outputs. Studio-scale performance, exhaustive accessibility, every source format and every recovery/permission environment are not established by it. See docs/KNOWN_LIMITATIONS.md. The entire historical master plan is not claimed complete.
