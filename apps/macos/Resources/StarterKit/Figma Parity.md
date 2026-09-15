# Using this kit with your Figma deck

Use the **[pitch.dog master starter](https://www.figma.com/design/lfle8qchYjg0O0VgCZGXnK/)**. Duplicate the whole file for a project. The other duplicate was used for importer testing; it is not the master. The starter and the Workbench to Figma, Deck Colours and Text Scramble Tools live in the shared Figma account.

1. In Workbench, export **Production/workbench.md** and **PSDs**. Leave automatic InDesign building off.
2. In Photoshop, edit the numbered PSDs in **Production/PSD**. Open **00.Background** to expand the shared artwork. In the main PSD, mask **01.Character** to create the cut-out.
3. Save the main PSD, then run **File → Scripts → Browse… → Automation/Photoshop/Export Slide PNGs.jsx** from this kit.
4. Choose the finished PSD folder. The script creates full-size **Slide 01-background.png** and **Slide 01-character.png** files in a separate output folder. Originals remain unchanged.
5. In your Figma starter, select the matching **Base-Slide-01**, then run your **Workbench to Figma** importer with `Production/workbench.md`.
6. Place the background behind the writing and the transparent character on its character layer. Check the overlap and text contrast.

Both slide sizes are supported. Keep 1920 assets with the 1920 starter, and 2576 assets with the cinemascope starter. Full-canvas PNGs preserve placement without guessing a crop.

For dark and light slides in one deck, set appearance on each slide. Keep project fonts and colours controlled by the variables/styles already in your Figma file. Review long headings and justified body text after changing fonts; wrapping and paragraph composition differ between Figma and InDesign.

Workbench's exported contents reflect its exported slide order. After rearranging pages in Figma, update the visible contents numbers and folios there. Check the final PDF after any numbering, link or text change.

For colours, use **Tools → Deck Colours → Created by you → Run**. Pick from labelled swatches and inspect both appearance previews before Apply. The optional **Set up PD House styles** action provides separate internal route/exploration typography. Install this kit’s **Fonts/PD House** files first; the supplied setup ZIP handles that on the other Mac. House typography does not replace project typography.

See the [PNG exporter guide](Automation/Photoshop/Export%20Slide%20PNGs%20-%20Read%20me.md) for transparency, visibility and batch limits.
