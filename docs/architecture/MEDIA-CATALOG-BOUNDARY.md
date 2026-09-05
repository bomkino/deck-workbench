> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# Media catalog boundary

Status: binding for WB-F02 Production Curate

Date: 2026-08-29

Upstream reviewed: `bomkino/reference-library` at exact `main` SHA `ac2d5944a26d9efeee5f186bd3b61e09a467c663`

## Decision

Workbench owns a project-scoped `MediaCatalogCore` beside, not inside, the Deck semantic kernel.

- The Deck kernel owns project judgment, per-slide decisions, slot and repeater assignments, find-more state, and the stable Asset references used by those decisions.
- The media catalog owns observed source truth: authorised Root identity, Source lineage, immutable Source revisions, storage Locations, stable Assets, availability, bounded queries, scans, and derived-preview jobs.
- The native document session owns filesystem authority, root grants, catalog persistence, helper lifecycle, preview caches, and privileged byte resolution.
- The workspace receives bounded projections and opaque identifiers. It never receives an absolute source path, cache path, bookmark, file descriptor, SQL surface, shell surface, or generic IPC escape hatch.

The boundary is intentionally smaller than Reference Library. Workbench does not import its review states, collections, categories, tags, shortlist semantics, or `.pitchlibrary` product shell. Curate semantics remain Deck semantics.

## Stable identity model

Paths, filenames, hashes, scan order, query order, and result position are evidence or presentation; none is identity.

```ts
type CatalogId = string;
type RootId = string;
type SourceId = string;
type SourceRevisionId = string;
type LocationId = string;
type AssetId = string;
type JobId = string;

interface CatalogRoot {
  id: RootId;
  displayName: string;
  kind: "linked";
}

interface Source {
  id: SourceId;
  currentRevisionId: SourceRevisionId;
  mediaFamily: "image" | "video" | "audio" | "document" | "font" | "other";
}

interface SourceRevision {
  id: SourceRevisionId;
  sourceId: SourceId;
  byteSize: number;
  mimeType: string | null;
  extension: string | null;
  fingerprint: {
    kind: "full" | "sampled";
    value: string;
  };
}

interface Location {
  id: LocationId;
  rootId: RootId;
  sourceId: SourceId;
  relativeDisplayPath: string;
  state:
    | "present"
    | "missing"
    | "permission_denied"
    | "offline_root"
    | "unreadable"
    | "moved_candidate";
}

interface CatalogAsset {
  id: AssetId;
  origin: { kind: "whole_source"; sourceId: SourceId };
}
```

IDs are generated opaque UUIDs. A changed file appends a `SourceRevision`; it does not mint a new Asset. A moved Location updates in place only when conservative evidence proves continuity. Exact copies and duplicate basenames remain distinct unless an explicit later merge operation says otherwise.

A Deck Asset reference is `{ catalogId, assetId }`. WB-F02 may elide `catalogId` in an in-memory projection because one project has one catalog, but it must not derive `assetId` from a filename, path, fingerprint, hash, or ordinal.

## Reconciliation rules

A successful scan applies these rules in order:

1. Same Root plus same relative path refreshes the existing Location. If its bytes changed, append a SourceRevision and advance the Source while preserving Root, Source, Location, and Asset IDs.
2. Otherwise, treat a candidate as a move only when there is exactly one old Location with matching platform file identity, media kind, byte size, and fingerprint; the old path is absent; and link-count evidence is safe. Update that Location row in place.
3. Otherwise create a new Source, SourceRevision, Location, Asset, and whole-source origin. Never guess from basename or content equality alone.
4. Mark unseen Locations missing only after a complete successful scan. Derive a Source as missing only when it has no live Location.
5. A cancelled or failed scan may commit already observed batches, but it must not mark unseen rows missing.
6. Root failures are state transitions, not deletions: missing volume becomes `offline_volume`/`offline_root`; denied access becomes `needs_permission`/`permission_denied`; other I/O becomes unavailable or unreadable.

Cross-volume moves do not preserve platform file identity. WB-F02 must leave them as missing plus new until a later explicit, user-confirmed relink/merge contract exists.

Reconnecting an existing Root requires the exact RootId and fresh host authority. The catalog accepts the new locator only after either a platform-identity fast path or a bounded evidence check over known relative Locations. The initial bound is eight candidates, at least `min(2, knownCandidates)`, at most 128 MiB per candidate, 256 MiB cumulative, and ten seconds. Mismatch fails closed.

Fingerprint quality is explicit. Reference Library's sampled fingerprint for files over 512 MiB is useful reconciliation evidence but is not a content-integrity proof; Workbench must not present it as one. Large-file integrity needs a separately budgeted full or chunked hash job.

## Portable data and host-local authority

The project must reopen on macOS or Linux with the same Asset IDs and Curate decisions even though a Root must be re-authorised on the new host.

| Class | Data | Location and meaning |
| --- | --- | --- |
| Portable semantic catalog | Deck-bound Catalog, Root, SourceRevision, Location and Asset IDs; safe relative paths; revision metadata; catalog revision | `media/catalog.json` inside the `.pitchdeck` package, with required `deckId` |
| Deck semantics | Project judgment, per-slide decision, slots, repeaters, find-more state, `{catalogId, assetId}` references | Existing schema-1 checkpoint/journal through additive typed commands and projections |
| Portable operational ledger | Scan/rendition Job IDs, phase, progress, terminal result | Catalog DB, durable but excluded from the Deck semantic digest and undo/redo |
| Host-local authority | Absolute Root locator, security-scoped bookmark or equivalent grant, active handle, platform file observations, helper state | Native application support keyed by `{deckId, rootId}`; never in checkpoint, journal, renderer state, or portable canonical digest |
| Disposable derived data | Thumbnail/preview bytes, decoder scratch, resource leases | Private host cache keyed by revision/profile/provider version; never in the project package |

Workbench does not require a visible `.pitchlibrary` package. The WB-F02 source slice uses a bounded, atomically replaced JSON subdocument rather than SQLite so it can remain inside the existing package and reopen on both native hosts. A catalog whose `deckId` does not match the open Deck is rejected. An App Support database is not canonical portable storage.

Absolute `last_known_display_path` data from Reference Library is deliberately not copied into the portable catalog. A picker-selected locator is host-local. Export and canonical-digest code must omit host grants and platform observations.

## Internal adapter

`MediaCatalogPort` is private to the native document session. It is not exposed as a window-global renderer API.

```ts
interface MediaCatalogPort {
  open(input: { deckId: string; catalogPath: NativePath }): Promise<CatalogSession>;
}

interface CatalogSession {
  attachRoot(grant: NativeRootGrant, displayName: string): Promise<{ rootId: RootId; jobId: JobId }>;
  reconnectRoot(rootId: RootId, grant: NativeRootGrant): Promise<RootSummary>;
  scanRoot(rootId: RootId): Promise<JobId>;
  cancelJob(jobId: JobId): Promise<"cancellation_requested" | "already_terminal" | "unknown_job">;
  queryAssets(query: AssetQuery): Promise<AssetPage>;
  queryJobs(query: JobQuery): Promise<JobPage>;
  authorizeResource(assetId: AssetId, profile: PreviewProfile): Promise<PrivilegedResourceDescriptor>;
  resolveLocation(locationId: LocationId): Promise<PrivilegedLocation>;
  close(): Promise<void>;
}
```

`NativePath`, `NativeRootGrant`, `PrivilegedLocation`, and the private path inside `PrivilegedResourceDescriptor` cannot cross into the workspace. The Curate projection composer joins catalog summaries to Deck decisions by AssetId and exposes the result through named `deck.query` projections.

This decision preserves the existing ten-method public bridge. Semantic Curate mutations use typed commands inside `deck.execute`; reads use named bounded projections inside `deck.query`. Native root selection is a typed host orchestration carried through that existing envelope: cancellation causes no canonical mutation; success records only stable catalog/root IDs and safe display metadata. The selected path remains host-private. If implementation requires an eleventh public bridge method, that is a bridge-contract change and needs a separate recorded decision; it is not authorised here.

On the current ad-hoc-signed, unsandboxed macOS host, the minimum safe gate is native picker selection followed by a private host-to-core path command and a retained, canonicalised directory handle; the renderer still receives only IDs. A future sandboxed build must activate and persist a security-scoped bookmark before helper launch and sign the helper with sandbox inheritance. Reference Library currently sends a raw path string from Swift to its Rust helper after bookmark activation; it does not pass a directory descriptor with `SCM_RIGHTS`.

## Query, paging, and virtual-window bounds

```ts
interface AssetQuery {
  search?: string;                 // at most 200 Unicode scalars
  rootId?: RootId;
  availability?: Availability[];  // at most 8 values
  mediaFamily?: string[];          // at most 8 values
  extension?: string[];            // at most 64 values
  sort: "path" | "name" | "modified" | "imported";
  direction: "asc" | "desc";
  offset: number;
  limit: number;                   // 1...250
  expectedCatalogRevision?: number;
  expectedAvailabilityRevision?: string;
}

interface AssetPage {
  offset: number;
  limit: number;
  total: number;
  items: AssetSummary[];
  nextOffset: number | null;
  catalogRevision: number;
  availabilityRevision: string;
}
```

- Every stable sort ends with AssetId as the final tie-breaker.
- The first page establishes both `catalogRevision` and a live Root `availabilityRevision`; subsequent pages include both. A mismatch returns `QuerySnapshotChanged`, and the workspace discards the stale generation and restarts.
- `nextOffset` is authoritative. The workspace must not assume `offset + requestedLimit` after a byte-bounded short page.
- A control frame is at most 1 MiB. Asset summaries and page encoding must be bounded before crossing the bridge.
- Result-scoped facets, if added, must say so. Reference Library's current first-page facets describe the whole library, so they are not reusable as filtered-result counts without adaptation.
- The core caches at most eight normalized, revision-pinned query orders and returns at most 250 summaries per page. Requests and responses carry a UI generation token; late responses from an older filter, sort, slide, catalog revision, or availability generation are ignored.

The media wall uses pure fixed-row virtual-window math. Inputs are sanitized to item count at least zero, columns and row height at least one, non-negative viewport/scroll values, and initial overscan of two rows. `rowHeight` includes the gap. The function returns start/end row, start/end item, total height, offset top, and rendered count. It is not valid for masonry or variable-height rows. Focus and selection are keyed by AssetId, never by a visible ordinal.

The WB-F02 10,240-record fixture must cover duplicate basenames, an offline Root, move reconciliation, short byte-bounded pages, stale-page cancellation, and stable keyboard focus across recycled rows.

## Jobs, progress, and cancellation

Job state is `queued | running | completed | failed | cancelled`. Progress is a bounded phase plus counts, never an unbounded log. Cancellation is idempotent. A scan cancel leaves the Root connected and must not infer missing rows. Terminal state is durably recorded before any terminal event is emitted; dropped/coalesced progress events cannot change truth because `queryJobs` is authoritative.

Initial guardrails are one active scan per Root, two concurrent scan/rendition workers per document session, at most ten in-flight derived-preview jobs, and at most 100 Job summaries per query. Session close revokes resource leases, requests cancellation, drains for a bounded interval, then permits the native supervisor to terminate a stuck helper.

## Availability and preview capability

Location availability and preview support are separate axes:

```ts
type Availability =
  | "present"
  | "missing"
  | "needs_permission"
  | "offline_volume"
  | "unreadable"
  | "unavailable";

type PreviewCapability =
  | { state: "ready"; profile: PreviewProfile }
  | { state: "generation_required"; profile: PreviewProfile }
  | { state: "catalogue_only"; reason: "unsupported_format" | "source_too_large" | "decoder_unavailable" }
  | { state: "failed"; code: string; retryable: boolean };

type PreviewProfile = "grid_standard" | "preview";
```

The renderer must not show a playable/previewable state merely because bytes are present. The initial safe still-image grid profile inherits explicit bounds: PNG/JPEG/WebP input, 256 MiB decode input, 64 million decoded pixels, 512-pixel maximum output edge, 8 MiB maximum output, and a 30-second deadline. Anything outside an installed, proved provider is `catalogue_only`, not a broken preview. Raw SVG must be rasterised, sanitised by a proved provider, or treated as catalogue-only; it must not enter the active DOM.

Privileged bytes are exposed only through an opaque URL such as `pitchdog-asset://{sessionId}/{assetId}/{profile}`. The native handler validates session, Asset, profile, size, range, MIME, and lease; streams from a private cache; and sends `no-store` and `nosniff`. Closing the document revokes every lease. Open/reveal/copy operations accept LocationId and are resolved by the native host at invocation time.

## Reuse and adaptation

| Disposition | Upstream material |
| --- | --- |
| Reuse after provenance review | Identity separation, conservative scanner/reconciliation algorithm, bounded job/cancellation states, protocol bounds, resource-authority pattern, fixed-row virtual-window math |
| Adapt for Workbench | `.pitchdeck` storage/session binding, removal of portable absolute paths, Curate projection composition, `nextOffset`-aware pager, result-facet semantics, large-file integrity, honest PreviewCapability, provider registry, macOS grant lifecycle |
| Do not import | `.pitchlibrary` product shell, Reference review/collection/tag/category semantics, its workspace UI, dormant rendition-table assumptions, or release/installer claims |

The upstream source is `AGPL-3.0-only`, matching Workbench's repository license. Copying still requires preserved copyright/license notices, exact source provenance, and Workbench's own dependency and notice checks. This architecture review copies no executable upstream code. Any later code extraction must be a separately reviewable import with attribution.

## Upstream evidence and claim limits

The reviewed boundary is grounded in these exact pinned files:

- [`AGENTS.md`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/AGENTS.md), [`ADR-001`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/docs/adr/ADR-001-ASSET-IDENTITY.md), [`ADR-002`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/docs/adr/ADR-002-SOURCE-REVISION-LOCATION-ASSET-ORIGIN.md), and [`ADR-003`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/docs/adr/ADR-003-LIBRARY-PACKAGE.md)
- [`reference-protocol/src/lib.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-protocol/src/lib.rs), [`discovery.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-core/src/discovery.rs), [`session.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-core/src/session.rs), [`editorial.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-core/src/editorial.rs), [`rendition.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-core/src/rendition.rs), and [`server.rs`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/crates/reference-core/src/server.rs)
- [`SECURITY_MODEL.md`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/docs/security/SECURITY_MODEL.md), [`virtual-window.ts`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/packages/workspace/src/virtual-window.ts), and [`use-asset-pager.ts`](https://github.com/bomkino/reference-library/blob/ac2d5944a26d9efeee5f186bd3b61e09a467c663/packages/workspace/src/use-asset-pager.ts)

Reference Library's ADR-004 and ADR-006 remain Proposed, and its target-machine/cross-host gates are not closed at the reviewed SHA. Therefore this is a source-reviewed design input, not proof that its binaries, installers, helper supervision, sandbox inheritance, codecs, or cross-host behavior are integrated or release-ready in Workbench. WB-F02 must produce Workbench-owned automated and target-machine evidence before making those claims.
