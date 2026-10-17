# Starter parity and Photoshop handoff

Status: implementation plan, 14 September 2026. Target v0.2.0.
Base: `c7966dd64171d4bc6babcc72d0d25006fa4f4e15` (v0.1.3).
Branch: `codex/workbench-parity`; starting worktree clean.

## Problem and resulting workflow

The native app currently exports ordinary Copy.md and original media, but cannot prepare the studio's numbered Photoshop slides. Its 1920 grid scales the cinemascope constants and its provisional type scales horizontally. Those differ from the current native design starters.

The new handoff should include importer-compatible Workbench Markdown and one PSD per exported slide. Each PSD contains `00.Background` and `01.Character`, sharing one embedded, full-canvas Smart Object. Its artwork keeps the image positions, frames, fit and crops chosen in Workbench. The designer edits that content and creates the character mask in Photoshop. The InDesign builder reuses prepared PSDs rather than replacing them with blanks.

## Implementation slices

1. **Grid and styles.** Centralize exact 24-column/12-row geometry: cinemascope 96/64 margins, 16/8 gutters; widescreen 72/64 margins, 12/8 gutters. Preserve fractional 62.5 px columns. Use the same geometry for guides, snapping, layouts and PSD export. Add an explicit starter style with independent Head/Sub/Body font choice and size/leading presets, justified-body option, per-slide dark/light appearance, and shared-role palette controls. Existing layouts retain their old typography until the user explicitly adopts the starter style; copy and image crops survive style changes and Undo. Do not change the application's native-control typography or its existing v13.0.0 font pin.
2. **PSD encoder.** Use pinned ag-psd 31.0.2 in a build-time bundle hosted by serial JavaScriptCore, with no browser, Node runtime or Photoshop requirement. Write RGB/8-bit, embedded original still images, source transforms, clipping masks, native composites and exact inner/outer guides. Both outer instances share an embedded-file ID but have distinct layer/instance IDs. Insert sRGB ICC data explicitly because the library's normal writer omits that resource. Empty slides remain editable templates. Do not invent a cut-out, flatten copy into artwork, or modify original files. Non-still representations and source exceptions are explicit.
3. **Handoff integration.** Add optional PSD and Workbench-Markdown outputs to the existing component exporter. Freeze the selected slide order once; use the same two-digit minimum ordinals in copy, PSD filenames and a manifest carrying stable slide IDs. Preserve the complete existing Copy.md output. Three-role import compatibility must retain visible writing and explain any grouping of extra copy roles. Only required media is read; cancellation cleans staging and errors never claim a failed component succeeded.
4. **InDesign handoff.** Extend the existing local Build tool to recognize and validate the exported PSD manifest before creating a project. Reuse prepared PSDs only when names, canvas, copy/order manifest and expected role layers agree. Keep its blank-template path for ordinary Markdown. Existing Figma writing import remains a separate supported consumer; image placement stays manual.
5. **Proof and release.** Add only focused public-behaviour checks for the new metadata/export contracts. Run the existing required native package journey, then inspect locally exported PSDs in Photoshop and a small InDesign build in both sizes. Cover shared-source edits, crop/frame fidelity, original hashes, transparent/empty and multiple-image cases, source failure, cancellation and save/reopen. Measure the same serial PSD run on an 8 GB Mac. Update current docs and notices, preserve historical evidence, merge with exact-source CI, tag/release its verified artifact and install that released build.

## Typography boundary

The existing font-binary pin is v13.0.0, `786b4a2b671182319320f922b8de8f927ea3a002`; retain it and its CC0 notices. User-authored deck typography is a governed consumer exception: slide composition needs editable project fonts and starter size/leading scales, which application-interface roles cannot represent. It applies only to deck rendering and handoff, not app controls. Project font availability, language coverage, wrapping and page fit require review. This is a permanent user-content capability; remove the exception only if a future canonical contract explicitly governs user-authored slide typography. Do not redistribute private upstream tokens or documentation.

## Acceptance boundaries

- Native Mac only; preserve current local-first architecture, durable mutation seam and source-media safeguards.
- No client files, private paths or commercial font binaries in Git history or public evidence.
- PSD layers initially show the complete scene. Character extraction is a later artist action.
- No claim of whole-deck accessibility or all-machine performance from a successful synthetic run.
- Current v0.1.3 installation precedes implementation; final installation must match the released v0.2.0 artifact.
