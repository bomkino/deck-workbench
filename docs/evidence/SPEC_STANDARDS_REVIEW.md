# DW-T00 / DW-W01-D01 Spec and Standards review

## Review basis

- Ticket: `DW-T00 — Apple-Silicon Story Document Tracer`
- Method: acceptance-criterion trace against the product, architecture, document/recovery, bridge/security and export contracts; followed by a clean extracted-artifact run.
- Runtime evidence: GitHub Actions run `33018035496`, macOS 26 arm64, implementation SHA `a55f29434cd2792aeae3f9b9f333461e3fc44332`.

## Findings

| Severity | Finding | Resolution |
|---|---|---|
| Blocking | The first green packaged run created the document through a test-only direct path instead of `NSSavePanel`. | Accepted. The tracer now presents the real native save panel and accepts its default action through a macOS system key event. |
| Material | The original checksum file embedded an absolute runner path. | Accepted. Checksums now contain only the relocatable artifact basename and are verified after download. |
| Material | Checkpoint reopen alone did not prove replay from a revision-zero checkpoint. | Accepted. The packaged create phase opens a second controller before save and requires journal replay to revision 3. |
| Material | A malformed named bridge method could leave a renderer promise unresolved. | Accepted. The host now returns a typed `InvalidCommand` rejection when the request ID is valid but the method/payload is malformed. |
| Advisory | The tracer retains the full journal after checkpoints. | Accepted as the bounded DW-T00 policy. It preserves durability and restart history; compaction remains deferred. |

## Standards trace

| Contract | Evidence | Result |
|---|---|---|
| Canonical Story and stable Section/Slide IDs | Kernel scenario tests and packaged projection receipts | Pass |
| Non-mutating prepare; atomic invalid/stale rejection | Public kernel-seam tests | Pass |
| Append + fsync before commit acknowledgement | Host document-store ordering plus packaged replay | Pass |
| Hash chain, schema and corrupt-journal failures | Portable tests plus packaged negative recovery probes | Pass |
| Named typed bridge; no generic IPC/network/filesystem renderer power | Generated parity test and source contract verifier | Pass |
| Interface Scale independent from artboard zoom | Public scale tests and packaged create receipt | Pass |
| Same Slide projection produces one-page PDF | Packaged reopen/export journey and PDFKit page-count check | Pass |
| arm64-only, macOS 26, ad-hoc signed, ZIP-valid extracted app | Direct artifact checks in packaged workflow | Pass |

No unresolved blocking finding remains for DW-T00. This review does not claim notarization, release readiness, final PDF typography, PPTX fidelity, Garuda parity or editor breadth.

## DW-W01-D01 addendum

Method: Design It Twice against stable-identity, atomic-command, durable-history and
projection contracts before exposing a destructive Story command.

| Severity | Finding | Resolution |
|---|---|---|
| Blocking | Cascading Section/Slide removal and last-item behavior had no supplied product decision. | D01-A kept both commands unavailable. D01-B later selected explicit-only removal with hard last-item rejection; cascading remains unsupported. |
| Blocking | Removing a headline would invalidate the named `slide.activeProjection` seam. | Public `content.remove` rejects every headline Block atomically. |
| Material | Recreating removed content with a new ID or append-only placement would break stable references and Story order. | History inverse stores the complete Block and its stable predecessor anchor; packaged reopen/undo must prove exact restoration. |
| Material | A UI-only removal path would bypass durability and replay semantics. | Removal uses `deck.execute`, kernel prepare, host append/fsync, commit, projection, undo and redo without another mutation route. |

Accepted scope is one non-headline Content Block. No production dependency, renderer
filesystem power, generic IPC, AI, telemetry or network path enters this slice.

## DW-W01-D01-B addendum

| Severity | Finding | Resolution |
|---|---|---|
| Blocking | Cascading Section deletion would combine multiple user-visible losses and enlarge every inverse/journal record. | Rejected for DW-W01. `section.remove` accepts only an empty Section. |
| Blocking | Removing the final Slide would leave `slide.activeProjection` without a valid target. | `slide.remove` rejects when Deck Slide count is one. |
| Blocking | Removing the final Section would violate the canonical Deck fixture and Editorial Spine topology. | `section.remove` rejects when Section count is one. |
| Material | Removing the selected Slide could make the workspace query a deleted ID after durable commit. | Workspace resolves a deterministic next/previous stable Slide ID before dispatch and queries only that surviving target after acknowledgement. |
| Material | Undo must restore exact structure, not create replacement identities. | Full Section/Slide snapshots plus owning/predecessor anchors are retained in semantic history and verified after packaged reopen. |

No second mutation path or new dependency enters D01-B. Clean Linux and macOS jobs
remain required before packaged status.

## DW-W01-R01 addendum

| Severity | Finding | Resolution |
|---|---|---|
| Material | The textarea caller previously wrapped embedded newlines inside one text node, losing semantic paragraph boundaries. | Normalize CRLF/CR to LF and emit one canonical paragraph per line; preserve blank lines as empty paragraphs. |
| Material | Plain-text equality alone could hide a changed rich-text tree. | Kernel and packaged assertions compare the exact paragraph array, including the empty middle paragraph. |
| Material | Reopen plus removal undo would not prove the `content.update` history entry itself. | The packaged journey performs a fourth undo/redo around the paragraph update and verifies both original and multiline values. |
| Advisory | Full rich-editor schemas create dependency and normalization policy surface. | Keep R01 to paragraph/text nodes; marks, lists, structured paste and editor dependencies remain unsupported. |

R01 reuses `content.update`, typed bridge, append/fsync-before-acknowledgement and
semantic history. It adds no dependency or privileged renderer capability.

## DW-W01-R02 addendum

| Severity | Finding | Resolution |
|---|---|---|
| Blocking | Host acknowledgement projected the first Slide, so editing another Slide changed selection and discarded its textarea. | After acknowledgement, query the selected stable Slide ID; fall back to the host projection only when history removed that Slide. Then reacquire the field by Content Block ID and restore focus/caret. |
| Material | Capturing Command–Z while a field contains uncommitted text would erase the user's local editing undo seam. | Intercept Deck undo/redo only when the field value equals the acknowledged projection. |
| Material | Command–Enter during input-method composition could commit an incomplete composition. | Composing keyboard events are ignored and remain uncancelled. |
| Material | A keyboard handler could masquerade as a separate mutation path. | It dispatches the existing typed `content.update` command and records `source.kind = keyboard`; history still uses bridge undo/redo. |

The packaged WebKit journey checks cancelation, revision, source kind, content and
focus. Hardware key routing and VoiceOver remain later acceptance surfaces.
