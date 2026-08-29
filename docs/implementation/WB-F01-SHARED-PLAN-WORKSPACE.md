# WB-F01 — Shared production Plan workspace

## Status

Implemented on `codex/workbench-phased-rebuild` as the first production gate after the disposable four-phase tracer.

## User capability

The packaged macOS and Linux applications now consume one generated workspace built from `packages/workspace/app`.

Inside that workspace a person can:

- move between Plan, Curate, Assemble and Handoff without changing documents;
- see Parts and Slides through the existing durable Story projection;
- edit Headline, Subheadline and Body copy while preserving paragraph breaks and Markdown source text;
- distinguish present, intentionally blank and unreviewed copy fields;
- mark a Slide as visible text, no on-Slide text or undecided;
- set an internal title, Purpose, lifecycle, Content Pattern and starting Visual Style;
- author stable Supporting Items for repeated content such as comps, cast, team or episodes;
- move Slides and Parts with controls or Option–Arrow;
- use the existing journalled undo/redo path;
- retain the existing neutral Asset, authored Pattern, crop, alignment and PDF seams in their dedicated phases.

## Schema-1 compatibility envelope

This gate deliberately does not change `.pitchdeck` schema version 1.

New Plan semantics live inside one reserved canonical Content Block:

```text
role:        workbench-plan
semanticKey: workbench.plan.v1
value:       one-line JSON envelope
```

The envelope records:

- Internal title;
- Purpose;
- Included, Skipped or Cut lifecycle;
- visible, no on-Slide text or undecided state;
- Content Pattern;
- explicit copy-field states;
- stable Supporting Items;
- media-slot count;
- text-position hint.

Visible copy remains in ordinary semantic `headline`, `subheadline` and `body` Content Blocks. Starting Visual Style remains the Slide intent. The renderer never owns the only copy.

Plan metadata is written last in a multi-command save. A partial failure therefore cannot falsely claim that the whole Plan edit completed. Every accepted mutation remains journalled and undoable through the current kernel.

## Shared-source build

```text
packages/workspace/app/
        ↓ scripts/build-workspace.mjs
build/generated/workspace/
        ↓
macOS app bundle + Linux package/runtime
```

`apps/macos/Resources/Workspace` is now a repository-relative compatibility link to the generated workspace. It is no longer a competing source tree.

## Preserved contracts

- ten-method native bridge;
- schema-1 Deck kernel;
- stable Section, Slide and Content Block identity;
- packaged Story keyboard journey;
- sequence keyboard/control movement;
- Interface Scale independent from artboard zoom;
- current W02 Pattern, Asset assignment, alignment and crop seams;
- one-page native PDF proof;
- sandboxed/no-network renderer.

## Deliberately deferred

- atomic single-command Plan save;
- CommonMark AST and inline mark schema;
- full Markdown import/diff UI;
- native folder and `.pitchlibrary` media sources;
- project-level versus per-Slide media judgment in production;
- direct-manipulation Assembly engine;
- final designer Handoff package;
- schema version 2 migration.

Those remain later gates. They are not hidden behind unfinished controls in this slice.
