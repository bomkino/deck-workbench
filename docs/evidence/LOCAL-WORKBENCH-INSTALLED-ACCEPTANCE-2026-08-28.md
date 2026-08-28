# Local Workbench installed acceptance

Recorded at `2026-08-28T06:07:15Z` on the candidate commit
`e3127b5f43c351b25d7d9f13b4aeed41ad530063`.

This receipt separates source, package, installed-host, CI and target-Linux
evidence. It does not turn one passing surface into a claim about another.

## Source and package

- `npm test`, `node scripts/verify-source.mjs` and the repository contract gate
  passed: 114 tests, no skipped failures.
- `scripts/build-macos.sh`, `scripts/verify-packaged-macos.sh` and
  `node scripts/write-evidence-receipt.mjs` passed on the exact candidate.
- Package:
  `artifacts/Deck-Workbench-apple-silicon-e3127b5f43c351b25d7d9f13b4aeed41ad530063.app.zip`
- Package SHA-256:
  `cd6daffec9f61441908b6dda82692e92b71803862f1364009801a49458dd2604`
- The extracted package passed ZIP integrity, strict ad-hoc signature, arm64
  executable, embedded-commit, `.icns`, create, reopen, history, reorder,
  removal and one-page PDF checks.
- The packaged scale tracer measured 45 visible controls at every supported
  Interface Scale step from 80% through 175%. It found no width or height below
  43.5 px. Artboard geometry remained independent of Interface Scale.

## Installed Mac journey

The exact candidate app was copied to `/Applications/Deck Workbench.app`,
registered with Launch Services and read back from the installed bundle.

- Bundle identifier: `dog.pitch.deck-workbench`
- Version: `0.0.1` (`CFBundleVersion` 1)
- Embedded commit:
  `e3127b5f43c351b25d7d9f13b4aeed41ad530063`
- Minimum system: macOS 26.0
- `codesign --verify --deep --strict`: pass
- Finder: canonical mark and version 0.0.1 visually confirmed on the installed
  application. A later exact-main follow-up also confirmed the mark in the live
  Dock.
- Interface Scale: 80%, 125% and 175% inspected in the installed app. The
  compact native toolbar, responsive desk and essential actions remained
  usable; the machine preference was restored to 125%.
- Artboard Zoom: `Fit Artboard to Stage` changed only the projection zoom;
  reopening the application restored the 0.35 session default.

The installed app created and reopened:
`/Users/kay/Documents/Deck Workbench Final Acceptance.pitchdeck`.

The journey committed a headline and paragraph-preserving body, exercised
undo/redo, added and reordered a Section and Slide, added and assigned a neutral
asset reference, applied an authored Cover Design Option and applied a valid
normalized crop. An out-of-bounds crop was rejected atomically as
`InvalidCommand`; the revision stayed unchanged. The document reopened at
revision 13 with its structure, story, asset, design and crop intact.

- Journal: 13 durable entries
- Checkpoint SHA-256:
  `520f3fd6ce358e97b40e4575740f7c9089c649ad4dca8d53a44612a5b524ec7d`
- Journal SHA-256:
  `4d8981588b4381e510411f5ff570c4aac410b2d07f140466e0a31db952cbe46e`
- Writer lock: released after an explicit crash-stale-lock recovery and a clean
  reopen/close cycle. The stale lock named a dead test process; its temporary
  recovery copy was moved recoverably to Trash after final-main acceptance.

The same installed journey exported
`/Users/kay/Documents/Deck Workbench Final Acceptance.pdf`.

- PDF SHA-256:
  `aedd551f3d3cd29291accf08de66ecbbff8fe25b388ed46c9b3dee22000c8944`
- Spotlight type: `com.adobe.pdf`
- Pages: 1

## GitHub CI

Both pull-request workflows passed on the exact candidate:

- DW-T00 macOS arm64, run 61:
  <https://github.com/bomkino/deck-workbench/actions/runs/33145684970>
- DW-G01 Ubuntu Linux x64, run 30:
  <https://github.com/bomkino/deck-workbench/actions/runs/33145684978>

These establish GitHub-hosted macOS package and Ubuntu/X11 Linux package
journeys. They do not establish Garuda KDE/Wayland acceptance.

## Garuda / UTM boundary

UTM 4.7.5 exposed an existing shared Garuda x86-64 VM, but its guest agent was
unavailable and the VM is also used by Drift. Inspection stopped at the live ISO
boot menu; no Deck Workbench package was installed or launched in that guest.
The user explicitly deprioritized Linux and asked that the shared UTM state be
handled carefully. Actual Garuda KDE/Wayland package launch and Mac–Garuda–Mac
round-trip therefore remain open target-machine evidence, not failures.

## Final-main manual accessibility follow-up

The installed final-main app at
`dd9b2cef1a116330452116674712cb0e60da3d67` passed a bounded keyboard-only
open/traversal/scale/export-cancel journey while preserving revision 13. A
VoiceOver core-control pass exposed concrete native and WebKit labels and kept
the decorative mark silent. Increase Contrast and Reduce Motion were enabled,
the Deck reopened and the interface remained usable; both preferences and
VoiceOver were restored to their original off state. The canonical icon was
visually confirmed in the live Dock. Exhaustive assistive-technology narration
across every Inspector control remains outside this bounded local acceptance.
