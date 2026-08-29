# Workbench UI/UX release pass

Date: 2026-08-29

## Scope and verdict

This review started from the person's complete path through Plan, Curate, Assemble and Handoff. It challenged draft ownership, action hierarchy, scaled reachability, focus, status, terminology and release truth. It deliberately avoided a rebrand, framework rewrite and decorative motion pass.

Verdict: the candidate is suitable for a `0.0.1` pre-alpha source release after exact-head package CI. It is not a production-ready Curate, final Assemble or designer-package Handoff claim.

## Before / After / Why

| Before | After | Why |
|---|---|---|
| The empty shell explained that a Deck was required but made New/Open a menu hunt. | The primary empty state now exposes `New Deck…` and `Open Deck…` directly, while keeping File-menu shortcuts. | The first useful action should be visible where the journey starts. |
| Plan rebuilt every field from canonical state, so committing or changing context could erase other unsaved work. | One sparse draft is owned per Slide and restored across rerenders, phase changes and Slide changes. Native Save, Close, New, Open and quit flush Plan and Find More drafts through the same writers; invalid drafts block the lifecycle action and regain focus. | The interface must never silently destroy thought-in-progress. |
| Plan exposed several competing commit models, including a drafted status select beside immediate lifecycle commands, and 160 repeated map actions across a 40-Slide Deck. | `Save Slide plan` owns authored form changes; lifecycle has one immediate command model; each map row has two specific, named actions. | One owner per change type reduces persistence guesswork and contradictory visible state. |
| Curate controls and a tall tray could leave less than one useful media-card row, especially at 175% Interface Scale. | Secondary controls and tray are compact, Find More is disclosed on demand, single-column reflow begins earlier and active phase content can recover by scrolling. | The media wall, not its controls, is the primary Curate task. |
| Assignment, selected slot, Compare membership, rating and review state were hidden or visually indistinguishable. | Assignment names the target slot; target, Compare, rating and review states remain visible on cards and trays. | The user can see what an action will change and what they already decided. |
| Find More edits were overwritten when the user changed Slide; reverting to the saved value could also leave an impossible-to-clear dirty draft. | A separate Find More draft is retained per Slide until that Slide saves successfully, while canonical reverts prune the no-op draft immediately. | Exception briefs are authored work, not disposable filter state, and “no change” must never block Close or Save. |
| Sequence lifecycle labels implied skipped and cut Slides were disabled; several repeated controls had ambiguous accessible names. | Lifecycle is named without false disabled state; map and media actions include their Slide or Asset target. | Semantics now match actual operability and voice/keyboard intent. |
| The Curate focus proxy mixed listbox markup with grid APIs and could fail on first render. | One consistent active-descendant listbox contract owns media focus, count and option state. | A single valid composite is safer for keyboard and assistive technology. |
| Interface scale hid Scale and save status; tiny labels could fall below practical reading size. | Toolbar areas remain explicit, Scale/status stay present, frequent labels have 11–12 px floors and warning contrast is darker. | Scaling must improve access without hiding recovery or state. |
| Phase changes rebuilt every workspace and moved focus even when the phase did not change. | Only the active phase renders; same-phase selection avoids phase focus churn; real phase changes focus the named active view. | Less DOM churn means less lost focus, flash and needless work. |
| Handoff suggested a package outcome while exporting only one page. | Handoff leads with the current blocker and names the active Slide PDF proof target. | Pre-alpha capability is useful when its boundary is explicit. |
| Hover feedback could stick on touch and evidence described motion the interface did not ship. | Hover is fine-pointer only; press feedback is 110 ms and reduced-motion remains authoritative. | Motion confirms input without becoming decoration or misleading evidence. |

## Source evidence

| Check | Result |
|---|---|
| `npm run verify` | Passed: 225/225 tests, source contract, repository rules and self-contained phased preview |
| Plan draft regression | Passed: dirty-field delta survives canonical refresh and clears only on successful full save or document change |
| Curate draft regression | Passed: Find More draft is keyed by Slide, survives context changes, and canonical reverts clear without issuing a rejected no-op command |
| Linux renderer lifecycle probe | Passed: direct New/Open empty-state actions work; Plan and Find More drafts auto-save through Close/reopen; invalid Present+empty copy blocks Close and focuses the field |
| Maximum-scale runtime probe | Passed on Linux/Xvfb: Curate wall/tray, Assemble controls and Handoff PDF action are reachable at 175% through one phase-owned scroll path |
| Static accessibility contracts | Passed: named phases/actions, semantic map and media focus, failure/success focus recovery, 44 px target floor, visible state and reduced-motion treatment |

## Claim boundary

Verified here means source-verified on the candidate tree only. Exact-head macOS and Ubuntu package workflows remain required before promotion. The authentic packaged Curate Root/save/quit/reopen journey, phased VoiceOver/Orca acceptance, Garuda/KDE/Wayland behavior, final Assemble and designer-package Handoff remain unverified.
