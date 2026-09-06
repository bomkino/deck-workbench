# Deck Workbench

A native Mac tool for turning final writing and a pile of references into a clear prototype and designer handoff. It helps communicate intent; it does not replace the designer.

## v0.1.3 — workflow polish and dependable layouts

[Download the Mac app](https://github.com/bomkino/deck-workbench/releases/latest). Choose the **.app.zip** asset, not GitHub's automatic source archive. Requires **Apple Silicon and macOS 26+**. Ad-hoc signed; not notarized.

1. Quit the old Workbench. Unzip the download.
2. Drag **Deck Workbench.app** into **Applications**, replacing the old app.
3. Open it. Keep an untouched copy of existing decks before migration.

If macOS blocks the first launch, open **System Settings → Privacy & Security → Open Anyway** after attempting to open the app. Do not disable Gatekeeper globally. A malware warning is different: do not override it.

## Work

Import or paste final copy. Curate images per slide. Suggest text placement, crops and gradients in Assemble. Export a handoff the designer can use without Workbench:

```text
Prototype.pdf
Prototype with notes.pdf
Copy.md
Approved Media/<slide>/original files
Shortlisted Media/<slide>/original files
Media index.csv
```

New prototypes default to **2576 × 1080**, the studio grid and readable provisional text. Copy remains separate from presentation. Shortlist membership is independent of the chosen image. Creative warnings do not veto export; unresolved saving errors are not silently ignored.

**Help → Keyboard Shortcuts** or **Command-/** opens the reference. Curate: arrows browse, Space opens/closes preview, S shortlists, Shift-S removes shortlist membership, M chooses, X rejects, [ and ] switch slides. Commands pause while editing text. Command-F focuses search. Command-Shift-E exports.

**Change a slide:** use **Layout** or **Edit Copy** above the work area. **Add a slide:** use **Add Slide** at the bottom of the sidebar. Right-click a slide or open the **Slide** menu to duplicate, rename, move or delete it. Delete confirms first and Undo restores the full slide; original media stays untouched.

Shortcuts: **Command-Shift-N** adds a slide, **Command-D** duplicates it, **Command-E** edits copy, **Command-Option-Up/Down** moves it, and **Command-Shift-Delete** asks to delete it. A heading-only import can now gain body/subheadline fields in Edit Copy.

v0.1.2 restores direct slide management and a captured-target copy editor. Layout changes are visible in both workspaces; Reset Placement and Apply Arrangement preserve copy/candidates while making repeated studio layouts quick. Custom frames now copy correctly, invisible text cannot intercept image-only editing, and text/gradient redraw work is reduced. It retains v0.1.1's curation, layout, export and cache repairs. See the release notes for exact scope and verification evidence.

## Existing decks

A first native edit upgrades the working package's reader schema. **v0.0.6 cannot reopen the upgraded copy.** v0.1.0 and v0.1.1 native decks keep the same reader schema in v0.1.2. An inherited legacy layout is preserved until you explicitly convert it; conversion is undoable, but not a promise of pixel-perfect legacy fidelity. Original media is copied, never edited.

## Build and maintain

On an Apple-Silicon Mac with Xcode command-line tools and Node.js 24+:

```sh
npm run build
npm test
npm run verify:package
```

Build produces an ad-hoc-signed `.app.zip` and SHA-256 file under `artifacts/`. The package journey runs the actual extracted app with a synthetic 20-slide handoff. It does not establish every interactive, accessibility or performance property. Check the receipt associated with the exact release commit.

Normal CI builds artifacts; only an explicit version tag publishes a release. No Electron installation, browser build, account, cloud service, model or telemetry is required.

[Workflow](docs/MAC_APP.md) · [Limitations](docs/KNOWN_LIMITATIONS.md) · [Architecture](docs/NATIVE_ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [Documentation index](docs/README.md)

AGPL-3.0. See LICENSE, NOTICE and THIRD_PARTY.md. Historical product/ticket documents are evidence, not current instructions.

## Finishing the working loop

v0.1.3 adds **Review deck** (Command-Shift-P; arrows/Space browse; Escape returns to editing), **Crop zoom** and centering, and removable optional copy fields. Document creation/open/close and replacement import retain their targets and drafts. File imports run off the UI thread with a bounded read. The media list refreshes only when its catalogue changes. Native controls reflow in narrower windows.

The exact release receipt separates exercised behavior from unmeasured studio-scale performance. This release keeps the existing native document schema and the full slide-editing/layout controls from v0.1.2.
