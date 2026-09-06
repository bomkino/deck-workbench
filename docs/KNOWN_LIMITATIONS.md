# Known boundaries — v0.1.3

Apple Silicon and macOS 26+ only. Ad-hoc signed, not notarized. The application is a prototype/intent tool, not final production design software.

The meaningful package check uses the actual extracted Mac app: native keyboard decisions, layout changes, per-image edits, notes undo, invalid-command continuation, save/reopen, original-media handoff, clean/notes PDFs, copy-only export and saved-copy recovery. Inspect `native-acceptance.json` for the exact release SHA. A successful scripted journey does not establish every user path.

Still requiring hands-on evaluation: VoiceOver and full keyboard navigation of every native control; all display/window/scaling combinations; large real media libraries on studio machines; network/removable/cloud-managed folders and permission recovery; every supported source codec. Performance counters are evidence from a synthetic hosted-Mac workload, not a blanket speed multiplier.

Import handles bounded Markdown/text, not DOCX/PDF conversion. Replacement import maps existing slides; it does not automatically add/remove/reorder them. Manual add, duplicate, rename, move and confirmed delete are available from the Slide menu/sidebar. The deck must retain at least one slide. Comparison supports at most three candidates. Ratings/project-wide picks remain secondary legacy metadata, not a complete native feature. The UI uses native Mac controls, with restrained branding rather than a production typography system.

Legacy compositions preserve supported text/image/gradient data; their old typography and unsupported shapes are not an exact reproduction guarantee. Convert deliberately and keep the original. Very dense copy can overflow a prototype at the lower type limit; complete text is retained in copy/notes companions when selected. PDFs represent GIF/video as a still frame, and PDF media as its first page; original files remain intact in media handoff.

Media sizes, scan depth/count, preview decoding and import/command payloads remain bounded. Unsupported previews do not imply that an original cannot be handed off. Partial handoff failures are shown; cancelled exports discard unfinished staging. No source media is intentionally changed.

A first native edit upgrades a pre-native deck's reader schema. v0.0.6 cannot read the upgraded working copy. v0.1.3 keeps the reader schema used by v0.1.0–v0.1.2. No multi-writer/cloud collaboration, automatic updates or notarization is included.

The v0.1.3 package journey also exercises native review navigation, normalized crop zoom and Undo, slide-bound notes, unchanged-catalog reuse, bounded import, concurrent document-creation exclusion and a stale Save rejection. Native window captures support visual review; they are not an exhaustive accessibility or all-display guarantee. External-volume/cloud-provider cancellation and rare post-journal failure handling still need real-environment evaluation. Crop zoom is limited to 4× and commits when the slider gesture finishes.
