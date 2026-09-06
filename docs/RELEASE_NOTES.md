# v0.1.2 — slide editing restored

This release restores direct editing without changing Workbench's prototype-and-handoff purpose.

## Slide controls

Layout and Edit Copy remain visible above both Curate and Assemble, even with the context panel hidden. The sidebar has Add Slide and a context menu. The new Slide menu exposes Add, Duplicate, Rename, Move Earlier/Later, Delete, Edit Copy and all layouts.

Add inserts after the selected slide and opens its copy editor. Duplicate retains writing, notes, shortlisted/chosen media and supported composition settings while giving all new document objects distinct identities. Rename changes the sidebar/handoff name, not the headline. Move can cross section boundaries. Delete confirms first, leaves original media untouched and restores the whole slide with Undo. The deck retains at least one slide.

## Copy editing

Edit Copy is no longer buried. Heading-only imports offer body/subheadline fields; additional body, caption and credit fields can be added. The editor captures the slide it opened, so selection changes cannot redirect a save. Copy and optional slide-name edits save together as one Undo step. Cancelling changes nothing. Failed saves leave the draft open. Closing or importing while a draft is open requires saving or cancelling first.

Unchanged fields preserve the original rich-text data; no-op saves do not add journal/history entries. A conflicting copy revision is rejected without overwriting newer writing. Existing media, notes and layouts stay associated with the slide.

## Small performance and safety changes

Sidebar ordinals use an indexed lookup rather than rescanning the deck for every row. Duplication works from the queued, durable slide after pending notes have flushed. Structural actions serialize with the existing command queue; no second file format, history engine or renderer is introduced.

## Verification and compatibility

The package journey covers add, captured-target copy editing, duplicate, rename, move, delete/Undo/Redo and edited text in the ordinary handoff, in addition to the existing curation/export/reopen checks. Read the receipt associated with this exact release; build completion alone is not proof of every interactive path.

The file reader schema is unchanged from v0.1.0/v0.1.1. Keep an untouched copy of pre-native decks before their first native edit. Apple Silicon and macOS 26+ remain required; the app is ad-hoc signed, not notarized. Source media is never edited by these commands. Exhaustive accessibility, large studio-library performance and every recovery/permission environment still need hands-on evaluation.

Prior release notes: [v0.1.1](releases/v0.1.1.md).

## Layout finishing and targeted performance work

Apply Arrangement now copies custom image frames, replacing the destination geometry deliberately while retaining each destination's crops, copy and notes. Changing a layout restores its intended gradient direction. Reset Placement restores text/image placement and gradient without clearing crops or writing. Undo restores the complete prior arrangement.

Image-only and blank-copy slides no longer expose invisible text hit targets. Resize handles keep a screen-sized hit area at small zooms. Fitted images explain why crop-panning is unavailable. Snapping includes both column/row edges and the final right/bottom margins. Keyboard movement stays within the canvas; gradient arrows translate both endpoints together without changing its direction. Dragged gradient endpoints cannot collapse into an invalid zero-length gradient.

Canvas and inspector reads reuse their resolved scene within a document revision. An 8 MiB-cost / 48-entry text cache reuses immutable Core Text layouts when image/gradient settings or text position change; size/copy/columns invalidate it. Interactive gradients draw directly into the screen context rather than allocating a multi-megapixel overlay for every pointer movement. PDF export retains the alpha-safe cached overlay, keeping source images and selectable text separate. Cache limits are eviction targets, not a total application-memory guarantee.

The extracted-app journey additionally verifies custom-frame copying, reset/Undo, reused text frames, visible layout targets and screen/export gradient agreement. No studio-wide speed multiplier is claimed.
