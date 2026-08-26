# Deck Workbench product specification

## Product sentence

Deck Workbench is a manual, local-first, story-first application for turning structured writing, project references, a Deck Design System and authored Layout Patterns into strong editable pitch-deck prototypes and honest professional handoffs.

## Primary users

The first user is pitch.dog: a small creative team producing film, television, advertising, documentary and adjacent authored pitch decks. The public application should remain understandable and useful to other filmmakers, producers, deck writers and small creative teams without becoming a generic presentation platform.

## User problem

Pitch-deck work currently fragments Story, references, typography, visual experiments, feedback, exports and designer handoff across several applications and folders. Existing general presentation tools are either too generic, too final-production-oriented, or too weak at preserving the relationship between narrative intent and visual alternatives.

Deck Workbench should reduce reconstruction work while preserving human taste. It provides structure and direct manipulation; it does not make creative decisions for the user.

## Success outcome

A user can move from rough Story and selected references to a coherent 20–40 Slide visual prototype, explore several non-destructive visual directions, review the Deck as a sequence, resolve deterministic issues and deliver a credible PDF, fidelity-first PPTX, PNG sequence and source/designer handoff.

## Core workflow

```text
Create/open Deck
    ↓
Write/import Story and Sections
    ↓
Assign project references and typography
    ↓
Apply authored Layout Patterns
    ↓
Edit Elements and image crops
    ↓
Create/compare Design Options
    ↓
Review sequence and Preflight
    ↓
Export PDF / PPTX / handoff / PNG
```

A user may also begin from references and a visual world, but Story remains the canonical semantic layer.

## Canonical document

```text
Deck
├── Design System
├── Sections
└── Slides
    ├── Slide Intent
    ├── Content Blocks
    ├── Media Assignments
    ├── Notes
    └── Design Options
        └── Composition
            └── Elements
```

## Initial element scope

- Text
- Image, including animated GIF projection
- Shape
- Line
- Group

Common video may play in the editor and use a chosen poster frame in static export. Tables, charts, arbitrary embedded web content, animation timelines and generic presentation widgets are outside the initial destination.

## Layout Pattern scope

The first serious release contains at least twelve excellent pitch-deck Pattern families. Full-bleed imagery is a primary design language. Blank canvas exists as an escape hatch. Applying a different Pattern creates a new Design Option by default.

Initial families:

1. Cover
2. Logline
3. Full-bleed statement
4. Editorial body
5. Two-column body
6. Character portrait
7. Character ensemble
8. World/location
9. Moodboard
10. Asymmetrical collage
11. Quote
12. Team / closing / comparison variants sufficient to cover real fixtures

The final family grouping may change after real fixture testing, but breadth may not replace quality.

## Design System

Every Deck owns:

- canvas preset;
- safe area;
- grid and margins;
- spacing scale;
- colour roles;
- typography roles;
- image treatments;
- strokes;
- corners;
- shadows;
- recurring labels and page furniture.

Every resolved Element property can explain whether it came from the Design System, Pattern snapshot or local override.

## Required canvas presets

- 2576 × 1080
- 1920 × 1080
- 2160 × 2160
- 4:3
- A4 portrait
- US Letter portrait

## Export priority

1. PDF — canonical visual-fidelity output
2. PPTX — fidelity-first portable handoff with explicit fallbacks
3. Designer/source handoff package
4. PNG sequence

No Keynote or Figma export and no broad PPTX import in the first serious release.

## Platform destination

### macOS

- Apple Silicon only
- macOS 26+
- SwiftUI native shell
- WebKit workspace where it earns its role
- free GitHub distribution
- ad-hoc-signed `.app.zip` initially

### Linux

- Garuda Linux / Arch / KDE is the binding reference
- Electron shell
- Wayland first, X11 checked
- `.pkg.tar.zst` primary
- AppImage and tarball fallback

The same Deck must round-trip without semantic loss.

## AI and privacy

Deck Workbench contains no AI runtime, model API, generated copy, generated layout, semantic search, taste score, telemetry, analytics or account system. It works offline. External ChatGPT/Codex operation is optional and uses accessibility, keyboard, CLI and an opt-in local MCP surface over the same deterministic command model.

## Anti-goals

- generic PowerPoint clone;
- final-production replacement for InDesign or Figma;
- cloud SaaS;
- collaboration server;
- user accounts;
- AI deck generator;
- template marketplace;
- generic DAM;
- browser-only edition;
- Windows/mobile editions;
- hidden source-file changes;
- numeric Deck quality score;
- full-Slide rasterization without disclosure;
- corporate dashboard visual language;
- unstable inspectors or overwhelming chrome.

## First serious release acceptance

A first public-quality release must satisfy the complete list in `FOUNDER_DECISIONS.md` section 4.12 and the release gates in `docs/03-build/RELEASE_DEFINITION.md`.
