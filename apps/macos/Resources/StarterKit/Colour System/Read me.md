# Choose your project colours

The library contains **31 colour families** and **five neutral bases**. You choose a small project palette from that library. The original starter colours remain in place until you click **Apply**.

## InDesign: begin here

1. Open your working deck, or a copy of the matching starter.
2. Open **Window → Utilities → Scripts → User** and run **Deck Colour Controls.jsx**. It may be inside the **pitch.dog** folder if installed by the portable setup.
3. Choose a **base**: Studio, Gray, Sand, Slate, or Black & white.
4. Choose your **Main/Primary colour**, **Secondary**, and **third accent**. Use the fourth only when you need it. **Mono** stays available.
5. Check the light/dark previews and click **Apply**.

Your reusable swatches and colour styles update together. Font choices, sizes and layout are separate. Reopen the helper to change the palette later. The helper makes one undoable change; save the deck when happy with it.

## Pick a colour by its job

| Colour role | Use it for |
| --- | --- |
| Text | Coloured headlines, captions, links or emphasis |
| Solid | A strong coloured card, band or full-slide fill |
| On solid | Readable text placed on that solid fill |
| Soft | A quiet tinted panel |
| On soft | Readable text placed on that soft panel |
| Line | Meaningful rules and dividers on the supplied neutral surfaces |

Use the **on dark** role on a dark neutral slide, and **on light** on a light neutral slide. Each coloured fill has its own foreground ink: a blue card and a yellow card may need different text colours even on the same slide.

The existing **D-Dark** and **L-Light** parents still let you mix appearances inside one deck. The palette belongs to this project. Updating the master colour library later does not recolour saved projects.

## Workbench and Figma

Workbench's **Type & colours** controls use the same library. Apply chosen colours to the intended slides and save. Production exports include resolved values; automatic InDesign builds can use those values. Older handoffs without palette data keep their starter colours.

Figma uses project colour aliases over the same library. Each slide keeps its own appearance. Its separate **Deck Colours** helper and installation instructions are in the **Figma Deck Colours** folder. The existing Workbench importer and Text Scramble tools are unchanged. Palette selection is explicit; changes made independently in InDesign and Figma do not synchronize automatically.

## Keep colour readable

The supplied opaque sRGB text pairs are checked at **4.5:1 or better**, with main neutral text at **7:1 or better** and meaningful lines at **3:1 or better**. Those checks cover the five supplied base/raised surfaces and each accent's own fill/ink pair. They are not a claim that any two library colours can be combined.

Custom hex colours, opacity, gradients and text over photographs need a fresh check. A colour family offers both strong fills and quieter shades; use the amount of colour that suits the project.

## Source

The 12-step light/dark ramps come from **Radix Colors 3.0.0**, under MIT. The original sRGB ramp values are retained; pitch.dog adds the deck roles and checks. `pitchdog-colours-v1.json` is the shared data, and `contrast-proof.json` records the supplied-pair calculations. App controls use the existing interface typography; this update changes no project font choices.
