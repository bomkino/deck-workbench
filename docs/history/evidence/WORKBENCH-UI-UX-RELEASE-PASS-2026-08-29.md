# Workbench UI/UX release pass

Date: 2026-08-29

Updated: 2026-08-30. This receipt supersedes its earlier 225-test draft and describes the current `v0.0.1` release candidate. Exact source identity and packaged results remain bound by the pull request and its commit-specific CI runs.

## Scope and verdict

This review started from the person's complete path through Plan, Curate, Assemble and Handoff. It challenged draft ownership, action hierarchy, scaled reachability, focus, status, terminology and release truth. It deliberately avoided a rebrand, framework rewrite and decorative motion pass.

Verdict: the candidate is suitable for a `0.0.1` pre-alpha source release after exact-head package CI. It is not a production-ready Curate, final Assemble or designer-package Handoff claim.

## Before / After / Why

| Before | After | Why |
|---|---|---|
| The empty shell explained that a Deck was required but made New/Open a menu hunt. | The primary empty state now exposes `New Deck…` and `Open Deck…` directly, while keeping File-menu shortcuts. | The first useful action should be visible where the journey starts. |
| Plan rebuilt every field from canonical state, so committing or changing context could erase other unsaved work. | One sparse draft is owned per Slide and restored across rerenders, phase changes and Slide changes. Native Save, Close, New, Open and quit flush Plan and Find More drafts through the same writers; invalid drafts block the lifecycle action and regain focus. | The interface must never silently destroy thought-in-progress. |
| Plan exposed several competing commit models, including a drafted status select beside immediate lifecycle commands, and 160 repeated map actions across a 40-Slide Deck. | `Save Slide plan` owns authored form changes; lifecycle has one immediate command model; each map row has two specific, named actions. | One owner per change type reduces persistence guesswork and contradictory visible state. |
| Curate controls and a tall tray could leave less than one useful media-card row, especially at 175% Interface Scale. | Secondary controls and tray are compact; Find More opens as a stable, upward overlay; single-column reflow begins earlier and active phase content can recover by scrolling. | The media wall, not its controls, is the primary Curate task, and disclosure must not move its own trigger. |
| Project Review and Find More relied on host-native disclosure markers and could open from the wrong origin or survive a phase change. | Both own a 1 rem Phosphor caret with a 0.5 rem gap, trigger-relative placement, fine-pointer entry motion, reduced-motion handling, outside/Escape dismissal and stable trigger geometry. | Expansion state, placement and interruption should be predictable across WebKit and Chromium. |
| Assignment, Project Pick and Compare labels changed width as focus and state changed. | Their action verbs keep stable geometry; the selected Asset and target slot live in one ellipsized context field, while titles and accessible names retain the exact action. | High-frequency keyboard traversal should update meaning without rewrapping the media wall. |
| Find More edits were overwritten when the user changed Slide; reverting to the saved value could also leave an impossible-to-clear dirty draft. | A separate Find More draft is retained per Slide until that Slide saves successfully, while canonical reverts prune the no-op draft immediately. | Exception briefs are authored work, not disposable filter state, and “no change” must never block Close or Save. |
| Sequence lifecycle labels implied skipped and cut Slides were disabled; several repeated controls had ambiguous accessible names. | Lifecycle is named without false disabled state; map and media actions include their Slide or Asset target. | Semantics now match actual operability and voice/keyboard intent. |
| The Curate focus proxy mixed listbox markup with grid APIs and could fail on first render. | One consistent active-descendant listbox contract owns media focus, count and option state. | A single valid composite is safer for keyboard and assistive technology. |
| Interface scale hid Scale and save status; tiny labels could fall below practical reading size. | Toolbar areas remain explicit, Scale/status stay present, frequent labels have 11–12 px floors and warning contrast is darker. | Scaling must improve access without hiding recovery or state. |
| Phase changes rebuilt every workspace and moved focus even when the phase did not change. | Only the active phase renders; same-phase selection avoids phase focus churn; real phase changes focus the named active view. | Less DOM churn means less lost focus, flash and needless work. |
| Handoff suggested a package outcome while exporting only one page, and a long Slide title could resize its action panel. | Handoff leads with the current blocker and uses one fixed `Export active Slide PDF` label; the full target remains in its accessible description. | Pre-alpha capability is useful when its boundary is explicit and its panel does not jump. |
| Hover feedback could stick on touch and evidence described motion the interface did not ship. | Hover is fine-pointer only; pointer press feedback is 140 ms, functional disclosures use a restrained 180 ms ease-out and reduced-motion remains authoritative. | Motion confirms input without becoming decoration or misleading evidence. |
| Application chrome relied on platform fallbacks and mixed text symbols, so hierarchy and icon metrics varied by host. | The pinned pitch.dog v13 Head, Body and Eyebrow roles are the packaged defaults; Phosphor supplies one offline icon family, and first paint waits for those bundled faces before reveal. | Typography and iconography should be deliberate and stable without fallback-metric reflow. |
| A long live-status message could grow the global toolbar; the zoom label changed width at 100%; fresh sessions presented the artboard at 35%. | Status and zoom labels have reserved one-line geometry, overflow state owns a stable slot and clean installs begin Artboard Zoom at 65% while preserving saved preferences. | State changes should not move every panel, and the primary visual judgment surface should be useful by default. |
| Spacing and control geometry drifted at dense card counts, short windows and extreme Interface Scale values. | Shared spacing tokens, a 44 px physical target floor, short-height reflow and the maximum-badge runtime probe cover the constrained layouts. | Scale must create room and reachability, not crop controls or collapse useful content. |
| Export could overlap another export or race stale composition and unloaded font state. | Export waits for packaged fonts, rejects stale or overflowing composition, serializes one transaction and always restores the interface. | A proof PDF must reflect the visible authored surface and leave the user in a recoverable state. |

## Source evidence

| Check | Result |
|---|---|
| `npm run verify` | Passed: 235/235 tests, source contract, repository rules and self-contained phased preview |
| Plan draft regression | Passed: dirty-field delta survives canonical refresh and clears only on successful full save or document change |
| Curate draft regression | Passed: Find More draft is keyed by Slide, survives context changes, and canonical reverts clear without issuing a rejected no-op command |
| Linux renderer lifecycle probe | Passed: direct New/Open empty-state actions work; Plan and Find More drafts auto-save through Close/reopen; invalid Present+empty copy blocks Close and focuses the field |
| Maximum-scale runtime probe | Passed on Linux/Xvfb: Curate wall/tray, Assemble controls and Handoff PDF action are reachable at 175% through one phase-owned scroll path |
| Runtime polish probe | Source-ready: open/close/reversal keeps both disclosure triggers fixed; overlays stay in the viewport; Phosphor icons remain optically centred; long status/export labels and 95→100% zoom retain geometry |
| macOS geometry probe | Corrected: activates Assemble, rejects zero-area artboard/shell measurements, checks the authored footprint and all four viewport sides for five real Plan controls |
| Packaged screenshot evidence | Source-ready: the exact-SHA workflow will retain four `1440×900 @ 100%` review layouts plus four `1180×605 @ 175%` stress layouts, uploaded separately from the release binaries |
| Static accessibility contracts | Passed: named phases/actions, semantic map and media focus, failure/success focus recovery, 44 px target floor, visible state and reduced-motion treatment |
| Typography and icon assets | Passed: exact pitch.dog v13 and Phosphor provenance, hashes, host routes, MIME types, CSP and packaged font-family probes |
| Export failure paths | Passed: font readiness, stale projection, overflow, reentrancy, UI locking and independent cleanup are fail-closed |

## Claim boundary

Verified here means source-verified on the candidate tree only. Exact-head macOS and Ubuntu package workflows remain required before promotion and release; the new screenshot and geometry rows become packaged evidence only when those workflows pass at the candidate SHA. The authentic packaged Curate Root/save/quit/reopen journey, phased VoiceOver/Orca acceptance, Garuda/KDE/Wayland behavior, final Assemble and designer-package Handoff remain unverified.
