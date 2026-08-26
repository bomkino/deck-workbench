# Deck Workbench execution index

## Native gates

### DW-T00 — Apple-Silicon Story Document Tracer

Mandatory first slice. See its dedicated ticket.

### DW-G01 — Garuda shell parity tracer

Dependencies: `DW-T00` semantic/document contract.

On Garuda KDE/Wayland:

- open the same fixture `.pitchdeck`;
- host kernel outside renderer in Electron utility process;
- repeat Story edit, durable journal, undo/redo, Interface Scale, reopen and PDF;
- verify KDE picker, menus, drag/drop and reveal;
- produce `.pkg.tar.zst`, AppImage and tarball;
- round-trip Mac → Garuda → Mac without semantic diff.

Do not call integrated until Jenai's actual machine passes.

### DW-G02 — Real editor dependency tracer

Dependencies: Mac and Garuda shells.

Prove in WebKit and Chromium:

- constrained ProseMirror schema or accepted alternative;
- Moveable transform one Text and one Image Element;
- Selecto multi-select;
- IME and keyboard editing;
- DOM accessibility;
- rail thumbnail;
- canonical state outside renderer;
- 100-Slide performance.

### DW-G03 — Real fonts and export tracer

Dependencies: editor projection.

Using approved pitch.dog fonts and representative safe Slides:

- WebKit PDF/PNG;
- Chromium PDF/PNG;
- PptxGenJS PPTX;
- Microsoft PowerPoint inspection;
- LibreOffice inspection;
- fallback report;
- colour and typography comparison.

## Vertical V1 slices

### DW-W01 — Story Document

Create/open Deck, Sections/Slides, canonical Story, reorder, save, close, reopen, undo, crash recovery, Interface Scale on Mac and Garuda.

### DW-W02 — First complete visual Slide

Cover, Full-bleed Statement and Editorial Body Patterns; assign Asset; edit text; crop image; align Element; save.

### DW-W03 — Design Options

Create, name, compare, activate and remove non-destructive visual options without duplicating Story.

### DW-W04 — References and animated media

Consume Reference Library Asset contract; Primary/Alternate assignment; GIF/video preview; poster frame; replacement preserving crop; missing reference resolution.

### DW-W05 — Design System and Font Lab

Import typography manifest; colour/grid/image tokens; provenance; global changes; explicit local overrides.

### DW-W06 — Authored Pattern family

At least twelve excellent pitch-deck families, proven against realistic content ranges and full-bleed-first work.

### DW-W07 — Review and Preflight

Filmstrip/contact sheet; sequence rhythm; deterministic issues; direct jump; executable remedies; reasoned acknowledgements; profile blockers.

### DW-W08 — Exports

PDF, fidelity-first PPTX, handoff and PNG with progress, cancellation, staging, fallback reports and checksums.

### DW-W09 — External control

Keyboard completeness, command palette, accessibility tree, local CLI and opt-in MCP. No AI or hidden daemon.

### DW-W10 — Release hardening

Mac `.app.zip`; Garuda packages; checksums; privacy/support bundle; performance corpora; accessibility; semantic round-trip; notices and installation docs.

## Sequencing rules

- Finish `DW-T00` before expanding editor scope.
- Prove Garuda parity before a large Mac-only feature lead develops.
- Do not build the twelve Patterns before the editor and document models are real.
- Do not defer export semantics until the end; `DW-G03` happens before V1 breadth.
- Each slice ends in a real user journey and an evidence receipt.
