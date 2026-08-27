# Workbench hardening receipt — 2026-08-27

## Repaired failure classes

- blank physical journal records can no longer disappear during validation;
- a durable append followed by live-kernel commit failure fences mutation until replay;
- Close releases the writer lock after an interrupted session instead of stranding the package;
- dead Linux utility processes reject pending and future requests instead of hanging;
- malformed Linux preferences are quarantined and defaults restored;
- Linux PDF replacement uses the atomic durable writer;
- `npm run verify` is the canonical source, syntax, documentation, action-pin and repository-hygiene gate.

## Promotion evidence

The temporary hardening workflow publishes this tree only after portable verification, the exact Ubuntu x86-64 tarball/Arch/AppImage journey and the native macOS 26 arm64 packaged journey pass. Canonical workflows rerun on the published branch and on `main`.
