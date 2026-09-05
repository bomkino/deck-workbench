# Active native architecture — v0.1.1

NativeWorkbenchUI, NativeWorkflowPanels, NativeCanvas and NativeShortcuts are the Mac surfaces. NativeWorkbenchController owns transient selection, drafts, filters, indexed projections and a serial captured-intention queue. NativeDocumentSession owns the document kernel and durable store actor. JavaScriptCore hosts the TypeScript-derived internal kernel without a browser. PitchDeckDocumentStore retains checkpoints, journal/replay, schema compatibility and safe recovery.

Known map edits (`frames`, `crops`, `imageFits`) merge by image role. Null resets a map or an entry; scalar/optional layout values have explicit reset semantics. Native layout changes reconcile visible image roles, retaining displaced choices as shortlisted candidates. Batch arrangements reuse the same command validation and compound history; no second mutation path.

Notes have draft generations. Acknowledgement clears only the generation actually saved, not later typing. A definitively rejected command does not block valid queued work; uncertain persistence does. Export/switch/close flush pending drafts and do not silently discard unresolved actions.

The controller caches slide/asset indexes, sorted/filtered media projections and resolved text layout. Preview scopes are explicit. NativeMediaIO provides bounded shared thumbnail work and byte caches; NativeAssetImage builds its NSImage once per completed request. Cache identity includes root access generation so reconnect cannot keep a stale missing preview. Text-only translation reuses Core Text layout; resize/copy/style changes resolve it again. These are bounded optimizations, not an alternate state store.

MediaCatalogSession performs progressive background scans and stores original identities/revisions. NativeSlideRenderer is shared by canvas and PDF. NativeHandoffExporter freezes one document snapshot, computes resources from selected outputs, stages originals once and verifies copies. Independent components report their actual results. Original filenames and source notes are retained in the portable media index; absolute machine paths are not included.

Build: scripts/build-native-macos.sh. Verification: npm test and scripts/verify-native-package.sh. Normal CI builds artifacts. Explicit `v*` tags publish only the matching successful main-branch artifact; no publish-on-every-push, self-mutating source workflow or permanent acceptance waiver.

Keep scope to prototype direction and handoff. No Linux, Electron, browser product, cloud service, telemetry or bundled AI. See KNOWN_LIMITATIONS.md for honest remaining boundaries.
