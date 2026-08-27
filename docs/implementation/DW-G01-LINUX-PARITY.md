# DW-G01 — Linux parity tracer

Status: Ubuntu/X11 source, package and two-process runtime journey verified by
exact-commit CI. Garuda KDE/Wayland remains unverified and is waived for canonical
`main` promotion; it is not implied by the Ubuntu result.

## Causal journey

The Linux shell uses Electron 44.0.0 with `sandbox: true`, context isolation and no
renderer Node integration. A narrow preload exposes exactly the generated bridge
methods. Named IPC channels reach a utility process that owns `DurableDeckSession`
and the Deck kernel outside the renderer.

The packaged verifier runs two distinct application processes:

1. create a `.pitchdeck`, edit the headline, add/move/rename Sections and Slides,
   set Slide intent, add and paragraph-edit canonical Content, append/fsync before
   every acknowledgement, undo/redo, change Interface Scale independently from
   artboard zoom, save and exit;
2. reopen the same package and preferences, recover semantic state and history,
   undo/redo the last structured Content edit, export and parse a one-page PDF.

It repeats that journey from both an extracted tarball and the exact AppImage. It
also extracts the Arch package and checks its metadata, launcher, paths, legal
files, x86-64 ELF and exact embedded commit.

## Security and durability boundaries

- no generic IPC, renderer filesystem, renderer network, shell or evaluator;
- main-frame and exact application-URL validation on every named channel;
- one serial utility-process document actor;
- prepare/validate without live mutation, append and fsync, then kernel commit;
- descriptor/no-follow package containment and the same exclusive writer lock as
  macOS and the CLI;
- failed candidate open does not displace the writable current document;
- ambiguous journal durability failure fences the session until explicit reopen.

## What Ubuntu CI proves

Ubuntu 24.04 x86-64 is a real, mandatory Linux build/package/runtime gate. It
proves portable semantics, the Electron process boundary, exact package contents,
reproducible AppImage construction, clean extraction, ELF identity, two-process
persistence/history, scale separation and PDF generation under X11/Xvfb.

It does not prove KWin/Wayland, KDE portals and pickers, DBus desktop integration,
drag/drop/reveal, Garuda `pacman` installation, target fonts/codecs/GPU behavior,
or a Mac → Garuda → Mac semantic round trip. Those require the actual target
machine and remain the next DW-G01 gate.
