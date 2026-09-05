# Deck Workbench

A Mac-only tool for turning final copy and selected media into a clear prototype and designer handoff. It does not replace the designer.

## Current version: v0.1.0 — native Mac user-test build

The native repair is the active source and build path. This version is being promoted at the studio's explicit request without running the full acceptance suite. A published app archive means it compiled and was packaged; it does **not** mean that export appearance, migration, recovery, keyboard behaviour, performance or accessibility have been validated.

[Download v0.1.0](https://github.com/bomkino/deck-workbench/releases/tag/v0.1.0). Use the `.app.zip`, not the automatic GitHub source archive. Apple Silicon and macOS 26 or newer are required. The app is ad-hoc signed, not notarized. macOS may require approval through its security controls. Do not disable system security globally.

**Start with a duplicate of a deck and retain v0.0.6 as a fallback.** The first native edit upgrades the package's reader schema; v0.0.6 cannot reopen that upgraded working copy. The original v0.0.6 release remains available. Source media is not intentionally modified.

## Working flow

Import final copy, curate the images, suggest the arrangement, export the handoff. The two main workspaces are Curate and Assemble; notes and copy remain associated with each slide. New prototypes default to 2576 x 1080. Copy is protected by default, not a writing assignment to complete in the app.

The native source implements whole-deck Prototype.pdf, Prototype with notes.pdf, editable Copy.md, and original files grouped per slide under Approved Media and Shortlisted Media. Chosen assignments and shortlist membership are independent. Creative warnings do not veto an otherwise possible export. These behaviours still need the studio's hands-on testing.

Keyboard reference: Help > Keyboard Shortcuts, or Command-/. In Curate, arrows browse; Space opens preview; S shortlists; Shift-S removes shortlist membership; M chooses for the active role; X rejects; [ and ] switch slides. Shortcuts pause while editing text. Command-Shift-E opens Export Handoff.

## Build

On Apple-Silicon macOS 26+, with Xcode command-line tools and Node.js 24+:

```sh
npm run build
```

The archive and SHA-256 file are written under artifacts/. No Electron installation or web build is required.

Optional development checks (not release claims): `npm test` for document-kernel behaviour, and `npm run verify:package` for the scripted Mac package journey. The latter is not run by this user-test release workflow.

## Documentation

- [Mac workflow and handoff](docs/MAC_APP.md)
- [Known limitations and testing boundary](docs/KNOWN_LIMITATIONS.md)
- [Architecture and remaining work](docs/NATIVE_ARCHITECTURE.md)
- [Release notes](docs/RELEASE_NOTES.md)
- [Documentation index](docs/README.md)

Linux, Electron packaging and the web workspace are retired. Previous architecture/product/ticket documents are historical evidence, not current operating instructions. No account, cloud service, model or telemetry is required. Licensed under AGPL-3.0; see LICENSE, NOTICE and THIRD_PARTY.md.
