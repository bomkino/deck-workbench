# Deck Workbench

[![DW-T00 macOS arm64](https://github.com/bomkino/deck-workbench/actions/workflows/dw-t00-macos.yml/badge.svg?branch=main)](https://github.com/bomkino/deck-workbench/actions/workflows/dw-t00-macos.yml)
[![DW-G01 Ubuntu Linux x64](https://github.com/bomkino/deck-workbench/actions/workflows/dw-g01-linux.yml/badge.svg?branch=main)](https://github.com/bomkino/deck-workbench/actions/workflows/dw-g01-linux.yml)

A local-first, story-first application for prototyping, reviewing and handing off cinematic pitch decks on Apple-Silicon macOS and Garuda Linux.

## Status

Pre-alpha. `main` is the canonical source branch. The shared Workbench now centres four task workspaces: Plan, Curate, Assemble and Handoff. Production Plan uses the durable Deck command seam, protects unsaved work per Slide, and can paste or locally choose, strictly preview and import a Workbench Markdown v1 `.md` into a new local `.pitchdeck`. Its conversion prompt is copied through the native clipboard; conversion itself stays outside the app. The local file chooser reads the selected bytes into the same textarea and never uploads them. No model, upload, account or network service is built in. The bounded Production Curate source slice adds an authorised, progressively loaded media workflow while keeping project judgment separate from per-Slide decisions. Handoff reviews readiness and exports the active Slide PDF at the selected canvas ratio only. The application chrome uses the pinned pitch.dog v13 Head, Body and Eyebrow families by default, with Phosphor for authored action icons; artboard/export typography remains an independent Deck concern.

`v0.0.6` is the current source and release line. It retains the v0.0.5 visual-workflow repair and completes Curate’s fullscreen keyboard loop: arrows browse, `0–5` rate, `P` toggles Project Pick, `S` toggles the current-Slide shortlist, `A` toggles Alternate, `M` opens assign-to-Slide, and `Esc` closes. Assignment focuses its first available role and returns to the same fullscreen Asset after assign or cancel. On macOS, one full-content window integrates the native traffic lights with Workbench’s compact phase toolbar while File and View commands remain in the system menu bar. The public GitHub Release, not version text alone, is the authority for whether those exact-commit artifacts are released and Latest.

`DW-T00` proves the first integrated Apple-Silicon Story Document tracer. `DW-W01` adds durable Deck/Section/Slide structure, ordering, intent and semantic Content Blocks. `DW-G01` adds a sandboxed Electron/utility-process Linux shell and exact x86-64 tarball, Arch-package and AppImage gates on Ubuntu/X11. A real user-chosen Curate media-folder journey is release acceptance reported separately, not an inference from CI.

The automated macOS and Ubuntu package journeys are binding repository gates. Target-machine Garuda/KDE/Wayland and interactive macOS accessibility checks are explicitly waived for source promotion to `main`; they remain unverified and are not release claims. See [`docs/03-build/RELEASE_DEFINITION.md`](docs/03-build/RELEASE_DEFINITION.md).

The tracer creates a native `.pitchdeck`, edits one canonical Story headline through the typed bridge and host-owned durable command seam, reopens with undo history, and exports one PDF page. Its macOS 26 arm64 workflow builds, ad-hoc signs, extracts, verifies, and runs the exact packaged journey at the checked-out SHA.

## Download and run

Use the CI-built assets on the [`v0.0.6` release](https://github.com/bomkino/deck-workbench/releases/tag/v0.0.6) only when GitHub shows that release as public and Latest. Verify the adjacent `.sha256` file before opening an asset.

- **Apple-Silicon macOS 26+:** download the `.app.zip`, extract it, then open `Deck Workbench.app`. The build is ad-hoc signed, not notarized, so macOS may require Control-click → Open on first launch.
- **Garuda/Arch x86-64:** download the `.pkg.tar.zst` and install it with `sudo pacman -U ./deck-workbench-*.pkg.tar.zst`.
- **Other x86-64 Linux:** download the AppImage, run `chmod +x Deck-Workbench-*.AppImage`, then launch it; or extract the `.tar.gz` and run `Deck-Workbench-linux-x64/deck-workbench`.

The packaged Ubuntu/X11 journey is automated. Garuda/KDE/Wayland installation and desktop integration remain unverified target-machine checks, as described below.

## Verify

Portable command and contract checks:

```sh
npm run verify
```

This single gate regenerates contracts, runs the full test suite, checks the source contract, validates JavaScript and shell syntax, verifies relative documentation links, enforces full-SHA GitHub Action pins, reconciles dependency notices and rejects tracked build clutter.

On Apple-Silicon macOS 26 or newer:

```sh
scripts/build-macos.sh
scripts/verify-packaged-macos.sh
node scripts/write-evidence-receipt.mjs
```

The packaged artifact and exact-SHA receipt are written under `artifacts/`.

On Ubuntu 24.04 x86-64, after installing the workflow dependencies listed in
`.github/workflows/dw-g01-linux.yml`:

```sh
npm ci
npm run install:electron
scripts/linux/fetch-appimage-tools.sh
npm run build:linux
npm run verify:linux
```

This builds and directly verifies a tarball, `.pkg.tar.zst`, and reproducible
AppImage through distinct create and reopen application processes. Actual Garuda
installation, KDE portals, Wayland/KWin behavior, drag/drop/reveal, target-machine
font rendering, codecs and GPU paths remain target-machine gates.

The bounded local CLI and privacy-safe support report adapters are documented in
`apps/cli/README.md` and `docs/implementation/DW-W10-SUPPORT-REPORT.md`.

## Principles

- Story remains canonical while visual alternatives change.
- Everything works locally and offline.
- No bundled AI, account, cloud service, telemetry or analytics.
- Mac is primary; Garuda Linux targets and requires the same semantic parity.
- PDF is the visual-fidelity reference.
- PPTX fallbacks are explicit.
- Interface Scale never changes the Deck itself.
- The project is free software under AGPL-3.0.

## Applications

- Apple-Silicon macOS 26+ app using SwiftUI and WebKit.
- Garuda/Arch/KDE Linux app using Electron; Ubuntu/X11 package journey automated,
  while target Garuda acceptance remains unverified and outside the `main`
  promotion gate.

## Documentation

Start with:

- `docs/product/PRODUCT_SPEC.md`
- `docs/product/WORKBENCH_CONSTITUTION.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/implementation/EXECUTION_INDEX.md`
- `docs/03-build/RELEASE_DEFINITION.md`

## Privacy

Deck Workbench is designed to work offline and collect nothing. Private decks, commercial fonts and client media must not be committed to this repository.

## Interface character

Workbench uses an editorial desk rather than a generic dashboard: a 44 px physical control floor, pitch.dog v13 role-based typography, Phosphor action icons, scale-aware spacing, hard rules, persistent Light/Dark/System appearance, and a dark focused stage. Interface Scale changes the complete chrome geometry while Artboard Zoom remains independent. The project mark follows the pitch.dog illustration law: one imperfect frame, one impossible coral cord, and enough negative space to stay legible at favicon size.
