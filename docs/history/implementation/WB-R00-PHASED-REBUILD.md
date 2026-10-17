> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# WB-R00 — Phased Workbench rebuild

Historical scope note: this document records the disposable tracer tranche before the phased workspace migrated into production. Current implementation and release evidence live in `EXECUTION_INDEX.md` and `../evidence/WORKBENCH-UI-UX-RELEASE-PASS-2026-08-29.md`.

## Goal

Replace the current simultaneous Editorial Spine as the primary workflow with four dedicated phases while preserving the durable Deck kernel, native shells, recovery, undo/redo and cross-platform meaning.

## First tranche

The first tranche is deliberately non-destructive:

1. freeze the phased product contract and original-feature parity ledger;
2. add a small pure workflow model covering blank states, readiness, stable repeater slots, media promotion/demotion, Pitch Grid geometry and gradient feathering;
3. build a disposable four-phase interaction tracer beside the packaged workspace;
4. prove the tracer can run without external services or dependencies;
5. leave `.pitchdeck` schema, Reference Library, production workspace and packaging unchanged until the interaction risks have been judged.

## Tracer journey

```text
open Plan
→ inspect intentional blanks, a no-text Slide and a comps Repeater
→ edit Purpose/copy/Visual Style
→ move or skip a Slide
→ enter Curate on the same Slide
→ search a virtual 2,400-Asset wall
→ shortlist, select, alternate, reject and rate media
→ demote selected media safely
→ enter Assemble on the same Slide
→ move/resize Text Stack
→ pan/scale source crop
→ use semantic type scales and Body columns
→ show and snap to the 24×12 Pitch Grid
→ manipulate linear/radial black gradients
→ record Find More and Designer Notes
→ enter Handoff
→ inspect concrete issues
→ export a tracer manifest and Obsidian-friendly Markdown
```

## Interaction evidence required before production migration

- direct manipulation feels immediate in WebKit and Chromium;
- one pointer gesture becomes one undo item;
- snapping is stable across zoom;
- text reflow and proportional scaling are distinguishable;
- one/two/three-column Body remains readable;
- gradient handles, feather and export use one model;
- project-level and per-Slide media judgment remain understandable;
- no panel or thumbnail loading causes structural jumps;
- repeated content retains copy/media identity;
- upstream changes flag review without deleting downstream work.

## Explicitly deferred

- production `.pitchdeck` schema migration;
- native folder authorisation and real media bytes;
- Reference Library core extraction;
- Moveable/Selecto dependency selection;
- bundled production font;
- canonical PNG/PDF/Handoff export;
- installed Apple-Silicon and Garuda journeys;
- retirement of the current workspace.

These are deferred until the hard interaction tracer is accepted, not omitted from the product.
