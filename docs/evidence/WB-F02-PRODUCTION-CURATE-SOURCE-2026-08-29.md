# WB-F02 Production Curate — source evidence receipt

Date: 2026-08-29

## Identity

- Repository: `bomkino/deck-workbench`
- Branch: `codex/workbench-phased-rebuild`
- Canonical starting SHA: `01e5e0bc635d7f755f1bb38af6c06ba5f1aa11d4`
- Pull request: #6, open and draft
- Ticket: WB-F02 Production Curate
- Candidate: the exact tree containing this receipt; the published commit and CI runs are the immutable identity

The handover archive did not contain canonical Git metadata. Its local synthetic baseline commit was used only for diffing and was not pushed or treated as repository history.

## User-observable source slice

The candidate adds a four-region Curate workspace with an included-Slide queue, bounded virtual media wall, selected-Slide brief, named Primary/Repeater slots, Alternates, Shortlist and an explicit Unplaced tray. Project rating/review/Pick remains independent from per-Slide shortlist/select/alternate/reject meaning. Find More state and its brief remain durable after a Primary assignment.

The native document sessions add typed Root authorization, reconnect, scan and bounded media queries through the existing ten-method bridge. Absolute Root locators and grants remain host-local. The renderer receives opaque identities, safe display metadata and nonce-bound rendition URLs. Linux still images are decoded to bounded PNG grid renditions; unsupported or oversized media remains catalogue-only.

The Deck-bound `media/catalog.json` preserves stable Asset, Source, Source Revision and Location identities. Changed bytes append Source Revisions. Completed scans may infer missing; incomplete or cancelled observations may not. Paging is pinned to both catalogue and live-availability generations, uses authoritative `nextOffset`, caps pages at 250 records and caps the fully enriched encoded response at 1 MiB.

## Public seams exercised

| Seam | Scenario | Result |
|---|---|---|
| Deck kernel prepare → durable append → commit | Curate judgments, Slide decisions, assignments, slot reconciliation, undo, redo and replay | Passed, including malformed history, ambiguous Plan, reserved identity and forged replay rejection |
| `deck.query` / `deck.execute` | Curate queue/Slide/Asset projections and typed semantic commands | Passed; no generic filesystem, shell, SQL, evaluator or IPC method added |
| Native media session | Root authorization state, bounded Roots/Assets paging, availability changes, scan reconciliation and resource lookup | Linux dynamic tests passed; macOS source/static contracts passed |
| `pitchdog-asset` resource handler | Session/nonce-bound safe Root-relative still-image rendition | Linux dynamic and macOS static/security contracts passed |
| Shared workspace | progressive paging, virtual window, keyboard/pointer parity, Unplaced/Ready gating and stale async fencing | Passed |
| Package Curate evidence hook | exact commit/platform/package binding | Fail-closed: remains `unverified` without an authentic native journey result |

## Commands run on the final combined tree

| Command | Exit | Result |
|---|---:|---|
| `npm run verify` | 0 | generation passed; 218/218 tests passed; source contract, repository rules and self-contained phased preview passed |
| `git diff --check` | 0 | no whitespace errors |

Focused adversarial runs also passed: kernel 41/41, native media-host 26/26 and Production Curate UI 13/13. The complete 218-test run is the binding local source result.

## Packaged artifact

No new package was built, signed, zipped, extracted or run in this Linux workspace. macOS Swift/AppKit code was inspected through source contracts only because the runner has no macOS SDK or packaged WebKit runtime. The Linux native-host modules were dynamically tested, but no packaged Electron journey was run.

The package scripts deliberately record Production Curate as `unverified` unless a real native journey result is supplied for the exact package commit and platform.

## Review and hardening

Independent adversarial review found and the candidate fixed:

- stale document, query, selection, availability and native-operation publication races;
- eager media-card/image recreation during focus movement;
- missing Unplaced visibility and included-Story queue semantics;
- N-per-Slide queue query fan-out;
- enriched Asset and Root responses exceeding the 1 MiB bridge frame;
- unsafe `__proto__` Root/Asset map keys;
- catalogue revision overflow and non-reopenable persistence;
- ambiguous Workbench Plan blocks and forged undo/redo replay identities;
- contradictory packaged-journey evidence accepted by the verifier.

The final HIGH-only renderer review reported no remaining blocker or high-severity finding.

## Honest status

Status: source-verified implementation slice; the full WB-F02 Production Curate gate remains open. This receipt does not claim packaged, integrated or release-ready Curate.

Still unproved or incomplete:

- durable production Job/progress/cancellation state for scan and rendition work;
- crash-transactional authorization across catalogue, host grant and scan state;
- authentic save/quit/fresh-process reopen with a real authorized Root on packaged macOS and Ubuntu;
- compiled macOS/AppKit parity, sandbox bookmarks and inherited helper signing;
- cross-host package round-trip;
- unchanged-file rescan optimization and move continuity for files beyond the current bounded evidence budget;
- removal of host platform file observations from the portable catalogue boundary;
- large-history/10,240-interaction kernel performance;
- target-machine culling, Preview/Compare quality and assistive-technology acceptance.

The next dispatchable gate is a real durable scan Job/cancellation seam with fault-injected recovery, followed by exact-head packaged journeys on macOS and Ubuntu.
