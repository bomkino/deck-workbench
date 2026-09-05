> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# WB-F02 — Production Curate

## Status

Source slice complete; packaged acceptance remains open.

This is the next production gate after the shared Plan workspace. It replaces the neutral Asset-reference placeholder with a durable, source-authorized Curate workflow while preserving the schema-1 Deck, journalled history and ten-method native bridge.

## User capability

Inside the packaged macOS and Linux applications, a person must be able to:

- authorize a real media Root through a native host picker;
- browse a progressively loaded and virtualized media wall without exposing absolute paths to the renderer;
- keep the selected Slide's Part, number, internal title, Purpose, copy, Supporting Items and Visual Style in view;
- record project judgment independently from per-Slide decisions;
- shortlist, select, alternate or reject an Asset for the current Slide;
- fill stable named primary slots, including Repeater slots keyed by Supporting Item identity;
- record a durable Find More state and brief;
- preserve Asset identity and Slide decisions while a source is missing;
- save, close and reopen the Deck with the same semantic state.

## Ownership boundary

The native host owns filesystem authority, root grants, enumeration and media-byte resolution. The renderer receives only bounded descriptors with opaque stable IDs, safe relative display paths, media metadata and availability.

The Deck kernel owns durable Workbench meaning:

- project judgment: rating `0–5`, review `unreviewed | keep | maybe | reject`, and Project Pick;
- per-Slide decision: `considered | shortlisted | selected | alternate | rejected-for-slide`;
- stable slot assignments;
- Find More state and brief;
- missing Asset identity.

Source files are read-only. Paths are Locations, never Asset identities. A per-Slide rejection never changes project judgment.

## Schema-1 compatibility

This gate remains schema version 1. New Curate meaning is additive and uses stable IDs. Older Decks without Curate data open with neutral defaults. Unknown fields continue to round-trip through checkpoint and journal replay.

The implementation must document the exact envelope and commands alongside the code. Every accepted Curate mutation must use the kernel's prepare → durable journal append → commit path and participate in undo/redo. Invalid commands are atomic no-ops.

## Stable layout

Curate has four fixed regions:

1. left Slide queue;
2. centre virtual media wall;
3. right Slide brief;
4. bottom primary slots, Alternates and Shortlist.

Loading and filtering must not cause panel jumps. The media wall mounts only the visible window plus bounded overscan. Keyboard culling must have visible pointer equivalents and stable focus.

## Acceptance

The source gate requires:

- focused kernel persistence, history, replay and invalid-command tests;
- source reconciliation tests that never use path as Asset identity;
- virtual-window and 10,000-record wall tests;
- bridge/security contract tests;
- the complete portable suite with no Production Plan regression.

The packaged gate requires the same exact commit to pass macOS and Ubuntu packaging and runtime journeys. Source tests alone do not establish packaged acceptance, WebKit/Chromium parity, culling rhythm, Preview quality or assistive-technology acceptance.

## Deliberately outside this first gate

- destructive source-file operations;
- a generic filesystem, shell, SQL or evaluation bridge;
- cloud catalogues or network media search;
- schema version 2 migration;
- final Assembly crop/layout behavior;
- final Handoff packaging;
- claims about Garuda/KDE/Wayland or exhaustive VoiceOver acceptance without those environments.

## Current gate state

The source slice implements the Deck-owned Curate commands/projections, Deck-bound portable catalogue, conservative reconciliation, bounded revision-pinned queries, 10,240-Asset virtual-wall fixture, four-region renderer, and native root/session seams. This is not yet the packaged Production Curate acceptance claim.

The source candidate passed generation, the complete portable suite, source-contract verification, repository verification and the self-contained phased-preview gate on 2026-08-29. The historical test count, exact command evidence and claim boundary are recorded in `docs/evidence/WB-F02-PRODUCTION-CURATE-SOURCE-2026-08-29.md`.

The gate remains open until production Job/cancellation state and crash recovery are implemented, host platform observations are removed from the portable catalogue boundary, large-history interaction cost is bounded, and target-machine evidence proves bounded generated previews, package reopen with a real authorised Root on both macOS and Ubuntu, cross-host Deck/catalog round-trip, and the exact-head packaged journey. The package scripts record Curate as `unverified` unless an authentic native journey result is supplied; source tests cannot promote that state.
