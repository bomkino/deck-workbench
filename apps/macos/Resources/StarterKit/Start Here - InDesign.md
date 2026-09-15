# Your pitch.dog starter

**v0.03 — polished and checked in InDesign 2026, 14 September 2026.**

Start a new deck from the **one-page INDD**. For the automatic Workbench + numbered PSD workflow, use [Start Here - Deck Production](<Start Here - Deck Production.md>). Keep the **ten-page Layout Kit** nearby for examples. Use **Deck Size Controls** when the writing needs to grow or shrink.

Pick the section you need. You do not need to learn everything before starting a deck.

## Start a project

1. In Finder, copy the **one-page INDD for your canvas** into your project folder. Choose from the table below.
2. Rename that copy for the project.
3. Open the copy in InDesign.

**You should see:** one page with `Head.`, `Sub.` and `Body.` in one text frame.

| Canvas | Start a project | Borrow layouts |
| --- | --- | --- |
| 2576 × 1080 cinemascope | [2576 starter](<[Starter File] [Pitch Deck] 2576x1080 v0.03 [pitch.dog].indd>) | [2576 layout kit](<Layout Kit v0.03.indd>) |
| 1920 × 1080 widescreen | [1920 starter](<1920x1080/[Starter File] [Pitch Deck] 1920x1080 v0.03 [pitch.dog].indd>) | [1920 layout kit](<1920x1080/Layout Kit 1920x1080 v0.03.indd>) |

Use the **matching Layout Kit** as your separate layout reference. Its ten pages demonstrate the styles, contents page, light slide and palette. The Workbench importer needs the one-page file. The 1920 files live together in the **1920x1080** folder.

**INDD is your working file.** The Archive folder holds earlier builds, crash-recovery copies and IDML interchange exports. You do not need those for everyday work. The original v0.01 is preserved in `Archive/Earlier Builds/`; only current starter files remain in the working folders.

Both versions use your **24 × 12** grid.

| Setting | 2576 × 1080 | 1920 × 1080 |
| --- | ---: | ---: |
| Left/right margins | 96 px | 72 px |
| Top/bottom margins | 64 px | 64 px |
| Column gutters | 16 px | 12 px |
| Row gutters | 8 px | 8 px |
| Individual cell | 84 × 72 px | 62.5 × 72 px |

The 1920 version keeps the same fonts, size presets and vertical rhythm. Its dark and light parents have rebuilt guides, numbered grid labels, full-page backgrounds and a folio in the bottom-right margin. Keep the **62.5 px** column width; rounding it causes drift.

To see the grid and numbered labels, choose **View → Screen Mode → Normal**. With the Selection tool active, **W** switches between Normal and Preview. The numbered labels are locked, nonprinting objects on **TEXT**; they do not appear in exported PDFs. To edit the parents, double-click **D-Dark** or **L-Light** in the Pages panel.

The five flat layers, front to back, are **TEXT → PSD - CHARACTERS → GRADIENT → PSD - BACKGROUNDS → Solid Background**. Text and folios live on TEXT. The two PSD layers hold the separate image placements. GRADIENT is ready for optional shading. Solid Background holds the dark/light parent fill. Expanding a layer shows its individual objects; no extra groups are required.

## Bring in your Workbench copy

For copy **and** numbered PSDs, run **Build Deck from Workbench.jsx** from Scripts → User; follow [Deck Production](<Start Here - Deck Production.md>). The steps below are your older copy-only importer. Both use the one-page starter.

1. Put `workbench.md` and your existing `Workbench to InDesign.jsx` beside the saved project INDD.
2. Open **Window → Utilities → Scripts → User**.
3. Run your Workbench importer.
4. Read its result. Review any pages it reports as overset.
5. Save the populated deck.

**You should see:** one slide for each Workbench slide, with your copy in the original frame.

Run the importer before adding layouts or a contents page. It needs the original one-page `Head. / Sub. / Body.` setup. Your importer makes a dated backup and leaves the populated document unsaved for review.

If your Markdown includes a `Canvas:` line, use `widescreen-1920x1080` for the 1920 starter or `cinemascope-2576x1080` for the 2576 starter.

If the importer is missing from Scripts → User, copy `Workbench to InDesign.jsx` into that installation's User Scripts folder. Your existing **Import Workbench.jsx** shortcut was installed in InDesign Beta; the regular InDesign installation has a separate folder.

## Choose your fonts

You choose the fonts and weights yourself in InDesign.

1. Open **Window → Styles → Paragraph Styles**.
2. Open **pitch.dog - typography system → Base - Edit**.
3. Double-click **Base - Head**.
4. Choose **Basic Character Formats**. Pick your font family and style. Click **OK**.
5. Repeat for **Base - Sub** and **Base - Body**.

**You should see:** related paragraph styles use your chosen families.

**Base - Page Number** controls the folio font. The contents list's numbers have their own **Character Style → TOC - Page number**. **Base - Screenplay** is separate. Check Bold, Italic and Bold Italic character styles after changing families: different fonts use different names for their weights.

## Make the writing larger or smaller

1. Open **Window → Utilities → Scripts → User**.
2. Double-click **Deck Size Controls.jsx**.
3. Click **Smaller** or **Larger** beside Head, Sub or Body. You can also pick a specific preset.
4. Read the proposed size/line-spacing pairs at the bottom of the dialog, such as `32/48 > 40/64`.
5. Click **Apply**.
6. Review the pages. Save when they look right.

**You should see:** size and line spacing change together. Font families, weights and colours stay as you set them.

Example: Body `000 (32)` → `+01 (40)` changes body text from 32/48 to 40/64. **All one step smaller/larger** moves all three roles by one step in their own scales.

To reverse the last control change, use **Edit → Undo Change deck size presets**.

The helper reports overflowing text inside groups too. If a size preset would change your font, weight, colour or tint, it stops and restores the previous settings.

Bullets, numbered lists and justified body text follow **Project | Body**, including its line spacing. Caption, Reading and Compact styles have their own deliberate sizes. Local overrides on individual text stay in place.

### The same change without the helper

Double-click **Project | Body**, choose **General**, and change **Based On** to a different preset in the **Body** group. Use the matching **Head** or **Sub** group for those roles.

## Change colours

**Fastest:** run **Deck Colour Controls** from User Scripts. Choose a base plus your Primary and accents, review both dark/light previews, then Apply. One Undo restores the change. Both canvas sizes include the same controls. [Step-by-step colour guide](<Deck Colour Controls - Read me.md>).

Use **Character Styles / Object Styles → Project Colours** for the friendly Primary, Secondary, Accent 3, Accent 4 and Mono roles. Use the matching **Ink on fill** for every coloured shape. The older Pink/Purple/Blue/Teal names below stay as compatibility slots.

Open **Window → Color → Swatches**. Double-click a named swatch to edit its RGB values.

| Swatch | What it controls |
| --- | --- |
| warm-black | Dark parent background; ordinary text on light slides |
| warm-white | Light parent background; ordinary text on dark slides |
| Surface - Raised | Card fill on dark slides |
| Surface - Raised (light) | Card fill on light slides |
| Accent - Pink / Purple / Blue / Teal | Four optional accent families |
| Accent - Mono | Neutral accent option |
| Ink - Muted (on dark / on light) | Supporting text and quieter captions |
| Rule - Divider (on dark / on light) | Solid divider strokes; no tint guesswork |

Every accent has **on dark** and **on light** versions. These labels describe the background behind the accent. Use the matching version.

For coloured text, apply the matching **Character Style**. For an accent-filled shape, use **Object Styles → Surface - Pink/Purple/Blue/Teal/Mono (on dark / on light)**. Edit the shared swatch later to update all uses of that colour.

**Text on an accent fill:** pastel **on dark** fills use **Ink - Dark** text; saturated **on light** fills use **Ink - Light** text. Kit page 07 shows both combinations. The accent name describes where the accent is used, not the ink placed on top of it.

Links have separate dark/light character styles and stay underlined. Muted text uses an explicit RGB swatch. Dividers use their own RGB swatches at 100% tint: tint is not the same as transparency.

The supplied text/solid-surface pairs were calculated at **4.84:1 or better**, including raised cards; divider/surface pairs at **3.49:1 or better**. These values apply to this supplied palette. Recheck contrast after changing colours, adding transparency or placing text over images. [How W3C measures text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

For a monochrome deck, use the **Mono** character styles and swatches for accents. To turn an already coloured project monochrome without restyling every object, set the four **on dark** accent swatches to the Mono-on-dark RGB value, and the four **on light** swatches to Mono-on-light. Keep their names. You can use one accent family, several, or none.

## Make a light slide

1. Open **Window → Pages**.
2. Drag the **L-Light** parent thumbnail from the top of the Pages panel onto the slide's thumbnail below.
3. Apply the matching paragraph styles from **Light Slides** to its text.
4. Use accent colours labelled **on light**, **Hyperlink - Light**, and the light card/divider styles. For opt-in GREP text, choose the preset ending **(light)**.

**You should see:** a light background, dark page number and readable dark text.

**D-Dark** is the dark parent. Parent pages change the background and folio; the paragraph styles control the slide's own text.

The Light Slides group also includes **Reading**, **Compact**, **Eyebrow**, **Quote**, **Bullet**, **Numbered** and **Numbered start** variants. They inherit their matching project styles, so you can adjust the main style once.

## Borrow a layout from the kit

Do this after importing Workbench copy. Borrow layouts from pages **03–08**. For a contents page, follow the separate contents instructions below.

1. Save your project. Open the **matching Layout Kit for your canvas** alongside it briefly.
2. In the kit, open the **Pages** panel menu and choose **Move Pages**.
3. Enter the kit page you want. Choose your project in **Move to** and pick where it should go.
4. Leave **Delete Pages After Moving** unchecked. Click **OK**.
5. Close the kit. Edit the copied page in your project.

**You should see:** an editable copy of that page in your project. Matching styles use your project's settings. Review it after copying. [Adobe's page-transfer guide](https://helpx.adobe.com/ca/indesign/desktop/create-and-organize-pages/arrange-and-order-pages/move-pages.html)

| Kit page | Example |
| --- | --- |
| 02 | Two-column light contents example; generate a fresh list in your project |
| 03 | Section divider |
| 04 | Image beside copy |
| 05 | Full-page image slot with a hidden contents marker |
| 06 | Two-column copy |
| 07 | Colour system: dark/light surfaces, ink, links and five accent options |
| 08 | GREP, character styles, bullets and numbering |
| 09–10 | Short instructions inside the file |

The image areas on 04 and 05 are deliberately empty. Page 05's contents label is hidden; only its folio prints until you add artwork.

Keep page 02 as a reference. Generate each project's contents afresh; this avoids carrying the kit's sample titles into your deck.

### Place, crop or fit an image

1. Choose **View → Screen Mode → Normal**.
2. Use the **Selection tool** (black arrow). Click the image frame near its edge.
3. Choose **File → Place** (`Command-D`). Pick your image and keep **Replace Selected Item** checked. Click **Open**.
4. With the frame selected, open **Window → Styles → Object Styles → Deck - Reusable Frames**.
5. Choose the fitting style you want:

| Style | What you should see |
| --- | --- |
| **Image - Fill and crop** | The frame is filled. Some edges of the image may be cropped. |
| **Image - Fit whole image** | The entire image is visible. Empty space may remain around it. |

Both styles preserve the image's proportions. **Auto-Fit** keeps the chosen behaviour when you resize the frame.

To adjust the crop, drag the circular **Content Grabber** in the image's centre. To move the frame and image together, drag outside that circle with the Selection tool. [Adobe's frame and image guide](https://helpx.adobe.com/indesign/desktop/add-graphics-and-media/manage-frames-and-objects/move-frame-content.html)

Keep the original image files in your project folder. InDesign links to those files. If one is moved later, use **Window → Links → Relink** to reconnect it.

## Your index / contents page

Here, “index page” means the deck's **Table of Contents**. InDesign gathers titles from special paragraph styles and adds their page numbers.

Start with visible titles. The image-only option below is optional.

### A. Choose which titles appear

1. Go to a slide you want listed.
2. Choose the **Type tool** and click inside its title.
3. In **Paragraph Styles → Contents**, apply **TOC - Headline (visible)**.
4. Repeat for the other titles you want listed.

**You should see:** the titles keep the Project Head appearance. They are now marked for the contents list.

On a light slide, use **TOC - Headline (light slide)**. For a smaller, indented contents entry, use **TOC - Subheading (visible)**, or **TOC - Subheading (light slide)** on a light background.

### B. Create the contents page

1. Add a blank page where you want the contents to sit. Apply **D-Dark** or **L-Light** as its parent.
2. Choose **Layout → Table of Contents**.
3. In **TOC Style**, choose **pitch.dog - Deck Contents** for a dark page, or **pitch.dog - Deck Contents - Light** for a light page.
4. Check **Create PDF Bookmarks**, **Make text anchor in source paragraph** and **Remove Forced Line Break**. Under **More Options**, keep **Include Text on Hidden Layers** checked.
5. Click **OK**. Your pointer now carries the generated text.
6. Drag a text frame across the **full inner width**, from the left margin to the right margin.
7. Switch to the **Selection tool**. With that frame selected, choose **Object Styles → Deck - Reusable Frames → Contents - Two columns**.

**You should see:** one heading across the top, then two columns with dotted leaders and two-digit page numbers. Read down the left column, then down the right. InDesign balances the entries between them. This is **one wide page**, not two facing pages.

The contents frame uses 11 grid columns for each side and leaves two grid columns between them: **216 px centre gap at 2576**, **161 px at 1920**. The title spans both columns automatically. Keep the frame inside the 64 px top/bottom margins; each long entry stays together while its title wraps.

If you later resize the frame, the two columns resize together. For a very long contents list, add a continuation page and thread the frame rather than shrinking everything.

### C. Update it after changes

Do this after changing titles, adding entries or moving pages.

1. Choose the **Type tool**.
2. Click inside the generated contents text.
3. Choose **Layout → Update Table of Contents**.
4. Check the result, then save.

**You should see:** current titles and current page numbers.

Edit titles on their original slides. Changes typed directly into the generated list are replaced the next time it updates. The list updates when you run the command; it does not refresh while you type. [Adobe's contents guide](https://helpx.adobe.com/be_en/indesign/using/creating-table-contents.html)

### Optional: list an image-only slide

1. Go to the image-only slide.
2. Choose **View → Screen Mode → Normal**.
3. Open **Window → Layers**. Select **TEXT**.
4. Draw a text frame on the slide. Type the entry you want, such as `Visual world`. Make the frame large enough to show every word; enlarge it if you see a red plus.
5. Apply **TOC - Marker (hidden layer)** to that paragraph. This established paragraph-style name stays the same.
6. Select the frame with the black arrow. Apply **Object Styles → Deck - Reusable Frames → TOC marker - Nonprinting**.
7. Press **W** to preview the slide, then update the contents using section C.

**You should see:** the entry in the contents, with no visible title in Preview or the exported PDF. In Normal view, the marker is available for editing. A separate hidden layer is no longer needed.

Use one source for each entry: a visible title or a nonprinting marker. Using both with the same words produces two entries.

### Those dots

The dots are **tab leaders**. They are generated formatting; you do not need to type a row of periods.

To change their appearance, double-click **TOC - Entry**, open **Tabs**, select the tab stop and edit **Leader**. The preset uses `. ` — a period followed by a space. Use `.` for closer dots, or clear Leader for no dots. **TOC - Subentry** has its own setting.

The right-indent tab keeps the numbers at the frame's right edge and uses the tab stop's leader. [Adobe's tabs guide](https://helpx.adobe.com/lv/indesign/using/tabs-indents.html)

### If something looks wrong

| What you see | What to do |
| --- | --- |
| A title is missing | Check its source paragraph uses a TOC source style; update the list. |
| An image-only entry is missing | Keep its marker on the slide, apply **TOC - Marker (hidden layer)**, and make sure the text fits in its frame. |
| An entry appears twice | Remove the extra source style or duplicate marker, then update. |
| Update Table of Contents is greyed out | Use the Type tool to click inside the generated contents text. |
| A copied kit list still has sample titles | Remove that sample list frame and generate a fresh one using section B. |
| A red plus on the contents frame | The text does not fit. Keep it inside the margins; thread it to a continuation page if both columns are full. |
| The contents is still one column | Select the frame with the Selection tool and apply **Contents - Two columns** in Object Styles. |
| The contents frame grows past the page | Select it; choose **Object → Text Frame Options → Auto-Size → Off**, then resize it inside the guides. Thread to another frame if needed. |
| Page numbers look old | Update the contents after reordering pages. |
| You see 010 instead of 10 | Use **Single Leading Zeros** numbering with an empty section prefix. Do not type a zero before the page-number marker. |

## Bullets and numbered lists

Click inside a paragraph, then choose its style in **Paragraph Styles → pitch.dog - typography system → Project - Specific**.

- **Project | Bullet** adds a bullet and hanging indent.
- **Project | Numbered - Start** begins a list at 1.
- **Project | Numbered** continues the list. Pressing Return after the Start style switches to this style automatically.

Type the words only; the styles supply the bullets and numbers. The examples on kit page 08 are ready to copy.

## Frame and GREP presets

**Object Styles → Deck - Reusable Frames** contains one- and two-column text frames, image fitting/cropping, captions, cards, rules and nonprinting notes. Use **Fill and crop** when cropping is intended; use **Fit whole image** to keep the full image visible.

For **Text - Two columns**, draw the frame across the full width inside your margins. Each reading column uses eleven grid columns, with a generous centre gap: 216 px in cinemascope or 161 px in 1920. This keeps neighbouring lines from running into each other visually. The underlying grid gutters remain 16 px and 12 px respectively.

**Paragraph Styles → GREP - Opt In** contains units/ratios, project keywords and draft-tag presets. Ordinary Project Body has no automatic keyword styling. To change a rule, double-click its paragraph style and choose **GREP Style**.

Each preset has a matching **(light)** paragraph style. Choose it for light slides; the keyword and draft-tag character styles use the matching light accent automatically. Units/ratios keep their No Break behaviour in both modes. To change the sample project keywords, edit the pattern in both the dark and light keyword presets.

## Keep it comfortable on your Mac

Keep one project document open for everyday work. Open the kit briefly when copying a page, then close it. Its PDF lets you browse examples without loading another InDesign document.

Deck Size Controls runs only when you open it. It creates no background service and saves nothing automatically.

## Before you export

Update the contents. Check for overset text and missing fonts/images. Switch to Preview to check what will print. Choose **File → Export → Adobe PDF (Print)**. Enable **Bookmarks** and **Hyperlinks** for contents navigation. Keep **Non-Printing Objects** and **Visible Guides and Baseline Grids** off, so editing aids stay out of the PDF.

**Earlier workflow checks:** both saved 2576 INDD files reopened; a two-slide Workbench import preserved the supplied copy; size changes and Undo worked; long and indented contents entries fitted; the kit PDF has working contents links and bookmarks. A further editing pass checked artwork placement, frame resizing, switching crop/fit styles, and contents updates after renaming a heading and moving an image-only page. All five PDF links and bookmarks followed the revised page order. Changing all three font families before using Size Controls preserved those choices through the size change and Undo.

No missing fonts or overset printable page frames were found in the delivered files. Larger sizes can still overflow a particular layout: the editing check caught that in the sample pages and the helper named the affected pages. Recheck after choosing project fonts or adding copy and images.

**1920 version:** both parents and all eleven document pages across the starter and kit use 1920 × 1080. The parent guides were checked against the exact grid coordinates. The existing Workbench script imported two slides with no overflow; the narrower kit was recomposed and its contents links and two-digit folios checked in the exported PDF. Use its matching layouts when working at this size.


**Colour and contents pass, 14 September:** all four INDD files reopened with the same 18 shared RGB colours, 110 paragraph styles, 30 character styles and 31 object styles. Both contents examples regenerated as two balanced columns, with five PDF links and updated bookmarks. A 126-character entry wrapped without overflow; light GREP colours and No Break were checked in the native application. The 1920 parent grids still have their exact 72 ruler guides each. Both one-page importer frames remain intact.


**Five-layer and production pass, 14 September:** both starters and both kits now use TEXT, PSD - CHARACTERS, GRADIENT, PSD - BACKGROUNDS and Solid Background. Existing font, colour and style definitions are preserved (110 paragraph, 30 character and 29 object styles). Each parent has 72 correct native guides; obsolete overlapping cinemascope guide sets were removed. Image-only contents markers live on TEXT and remain nonprinting. The new Build/Refresh workflow passed native checks in both sizes, including blank slides, returned PSDs and a moved project folder. Use [Deck Production](<Start Here - Deck Production.md>) for that workflow.
