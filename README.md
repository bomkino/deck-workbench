# Deck Workbench

A native Mac tool for turning final writing and a pile of references into a clear prototype and designer handoff. It helps communicate intent; it does not replace the designer.

## Deck Workbench 1.0

This guide covers v1.0.0; the [release notes](docs/RELEASE_NOTES.md) list what changed. Find published builds and their verification receipts in [Mac releases](https://github.com/bomkino/deck-workbench/releases). Requires **Apple Silicon and macOS 26+**. Ad-hoc signed; not notarized.

Copies from v0.5.0 onward update themselves through **Deck Workbench › Check for Updates…** ([Updates](docs/UPDATES.md)). To install, or to replace v0.4.0 or earlier:

1. Choose the release's **.app.zip**, not GitHub's automatic source archive. Quit the old Workbench and unzip it.
2. Drag **Deck Workbench.app** into **Applications**, replacing the old app.
3. Open it. Keep an untouched copy of existing decks before migration.

The app isn't notarized, so the first time you open it macOS says it could not verify it is free of malware. Click **Done**, open **System Settings → Privacy & Security**, click **Open Anyway** beside Deck Workbench and confirm. If macOS ever says the app will damage your computer, delete it.

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

New decks default to **2576 × 1080**; **1920 × 1080** has its own exact starter grid. Head, Sub and Body fonts and size/leading steps are editable. **Fit copy within readable limits** is optional; review any overflow before handoff. Choosing an image also shortlists it; removing one keeps the other.

`Production/workbench.md` supplies the three writing roles for the existing InDesign/Figma import workflow. Its manifest records source fields, slide order, projection warnings and output hashes. PSDs retain full editable images and default to Workbench framing with editable masks; a full-image option disables those masks: `00.Background` and `01.Character` share one embedded artwork source. Optional automatic InDesign building creates `InDesign/Deck.indd` with styled copy and linked PSDs. Both starters, layout kits and production scripts—including the Figma PNG exporter—travel in `Starter Kit`. Text layout, gradients and character cut-outs still need design work; the PDF remains the visual guide. See [production workflow and limits](docs/MAC_APP.md#export).

**Change a slide:** use **Layout** or **Edit Copy** above the work area. **Add a slide:** use **Add Slide** at the bottom of the sidebar. Right-click a slide or open the **Slide** menu to duplicate, rename, move or delete it. Delete confirms first and Undo restores the full slide; original media stays untouched. A heading-only import can gain body/subheadline fields in Edit Copy.

**Review deck** hides the editing panels; Escape returns. **Reset placement** and **Apply arrangement…** keep copy and image crops. Each completed drag is one undoable edit; Escape cancels it.

## Keyboard shortcuts

**Help → Keyboard Shortcuts**, Command-/ or ? opens the same reference in the app. Single-key commands pause while you type copy, notes or search text, and a focused slide list keeps its own arrow keys.

| Keys | What it does | Where |
|---|---|---|
| ← → / ↑ ↓ | Previous / next image; previous / next grid row | Curate |
| Space | Open or close the image preview | Curate |
| Return, or double-click | Preview the focused image | Curate |
| S | Add the image to this slide's shortlist | Curate |
| Shift-S | Remove it from the shortlist; a chosen assignment stays | Curate |
| M | Choose it for the selected image slot | Curate |
| X | Reject it for this slide; unassigns it if chosen | Curate |
| Shift-X | Restore a rejected image | Curate |
| C | Add the image to the comparison, or take it out (up to three) | Curate |
| Shift-C | Open Compare | Curate |
| ← → · M · S / Shift-S · 1–3 · Escape | Select · choose · shortlist / remove from it · choose that candidate · close | Compare |
| [ / ] | Previous / next slide (Option-[ / ] on layouts that type them with Option) | Anywhere |
| Return, or double-click | Edit the slide's copy | Slide list |
| Arrows, Shift-arrows | Nudge the selected text, frame or gradient; Shift moves ten units | Assemble |
| Command-drag · Option-drag · Space-drag | Move an image frame · bypass snapping · pan the canvas | Assemble |
| Escape | Cancel a drag, close a preview or leave Review deck | Anywhere |
| ← ↑ / → ↓, Page Up / Page Down | Previous / next slide | Review deck |
| Space / Shift-Space, Home / End | Next / previous slide; first / last slide | Review deck |
| N | Show or hide the slide's designer notes | Review deck |
| ⌘N · ⇧⌘V · ⌘O | Import final copy · paste final copy · open a deck | File |
| ⌘S | Save the deck, including notes you are still typing | File |
| ⇧⌘E | Export designer handoff | File |
| ⌘Z / ⇧⌘Z | Undo / redo | Edit |
| ⌘, | Settings | Deck Workbench |
| ⇧⌘N · ⌘D · ⌘E | Add a slide · duplicate it · edit its copy | Slide |
| ⌘J | Go to the next slide that still needs an image | Slide |
| ⌥⌘↑ / ⌥⌘↓ | Move the slide earlier / later | Slide |
| ⇧⌘Delete | Delete the slide (asks first) | Slide |
| ⌘1 / ⌘2 | Curate / Assemble | Workbench |
| ⌘F | Switch to Curate and search media | Workbench |
| ⌘0 · ⌥⌘I | Fit the canvas · show or hide the context panel | Workbench |
| ⇧⌘P | Review deck | Workbench |
| ⇧⌘R | Reveal the focused media in Finder | Workbench |
| ⌘/ | Keyboard Shortcuts | Help |

## Where your work lives

- A deck is one `.pitchdeck` package, saved where you choose when you create it.
- Every decision is saved as you work. Command-S also saves notes you are still typing.
- Media stays in its own folders, untouched. Workbench reads the originals and copies them only into a handoff.
- Folder access is remembered in `~/Library/Application Support/Deck Workbench/` (`media-grants.json`).
- If a deck won't open, use **File → Recover Saved Copy…**. It makes a separate working copy and leaves the original as it is.
- Decks from older versions: [Recovery](docs/MAC_APP.md#recovery) explains when Workbench upgrades a deck and how to keep a copy an older version can open.
- To uninstall, delete the app and that folder. Settings are in `~/Library/Preferences/dog.pitch.deck-workbench.plist`.

## Build and maintain

Needs an Apple-Silicon Mac on macOS 26 with Xcode (the macOS 26 SDK and command-line tools) and Node.js 24+.

```sh
npm run build            # the app, its .app.zip and .sha256 under artifacts/
npm test                 # document-kernel tests
npm run verify:package   # the extracted app's package journey and its receipt
```

Build produces an ad-hoc-signed `.app.zip` and SHA-256 file under `artifacts/`. It refuses uncommitted or untracked sources, because the app is labelled with its exact commit. The package journey runs the actual extracted app with synthetic decks and handoff cases. It does not establish every interactive, accessibility or performance property. Check the receipt associated with the exact release commit.

**Native Mac build** (`.github/workflows/mac-native.yml`) runs on pushes to `main` and `codex/` branches and on pull requests to `main`, in this order:

1. `npm test`
2. `npm run verify:indesign`: the InDesign builder's bundle validators (`tests/verify-indesign-bundle.mjs`)
3. `npm run build`
4. `npm run verify:package`
5. the UI gallery, `"build/native/Deck Workbench.app/Contents/MacOS/DeckWorkbench" --native-ui-gallery "$PWD/artifacts/ui"`, which captures every main screen and sheet for visual review
6. `npm run test:update`: `scripts/test-update.sh` installs a signed update from a local feed and refuses a tampered one

Normal CI builds artifacts; a release is published only by running the release workflow by hand on `main`, and becomes Latest only after a copy of the current Latest release has updated itself to it. Installed copies from v0.5.0 onward offer newer versions themselves; each update is checked against pitch.dog's signing key before it installs. See [Updates](docs/UPDATES.md). No Electron installation, browser build, account, cloud service, model or telemetry is required.

[Workflow](docs/MAC_APP.md) · [Updates](docs/UPDATES.md) · [Limitations](docs/KNOWN_LIMITATIONS.md) · [Architecture](docs/NATIVE_ARCHITECTURE.md) · [Release notes](docs/RELEASE_NOTES.md) · [Documentation index](docs/README.md)

AGPL-3.0. See LICENSE, NOTICE and THIRD_PARTY.md; **About Deck Workbench** shows the NOTICE too. The existing FontBlind v13.0.0 binary pin and notices are retained. Historical product/ticket documents are evidence, not current instructions.
