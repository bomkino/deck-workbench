# Deck Workbench

A local-first, story-first application for prototyping, reviewing and handing off cinematic pitch decks on Apple-Silicon macOS and Garuda Linux.

## Status

Pre-alpha. The repository is beginning with an Apple-Silicon Story Document tracer. Do not use it for production client work yet.

## Principles

- Story remains canonical while visual alternatives change.
- Everything works locally and offline.
- No bundled AI, account, cloud service, telemetry or analytics.
- Mac is primary; Garuda Linux has required semantic parity.
- PDF is the visual-fidelity reference.
- PPTX fallbacks are explicit.
- Interface Scale never changes the Deck itself.
- The project is free software under AGPL-3.0.

## Planned applications

- Apple-Silicon macOS 26+ app using SwiftUI and WebKit.
- Garuda/Arch/KDE Linux app using Electron.

## Documentation

Start with:

- `docs/product/PRODUCT_SPEC.md`
- `docs/product/WORKBENCH_CONSTITUTION.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/implementation/EXECUTION_INDEX.md`

## Privacy

Deck Workbench is designed to work offline and collect nothing. Private decks, commercial fonts and client media must not be committed to this repository.
