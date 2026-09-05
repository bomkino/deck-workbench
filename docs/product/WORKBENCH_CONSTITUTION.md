> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# Deck Workbench Constitution

**Status:** prototype contract for F02 — Deck state model  
**Date:** 2026-08-26  
**Scope:** Deck Workbench only. Reference Library and Font Lab are external products reached through neutral manifests.

## Product sentence

Deck Workbench is a manual, story-first visual wireframing and deck-prototyping instrument. It turns structured writing, assigned references, a Deck Design System, and authored Layout Patterns into strong editable deck prototypes and honest handoffs.

It is not a PowerPoint clone, an AI deck generator, a cloud service, or a final-production substitute for InDesign or Figma.

## Constitutional product rules

1. **The Story survives the design.** Semantic copy is canonical and does not live only inside rendered text boxes.
2. **Slide order is not Slide identity.** Reordering never changes a Slide ID or breaks external references.
3. **Visual exploration is non-destructive.** Applying a Layout Pattern creates a Design Option by default.
4. **Design Options share meaning.** They share the Slide's Content Blocks and Media Assignments; they do not fork copy.
5. **Content identity and presentation role are different.** A Slide may contain several `body`, `caption`, or `credit` Blocks; unique semantic keys keep each one independently addressable.
6. **The renderer is a projection.** It never owns the only canonical Deck state.
7. **Every meaningful edit is a command.** Manual UI, keyboard, CLI, and optional MCP use the same command vocabulary and validation.
8. **Commands are atomic.** A rejected command leaves the Deck unchanged.
9. **Undo is foundational.** A drag, crop, text edit, Pattern application, or Design System change becomes one coherent history entry.
10. **Reference identity is stable.** Media Assignments store neutral Asset IDs, not filenames or raw filesystem paths.
11. **Missing material remains legible.** Missing Assets and fonts are preserved and reported; nothing is silently substituted or removed.
12. **Inheritance is visible.** An Element property can come from the Deck Design System, the Layout Pattern, or a local override.
13. **Overflow is information.** Long copy is reported with deterministic remedies; it is never silently cut or shrunk into unreadability.
14. **Export is honest.** PDF is the visual-fidelity reference. PPTX reports every raster fallback and never calls a flattened object editable.
15. **No built-in AI.** The application contains no model runtime, generated copy, generated layouts, semantic search, or creative scoring.
16. **Agent-compatible, not agent-powered.** External tools may operate the same deterministic commands through accessibility, keyboard, CLI, and an optional local MCP interface.
17. **Mac and Linux preserve document meaning.** Rendering may vary within measured tolerances; Deck semantics may not.
18. **Interface Scale is independent of artboard zoom.** Accessibility and comfort never alter canvas geometry or export dimensions.
19. **The interface stays stable.** Sidebars and inspector groups do not jump around as selection changes.

## Domain glossary

| Term | Meaning |
|---|---|
| **Deck** | Canonical project document containing Story, Design System, references, and Design Options. |
| **Section** | Ordered group of Slides. It carries narrative structure, not visual geometry. |
| **Slide** | Stable semantic unit in a Deck. Its ID does not change when its page number changes. |
| **Slide Intent** | Why the Slide exists: cover, logline, character, world, quote, team, closing, and so on. |
| **Content Block** | Canonical semantic writing with a unique semantic key and a reusable presentation role. Keys distinguish `person.1.bio` from `person.2.bio`; both may use the `body` role. |
| **Media Assignment** | Stable role-based reference to an Asset, such as Primary, Alternate, Portrait, Texture, or Background. |
| **Design Option** | One alternative visual arrangement for the same Slide content and assignments. |
| **Composition** | Internal editable scene graph owned by one Design Option. |
| **Element** | Text, Image/GIF, Shape, Line, or Group inside a Composition. |
| **Layout Pattern** | Versioned authored recipe that instantiates a Composition from semantic Content Block keys, Media Assignment roles, and Design System tokens. |
| **Design System** | Deck-level canvas, grid, typography, colour, spacing, image-treatment, stroke, corner, shadow, and page-furniture rules. |
| **Local Override** | Explicit Element property that wins over Pattern and Design System values. |
| **Asset Reference** | Neutral external identity supplied by Reference Library or an embedded/external Deck attachment. |
| **Preflight Issue** | Deterministic, locatable condition that may block or degrade one or more export profiles. |
| **Export Profile** | Named export policy such as PDF Visual Fidelity, PPTX Fidelity, Handoff, or PNG Sequence. |
| **Command** | Atomic user-visible mutation of canonical Deck state. |
| **Projection** | Read-only view derived from Deck state for UI, rendering, thumbnails, preflight, or export. |

## Command vocabulary

Commands use stable domain verbs rather than UI implementation names.

```text
deck.rename
section.add
section.rename
section.remove
slide.add
slide.move
slide.intent.set
slide.remove
content.add
content.update
content.remove
asset.reference.add
asset.availability.set
asset.assign
designOption.applyPattern
designOption.duplicate
designOption.rename
designOption.activate
element.text.detach
element.frame.update
element.crop.update
element.override.set
element.override.clear
designSystem.token.update
font.availability.set
preflight.acknowledge
```

UI controls may group commands, but they may not bypass this seam.

## Public seams proven by this prototype

```text
createSession(deck)
execute(session, command)
undo(session)
redo(session)
validateDeck(deck)
runPreflight(deck)
serializeDeck(deck)
deserializeDeck(json)
projectSlide(deck, slideId, optionId)
resolveElementProperty(deck, element, property)
```

The prototype is disposable. These names express the domain contract, not a commitment to JavaScript or any production framework.

## Explicit anti-goals for F02

- No renderer bake-off.
- No production file format.
- No final UI direction.
- No Electron or SwiftUI shell.
- No editable PPTX implementation.
- No direct filesystem access.
- No Reference Library implementation.
- No Layout Pattern authoring UI.
- No random unit-test farm.

## F02 exit predicate

F02 passes only when a realistic 20-Slide Deck can perform every named scenario while preserving these invariants:

- Pattern changes never destroy or fork semantic copy.
- Reorder never changes Slide identity.
- Design Options share Content Blocks and Media Assignments.
- Asset replacement preserves the image slot and crop.
- Design System inheritance and local overrides remain explainable.
- Invalid commands leave no partial mutation.
- Undo/redo restore observable state.
- Missing material produces deterministic Preflight Issues.
- Save/reopen preserves semantic meaning.
