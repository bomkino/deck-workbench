> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# DW-T00 — Apple-Silicon Story Document Tracer

## Goal

Prove one complete packaged macOS journey across the real ownership boundaries before the editor, Linux shell, Pattern family or export breadth expands.

## User journey

```text
launch app
→ create .pitchdeck
→ see one Section + one Slide in Editorial Spine
→ edit headline in Story
→ typed bridge sends content.update
→ kernel prepares change outside WebView
→ host appends + fsyncs journal
→ host commits and acknowledges
→ visual projection updates
→ undo
→ redo
→ change Interface Scale
→ change artboard zoom independently
→ save and quit
→ reopen packaged app
→ recover headline and undo history
→ undo after reopen
→ export one PDF page
```

## Acceptance criteria

### Repository

- `main` is the canonical source branch after the verified tracer promotion;
- the original tracer branch and exact start/end SHAs remain recorded in evidence;
- exact start/end SHAs recorded;
- existing AGPL licence preserved;
- root documentation installed;
- no legacy Deck Prototyper code copied.

### Deck kernel

- runs outside WebView;
- Story/Slide IDs are canonical;
- headline is semantic rich-text JSON;
- command envelope includes ID and expected revision;
- `prepare` is non-mutating;
- invalid and stale commands are atomic rejections;
- undo/redo are semantic and durable;
- query does not mutate revision.

### Document

- native `.pitchdeck` package;
- `manifest.json`, `checkpoint.json`, `journal.ndjson`;
- append + fsync before acknowledgement;
- hash chain;
- idempotent retry;
- unsupported schema failure;
- corrupt journal failure;
- restart/replay;
- atomic checkpoint or an explicitly documented bounded tracer implementation that does not violate durability ordering.

### Mac shell

- Apple-Silicon executable;
- macOS 26 minimum;
- native create/open/save UI;
- minimal SwiftUI shell;
- minimal WebKit Editorial Spine;
- typed named bridge;
- no application network client;
- no unrestricted path/shell/eval bridge;
- Interface Scale preference independent from Deck/artboard zoom.

### PDF

- one page generated from the same Slide projection;
- correct selected canvas preset;
- output exists, is parseable and has one page;
- no claim of final typography/PPTX fidelity.

### Packaging

- guarded reproducible build script;
- generated `.app` bundle;
- ad-hoc signature;
- architecture check proves `arm64` only;
- ZIP integrity check;
- extract and verify again;
- SHA-256 file;
- exact packaged journey run from extracted artifact.

## Public-seam tests

1. `DeckKernel.prepare/commit/undo/redo/query`
2. document append/replay/recovery
3. generated bridge contract on both sides
4. Interface Scale versus artboard zoom
5. packaged user journey

Do not test trivial SwiftUI wrappers or every CSS rule.

## Recommended implementation sequence

1. Install docs and evidence templates.
2. Define caller-first kernel and bridge types.
3. Implement kernel scenarios.
4. Implement `.pitchdeck` host adapter and recovery tests.
5. Create minimal workspace projection.
6. Create SwiftUI/WebKit shell and bridge.
7. Integrate Story edit and durability acknowledgement.
8. Integrate undo/redo and reopen.
9. Integrate Interface Scale and one-page PDF.
10. Build/package/sign/extract/verify.
11. Run Spec/Standards review.
12. Run independent artifact verification.
13. Commit evidence receipt.

## Non-goals

- React/Moveable/Selecto/ProseMirror;
- full direct manipulation;
- Reference Library;
- Pattern browser;
- Garuda;
- PPTX;
- full handoff;
- CLI/MCP;
- Release publication.

## Exit states

- **Source-ready:** source build and public-seam tests pass.
- **Packaged:** real `.app.zip` built, signed, extracted and verified.
- **Integrated:** exact packaged journey passes at exact SHA.

Anything less must be stated precisely.
