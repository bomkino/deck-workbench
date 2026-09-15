# Deck Colours for Figma

Choose the project palette in one panel. The colour library uses pitchdog-colours/1 v1.0.0, pinned to SHA-256 08c4c0f496ca2d217eb0d583b1547a4bd226b28b713199f735fbf53d07d3a8a6.

## Install once on each Mac

1. Keep this complete folder somewhere permanent, such as Documents/pitch.dog Tools.
2. Open a design file in Figma Desktop.
3. Open the Figma menu → Plugins → Development → Import new plugin from manifest.
4. Choose this folder's manifest.json.
5. Run **pitch.dog — Deck Colours** from Plugins → Development.

This development plugin is installed locally on each Mac. Sharing the Figma account does not install these local files. No Node, build tools, fonts, network permission or paid plugin is needed. The two appearance modes already exist in the updated starter.

## Use

1. Duplicate the updated pitch.dog starter for a project.
2. Run Deck Colours.
3. Pick a Base and any accents you want. **Keep current** leaves a role untouched.
4. Press **Apply choices**. All matching Dark and Light values update together.
5. Each slide keeps its existing appearance. The helper does not change page modes, slide modes, fonts, text, layout or grid.

Primary means the main accent. Secondary, Third and Fourth are optional. Mono is a separate neutral option; **Use Mono for all four accents** selects one neutral family for every accent, then waits for Apply.

**Restore previous** returns to the palette before the last application in this plugin session. Figma Undo (⌘Z) also works.

## Choose the right colour role

- **Accent / Primary / Text**: coloured text on a regular deck background.
- **Accent / Primary / Solid** + **On solid**: a strong coloured panel and the text over it.
- **Accent / Primary / Soft** + **On soft**: a subtle coloured panel and the text over it.
- **Line**: a rule or meaningful boundary.

The same six roles exist for each accent. Use each fill's own matching ink; there is no universal text colour for every fill.

## Native editing and custom colours

Local variables → **pitch.dog / Colour** contains the small project palette. Edit the Dark and Light columns for a custom client colour. Local variables → **pitch.dog / Palette → Library** contains all source families, roles and scales; the large raw library is hidden from everyday property pickers.

The helper deliberately stops if a pinned library colour has been edited. Customise project variables in Colour; keep the Library source values intact. Existing custom project choices stay untouched until you select a replacement.

A changed palette applies to this Figma file. It does not automatically recolour separate existing Workbench or InDesign files. Use the same family choices there.

## Verification

The supplied script and panel pass JavaScript syntax checks. Its apply/restore core is checked against the real starter's native variables. Local development-plugin installation and a panel click need to be verified once on the receiving Mac.

Official installation guidance: https://help.figma.com/hc/en-us/articles/360042786733-Create-a-classic-plugin-for-development

