# Mac workflow

## Intake and copy

File → Import Final Copy reads UTF-8 Markdown/text locally, up to 1 MiB. File → Paste Final Copy uses exactly the same parser. Review slide boundaries before creating a deck. Ordinary Markdown follows `examples/native-copy.md`; its fenced blocks protect literal headings and backslashes. Workbench Markdown v1 uses its own structural-prefix escaping and preserves `present`, `intentionally-blank` and `unreviewed` copy states. Unsupported or malformed structure produces an error without changing the open deck.

Replacement is a separate preview: match incoming slides to existing slides, inspect both texts, then apply. Only uniquely identical titles are proposed automatically. Ambiguous titles need explicit mapping, not guesses by page number. Unmapped existing slides remain unchanged. Replacement preserves the matched slides' IDs, media, notes and layout; it is one undoable operation. It does not insert/reorder/delete slides.

On-slide writing is protected by default. Edit opens a deliberate copy editor. Designer notes are separate and autosave after a brief pause. Document Undo flushes pending notes first; Undo while typing uses the native text editor's history. Acknowledged drafts cannot overwrite an undone note.

## Edit slides

Layout and Edit Copy are always available in the selected-slide bar above Curate/Assemble; the context inspector does not have to be open. Right-click a sidebar slide or use the Slide menu for the same actions.

- **Add Slide** / Command-Shift-N inserts after the current slide, in its section, and opens the editor. New slides default to full bleed with text.
- **Duplicate Slide** / Command-D preserves the source slide's copy, chosen media, shortlist, notes and supported layout. Document identities are new; original media is shared, not modified.
- **Rename** changes the sidebar and export-folder name, not the on-slide headline. Edit Copy also offers this name field.
- **Move Earlier/Later** / Command-Option-Up/Down retains slide identity and can cross section boundaries.
- **Move to Position…** accepts a deck position from 1 to the current slide count. Contents and the next handoff follow the new order.
- **Delete Slide** / Command-Shift-Delete asks for confirmation. Undo restores the full slide and order. Source files remain untouched. The final slide cannot be deleted; edit it or add another first.

**Edit Copy** / Command-E opens the selected slide's fields. Missing headline/subheadline/body fields are offered automatically; Add Text Field supports extra body/caption/credit text. Empty optional fields consume no prototype space. Save Copy commits the edit and any name change together; Cancel changes nothing. The save always targets the slide opened for editing, not a later selection. A failed save keeps the draft available. Save or cancel before closing/switching decks or exporting.

## Add contents or a moodboard

Select the slide to insert after, then choose **Slide → Add Contents / Index**. The index lists included slide names in deck order, with two balanced reading columns, right-aligned page numbers and drawn dotted leaders. Long titles wrap. Rename or move the source slides to update the entries; Edit Copy does not edit this derived list. Contents pages are omitted from the list but still occupy page numbers. A selected-slide export recalculates entries and page references for that export. Use **Move to Position…** to put the index near the front.

Choose **Slide → Add Moodboard…**, select up to 12 images and click **Add moodboard**. Selection order sets the initial grid. A blank moodboard starts with six empty slots; **Layout → Moodboard** and the **Image slots** control offer 1–12 slots. Changing the count resets the grid frames and retains displaced choices in the shortlist. In Assemble, drag an image to crop it, Command-drag to move its frame, and drag its handle to resize. Use **Duplicate Slide** to reuse the entire moodboard, then **Move to Position…** to place the copy. Duplication preserves artwork, frames, crops, writing and notes without editing source files.

**Slide → Add Blank Slide** creates a deliberately empty slide, without placeholder dashes. Move, duplicate, edit or undo it normally.

## Curate

Add a media folder. The originals remain in place. Search filenames/folders; sort naturally by filename/folder or newest scanned modification date. Collection and folder filters stay visible. Clear Filters returns to all candidates.

The chosen-slot tray shows what is assigned independently of keyboard focus. Choose for a role; Remove from the slot retains the candidate in the shortlist. Shortlist and chosen membership can overlap. Choosing an image already used in another visible slot swaps or moves the assignments. Changing to fewer image slots preserves excess choices in the shortlist.

Arrows move through the visible collection, including after an item is rejected or removed. Space opens a full-working-area preview and returns to the same collection. Previewing a chosen/shortlisted item from the context panel stays in that candidate collection. Comparison retains insertion order: arrows select, M chooses, S shortlists, 1–3 choose the corresponding candidate, Escape returns. Optional auto-advance is off by default in Settings.

The interface acknowledges pending saves. A definitively invalid action is rejected without fencing subsequent valid actions. An uncertain durable write does fence later actions to protect their order. Retry, save, restore or explicitly discard pending actions; never interpret a dismissed warning as a successful save.

## Assemble

Default canvas: 2576 × 1080. Both slide starters use a numbered 24-column/12-row grid. At 2576 × 1080, horizontal/vertical margins are 96/64 and gutters 16/8; at 1920 × 1080 they are 72/64 and 12/8. Guides and snapping share this geometry, including the widescreen grid's fractional column widths.

Open **Type & colours…** to choose installed Head, Sub and Body font families/faces, alignment, colour roles, and paired size/leading steps. Each role shows **Step +5**, **Step 0**, etc.; Smaller/Larger moves one step and changes size and leading together. Step 0 is Head 48, Sub 40 and Body 32. **Choose a font pair** offers New York + SF Pro, pitch.dog Head + Body, or SF Pro throughout, changing fonts only. Starter type keeps the same size at both slide widths. Apply to the current slide or enable **Apply to every slide**; one Undo restores the previous settings. Missing fonts are flagged and temporarily rendered with the system font.

The application interface uses pitch.dog Head/Body from the existing FontBlind v13.0.0 pin. **Settings → Interface size** scales the workspace, captions and dialogs without changing the canvas or exports. Native window/menu typography and monospace data remain system fonts. Existing decks keep their fonts; the Apple and pitch.dog canvas pairs are opt-in.

In the Colours tab, choose one of five neutral bases and assign colour families to Primary, optional Secondary/Third/Fourth, and Mono. The bundled library has 31 families; Mono offers its six neutrals. Dark/light samples show text contrast on the selected base. **Custom hex colours** retains direct editing, including fill/text-on-fill pairs and lines after a family is selected. Choosing a family stages its exact hex values. **Apply colours to every slide** starts checked, so **Apply colours** sets the project palette together; turn it off for the current slide only. Type has its own scope and still starts on the current slide. Existing decks are never recoloured when the library changes. Unused accent roles do not appear automatically.

Set **Slide appearance → Dark/Light** separately for each slide; applying colours across the deck retains those choices. The normal-text contrast target is 4.5:1; custom colours and image backgrounds still need review. Older native layouts keep their existing type until you apply type settings; choosing an appearance or palette also recolours their text. Preserved legacy layouts require explicit conversion before these controls apply.

**Solid background** uses the text-only layout and keeps all chosen images and the shortlist. Switching off uses Text left and restores the primary image; select Moodboard or another layout to show additional retained images. Approved Media still carries those assigned originals.

Select a text-left/right/lower/wide, text-only, image-only, two-image, three-image or moodboard arrangement. Empty copy fields take no space. New and newly imported slides start with Fit Copy off. Enable it to measure actual text and reduce size within the prototype limit. Dense copy or contents can still overflow; the warning remains visible, and selected copy/notes companions retain the full writing. Contents remains a two-column list rather than following the general Columns control.

Drag text to move its region, or resize at its handle. Drag an image to pan its crop; Command-drag moves its frame. Guides snap when enabled; Option bypasses snapping. Space-drag pans the viewport. Fit recentres the canvas. Escape cancels the gesture; a completed drag is one Undo step. Small click movements do not create edits, and reversing a crop drag at an image edge responds immediately. Clean Preview hides editing overlays without changing exported content.

Image-specific frame/crop/fill edits merge only that role. Reset Crop resets one role. Gradient strength preserves the currently visible direction. Controls follow saved values and Undo. Legacy text fitting requires explicit conversion to a native prototype layout; unsupported legacy shapes/lines are reported rather than claimed as exact fidelity.

Apply Arrangement copies the resolved arrangement to explicitly selected slides in one Undo step. It does not change their copy, notes, original media or per-image crops. Slots are reconciled without deleting candidates.

## Export

First use: **Settings → Connect InDesign** asks macOS for Automation permission. Connect Photoshop only if needed; PSD generation itself needs neither Adobe app. **Save complete starter kit…** extracts both sizes and scripts without a deck. Native folder pickers grant the file access used by the workflow.


Command-Shift-E selects complete handoff components and all/current/selected slide scope. Component choices are remembered; accepting changed original files requires explicit consent each time. PSDs are optional and include the production writing when selected. **PSD artwork → Match Workbench · editable masks** is the default, matching the canvas framing. **Full images · no frame crop** disables those masks while retaining position and scale. Both modes retain the complete embedded JPEG/PNG/TIFF originals; no crop is baked into those source files. The PDF remains the framed Workbench preview, so a full-image PSD may reveal additional artwork beyond the prototype frames. **Build InDesign automatically** is optional and includes PSDs plus writing. Leave it off for Figma. Production exports include the complete portable starter kit. On other canvas sizes the PSD switch is unavailable, while writing, PDFs and media remain selectable.

- Prototype.pdf: clean proportional slides, one page per exported slide.
- Prototype with notes.pdf: slide preview, full copy, direction and source filenames; long copy continues onto labelled companion pages.
- Copy.md: literal editable text in fenced blocks, organised by slide; notes separate.
- Production/workbench.md: Workbench Markdown v1 writing for the existing InDesign/Figma import workflow.
- Production/workbench-production.json: stable slide IDs, source/export order, complete copy fields, three-role projection, notes, warnings, copy/PSD hashes, and each styled slide's frozen palette plus Head/Sub/Body colour roles. Keep it beside workbench.md. The bundled InDesign builder consumes these colours; a writing-only import does not carry them.
- Production/PSD/Slide 01.psd, Slide 02.psd, …: numbered RGB/8-bit artwork files at 1920 × 1080 or 2576 × 1080. Selecting PSD also selects the production writing and manifest.
- Starter Kit: both INDD sizes and layout kits, PSD starters, guides and all production helpers, including Text Scramble and Export Slide PNGs.
- InDesign/Deck.indd: optional generated deck, with working PSDs in InDesign/Links/PSD. Edit these linked copies; Production/PSD remains the initial export.
- Approved Media and Shortlisted Media: original files per slide, including reused images as usable copies.
- Media index.csv: relative output paths, roles, original filenames, source notes, hashes and status.

For production, keep the **Production** folder together. The Markdown has Headline, Subheadline and Body roles; extra fields are grouped with paragraph breaks and recorded in the manifest, rather than discarded. Copy.md retains the original field structure. Notes stay separate from visible writing. Missing fields remain unreviewed; older production importers may display a dash for them. This writing import does not recreate moodboard frames, type settings or the live contents behaviour in another app.

Each PSD has **00.Background** and **01.Character**, sharing one embedded **Shared Artwork.psd**. Edit that shared artwork in Photoshop to change both instances. Its chosen images retain their frames, fit, crop transforms and masks, with native guides and a nonprinting numbered-grid path. Both outer roles initially show the complete artwork: the artist must create the character cut-out/mask. Then use the bundled PNG role exporter for the artwork-only background/character PNGs. No automatic cut-out is produced. A hidden cyan 50% text-area guide inside Shared Artwork marks the resolved text region. Enable it while expanding artwork, then hide it before saving a finished PSD. The bundled PNG exporter suppresses it in a temporary copy. Text and gradients remain design work in the destination; use the prototype PDF as the visual guide and the writing importer for copy. Automatic InDesign building consumes the prepared bundle after it reaches its final path; Figma writing import and artwork placement remain separate steps.

Workbench creates these PSDs without Photoshop or InDesign. Native Photoshop inspection covered shared-source edits, save/reopen, JPEG orientation and transparent role export. The optional InDesign build imports copy and places both PSD roles. Refresh remains an explicit action after returned artwork or a folder move. None of these steps is required for the Figma route. Review the final composition in the destination app. PSD export is serial, supports at most 12 placed images per slide, and enforces per-slide source and memory budgets; see [Known boundaries](KNOWN_LIMITATIONS.md).

Only resources needed for requested outputs are read. Copy-only needs no source media. Originals are staged once and checked; preview/export images never replace handed-off originals. Case-insensitive filename collisions are resolved without dropping normal extensions. Existing handoff folders and source media are never overwritten.

Each completed component can survive an independent component error. Production writing, manifest and requested PSDs form one component: if one PSD fails, that Production folder is not delivered partially. Copy.md, media and PDFs can still succeed independently. The result panel lists actual outputs and exceptions. A deliberately cancelled export removes its unfinished staging folder. Once that folder is committed, cancelling the Adobe build retains the completed handoff and marks any partial InDesign output incomplete. Unavailable/changed sources are identified by slide and role; they are not silently accepted or represented as successful copies. Reports name only companions actually produced.

## Recovery

New decks use package schema 3 and need Workbench 0.2 or later. Merely opening an older package leaves its saved schema unchanged. Before a saved starter feature or explicit copy-field state reaches the journal, Workbench copies and verifies the previous manifest, checkpoint, journal and available recovery/catalogue data under `recovery/pre-starter-0.2.0` inside the package. Existing recovery data is preserved. A failed backup blocks the edit. Older apps reject the upgraded working package; Undo does not downgrade it, and the internal recovery data is not a standalone deck. Keep an untouched duplicate if you need the old app.

Recover Saved Copy creates a separate recovered package. Save Pending Actions exports the unresolved command queue; Restore Pending Actions checks deck identity, payload bounds, command vocabulary and IDs before asking to replay. Duplicate acknowledged IDs are deduplicated. Never restore another deck's actions into the current one.

This is local single-writer work, not simultaneous collaborative editing. Preserve the original if storage reports corruption or an uncertain write.

## Layout finishing

A new layout restores its default text/image placement and gradient direction while keeping existing crops. **Reset placement** repeats that reset for the current layout; Undo restores it. Apply Arrangement copies custom image frames as well as the text region, columns and gradient, without overwriting the destination's image crops or writing.

Arrow keys nudge the selected visible region or gradient; Shift uses a larger step. Frame movement stays inside the canvas. Guides snap to both sides of each column/row, including the right and bottom margins. Image-only layouts do not offer invisible text controls. With **Fit whole image**, switch to **Fill / crop** before panning the crop; Command-drag still moves the frame.

The screen draws live gradients directly. PDFs retain the alpha-safe overlay export so gradients cannot hide source images. Unchanged text layout is reused while images, gradients or text position change.

## Review, crop and working-window polish

**Review deck** in Assemble (or Command-Shift-P) hides the editing panels. Left/Right or Up/Down move through slides; Space advances, Shift-Space returns, Home/End jump to the beginning/end, and Escape restores the editing workspace. Reviewing never changes slide content. Excluded slides remain visible for review; their inclusion in export stays an independent choice.

For an image in **Fill / crop**, the inspector offers **Crop zoom** (100–400%) and **Centre crop**. Zoom retains the current focal point where the image boundaries allow. Dragging still pans the crop. Each committed adjustment is undoable, does not change other image roles, and never changes the source file. Reset Crop returns to the full source.

The copy editor can remove optional body/subheadline/caption/credit fields. Removal affects only its draft until Save Copy; Cancel changes nothing. Notes editing and copy fields retain stable slide/field identities across view updates.

Search closes preview/comparison and returns to the media collection. Escape leaves the search field. Returning from a candidate preview restores a visible media focus. Comparison resets for a different slide rather than silently reusing unrelated candidates.

Import parses locally off the UI thread with the existing 1 MiB limit. Replacement stays open until saving is acknowledged and retains errors/drafts when rejected. Document transitions are serialized; a late chooser or Save cannot redirect work into a newly opened deck. Export is unavailable while a conflicting edit/transition/destination chooser is active, but creative layout warnings remain nonblocking. The export chooser shows the actual included slide count.

Inside Photoshop, double-click **00.Background** to open Shared Artwork. Every chosen image is another editable Smart Object. Shift-click its mask thumbnail to enable/disable the saved Workbench framing, or edit the mask normally. Image content beyond the slide canvas remains in the embedded original; double-click the image Smart Object or transform it to reach that content. Save Shared Artwork and the main PSD to update both outer roles. A mask can be changed after saving and reopening; it does not depend on Photoshop undo history.
