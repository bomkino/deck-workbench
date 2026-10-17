# Slide editing — implementation scope

Starting main/release: 0b6013051a38727f4ba44acd18860cf1e4b16583 (v0.1.1).

Goal: restore obvious layout and copy editing and missing manual slide management while preserving the native curation/handoff workflow. No redesign, no expansion into production typography.

Changes: shared visible Layout/Edit Copy bar, Add/Duplicate/Rename/Move/Delete with coherent Undo, captured-target copy editor with missing/extra text fields and durable save acknowledgement. Preserve original media and stable source identities. Fix empty/no-op history writes and repeated sidebar ordinal scans. Do not add a new schema/history vocabulary.

Proof: kernel state/Undo/reopen and legacy-ID remapping; native controller add/edit/duplicate/move/rename/delete/undo; ordinary final PDFs/copy/media handoff containing authored copy. Exact-build receipt is the completion evidence. Manual exhaustive accessibility and studio-scale benchmarking remain out of scope.

The user's feedback that other workflows are satisfactory is a constraint: preserve them.
