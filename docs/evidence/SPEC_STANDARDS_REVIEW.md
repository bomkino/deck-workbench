# DW-T00 Spec / Standards review

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
