> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# Editorial Spine interface contract

## Default workspace — Editorial Desk

```text
┌──────────┬───────────────────────────────────────┬─────────────────┐
│ Sequence │ Story sheet        │ Visual stage     │ References /    │
│          │                    │                  │ Inspector       │
└──────────┴───────────────────────────────────────┴─────────────────┘
```

The exact proportions may evolve through implementation, but the topology remains stable:

- Sequence remains locatable.
- Story remains readable writing, not a property-form dump.
- Stage remains large enough for full-bleed judgment.
- References and Inspector share a predictable region rather than causing the entire interface to jump.

## Temporary workspace states

### Focus Stage

Expands the visual stage for crop, hierarchy and composition judgment. Story is still one command away and the selected Slide/Option does not change.

### Reference Strip

Adds a bottom or adjacent curation strip for rapid assignment. It does not create a second library, duplicate metadata or change Deck semantics.

## Primary modes

- Story
- Design
- Review

They are projections over one Deck session, not separate documents or workflows that must be synchronized manually.

## Inspector

Stable top-level groups:

1. Selection
2. Content / Media binding
3. Geometry
4. Appearance
5. Constraints / provenance
6. Accessibility / export notes where relevant

Groups may show empty or inapplicable states. The entire inspector does not reorder itself for every selection.

## Visual language

Workbench is an operating tool. It should feel authored and cinematic without becoming decorative:

- calm dark and light appearances;
- disciplined typography;
- thin structural rules used semantically;
- full-bleed imagery allowed to lead;
- restrained motion;
- no corporate dashboard cards;
- no AI gradients or generic “creative tool” neon;
- no excessive rounded containers;
- no ambient thumbnail carousel.

## States every production surface must design

- first-run;
- empty Deck;
- 1 Slide;
- 40 Slides;
- 100+ Slide stress Deck;
- selected and multi-selected Elements;
- long Story copy;
- overflow;
- missing Asset;
- missing font;
- busy export;
- cancelled job;
- document read-only;
- journal recovery;
- package too new;
- large Interface Scale;
- reduced motion;
- keyboard focus;
- VoiceOver/Orca output.

## Direction provenance

The accepted topology was selected during the F03 direction exercise: Editorial Spine is the default, Focus Stage is temporary and Reference Strip is contextual. The exploratory prototype files are not production inputs and are intentionally not carried in this repository. Do not merge all three states into permanent simultaneous chrome.
