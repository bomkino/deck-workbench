# Deck Workbench agent instructions

These instructions govern all repository work unless a narrower directory-level `AGENTS.md` explicitly deepens them.

## Read first

1. `docs/product/WORKBENCH_CONSTITUTION.md`
2. `docs/product/PRODUCT_SPEC.md`
3. `docs/product/GLOSSARY_AND_COMMANDS.md`
4. `docs/architecture/SYSTEM_ARCHITECTURE.md`
5. the current ticket under `docs/implementation/`

Record the exact branch, SHA and working tree before changing code.

## Product

Deck Workbench is a manual, local-first, story-first deck prototyping application. The Mac edition is primary. The Linux edition targets Garuda Linux / Arch / KDE. The product contains no bundled AI, telemetry, account, cloud service or mandatory network dependency.

## Ownership

- Deck kernel owns semantic document state, commands, validation, undo/redo, Preflight and export planning.
- Native shell owns document lifecycle, permissions, durable persistence, privileged operations and packaging.
- Workspace owns transient interaction and projections.
- Renderer never becomes the canonical document store.

## Non-negotiables

- Story survives design changes.
- Slide ID survives reorder.
- Design Options share Story and assignments.
- One command seam serves manual and external mutations.
- Invalid commands are atomic no-ops with explicit errors.
- Durable acknowledgement occurs only after journal fsync.
- Interface Scale is not artboard zoom.
- No generic IPC, arbitrary path API, shell execution, SQL or eval exposed to renderer.
- No hidden fallback, silent data loss, silent font substitution or silent full-Slide rasterization.
- Preserve AGPL-3.0 and document every third-party dependency.

## Working style

- Narrow context. One causal slice at a time.
- Write caller usage and types before difficult implementations.
- Prefer deep modules with small interfaces.
- Do not add abstractions for one hypothetical adapter.
- Improve architecture only where the current slice needs it.
- Debug from reproduction and root cause, not guess-and-check edits.
- Verify delegated work by inspecting the diff and running the real artifact.
- Keep an append-only decision/evidence trail in `docs/evidence/DECISIONS.tsv`.

## Tests

Test public behaviour, not implementation shape. Do not create random snapshots, wrapper tests or a coverage quota. Every completion claim requires a fresh proving command and its result.

## Git and authority

- Work on `codex/` branches.
- Do not merge, publish Releases, deploy, delete branches or modify repository settings without explicit authority.
- Do not commit private decks, source media, commercial fonts, working `.pitchdeck` documents outside approved fixtures, local build products or credentials.

## UI

Default topology is Editorial Spine. Focus Stage and Reference Strip are temporary workspace states. Avoid corporate SaaS chrome, generic card dashboards, jumping inspectors, ambient animation and AI-like decorative excess. Keep operations calm, legible and keyboard-complete.

## Claim language

- `source-ready`: source builds and available public-seam checks pass.
- `packaged`: a real bundle was built, signed, zipped, extracted and verified.
- `integrated`: the exact packaged journey passed at the exact commit SHA.
- `release-ready`: all required platform, distribution, accessibility, performance and notice gates passed.

When evidence is missing, state exactly what remains unverified.
