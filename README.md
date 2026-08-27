# Deck Workbench

A local-first, story-first application for prototyping, reviewing and handing off cinematic pitch decks on Apple-Silicon macOS and Garuda Linux.

## Status

Pre-alpha. `main` is the canonical source branch. `DW-T00` proves the first integrated Apple-Silicon Story Document tracer. The bounded `DW-W01` work adds durable Deck/Section/Slide structure, ordering, intent and semantic Content Blocks. `DW-G01` adds a sandboxed Electron/utility-process Linux shell and exact x86-64 tarball, Arch-package and AppImage gates on Ubuntu/X11.

The automated macOS and Ubuntu package journeys are binding repository gates. Target-machine Garuda/KDE/Wayland and interactive macOS accessibility checks are explicitly waived for source promotion to `main`; they remain unverified and are not release claims. See [`docs/03-build/RELEASE_DEFINITION.md`](docs/03-build/RELEASE_DEFINITION.md).

The tracer creates a native `.pitchdeck`, edits one canonical Story headline through the typed bridge and host-owned durable command seam, reopens with undo history, and exports one PDF page. Its macOS 26 arm64 workflow builds, ad-hoc signs, extracts, verifies, and runs the exact packaged journey at the checked-out SHA.

## Verify

Portable command and contract checks:

```sh
npm run verify
```

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
installation, KDE portals, Wayland/KWin behavior, drag/drop/reveal, target fonts,
codecs and GPU paths remain target-machine gates.

The bounded local CLI and privacy-safe support report adapters are documented in
`apps/cli/README.md` and `docs/implementation/DW-W10-SUPPORT-REPORT.md`.

## Principles

- Story remains canonical while visual alternatives change.
- Everything works locally and offline.
- No bundled AI, account, cloud service, telemetry or analytics.
- Mac is primary; Garuda Linux has required semantic parity.
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
