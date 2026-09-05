# v0.1.0 — Native Mac user-test release

This release becomes the active Mac version at the studio's explicit request, without the full acceptance suite. The studio will test it hands-on. Successful compilation and packaging do not establish behavioural correctness.

The rebuild replaces the WebKit workspace with native Curate/Assemble surfaces. Source implements whole-deck and notes PDFs, complete copy and per-slide original-media handoff, independent shortlist membership, queued decisions, provisional text fitting, native image handling and saved-copy recovery. Linux/Electron/web distribution paths are retired and current documentation has been rewritten.

**Use a duplicate deck first.** First native editing upgrades the working package reader schema. Keep the original deck and v0.0.6 as a fallback. This build requires Apple-Silicon macOS 26+ and is ad-hoc signed, not notarized. Import, PDF appearance, media exports, migration/recovery, performance and accessibility remain unverified. The complete master plan is not claimed finished.

Download the .app.zip asset and retain its .sha256 checksum. Automatic GitHub source archives are not the installable app.
