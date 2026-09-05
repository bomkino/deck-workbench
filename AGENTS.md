# Workbench repository instructions

Read README.md, docs/MAC_APP.md, docs/NATIVE_ARCHITECTURE.md and docs/KNOWN_LIMITATIONS.md first. Old numbered product/architecture/implementation documents are historical.

Build only the native Mac app. Preserve exact copy, stable identities, independent shortlist membership, coherent undo, durable acknowledgement and recoverable user files. SwiftUI/AppKit owns interaction; JavaScriptCore hosts the internal kernel without a browser. No Linux/Electron/browser product.

Work on a codex/ branch from an exact recorded SHA. Do not commit private decks/media, credentials or build products. Do not force-push, delete unrelated work or silently migrate user files. Main promotion and release require explicit authority. Preserve AGPL-3.0 and notices.

Test the smallest real behavior affected: actual caller payload, resulting state, reopen or exported artifact. Run the native package journey for connected changes; compilation alone is not a behavior claim. Do not add source-regex checks as a substitute. State incomplete accessibility/performance/environment verification honestly. The v0.1.0 test waiver was historical, not permanent.

Normal CI builds; explicit version tags publish an exact successful main-branch artifact. Do not let ordinary pushes or documentation edits create Latest releases. Keep current docs accurate and older evidence historical.
