# Phased Workbench interaction tracer

This is a disposable interaction tracer for the Workbench product reset. It leaves the packaged production workspace untouched while proving the four-phase workflow and its hardest interaction assumptions.

## Run from the repository

```bash
npm run preview:phased
```

Open:

```text
http://127.0.0.1:8124/prototypes/phased-workbench/
```

The tracer stores its local working state in browser storage. Use **Reset tracer** to restore the committed fixture.

## Build a self-contained preview

```bash
npm run build:phased-preview
```

Output:

```text
artifacts/phased-workbench-preview/
```

Run that preview independently:

```bash
cd artifacts/phased-workbench-preview
node serve.mjs
```

Then open `http://127.0.0.1:8124/`.

Verify the self-contained preview:

```bash
npm run verify:phased-preview
```

## What is real in this tranche

- Plan, Curate, Assemble and Handoff are separate full-screen workspaces over one selected Slide.
- blank, intentionally blank and no-on-Slide-text states remain distinct;
- simple copy and repeated-item Slides coexist;
- Curate separates project-level Picks/ratings from per-Slide shortlist/select/alternate/reject;
- the media wall is virtualised over 2,400 generated Assets;
- Assembly includes direct text movement/resizing, image crop movement, semantic type scales, one/two/three-column Body, the original 24×12 Pitch Grid, snapping and editable linear/radial black gradients;
- one pointer gesture becomes one undo entry;
- media can be promoted and demoted without deletion;
- Handoff reports concrete issues and exports a tracer manifest plus Obsidian-friendly Markdown.

## Deliberate limits

This tranche does not alter `.pitchdeck` schema, native media permissions, Reference Library, packaged exports or the current production workspace. It is the interaction-risk gate that must be judged before those systems are changed.

The tracer source is split by phase and fragment so each mini-app can evolve independently without turning the prototype into one monolith.
