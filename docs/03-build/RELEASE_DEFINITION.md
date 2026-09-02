# Release definition

This document is the repository authority for promotion and release language.
Product scope remains defined by `docs/product/PRODUCT_SPEC.md` and
`docs/product/WORKBENCH_CONSTITUTION.md`.

## State boundaries

- **Canonical source:** the intended code and documentation are on `main`.
- **CI passed:** required checks succeeded for the exact `main` commit.
- **Packaged:** a platform artifact was built, hashed, extracted and inspected.
- **Integrated:** the named packaged journey passed at the exact commit.
- **Released:** a GitHub Release exists and exposes the intended artifacts.
- **Release-ready:** every gate explicitly required for that release has passed.

None of these states implies the next.

## Canonical-main gate

A commit may become canonical `main` when:

1. the worktree and source identity are exact and clean;
2. `npm run verify` passes;
3. the macOS workflow builds the arm64-only ad-hoc-signed app ZIP and completes
   the packaged create/edit/save/quit/reopen/undo/PDF journey;
4. the Ubuntu workflow builds and verifies the x86-64 tarball, Arch package
   structure and reproducible AppImage, including two-process persistence,
   rendered geometry and the exact-SHA packaged screenshot set;
5. AGPL-3.0, notices and `THIRD_PARTY.md` remain coherent;
6. documentation distinguishes verified, waived and unverified surfaces; and
7. the promotion is a fast-forward or an explicitly reviewed merge.

## Current waiver

On 2026-08-27, the repository owner explicitly waived real-world target testing
as a prerequisite for promotion to `main`. The following are therefore not
canonical-main blockers:

- Garuda/KDE/Wayland installation and desktop integration;
- an actual `pacman` transaction;
- Mac-to-Garuda-to-Mac transfer on target machines; and
- interactive macOS assistive-technology acceptance.

These surfaces remain **unverified**. Documentation, issues and release notes must
not describe them as passed. A waiver changes the promotion policy; it does not
manufacture evidence.

## Current public status

Deck Workbench is pre-alpha source with bounded integrated tracers. It is not a
public v1, notarized distribution or production-ready editor. GitHub's public
Latest state is authoritative: if `v0.0.5` is not yet public, `v0.0.4` remains
the last normal release. `v0.0.4` added native conversion-prompt copying and
strict paste, Preview and import into a new local `.pitchdeck`; it did not add
upload or built-in AI. Normal release status does not manufacture production readiness.
Source text or a tag alone does not prove publication; the GitHub Release and
its attached exact-commit artifacts are the authority. The existing unpublished
`v0.0.3` draft is historical and must be retargeted to
`c6736ef6c20e1e5d5e6bdfd4f40c5ce062280512` before anyone publishes it.

## Current source and release line

The current source and intended Latest release line is `v0.0.5`. Its bounded repair scope makes Full Bleed the
new-work default and makes Plan's visual decision drive the initial Assembly. Assembly renders assigned images
without distortion, exposes Fit/Fill, three text sizes, direct Element movement and resizing, role-specific image
swaps, visual gradient controls, an image-backed Slide rail, and working canvas changes. Curate exposes a clear
Primary action, real thumbnail trays, a local fullscreen rated preview, and role-aware assignment to any Slide. It is
not released, Latest, packaged or installed merely because the source version
is `0.0.5`. Release status comes from the public GitHub Release targeting an
exact canonical-main commit whose package workflows passed, with its public
artifacts downloaded and read back. Curate and target-machine behavior outside
repository CI must be reported from direct acceptance rather than assumed.

## First serious release

A future first serious release additionally needs the complete Story workflow,
the packaged visual/Asset journey, Design Options UI, references/media, Deck
Design System and fonts, authored Pattern breadth, Review/Preflight, honest PDF,
PPTX/handoff/PNG exports, performance evidence, installation documentation and
release checksums. Deferred target-machine checks may be reinstated as binding by
an explicit owner decision.

## Repository integrity gate

Every promoted source tree must pass `npm run verify`. The gate regenerates shared contracts, runs all tests, checks source invariants, validates JavaScript and shell syntax, resolves relative documentation links, enforces full-commit GitHub Action pins, reconciles Electron notices and rejects tracked build output. Platform package journeys run this gate before packaging.
