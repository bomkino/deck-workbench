# Mac workflow

Import a UTF-8 Markdown/text file. Workbench Markdown v1 remains an intended input; plain Markdown uses `## Slide title` and optional `### Headline`, `### Body` and `### Notes` fields. Inspect the import preview. Arbitrary DOCX/PDF parsing is not implemented. New decks default to 2576 x 1080.

Curate keeps the current slide, locked copy and media context together. Attach media folders, choose an image for a role, and save additional candidates. Chosen assignments and shortlist membership are separate. Use Help > Keyboard Shortcuts (Command-/); Command-1/2 switches Curate/Assemble. Curation letters should not act while typing notes, copy or search text.

Assemble is for suggested image crops, text region, columns and gradients. Fit Copy adjusts provisional presentation without rewriting words. Complete text is retained separately when the rough slide cannot show it all. The renderer is shared with PDF output, and selection controls are not slide content.

Export Handoff (Command-Shift-E) offers Prototype.pdf, Prototype with notes.pdf, Copy.md, original-media folders Approved Media/ and Shortlisted Media/ grouped per slide, and a media index. Options may be selected separately. Exported source originals are copies, not cropped derivatives. Long notes continue outside the slide preview. Source/destination failures must be reported, not called success.

Before testing, duplicate the .pitchdeck in Finder while it is closed. First native editing upgrades its package reader schema and keeps a compatibility backup inside recovery/pre-native-0.0.6. That internal backup is not a substitute for an independent duplicate. Keep the old app away from the upgraded working copy. File > Recover Saved Copy creates a separate recovery destination; its behaviour is still awaiting hands-on verification.
