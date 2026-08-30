# Interface Scale contract

## Purpose

Interface Scale makes the application comfortable and accessible without modifying the creative artifact.

## Values

```text
80%
90%
100%
110%
125%
150%
175%
```

## Interface Scale changes

- app-controlled menus and popovers;
- toolbar height and controls;
- sidebars and Inspector;
- interface typography;
- icons;
- hit targets;
- Slide rail thumbnails;
- modal and sheet content;
- command palette;
- status and Activity UI.

## Interface Scale never changes

- Deck canvas dimensions;
- Element geometry;
- Design System typography values;
- image crop;
- artboard zoom;
- exported PDF/PPTX/PNG geometry;
- persisted `.pitchdeck` semantics.

## Separate workspace controls

- artboard zoom;
- fit Slide;
- fit selection;
- 100%;
- Slide rail thumbnail size;
- Review/contact-sheet thumbnail size.

## Persistence

Interface Scale is stored per product and per machine. It is not stored in a Deck. Opening the same Deck on another machine uses that machine's preference.

Artboard Zoom follows the same machine-local rule but remains an independent
preference. A clean installation starts at 65%; an existing saved value wins.
Neither value changes authored Deck or export geometry.

## Shortcuts

Mac:

```text
⌥⇧⌘-
⌥⇧⌘=
⌥⇧⌘0
```

Linux:

```text
Ctrl+Shift+Alt+-
Ctrl+Shift+Alt+=
Ctrl+Shift+Alt+0
```

Also expose `View → Interface Scale` and command-palette actions.

## Acceptance

A tracer passes only if changing Interface Scale produces no semantic or export diff and does not change artboard zoom. It must measure a visible, nonzero artboard rather than accepting equal hidden rectangles. A production release must remain usable at 150% in a representative laptop window and must not hide essential actions at 175%.
