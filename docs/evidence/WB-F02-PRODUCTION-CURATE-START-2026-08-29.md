# WB-F02 Production Curate — start receipt

Date: 2026-08-29

## Frozen starting point

- Canonical repository: `bomkino/deck-workbench`
- Branch: `codex/workbench-phased-rebuild`
- Canonical head: `01e5e0bc635d7f755f1bb38af6c06ba5f1aa11d4`
- Pull request: #6, open and draft
- Handover archive checksum manifest: fully verified before editing
- Portable baseline: 134 tests passed; source verification passed
- Repository-only baseline check: unavailable in the archive until a local synthetic Git baseline was established

The canonical branch head was read back before implementation and had not moved. The local synthetic baseline is diagnostic only and is not canonical Git history.

## Upstream boundary inspected

Reference Library `main` was frozen for design inspection at:

`ac2d5944a26d9efeee5f186bd3b61e09a467c663`

The reviewed boundary establishes:

- random stable Asset, Source and Location identities;
- paths as mutable Locations, not identities;
- conservative move reconciliation only when platform identity and file evidence are unambiguous;
- explicit missing/offline state without erasing Assets;
- bounded paging and virtual windows;
- native ownership of absolute paths and authorized resources;
- renderer access only to opaque IDs and relative display paths;
- honest media-provider capability and visible Preview failures.

No Reference Library source was changed.

## Initial claim boundary

Implementation may become source-ready after focused and portable tests. It is not packaged, integrated or release-ready until the exact resulting commit passes both macOS and Ubuntu package/runtime gates. Human culling, Preview/Compare, Interface Scale and assistive-technology judgments remain separate evidence.
