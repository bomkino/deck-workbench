# Deck Workbench

A native Mac tool for turning final writing and a pile of references into a clear prototype and designer handoff. It helps communicate intent; it does not replace the designer.

## v0.5.0 — a new workspace, PSD copy guides and in-app updates

This guide covers v0.5.0; the [release notes](docs/RELEASE_NOTES.md) list what changed. Find published builds and their verification receipts in [Mac releases](https://github.com/bomkino/deck-workbench/releases). Requires **Apple Silicon and macOS 26+**. Ad-hoc signed; not notarized.

1. Choose the release's **.app.zip**, not GitHub's automatic source archive. Quit the old Workbench and unzip it.
2. Drag **Deck Workbench.app** into **Applications**, replacing the old app.
3. Open it. Keep an untouched copy of existing decks before migration. From v0.5.0 onward, later versions arrive through **Deck Workbench › Check for Updates…** instead.

If macOS blocks the first launch, open **System Settings → Privacy & Security → Open Anyway** after attempting to open the app. Do not disable Gatekeeper globally. A malware warning is different: do not override it.

## Work

1. **Import or paste final copy** (or drop the file on the window). Review the slide boundaries, then create the deck. Workbench Markdown v1 and ordinary Markdown/text are supported.
2. **Curate images.** Add (or drop) a media folder, shortlist references and choose each slide's artwork. Original files stay untouched. The sidebar marks slides that still need an image and counts the ready ones.
3. **Arrange the deck.** Use **Slide → Add Contents / Index** or **Add Moodboard…**. Moodboards accept up to 12 images. **Duplicate Slide** reuses a layout; **Move to Position…** puts any slide where you want it. Contents follows the included slide names and order automatically.
4. **Assemble.** Use the numbered 24-column/12-row grid and **Type & colours…**. Choose a neutral base, main accent and optional extra accents from 31 colour families; set **Dark/Light** separately on each slide. Drag images to crop; Command-drag moves their frames. Contents uses two columns with dotted leaders.
5. **Export designer handoff** with Command-Shift-E. Choose the slides and components. A full selection produces:

```text
Prototype.pdf
Prototype with notes.pdf
Copy.md
Production/
  workbench.md
  workbench-production.json
  PSD/Slide 01.psd, Slide 02.psd, …
Approved Media/<slide>/original files
Shortlisted Media/<slide>/original files
Media index.csv
Starter Kit/          (with production writing or PSDs)
START HERE.txt        (with production writing or PSDs)
InDesign/Deck.indd    (when built automatically)
Export issues.txt     (when something needs review)
```

New decks default to **2576 × 1080**; **1920 × 1080** has its own exact starter grid. Head, Sub and Body fonts and size/leading steps are editable. Fit Copy is optional; review any overflow before handoff. Choosing an image also shortlists it; removing one keeps the other.

`Production/workbench.md` supplies the three writing roles for the existing InDesign/Figma import workflow. Its manifest records source fields, slide order, projection warnings and output hashes. PSDs retain full editable images and default to Workbench framing with editable masks; a full-image option disables those masks: `00.Background` and `01.Character` share one embedded artwork source. Optional automatic InDesign building creates `InDesign/Deck.indd` with styled copy and linked PSDs. Both starters, layout kits and production scripts—including the Figma PNG exporter—travel in `Starter Kit`. Text layout, gradients and character cut-outs still need design work; the PDF remains the visual guide. See [production workflow and limits](docs/MAC_APP.md#export).

**Help → Keyboard Shortcuts**, **Command-/** or **?** opens the reference. Curate: arrows browse, Space opens/closes preview, S shortlists, Shift-S removes shortlist membership, M chooses, X rejects, C compares, [ and ] switch slides (Option-[ / ] on layouts that need it). Commands pause while editing text; a focused slide list keeps its own arrow keys. Command-F switches to Curate and focuses search. Command-1 / Command-2 switch Curate / Assemble, Command-0 fits the canvas, Command-Option-I shows or hides the context panel and Command-Shift-R reveals focused media in Finder. Command-N imports final copy, Command-Shift-V pastes it and Command-O opens a deck. Command-J goes to the next slide that still needs an image. Command-Shift-E exports. Double-click (or Return on) a slide to edit its copy; double-click an image to preview it.

**Change a slide:** use **Layout** or **Edit Copy** above the work area. **Add a slide:** use **Add Slide** at the bottom of the sidebar. Right-click a slide or open the **Slide** menu to duplicate, rename, move or delete it. Delete confirms first and Undo restores the full slide; original media stays untouched.

Shortcuts: **Command-Shift-N** adds a slide, **Command-D** duplicates it, **Command-E** edits copy, **Command-Option-Up/Down** moves it, and **Command-Shift-Delete** asks to delete it. A heading-only import can now gain body/subheadline fields in Edit Copy.

**Review deck** / Command-Shift-P hides editing panels. Arrows or Space browse, N shows the slide's designer notes beside it, Escape returns. Reset Placement and Apply Arrangement preserve copy and image crops. Each completed drag is one undoable edit; Escape cancels it.

## Existing decks

New packages use **schema 3**, which older Workbench versions reject. Opening an older deck alone does not upgrade it. Before saving starter features or explicit copy-field states, Workbench verifies pre-upgrade recovery data inside the package, then upgrades the working copy. Keep an untouched duplicate when you need to reopen it in an older app; Undo does not downgrade the package. Legacy layouts remain preserved until explicit conversion, without a pixel-perfect fidelity guarantee.

## Build and maintain

On an Apple-Silicon Mac with Xcode command-line tools and Node.js 24+:

```sh
npm run build
npm test
npm run verify:package
```

Build produces an ad-hoc-signed `.app.zip` and SHA-256 file under `artifacts/`. The package journey runs the actual extracted app with synthetic decks and handoff cases. It does not establish every interactive, accessibility or performance property. Check the receipt associated with the exact release commit.

Normal CI builds artifacts; a release is published only by running the release workflow on `main` for an explicit version tag. Installed copies from the first release with updates onward offer newer versions themselves (**Deck Workbench › Check for Updates…**); each update is checked against pitch.dog's signing key before it installs. See [Updates](docs/UPDATES.md). No Electron installation, browser build, account, cloud service, model or telemetry is required.

[Workflow](docs/MAC_APP.md) · [Updates](docs/UPDATES.md) · [Limitations](docs/KNOWN_LIMITATIONS.md) · [Architecture](docs/NATIVE_ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [Documentation index](docs/README.md)

AGPL-3.0. See LICENSE, NOTICE and THIRD_PARTY.md. The existing FontBlind v13.0.0 binary pin and notices are retained. Historical product/ticket documents are evidence, not current instructions.
