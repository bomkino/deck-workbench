# Workbench → InDesign → Photoshop → Figma

Use **Build**, **Refresh**, then **Export**. Each tool asks for folders; there is no code to edit.

This guide matches **InDesign production helper 1.2.1**. Native Build and save/reopen were verified in both slide sizes on 15 September 2026, including headline styles and the two-column Contents leaders. Returned-PSD Refresh was also verified.

To install the InDesign tools, open **Window → Utilities → Scripts**, right-click **User**, then choose **Reveal in Finder**. Copy the complete `Automation/InDesign` folder there, keeping its `.jsxinc` files beside the scripts. Photoshop uses **File → Scripts → Browse…**.

## 1. Build your deck

In Workbench, open **Export designer handoff**. Include **Production / PSD · numbered Photoshop slides**; this also includes the production writing. Choose **All included**, **Current slide**, or **Choose slides**. Keep **Copy.md** and **Prototype.pdf** as writing and visual companions. Export creates a new handoff folder with **Production** inside it.

1. Open the unused **one-page InDesign starter** for the size you want: 2576 × 1080 or 1920 × 1080.
2. Open **Window → Utilities → Scripts → User**.
3. Double-click **Build Deck from Workbench.jsx**.
4. Choose **Production → workbench.md** from the Workbench handoff. Keep its neighbouring manifest and PSD folder together.
5. Choose where the new project should live. Enter a new project folder name. Click **Build**.

**You should see:** your saved `Deck.indd`, with one page per Workbench slide and the copy already placed. The matching numbered PSDs are in `Links/PSD`.

If the Workbench export includes PSDs, Build uses those pictures. It checks their hashes, dimensions, slide identities and Background/Character layers before creating the project. If the manifest deliberately contains no PSDs, Build makes the usual blank starter PSDs. A mixture of present and missing PSDs is refused; it never quietly replaces missing exported artwork with blanks.

The progress window starts with these checks. Build uses this Mac's built-in SHA-256 tool to verify both the source files and their project copies. **Cancel** stops before the next step. No unchecked copy is accepted.

For an older standalone `workbench.md`, the blank-PSD workflow still works. **Copy.md is the complete human-readable writing companion; it is not the production importer file.**

The starter you opened stays untouched. The selected starter determines the output size; the tool does not stretch the other template. Use a cinemascope or widescreen Workbench export. Reused PSDs must match the selected starter. Copy without PSDs can build a separate project in the other size; review its text fit.

**Light and dark can sit together.** When a production slide explicitly chooses Light or Dark, Build applies that slide's L-Light or D-Dark parent and matching Head/Sub/Body ink. Your starter's local font and size choices remain. Older files without an appearance choice keep the selected starter's appearance.

The project looks like this:

```text
Your Project/
  Deck.indd
  workbench.md
  deck-production.json
  source-workbench-production.json   # when using a production bundle
  Links/
    PSD/
      Slide 01.psd
      Slide 02.psd
      ...
  Workbench-Backups/
```

**Review any overflow pages listed in the result.** All writing is retained, including overset text. Make the frame larger, recompose the slide or use Deck Size Controls. The tool does not silently shorten writing or shrink fonts. Intentionally blank fields stay blank; unreviewed fields use `-` as an editing reminder.

Workbench can hold extra body, caption and credit fields. The three-slot production import combines those into Body with paragraph breaks between fields. Export warnings describe the mapping. **Copy.md and the production manifest retain the original fields, exact text, IDs and order.** Notes remain separate. No original deck or writing file is changed. If a field contains only whitespace, production Markdown reports that it cannot represent it; the full-copy companion still retains it.

Single source line breaks remain forced line breaks; paired line breaks become paragraph returns. Check justified paragraphs after import: forced line breaks can spread words widely. The importer preserves your words and styles rather than adjusting the copy to fit.

Build once, before making further InDesign layout changes. To start again, use the unused starter and a new project folder name. Building over an existing folder is refused.

### When your Workbench deck includes Contents

Add or move a **Contents** slide in Workbench, then export the production bundle. Build recognises that slide from the manifest and formats it automatically:

- One full-width title, followed by two balanced columns on the same slide.
- The existing **Contents - Two columns** object style: 216 px centre gap at 2576, 161 px at 1920.
- **TOC - Title**, **TOC - Entry** and **TOC - Page number** styles, with the matching light variants where needed.
- Native right-indent tabs create the dotted leaders. Long titles may wrap; the page numbers stay at the right edge. The dots are formatting, not typed periods.

Entries use the exact included and selected export order. A Contents slide may be anywhere; multiple Contents slides are excluded from the entry list but still count as pages. Extra captions or credits stay as separate copy around the list. Build refuses stale or mismatched contents instead of guessing new numbers.

**This imported list is a frozen Workbench index.** It is editable InDesign text, but **Layout → Update Table of Contents** does not regenerate it, and Build does not add native TOC hyperlinks or bookmarks. If you reorder in Workbench, export and build a fresh project. If you want InDesign to own later numbering, follow the generated-TOC steps in [Start Here - InDesign](<Start Here - InDesign.md>) and replace this frozen list with a native TOC.

To edit its look, use **Paragraph Styles → Contents** and **Object Styles → Deck - Reusable Frames → Contents - Two columns**. Change the **Leader** in TOC - Entry's Tabs settings to alter the dots. If you see a red plus, keep all copy and thread a continuation frame; do not shrink the entire deck to force it to fit. Native rendering and final PDF fit still need a visual check after your fonts or copy change.

## 2. Five simple InDesign layers

This is the front-to-back order in **Window → Layers**:

| Layer | Put this here |
| --- | --- |
| **TEXT** | Copy, headings and page numbers |
| **PSD - CHARACTERS** | The cut-out subject from each PSD |
| **GRADIENT** | Any optional shading you add behind the subject and text |
| **PSD - BACKGROUNDS** | The complete background image from each PSD |
| **Solid Background** | The dark or light base colour |

These are flat layers. Expanding a layer shows its objects; those disclosure triangles are normal InDesign controls.

The image layers are locked after building so you can edit text easily. Unlock a layer using its lock column if you need to move or crop an image. If you want a subject to cover part of a title, drag **PSD - CHARACTERS** above **TEXT**. Refresh preserves your layer order and image positions.

Guides and numbered editing aids live with the text layer. They are locked and do not print. Press **W** with the Selection tool active to switch between Normal and Preview. The folio still prints. Use D-Dark or L-Light to choose a page's base colour.

Each slide links to **one PSD twice**. InDesign shows only `00.Background` in the background placement and only `01.Character` in the character placement. Both placements reference the same numbered file; no duplicate PSD is needed for the second placement.

## 3. Give the PSDs to your image editor

Send the numbered files from **Links/PSD**. She needs Photoshop; she does not need your InDesign document for this step.

For each slide:

1. Open its PSD.
2. Double-click the thumbnail of **00.Background** to open the Smart Object.
3. Place the image inside. Expand or finish the background as needed. Keep this inner canvas at the slide's original size.
4. Save the Smart Object, then close that inner tab.
5. Back in the main PSD, select **01.Character**. Use **Remove Background**, then refine its mask.
6. Save the main PSD and close it.

**You should see:** the full scene on Background and a masked subject on Character. Both Smart Objects share the image inside that one PSD. The cut-out mask belongs to the outer Character layer; do not erase the shared background inside the Smart Object.

Keep these unchanged:

- Filenames: `Slide 01.psd`, `Slide 02.psd`, etc.
- Canvas size: 2576 × 1080 or 1920 × 1080.
- The two top-level Smart Object names: `00.Background` and `01.Character`.
- Layered, 8-bit RGB PSD format, with embedded artwork.

Keep both outer layers visible when saving. Each exported role will use its saved mask and artwork. The exporter does not perform Remove Background for you.

## 4. Bring finished PSDs back

**Easiest route: let Refresh replace the files.**

1. Save her returned PSDs in a separate folder. Finish copying/downloading them first.
2. Open your generated `Deck.indd`. Save and close the project PSDs in Photoshop.
3. Run **Scripts → User → Refresh PSD Links.jsx**.
4. Choose **Bring in a returned PSD folder**. Click **Continue** and choose her folder.

**You should see:** the finished pictures on the correct pages, with your text unchanged. The tool saves the deck.

Refresh first checks dimensions and layer names. It backs up the open InDesign document and the PSDs it will replace, installs the returned files into the existing `Links/PSD` folder, then refreshes both placements. It reapplies Character/Background visibility by layer name, so changed internal Photoshop layer IDs do not confuse it.

Backups live in **Backups → PSD Refresh [date and time]**. `Previous PSDs` holds the replaced files; `Incoming` holds the returned copies used for that refresh. Keep the backup until you are happy with the result.

You can return just a few finished slides. The other linked PSDs stay in place. Unknown names or the wrong canvas size stop the operation before project PSDs are replaced.

### If you already replaced the files yourself

Keep the same filenames in the same `Links/PSD` folder. Run **Refresh PSD Links** and choose **Refresh files already in this project**.

It refreshes the links and reapplies their layer visibility. It can back up the current document, but cannot recover PSD versions you already overwrote yourself. Use the returned-folder route when you want automatic PSD backups.

### If you move the project folder

Move the whole project together, including **Deck.indd** and **Links/PSD**. Open the deck and run Refresh. It uses the project folder beside the open INDD, so a different computer or drive letter does not require relinking every slide manually.

Keep the PSD filenames stable after reordering pages. They identify artwork, while InDesign's page numbers follow the current page order. A duplicated page intentionally shares its original PSD until you assign it separate artwork. To change the Workbench slide count, build a fresh project or add new artwork deliberately.

Production exports also record each Workbench slide’s stable ID separately from its export number. Build keeps that ID on the InDesign page and in `deck-production.json`; duplicate titles and changed page order do not become guessed identity matches.

## 5. Export the pictures for Figma

1. Save and close all numbered slide PSDs in Photoshop.
2. In Photoshop, choose **File → Scripts → Browse…**.
3. Select **Automation/Photoshop/Export Slide PNGs.jsx** in this Starter File folder.
4. Choose the folder of finished numbered PSDs.
5. Choose a fresh, empty output folder.

**You should see:** two PNGs per PSD:

```text
Slide 01-background.png
Slide 01-character.png
Slide 02-background.png
Slide 02-character.png
```

Every PNG keeps the full slide canvas. The character file is transparent outside its saved cut-out; a background that fills the canvas is naturally opaque. Neither export is trimmed, stretched or downsampled.

The exporter processes one PSD at a time and closes it without saving. It refuses open same-named slide documents and existing export filenames. The report says **COMPLETE** only when the full batch finishes. Check the cut-outs visually before delivery.

In Figma, place both PNGs at the slide's full width and height, starting at **X = 0, Y = 0**. Put background below the text and character above or below the text as desired. Use your existing Workbench importer for the writing. This exporter does not upload or insert the PNGs into Figma.

## Photoshop guides and numbers

Both PSD sizes have the same **24 × 12** grid as their InDesign counterpart, including inside `00.Background`.

- **Command-;** toggles native guides.
- For numbered labels, open **Window → Paths** and click **GRID NUMBERS - nonprinting**.
- **Command-H** toggles Extras, including the selected number path and guides. If Photoshop asks, choose **Hide Extras**.

The numbers are an editing path, not artwork. Never fill or stroke that path. Native guides and the unstroked number path do not appear in exported images.

## If a tool stops

| Message or situation | Next action |
| --- | --- |
| Project folder already exists | Choose a different project name. The tool never builds over your existing deck. |
| Missing or substituted font | Resolve the fonts in the unused starter, then build again. |
| Copy or PSD changed after production export | Export a fresh Production bundle. Keep the original handoff intact. |
| Production PSDs cover only some slides | Export every production PSD, or export production copy with no PSDs. Mixed coverage is refused. |
| Text overflow | Open the listed pages and adjust their text frames or size presets. |
| Unknown returned PSD name | Restore the original `Slide 01.psd` filename. |
| Wrong dimensions or missing role layer | Fix that PSD copy in Photoshop, save it and rerun Refresh. |
| Open same-named PSD during PNG export | Save and close that document, even if it is from another folder. |
| Partial PNG batch | Keep it separate. Rerun into a fresh output folder. |
| A build folder contains only `Deck - BUILDING.indd` | That build is incomplete. Read its message; correct the cause and build into a new folder. |

For fonts, colours, size controls and your two-column contents page, use [Start Here - InDesign](<Start Here - InDesign.md>).
