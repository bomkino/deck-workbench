# WB-F02 Reference Library boundary evidence

Date: 2026-08-29

Ticket: `WB-F02-PRODUCTION-CURATE`

Evidence kind: pinned upstream source review; no upstream mutation and no executable code import

## Identity

| Item | Value |
| --- | --- |
| Workbench repository | `bomkino/deck-workbench` |
| Workbench branch | `codex/workbench-phased-rebuild` |
| Workbench local HEAD observed before this docs-only change | `aa17987958ca142b6730ab30b203d1af9e5d1abe` |
| Handover source HEAD recorded by the WB-F02 start receipt | `01e5e0bc635d7f755f1bb38af6c06ba5f1aa11d4` |
| Upstream repository | `bomkino/reference-library` |
| Upstream ref resolved through the GitHub connector | `refs/heads/main` |
| Exact upstream SHA | `ac2d5944a26d9efeee5f186bd3b61e09a467c663` |
| Upstream license | `AGPL-3.0-only` |
| Binding output | `docs/architecture/MEDIA-CATALOG-BOUNDARY.md` |

The upstream ref was resolved before file inspection. All upstream claims below are limited to that exact commit.

## Method

The review read the pinned upstream `AGENTS.md`, architecture decisions, security model, database migration, Rust protocol/core implementation, macOS and Linux host resource paths, workspace pager/window code, and relevant tests. It compared those findings with the Workbench constitution, product specification, glossary, system architecture, bridge/security contract, document/recovery contract, and current WB-F02 implementation ticket.

No file in `bomkino/reference-library` was edited. No dependency or executable source was copied into Workbench. The only intended Workbench changes from this subtask are this receipt and the media-catalog boundary note. Pre-existing changes to the WB-F02 ticket, start receipt, and `DECISIONS.tsv` were outside this subtask.

## Findings

| Concern | Pinned upstream evidence | Observed behavior | Binding Workbench disposition |
| --- | --- | --- | --- |
| Stable identity | `docs/adr/ADR-001-ASSET-IDENTITY.md`; `migrations/0001_t01.sql` | Asset IDs are generated; filename, path, fingerprint, result order, and scan order are not identity | Preserve opaque AssetId; Deck references `{catalogId, assetId}` |
| Source truth | `docs/adr/ADR-002-SOURCE-REVISION-LOCATION-ASSET-ORIGIN.md`; migration | Source, immutable revision, Location, Asset, and origin are separate records | Reuse the separation; keep Curate judgment in the Deck kernel |
| Root authority | `crates/reference-core/src/session.rs`; macOS grant store and supervisor | Host selects/activates authority; core canonicalises and retains a directory handle; renderer gets no path | Absolute locator/grant is host-local and keyed by DeckID+RootId |
| Move reconciliation | `crates/reference-core/src/discovery.rs` | Same relative path refreshes in place; otherwise only unique platform identity plus kind/size/fingerprint and absent old path qualifies as a move | Preserve IDs only on conservative proof; never guess by basename/hash; cross-volume remains unresolved |
| Failure and cancel | `discovery.rs`; `server.rs` | Offline/denied/unreadable become states; complete scan alone marks unseen missing; cancelled scan does not | Missing/offline survives in catalog and Deck decisions; cancel is non-destructive and idempotent |
| Reconnect | `session.rs` | Exact RootId plus authority; identity fast path or bounded evidence probe | Adopt bounded fail-closed rebind; no portable absolute path hint |
| Query snapshot | `reference-protocol/src/lib.rs`; `editorial.rs` | Typed filters, AssetId tie-break, bounded pages, library revision guard, byte-bounded response | Use catalog revision guard, 1 MiB frame, limit at most 100, and authoritative `nextOffset` |
| Pager behavior | `packages/workspace/src/use-asset-pager.ts` | UI assumes fixed page starts even though protocol can return a short byte-bounded page and `nextOffset` | Adapt; test short pages and do not copy the fixed-offset assumption |
| Virtual wall | `packages/workspace/src/virtual-window.ts` | Pure fixed-row window with sanitized inputs and row overscan | Reuse math for fixed grid/list only; key focus/selection by AssetId |
| Jobs | `reference-protocol/src/lib.rs`; `server.rs` | Queued/running/terminal ledger, bounded queries, idempotent cancellation; durable truth precedes events | Persist bounded operational ledger; events may coalesce/drop; queries remain authoritative |
| Preview bytes | `rendition.rs`; Linux and macOS resource handlers | Native validates an opaque session/asset/profile URL and streams private cache bytes under limits | Use opaque resource scheme; no `file:` URL or renderer path; revoke on session close |
| Preview honesty | `rendition.rs`; `docs/adr/ADR-007-PREVIEW-PROVIDERS.md` | Pinned implementation has hard-coded profile/MIME handling; proposed provider-registry design is not implemented; oversized source may fail only at authorization | Split Availability from PreviewCapability; unsupported/oversize is catalogue-only before render |
| Package model | `docs/adr/ADR-003-LIBRARY-PACKAGE.md`; session implementation | Reference core currently opens `.pitchlibrary`; caches and grants are external; portable DB currently retains an absolute display path | Adapt to a neutral DeckID-bound catalog inside `.pitchdeck`; do not copy portable absolute paths |
| Runtime | Cargo manifests; `CoreSupervisor.swift`; Linux host | Canonical core/protocol are Rust; macOS Swift launches the helper directly without Node; Linux Electron launches the same helper | Rust helper is a candidate shared core, but packaging/signing/target proof belongs to Workbench |

## Exact boundary-relevant files

- `AGENTS.md`
- `docs/adr/ADR-001-ASSET-IDENTITY.md`
- `docs/adr/ADR-002-SOURCE-REVISION-LOCATION-ASSET-ORIGIN.md`
- `docs/adr/ADR-003-LIBRARY-PACKAGE.md`
- `docs/adr/ADR-004-CORE-HOST-PROTOCOL.md`
- `docs/adr/ADR-006-SUPERVISION-AND-CRASH-RECOVERY.md`
- `docs/adr/ADR-007-PREVIEW-PROVIDERS.md`
- `docs/adr/ADR-008-QUERY-SEMANTICS.md`
- `docs/security/SECURITY_MODEL.md`
- `docs/product/ASSET_BROWSER_PARITY.md`
- `migrations/0001_t01.sql`
- `crates/reference-protocol/src/lib.rs`
- `crates/reference-core/src/discovery.rs`
- `crates/reference-core/src/session.rs`
- `crates/reference-core/src/editorial.rs`
- `crates/reference-core/src/rendition.rs`
- `crates/reference-core/src/server.rs`
- `packages/bridge-contract/src/index.ts`
- `packages/workspace/src/virtual-window.ts`
- `packages/workspace/src/use-asset-pager.ts`
- macOS `CoreSupervisor.swift`, `SecurityScopedGrantStore.swift`, `WorkspaceSchemeHandler.swift`, and `ResourceFileStreamer.swift`
- Linux `main.mjs`, `session-resource-authority.mjs`, and `resource-response.mjs`

All paths in this section refer to `bomkino/reference-library@ac2d5944a26d9efeee5f186bd3b61e09a467c663`.

## Security and host conclusions

Reference Library's macOS host sends an authorised raw path string over its private length-prefixed Swift-to-Rust channel after activating a security-scoped grant. The helper then opens and verifies the directory. It does not pass a directory descriptor with `SCM_RIGHTS`. This is acceptable only as a private host/core seam; it is not a renderer contract.

Workbench's current macOS app is ad-hoc signed and unsandboxed. For WB-F02, a native picker plus private path transfer, canonicalisation, retained directory handle, and opaque renderer IDs is the minimum safe gate. A future sandboxed build needs bookmark persistence/activation and a helper signed for sandbox inheritance; the pinned upstream source is design evidence, not target-machine proof of that Workbench configuration.

The existing ten-method Workbench bridge remains authoritative. This review does not approve a generic media IPC namespace or an eleventh public method. Named Curate projections and typed commands stay within `deck.query`/`deck.execute`; native byte and root authority remain behind the document session.

## License and dependency disposition

Upstream declares `AGPL-3.0-only`, which is compatible with this AGPL Workbench repository, but compatibility is not permission to lose provenance. A later code import must preserve notices, identify the exact upstream commit, and run Workbench's dependency-license/notice gates. The upstream generated production dependency inventory at the pinned commit lists permissive direct dependency licenses, but that is not a substitute for a fresh Workbench build inventory.

This receipt introduces documentation only. It does not require a new third-party notice entry.

## Claim limits

- This review proves that the recorded design and source behavior existed at the pinned upstream SHA.
- It does not prove that Reference Library or Workbench is target-installed, packaged, signed, sandboxed, codec-complete, cross-host portable, or release-ready.
- Upstream ADR-004 and ADR-006 are still Proposed at the reviewed commit.
- Upstream target-machine and cross-host gates remain open at the reviewed commit.
- The proposed Workbench adapter, package subdocument, query bounds, PreviewCapability, and ten-method orchestration still require WB-F02 implementation and Workbench-owned tests.
- The 10,240-record wall, duplicate basenames, offline Root, moved Location, short page, stale request, cancellation, bounded rendition, save/reopen, macOS, and Linux cases remain acceptance evidence to be produced by WB-F02.

Verification for this docs-only change is limited to repository diff inspection and whitespace/error checking. No implementation or target-runtime claim is made.
