# Mac workflow — v0.1.1

## Intake and copy

File → Import Final Copy reads bounded Markdown/text locally. File → Paste Final Copy uses exactly the same parser. Review slide boundaries before creating a deck. See `examples/native-copy.md`. Literal fenced blocks protect headings, `State:` and backslashes that belong to copy. Unsupported or malformed structure produces an error without changing the open deck.

Replacement is a separate preview: match incoming slides to existing slides, inspect both texts, then apply. Only uniquely identical titles are proposed automatically. Ambiguous titles need explicit mapping, not guesses by page number. Unmapped existing slides remain unchanged. Replacement preserves the matched slides' IDs, media, notes and layout; it is one undoable operation. It does not insert/reorder/delete slides.

On-slide writing is protected by default. Edit opens a deliberate copy editor. Designer notes are separate and autosave after a brief pause. Document Undo flushes pending notes first; Undo while typing uses the native text editor's history. Acknowledged drafts cannot overwrite an undone note.

## Curate

Add a media folder. The originals remain in place. Search filenames/folders; sort naturally by filename/folder or newest scanned modification date. Collection and folder filters stay visible. Clear Filters returns to all candidates.

The chosen-slot tray shows what is assigned independently of keyboard focus. Choose for a role; Remove from the slot retains the candidate in the shortlist. Shortlist and chosen membership can overlap. Choosing an image already used in another visible slot swaps or moves the assignments. Changing to fewer image slots preserves excess choices in the shortlist.

Arrows move through the visible collection, including after an item is rejected or removed. Space opens a full-working-area preview and returns to the same collection. Previewing a chosen/shortlisted item from the context panel stays in that candidate collection. Comparison retains insertion order: arrows select, M chooses, S shortlists, 1–3 choose the corresponding candidate, Escape returns. Optional auto-advance is off by default in Settings.

The interface acknowledges pending saves. A definitively invalid action is rejected without fencing subsequent valid actions. An uncertain durable write does fence later actions to protect their order. Retry, save, restore or explicitly discard pending actions; never interpret a dismissed warning as a successful save.

## Assemble

Default canvas: 2576 × 1080. Grid: 24 columns/12 rows, horizontal/vertical margins 96/64, gutters 16/8. Provisional type is modest, not production typography.

Select an explicit text-left/right/lower/wide, text-only, image-only, two-image or three-image arrangement. Empty copy fields take no space. Fit Copy measures actual text within the chosen region and lowers size only within readable prototype limits. Very dense copy can still overflow; the companion outputs contain all writing.

Drag text to move its region, or resize at its handle. Drag an image to pan its crop; Command-drag moves its frame. Guides snap when enabled; Option bypasses snapping. Space-drag pans the viewport. Fit recentres the canvas. Escape cancels the gesture. Clean Preview hides editing overlays without changing exported content.

Image-specific frame/crop/fill edits merge only that role. Reset Crop resets one role. Gradient strength preserves the currently visible direction. Controls follow saved values and Undo. Legacy text fitting requires explicit conversion to a native prototype layout; unsupported legacy shapes/lines are reported rather than claimed as exact fidelity.

Apply Arrangement copies the resolved arrangement to explicitly selected slides in one Undo step. It does not change their copy, notes, original media or per-image crops. Slots are reconciled without deleting candidates.

## Export

Command-Shift-E selects complete handoff components and all/current/selected slide scope. Component choices are remembered; accepting changed original files requires explicit consent each time.

- Prototype.pdf: clean proportional slides, one page per exported slide.
- Prototype with notes.pdf: slide preview, full copy, direction and source filenames; long copy continues onto labelled companion pages.
- Copy.md: literal editable text in fenced blocks, organised by slide; notes separate.
- Approved Media and Shortlisted Media: original files per slide, including reused images as usable copies.
- Media index.csv: relative output paths, roles, original filenames, source notes, hashes and status.

Only resources needed for requested outputs are read. Copy-only needs no source media. Originals are staged once and checked; preview/export images never replace handed-off originals. Case-insensitive filename collisions are resolved without dropping normal extensions. Existing handoff folders and source media are never overwritten.

Each completed component can survive an independent component error. The result panel lists actual outputs and exceptions. A deliberately cancelled export removes its unfinished staging folder. Unavailable/changed sources are identified by slide and role; they are not silently accepted or represented as successful copies. Reports name only companions actually produced.

## Recovery

Open original decks from duplicates during migration. Recover Saved Copy creates a separate recovered package. Save Pending Actions exports the unresolved command queue; Restore Pending Actions checks deck identity, payload bounds, command vocabulary and IDs before asking to replay. Duplicate acknowledged IDs are deduplicated. Never restore another deck's actions into the current one.

This is local single-writer work, not simultaneous collaborative editing. Preserve the original if storage reports corruption or an uncertain write.
