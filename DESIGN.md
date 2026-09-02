# Deck Workbench interface direction

Deck Workbench is a local production editor, not a dashboard. The Deck stays visually dominant while navigation, media judgment and properties remain immediately reachable.

## Reference model

- Apple Keynote supplies the navigator–canvas–inspector geometry, thin dividers and reversible pane visibility.
- Apple’s current macOS window and toolbar guidance supplies one full-content frame, system-owned traffic lights, native menus and no redundant app-name title.
- Codex and Raycast demonstrate the useful hybrid pattern: a native Mac window owns chrome and lifecycle while a focused workspace occupies the full content area.
- Figma supplies selection-aware property editing beside, never on top of, the canvas.
- Lightroom supplies the Curate filmstrip, full-image review and direct rating model.
- Impeccable Operate supplies the restraint: familiar controls, progressive disclosure and no decorative chrome competing with the work.

## Shell

- One compact toolbar contains Deck identity, the four phases, history, pane visibility, Appearance and save state.
- On macOS, full-size content extends beneath a transparent hidden titlebar so the native traffic lights live inside this single toolbar. AppKit measures their occupied width; Workbench never redraws or manually moves them.
- On macOS, the native File and View menus own document commands, export, theme and Interface Scale. The window does not repeat them in a second native action strip or an app-name title.
- Plan, Curate, Assemble and Handoff are a persistent one-click switcher. The selected phase uses a quiet tinted surface and a single accent rule, not a black slab.
- Roomy windows use a narrow navigator, dominant work area and contextual inspector. Navigator and Inspector controls hide their panes without changing Deck state.
- Curate and Assemble preserve a visible thumbnail rail. Curate keeps Project Picks, Primary slots, Alternates, Slide shortlist and Unplaced imagery readable at the bottom.
- Narrow and high-scale layouts reflow into one column while retaining every action and all five Curate tray regions.

## Visual system

- Neutral cool surfaces, hairline separators, one coral accent and an 8 px corner radius.
- Controls keep a minimum 44 px target while using compact padding and a restrained 3rem toolbar.
- Selection is a tinted surface plus a narrow accent edge. Dark full-row selections are reserved for authored content, not interface state.
- Light and Dark themes share semantic surface tokens; stage controls never hard-code a theme-specific background.
- The authored Slide canvas and export geometry remain isolated from Interface Scale and workspace styling.

## Interaction

- Frequent state changes are immediate. Motion is limited to 140–180 ms press and disclosure feedback and is removed under reduced-motion preference.
- Appearance is one bounded popover. Advanced gradient values are disclosed only when needed.
- Assembly keeps direct manipulation primary: drag and resize text or image frames; pan proportional Fill imagery; move gradient handles on canvas; use the inspector for exact values.
- Images always retain their source aspect ratio. Fit shows the whole source; Fill crops it proportionally.
- Curate makes “Use as Primary” the dominant current-Slide action and keeps rating, Project Pick, shortlist, alternate and cross-Slide assignment available in full-screen Preview.

## Protected contracts

DOM identifiers, keyboard routes, native bridge operations, kernel commands, document formats, media identity, artboard geometry and export behaviour are product contracts. This interface direction may reorganize and style them, but it must not rename, reinterpret or bypass them.
