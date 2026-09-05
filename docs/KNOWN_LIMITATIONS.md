# Known boundaries — v0.1.1

Apple Silicon and macOS 26+ only. Ad-hoc signed, not notarized. The application is a prototype/intent tool, not final production design software.

The meaningful package check uses the actual extracted Mac app: native keyboard decisions, layout changes, per-image edits, notes undo, invalid-command continuation, save/reopen, original-media handoff, clean/notes PDFs, copy-only export and saved-copy recovery. Inspect `native-acceptance.json` for the exact release SHA. A successful scripted journey does not establish every user path.

Still requiring hands-on evaluation: VoiceOver and full keyboard navigation of every native control; all display/window/scaling combinations; large real media libraries on studio machines; network/removable/cloud-managed folders and permission recovery; every supported source codec. Performance counters are evidence from a synthetic hosted-Mac workload, not a blanket speed multiplier.

Import handles bounded Markdown/text, not DOCX/PDF conversion. Copy replacement maps existing slides; it does not automatically add/remove/reorder slides. Comparison supports at most three candidates. Ratings/project-wide picks remain secondary legacy metadata, not a complete native feature. The UI uses native Mac controls, with restrained branding rather than a production typography system.

Legacy compositions preserve supported text/image/gradient data; their old typography and unsupported shapes are not an exact reproduction guarantee. Convert deliberately and keep the original. Very dense copy can overflow a prototype at the lower type limit; complete text is retained in copy/notes companions when selected. PDFs represent GIF/video as a still frame, and PDF media as its first page; original files remain intact in media handoff.

Media sizes, scan depth/count, preview decoding and import/command payloads remain bounded. Unsupported previews do not imply that an original cannot be handed off. Partial handoff failures are shown; cancelled exports discard unfinished staging. No source media is intentionally changed.

A first native edit upgrades a pre-native deck's reader schema. v0.0.6 cannot read the upgraded working copy. v0.1.1 does not introduce a further reader-schema increase over v0.1.0. No multi-writer/cloud collaboration, automatic updates or notarization is included.
