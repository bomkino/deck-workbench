# Deck Workbench — ChatGPT Cloud Work Handover

**Handover date:** 29 August 2026  
**Repository:** `bomkino/deck-workbench`  
**Working branch:** `codex/workbench-phased-rebuild`  
**Packaged commit:** `__PACKAGED_COMMIT__`  
**Pull request:** `#6` into `main`  
**Status at handover:** Branch work only. Do not merge without explicit user instruction.

---

# 0. Paste this into ChatGPT Cloud Work

```text
@GitHub

Read `CLOUD_WORK_HANDOVER_2026-08-29.md` completely before changing code.

Work in:
- repository: bomkino/deck-workbench
- branch: codex/workbench-phased-rebuild
- packaged commit: see EXACT_STATE.txt
- pull request: #6

Continue the rebuild from the exact source in this ZIP and the canonical GitHub branch. Do not restart the product discussion. Do not revive the old four-pane Editorial Spine as the primary workflow. Do not merge to main, publish, release, delete branches, or rewrite history unless explicitly authorised.

The next build gate is Production Curate. Build it as a real vertical slice on the shared production workspace and durable Deck kernel. Preserve everything already proven in Production Plan, macOS WebKit, Ubuntu/Electron, schema-1 compatibility, journalled undo/redo, focus retention, Interface Scale, package verification and the original Prototyper parity ledger.

Work long-horizon. Use actual user journeys and concrete acceptance gates. Avoid test theatre, coverage quotas, giant screenshot farms, architecture masturbation, speculative abstractions and fake progress. Tests must protect real semantics, geometry, packaging or regressions.

Before implementation, inspect the current Reference Library repository through @GitHub and identify the smallest safe reusable media-core boundary. Do not merge the two products and do not create competing Asset identities.

Then build Production Curate through the complete journey described in this handover. Keep the user informed with sparse, concrete progress updates. Stop only at a truthful gate boundary or a real blocker.
```

---

# 1. What Workbench is now

Deck Workbench is **pitch.dog’s internal pre-production tool for turning locked slide copy and project media into a slide-by-slide visual plan, rough assembly and designer-ready handoff**.

It enters after the writing is already divided into Slides and is locked or nearly locked.

The intended production chain is:

```text
01 PLAN
Exact copy + Slide purpose + content structure + visual intent

02 CURATE
Search the media mountain + shortlist + assign primaries + retain alternates

03 ASSEMBLE
Move/crop media + place white text + use Swiss grid + build black gradients

04 HANDOFF
Review concrete gaps + package copy, roughs, media, notes and instructions
```

Workbench is not:

- a generic presentation platform;
- a writing assistant;
- an AI deck generator;
- a replacement for Figma or InDesign;
- a universal digital asset manager;
- a collaboration/account/cloud product;
- a place to perform final typography and production design.

Its primary output is a clear first visual draft and designer handoff—not finished artwork.

---

# 2. Product lineage

The real ancestor was **Deck Prototyper** inside the original `pitch-deck-tools` repository.

Its correct product instinct was a sequential workflow:

```text
Script → Curation → Assembly → Export
```

It could already:

- ingest slide copy;
- use Headline, Subheadline and Body;
- scan local media;
- shortlist/rate/select main and backup images;
- use full-bleed, split, grid and text-only layouts;
- pan, scale, fit, align and mirror images;
- use a 24×12 grid and snapping;
- add notes;
- export rough frames, PDF, media and specifications.

Its weakness was architecture and durability, not workflow.

The current Workbench retained the stronger modern foundation:

- stable Deck, Section and Slide identity;
- semantic Content Blocks;
- durable `.pitchdeck` documents;
- journalled commands;
- undo/redo across reopen;
- crash recovery;
- neutral Asset references;
- Design Options/Compositions;
- macOS and Linux applications;
- package verification.

The governing rebuild formula is:

```text
Deck Prototyper’s phase logic
+
Workbench’s durable document engine
+
Reference Library’s reusable media infrastructure
+
a restrained Swiss art-direction canvas
```

---

# 3. Non-negotiable product decisions

## 3.1 Four dedicated phases

Plan, Curate, Assemble and Handoff are task-specific mini-apps over one Deck.

The selected Slide and durable project meaning survive phase changes. Users can move backward and forward freely. No phase should expose every control merely because the data exists.

## 3.2 Locked-copy entry point

The user normally arrives with copy already divided into Slides.

Copy corrections are allowed. Writing the Deck is not Workbench’s primary job.

## 3.3 Copy roles

The privileged visible roles are:

- Headline;
- Subheadline;
- Body.

Each field may be:

- present;
- intentionally blank;
- unreviewed.

An intentional blank is not a defect.

A Slide may explicitly have **no on-Slide text** while retaining its internal title, Purpose, research context and handoff instructions.

## 3.4 Content Pattern is not Visual Style

Content Pattern describes the information structure:

- Simple Copy;
- Quote;
- Repeater;
- Comparison;
- Gallery Captions;
- No On-Slide Text;
- Custom.

Visual Style describes the starting composition:

- Text Only;
- Full Bleed;
- Full Bleed + Overlay;
- Image + Text;
- Diptych;
- Triptych;
- Gallery;
- Custom.

Do not collapse these into one overloaded layout choice.

## 3.5 Repeated content has stable identity

Comps, cast, team, episodes and similar Slides use stable Supporting Items.

A three-comps Slide is not one Body blob with three captions. Each item retains its title, caption, link and media binding when reordered.

## 3.6 Full Bleed

Full Bleed means the image frame covers the artboard. It may still need:

- expansion;
- retouching;
- a stronger source;
- higher resolution;
- a revised crop.

Text may sit on top. Black gradients protect white text.

## 3.7 Media judgment has two levels

Project-level judgment answers whether an Asset matters to the project.

Per-Slide judgment answers what role that Asset may play on one Slide.

An Asset can be a Project Pick, rejected for Slide 07, selected for Slide 11 and alternate for Slide 18 without contradiction.

## 3.8 Upstream changes create review work, not destruction

Copy edits preserve media and assembly, then mark text/gradient review.

Visual Style changes preserve copy and all candidates, retain compatible slots and move incompatible selections to an unplaced tray.

Media replacement preserves frame, gradient and notes, attempts normalised crop transfer and marks crop review.

Nothing important disappears silently.

---

# 4. What is already built

## 4.1 Product contract and parity ledger

Read:

- `docs/product/PHASED_WORKBENCH_CONSTITUTION.md`
- `docs/product/PROTOTYPER_PARITY_LEDGER.md`
- `docs/implementation/WB-R00-PHASED-REBUILD.md`

These freeze the product direction and prevent accidental loss of original Deck Prototyper behaviour.

## 4.2 Disposable four-phase interaction tracer

Location:

- `prototypes/phased-workbench/`
- `packages/workflow-model/index.mjs`

Run:

```bash
npm run preview:phased
```

Build its self-contained preview:

```bash
npm run build:phased-preview
npm run verify:phased-preview
```

The tracer proves the intended interaction model. It is not the production source of truth.

It demonstrates:

- Plan, Curate, Assemble and Handoff as separate workspaces;
- intentional blanks and no-text Slides;
- repeated items;
- virtualised 2,400-Asset media wall;
- project Picks/ratings versus per-Slide decisions;
- primary, alternate and shortlist trays;
- direct text/image manipulation;
- semantic type scales;
- one/two/three Body columns;
- original 24×12 Pitch Grid;
- snapping;
- linear/radial gradients, endpoints, feather and presets;
- concrete Handoff issues;
- Markdown and manifest export.

Use it as a behavioural reference. Do not promote its browser-storage fixture architecture into production.

## 4.3 Shared production workspace

Production source:

```text
packages/workspace/app/
```

Generation:

```text
packages/workspace/app/
        ↓ scripts/build-workspace.mjs
build/generated/workspace/
        ↓
macOS app bundle + Linux package/runtime
```

`apps/macos/Resources/Workspace` is a compatibility link to the generated shared workspace. Mac and Linux no longer maintain competing workspace source trees.

## 4.4 Production Plan phase

Read:

- `docs/implementation/WB-F01-SHARED-PLAN-WORKSPACE.md`

The packaged apps now support:

- four persistent phase routes;
- Parts and Slides;
- internal title;
- Purpose;
- Included, Skipped and Cut lifecycle states;
- visible text, no on-Slide text and undecided states;
- Headline, Subheadline and Body;
- present, intentionally blank and unreviewed states;
- Content Patterns;
- Visual Styles;
- stable Supporting Items;
- Part and Slide movement;
- Option–Arrow movement;
- exact copy editing;
- journalled undo/redo;
- existing Asset, Pattern, alignment, crop and PDF seams.

## 4.5 Schema-1 compatibility envelope

The production gate deliberately does not migrate `.pitchdeck` away from schema version 1.

New Plan semantics live in one reserved canonical Content Block:

```text
role:        workbench-plan
semanticKey: workbench.plan.v1
value:       JSON envelope
```

The envelope records:

- internal title;
- Purpose;
- lifecycle;
- text presence;
- Content Pattern;
- explicit copy-field states;
- Supporting Items;
- media-slot count;
- text-position hint.

Visible copy remains in ordinary semantic `headline`, `subheadline` and `body` Content Blocks.

Starting Visual Style remains the Slide intent.

The renderer never owns the only copy.

## 4.6 Cross-platform hardening completed

The branch contains extensive packaged fixes discovered through real macOS WebKit and Ubuntu/Electron journeys, including:

- shared-workspace generation and host parity;
- active-projection fallback before full Deck hydration;
- atomic publication of hydrated Story/projection/Asset state;
- cancellable stale hydration;
- serialized/deferred macOS bridge request admission;
- bounded bridge timeout and fail-closed fencing;
- Story and Sequence focus restoration after DOM replacement;
- Interface Scale reflow;
- independent artboard geometry;
- explicit packaged control target geometry;
- native WebKit select hardening at large Interface Scale.

Do not casually simplify the bridge, focus, scale or packaged-hardening work. It exists because actual packaged journeys failed without it.

## 4.7 Current exact-head verification

The source head before this packaging-only handover commit was:

```text
57184e53cf6a71464ae64033b8a971840288bbbe
```

At that head:

```text
DW-T00 macOS arm64         success
DW-G01 Ubuntu Linux x64    success
```

The packaging workflow writes the final exact artifact SHA to `EXACT_STATE.txt`. Re-check exact-head workflows before claiming the next gate is closed.

---

# 5. Current repository state

```text
Default branch: main
Working branch: codex/workbench-phased-rebuild
Pull request:   #6
PR state:       open, draft
Merged:         no
```

`main` is intentionally untouched.

The PR title/body began when this was only an interaction tracer and may understate the present Production Plan work. Update the PR description after the next truthful gate, but do not merge without explicit authorisation.

---

# 6. Read these files in this order

1. `CLOUD_WORK_HANDOVER_2026-08-29.md`
2. `EXACT_STATE.txt`
3. `docs/product/PHASED_WORKBENCH_CONSTITUTION.md`
4. `docs/product/PROTOTYPER_PARITY_LEDGER.md`
5. `docs/implementation/WB-R00-PHASED-REBUILD.md`
6. `docs/implementation/WB-F01-SHARED-PLAN-WORKSPACE.md`
7. `packages/workspace/app/index.html`
8. `packages/workspace/app/workspace-core.js`
9. `packages/workspace/app/workspace-plan.js`
10. `packages/workspace/app/workspace-visual.js`
11. `packages/workspace/app/workspace-handoff.js`
12. `packages/workspace/app/workspace.js`
13. `packages/workspace/app/styles.css`
14. `packages/workspace/app/packaged-hardening.css`
15. `packages/deck-kernel/src/deck-kernel.ts`
16. `packages/bridge-contract/bridge.contract.json`
17. `scripts/generate-bridge.mjs`
18. `scripts/build-workspace.mjs`
19. `tests/production-plan-model.test.mjs`
20. `tests/bridge-fifo.test.mjs`
21. `tests/interface-scale-reflow.test.mjs`
22. `tests/workspace-design-contract.test.mjs`
23. `prototypes/phased-workbench/README.md`

---

# 7. Local commands

## Requirements

- Node.js 24 or newer.
- npm.
- Electron dependencies for packaged Linux work.
- Apple-Silicon macOS 26 or newer for the native macOS gate.

## Install and verify source

```bash
npm ci
npm run verify
```

`npm run verify` currently performs:

```text
npm test
npm run verify:source
npm run verify:repository
npm run verify:phased-preview
```

Generation includes:

```text
scripts/generate-bridge.mjs
scripts/build-kernel.mjs
scripts/build-workspace.mjs
```

## Tracer preview

```bash
npm run preview:phased
```

## Linux package

```bash
npm run install:electron
npm run build:linux
npm run verify:linux
```

## macOS package

```bash
scripts/build-macos.sh
scripts/verify-packaged-macos.sh
```

The macOS scripts reject non-Apple-Silicon hosts, macOS below 26 and dirty exact-commit packaging.

## Binding CI gates

- `.github/workflows/dw-t00-macos.yml`
- `.github/workflows/dw-g01-linux.yml`

Do not call a gate complete until both exact-head runs pass.

---

# 8. The next build gate: Production Curate

## 8.1 Goal

Replace the production Curate placeholder/neutral Asset seam with a real, fast, durable media-selection workflow while preserving the shared workspace and Deck kernel.

The complete user journey must become:

```text
Open a planned Slide
→ retain its Purpose and exact copy in view
→ attach a real project media source
→ browse thousands of media items without UI jumping
→ search/filter/cull
→ shortlist for the current Slide
→ compare candidates
→ fill named primary slots
→ keep alternates
→ mark Find More Media when needed
→ switch Slides without losing decisions
→ save, close, reopen
→ preserve Asset identity and every decision
```

## 8.2 First action: inspect Reference Library

Use `@GitHub` to locate and inspect the canonical Reference Library repository.

Identify the smallest safe reusable boundary for:

- authorised Roots;
- Source and Location reconciliation;
- stable Asset identity;
- missing/offline states;
- bounded renditions;
- resource authorisation;
- query/filter/sort/paging;
- virtualised contact-sheet calculations;
- scan/rescan/reconnect jobs;
- cancellation and progress.

Do not:

- merge Reference Library into Workbench;
- fork its whole UI into Workbench;
- create a second incompatible Asset identity system;
- destabilise its released application;
- expose raw filesystem paths to the renderer.

Prefer a shared protocol/core with adapters that leave Reference Library’s existing public behaviour unchanged.

## 8.3 Production Curate data distinctions

### Project-level Asset judgment

At minimum:

```text
rating: 0–5
review: unreviewed | keep | maybe | reject
projectPick: boolean
```

### Per-Slide Asset decision

At minimum:

```text
considered
shortlisted
selected
alternate
rejected-for-slide
```

A per-Slide rejection must not reject the source globally.

### Named primary slots

Visual Style should derive primary slot requirements:

```text
Text Only                  0
Full Bleed                 1
Full Bleed + Overlay       1
Image + Text               1
Diptych                    2
Triptych                   3
Gallery                    variable
Custom                     variable
```

Repeater Slides derive named slots from stable Supporting Item IDs, not array positions:

```text
The Bear
Reservation Dogs
This Is Us
```

not:

```text
Slot 1
Slot 2
Slot 3
```

### Find More Media

Keep it distinct from Designer Notes and Source Treatment:

```text
state: not-needed | needed | resolved | waived
brief: exact research request
existingPrimaryStatus: none | temporary | usable | approved
```

Assigning a temporary image must not silently close Find More.

## 8.4 Production Curate UI

Curate is a dedicated mini-app, not an Inspector panel inside Plan.

Recommended stable regions:

```text
Left:    Slide queue
Centre:  virtualised media wall
Right:   selected Slide brief
Bottom:  primary slots + alternates + Slide shortlist
```

The Slide brief should always preserve context:

- Part;
- Slide number;
- internal title;
- Purpose;
- Headline;
- Subheadline;
- Body preview;
- Supporting Items;
- Visual Style;
- required slots;
- Find More state.

Panels should retain geometry while media loads. Thumbnail boxes reserve aspect ratio. Missing Assets remain visible. Filters do not reset selection or unexpectedly jump scroll position.

## 8.5 Media wall capabilities

Required:

- thousands of Assets without mounting thousands of DOM nodes;
- search by filename/path/title/note where available;
- folder filter;
- type filter;
- orientation filter;
- rating filter;
- project judgment filter;
- selected/alternate/shortlist/unused/missing filters;
- thumbnail-density control independent from Interface Scale;
- stable keyboard navigation;
- full Preview;
- two-to-four-image Compare/Culling mode;
- right-click actions with explicit verbs;
- source reveal through native host authority;
- clear availability and media-type labels.

Avoid ambiguous verbs such as `Remove`. Use:

- Demote to Slide Shortlist;
- Demote to Alternate;
- Clear current-Slide decision;
- Reject for this Slide;
- Remove Project Pick;
- Detach source reference.

No action should rename, move, trash or overwrite original source files.

## 8.6 Keyboard rhythm

The exact mapping can be refined through actual use, but preserve a fast culling path:

```text
Arrow keys          navigate media
Space               Preview
S                   toggle Slide shortlist
M                   assign next open primary slot
A                   add Alternate
X                   reject for current Slide
Shift+X             clear current-Slide decision
0–5                 project rating
N                   next unresolved Slide
P                   previous Slide
+ / -               thumbnail density
C                   compare selected candidates
```

Shortcuts must be discoverable in menus/tooltips and not be the only way to perform core actions.

## 8.7 Persistence

Do not leave Curate decisions in browser storage.

Every meaningful decision must live in durable canonical Deck state or a deliberate schema-compatible envelope with stable IDs.

Before choosing the persistence form, document:

- ownership of Asset catalogue identity;
- ownership of per-Slide decisions;
- migration from current schema-1 neutral Asset references;
- reopen behaviour;
- missing-source behaviour;
- Mac → Linux → Mac meaning;
- change propagation when Visual Style or Supporting Items change.

Do not rush schema version 2 merely because it is cleaner. Expand safely, prove migration, then contract.

## 8.8 Change propagation

Curate must preserve:

- shortlisted media after Visual Style changes;
- compatible selected slots;
- incompatible selections in an unplaced tray;
- prior crop/slot history where safe;
- all alternates;
- Find More state;
- Supporting Item/media identity after item reorder;
- missing Asset identity after a Root disconnect;
- decisions after source rename/move reconciliation.

## 8.9 Performance fixture

Use a representative heavy fixture:

- at least 10,000 indexed records;
- nested folders;
- duplicate filenames;
- portrait, landscape and square media;
- missing/offline sources;
- a slow external-root simulation;
- still images first;
- explicit GIF/video provider boundaries rather than pretending still-image support solves them.

Measure useful behaviour:

- first usable media wall;
- scrolling;
- search/filter response;
- Preview latency;
- assignment rhythm;
- selection retention;
- memory growth;
- cancellation;
- reconnect correctness.

Do not invent vanity performance numbers detached from the target machines.

## 8.10 Curate acceptance journey

The gate is complete only when this works in packaged applications:

```text
Create/open a Deck
→ select a planned Full-Bleed Slide
→ authorise a real media Root
→ see progressive bounded thumbnails
→ search and filter
→ shortlist multiple candidates for that Slide
→ compare candidates
→ select Primary
→ add two Alternates
→ mark Find More with a brief
→ move to a Repeater Slide
→ assign named item slots
→ reject one Asset only for that Slide
→ disconnect the source Root
→ preserve visible missing Asset identities
→ reconnect/rescan after source movement
→ retain the same Asset identities and decisions
→ save, close, reopen
→ open on the other platform
→ retain the same Deck meaning
```

Binding gates:

- focused domain semantics;
- one heavy media-wall test fixture;
- one packaged macOS journey;
- one packaged Ubuntu journey;
- no regression to Production Plan;
- no regression to Reference Library if shared code is extracted.

---

# 9. Test philosophy

Use tests only at meaningful seams.

Good tests:

- stable IDs;
- intentional blank semantics;
- candidate state transitions;
- named slot identity;
- Visual Style change propagation;
- source move/reconnect reconciliation;
- query/paging/virtual window geometry;
- undo/redo;
- migration;
- package journeys;
- a regression for an actual defect.

Avoid:

- coverage quotas;
- tests for every CSS class;
- tests for every icon;
- arbitrary UI-count assertions;
- huge brittle screenshot farms;
- mocks that never launch the real package;
- tests written only to make activity look substantial.

Human acceptance remains necessary for:

- media-culling rhythm;
- no-jump behaviour;
- Preview/Compare quality;
- keyboard flow;
- Interface Scale;
- macOS WebKit versus Linux Chromium behaviour.

---

# 10. Important known deferrals

These are not complete yet:

- atomic single-command Plan save;
- CommonMark AST and inline mark schema;
- full Markdown import/diff/sync UI;
- production media Root/`.pitchlibrary` integration;
- production project-level/per-Slide curation states;
- direct-manipulation Assembly engine;
- bundled final rough typeface decision;
- production gradient engine;
- final PNG/PDF renderer parity;
- complete designer Handoff package;
- Deck Prototyper importer;
- schema version 2 migration;
- installed Garuda Wayland/X11 acceptance for the future Curate/Assembly work.

Do not claim these from the tracer.

---

# 11. Known risks

## Product risks

- turning Curate into a generic DAM;
- hiding Slide copy while choosing media;
- conflating global rating with per-Slide suitability;
- losing a shortlist when a primary is chosen;
- allowing temporary media to close Find More automatically;
- flattening Repeater items;
- UI regions changing size as content loads;
- exposing every control simultaneously;
- reintroducing generic SaaS chrome.

## Data risks

- using filename as identity;
- duplicating Assets after source movement;
- raw path authority in renderer state;
- browser storage as canonical state;
- missing Assets disappearing;
- silent migration loss;
- packaging thumbnails instead of originals;
- source mutation.

## Cross-platform risks

- WebKit/Chromium focus divergence;
- target geometry changing at large Interface Scale;
- query/render races after bridge mutations;
- different file authorisation semantics;
- different thumbnail orientation/colour handling;
- Linux utility-process and macOS security-scope divergence.

## Process risks

- polishing the old simultaneous workspace instead of the phased product;
- rewriting the kernel unnecessarily;
- changing Reference Library without its own regression gates;
- expanding into Assembly before Curate completes one real journey;
- calling source-unit tests a packaged acceptance gate;
- merging because CI is green without explicit user authorisation.

---

# 12. Do not repeat completed work

Do not restart:

- product-positioning debate;
- Deck Prototyper lineage research;
- four-phase IA debate;
- blank/no-text semantics;
- Content Pattern versus Visual Style distinction;
- shared workspace architecture;
- schema-1 Plan envelope;
- bridge FIFO/hydration hardening;
- Interface Scale/artboard separation;
- packaged select geometry fixes;
- basic Plan phase implementation.

Inspect and improve when implementation evidence demands it, but do not erase settled decisions casually.

---

# 13. Definition of a truthful next checkpoint

A useful next Cloud Work checkpoint is not “media architecture designed.”

It is:

```text
One real authorised media source
→ one virtualised production wall
→ one selected Slide brief
→ durable Slide shortlist
→ durable Primary/Alternate assignment
→ named Repeater slots
→ missing source remains visible
→ save/reopen
→ packaged macOS and Ubuntu gates green
```

After that, deepen comparison, ratings, Find More, reconnect and heavy-root performance.

Do not move to production Assembly merely because Curate’s UI exists. Move when the full media-selection journey is trustworthy.

---

# 14. Handover package inventory

This ZIP should contain:

```text
deck-workbench-cloud-work-handover/
├── CLOUD_WORK_HANDOVER_2026-08-29.md
├── EXACT_STATE.txt
├── HANDOVER_SHA256SUMS.txt
├── complete tracked repository source at the packaged commit
└── no .git directory, node_modules, build output or prior CI runtime packages
```

`EXACT_STATE.txt` is the authority for the packaged commit SHA.

`HANDOVER_SHA256SUMS.txt` verifies every file except itself.

---

# 15. Final instruction to the continuation model

Preserve the narrow product.

The user comes to Workbench with slide copy already in place. The most important unresolved job is the media mountain: help the team see each Slide’s writing and Purpose, judge thousands of media items quickly, preserve a Slide-specific shortlist, assign named primaries and alternates, record what still needs research, and carry those decisions cleanly into Assembly.

Build that—not a generic asset browser, not another planning document, and not a worse Figma.
