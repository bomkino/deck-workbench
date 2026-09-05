> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# Deck Prototyper parity ledger

This ledger prevents the phased Workbench rebuild from accidentally losing useful Deck Prototyper behaviour.

| Deck Prototyper capability | Phased Workbench decision |
|---|---|
| Script phase | Rebuild as Plan. |
| Headline / Subheadline / Body | Preserve as privileged canonical fields with explicit blank states. |
| Add, delete and reorder Slides | Preserve with stable IDs, Included/Skipped/Cut lifecycle and durable undo. |
| `deck-copy.txt` sync | Replace with `.pitchdeck` canonical state plus Markdown import/export and explicit external diff. |
| Full Bleed | Preserve; clarify source-treatment and expansion status. |
| Split layout | Rebuild as Diptych and Image + Text. |
| Grid layout | Rebuild as Gallery Auto Layout with named Supporting Item slots. |
| Text Only | Preserve, distinct from no on-Slide text. |
| Local media-folder scan | Rebuild on shared media infrastructure. |
| Folder/type/search filters | Preserve and page/virtualise. |
| Thumbnail-density control | Preserve independently from Interface Scale and Preview zoom. |
| Shortlist | Preserve per Slide; separate from project-level Pick/rating. |
| 1–5 rating | Preserve as optional project-level judgment. |
| Main media | Replace with named primary slots. |
| Backups | Rename Alternates. |
| Used/unused filters | Preserve. |
| Lightbox | Rebuild as full Preview and 2–4 candidate Compare. |
| Keyboard curation | Preserve and make discoverable. |
| Next issue | Preserve as next unresolved Slide. |
| Multiple media slots | Preserve with stable slot identities. |
| Per-slot transforms | Preserve as frame/crop geometry. |
| Image pan and scale | Rebuild as direct Frame and Crop modes. |
| Mirror | Preserve. |
| Fit width/height and edge alignment | Preserve. |
| Source-image boundary preview | Preserve in Crop mode. |
| Text X/Y and width | Rebuild as direct Text Stack movement, reflow and proportional scale. |
| Original 24×12 grid | Preserve exactly. |
| Crude 32-unit snap | Replace with Pitch Grid, smart guides and optional micro-grid. |
| GIF label/preview | Preserve; add explicit poster-frame state. |
| Designer Notes | Preserve; separate from Find More Media and Source Treatment. |
| Deck Health score | Reject; replace with concrete preflight issues. |
| Fix first issue | Preserve as direct phase/Slide navigation. |
| Media-package export | Rebuild with source authorisation, staging, verification and checksums. |
| JPEG visual frames | Rebuild as PNG/JPEG roughs. |
| Rough PDF | Preserve. |
| Spec-sheet export | Deepen into per-Slide designer specifications and offline Handoff Viewer. |
| Backup-first reset | Replace with durable document history, migration receipts and versioned exports. |
| Mac browser launcher | Replace with native Apple-Silicon application. |
| Linux browser launcher | Replace with packaged Garuda application while preserving the same Deck meaning. |
