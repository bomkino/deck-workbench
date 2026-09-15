# Deck Colour Controls

**One project. Pick your colours once. Use dark and light slides together.**

1. Open your starter or project deck in InDesign.
2. Open **Window → Utilities → Scripts → User → Deck Colour Controls**.
3. Pick a **Base**: Studio, neutral, warm, cool, or black and white.
4. Pick your **Primary**, **Secondary** and **Accent 3**. Accent 4 is optional; unused colours do not appear on your pages.
5. Look at both previews. Click **Apply project colours**. Review your pages, then save.

**Cancel changes nothing. One Edit → Undo restores an Apply.** Opening the starter does not replace its existing colours.

## While designing

- Coloured text: **Character Styles → Project Colours → Primary/Secondary/etc. → Text (on dark/on light)**.
- Coloured shape: **Object Styles → Project Colours → Primary/Secondary/etc. → Fill** or **Soft fill**.
- Text on that shape: use its matching **Ink on fill** or **Ink on soft** character style.
- Dividers: use the matching **Line** object style. Set your preferred line thickness separately.
- **Mono** styles are always available. The helper's **Make all accents Mono** checkbox recolours all four accent slots together; uncheck it later to return to the saved family choices.

“On dark” means the surrounding slide is dark. It does not mean the ink inside every coloured box must be white. The helper supplies the correct ink for each fill.

Old Pink/Purple/Blue/Teal names remain as compatibility slots: **Primary/Secondary/Accent 3/Accent 4**. Existing uses update without restyling. New friendly styles live in Project Colours. Fonts, sizes, copy, page layouts and dark/light parent choices are unchanged.

## Workbench handoffs

Frozen colours travel with each slide. Different slide palettes remain distinct on import. A later **Apply project colours** deliberately updates all managed colour roles across the InDesign document. Editing InDesign does not change the Workbench project or Figma file.

## Installation

Copy **Deck Colour Controls.jsx** and its complete sibling **Colour System** folder into InDesign's User Scripts folder. Keep them together. The helper reads only local files and needs no web connection.

The supplied solid text pairs are checked at 4.5:1; meaningful divider pairs at 3:1. Photos, gradients, transparency, arbitrary manual RGB edits and print conversion need their own contrast review.
