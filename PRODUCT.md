# Product

<!-- impeccable:product-schema 1 -->

> Working record: the user explicitly authorised a question-free one-shot. Unless a fact is stated in their visual-redesign brief, the facts below are labelled assumptions inferred from the repository and should be reconfirmed before future product-scope changes.

## Platform

web

## Users

- **Confirmed for this redesign:** an expert deck-maker operating a desktop production tool at 1440 × 900 and 1280 × 720.
- **Repository-derived assumption:** the primary user is pitch.dog and adjacent small creative teams producing film, television, advertising, documentary, and other authored pitch decks.

## Product Purpose

- **Repository-derived assumption:** Deck Workbench turns structured writing and project media into a slide-by-slide visual plan, rough assembly, and designer-ready handoff without replacing human judgment.
- **Confirmed for this redesign:** success means the central work stays dominant, phase changes remain one click, Slides and imagery are immediately legible, and existing functionality remains unchanged.

## Positioning

- **Repository-derived assumption:** it is a manual, local-first, story-first pre-production instrument whose canonical Story survives design exploration; it is not a generic presentation platform, cloud SaaS, or AI deck generator.

## Operating Context

- **Repository-derived assumption:** the shared web workspace runs inside a macOS WebKit shell and a Linux Electron shell while the native hosts retain document lifecycle, permissions, persistence, privileged operations, and packaging.
- **Repository-derived assumption:** users move through Plan, Curate, Assemble, and Handoff over one Deck while preserving Slide selection, identity, history, assignments, and canonical meaning.

## Capabilities and Constraints

- **Confirmed for this redesign:** preserve all DOM identifiers, JavaScript bindings, copy, data/native contracts, and current feature behaviour.
- **Confirmed for this redesign:** CSS and markup lead; JavaScript is limited to a necessary panel collapse or shortcut. No framework, kernel, bridge, native, or data-model rewrite.
- **Repository-derived assumption:** Plan manages exact copy and intent; Curate judges and assigns authorised media; Assemble arranges media, text, crop, type scale, and gradients; Handoff exposes concrete readiness and export actions.
- **Repository-derived assumption:** Interface Scale is independent of artboard zoom and Deck geometry.
- **Repository-derived assumption:** the product contains no bundled AI, account, telemetry, analytics, cloud dependency, or mandatory network access.

## Brand Commitments

- **Confirmed for this redesign:** use a quiet Apple Keynote-like editor shell with one accent, system sans typography, restrained neutral layers, familiar controls, and no generic SaaS dashboard treatment.
- **Repository-derived assumption:** preserve the Deck Workbench name, pitch.dog mark, authored Phosphor icons, and calm editorial working character.

## Evidence on Hand

- **Repository-derived assumption:** product contracts live under `docs/product/`, architecture boundaries under `docs/architecture/`, and the production workspace under `packages/workspace/app/`.
- **Confirmed for this redesign:** the existing v0.0.5 functional rescue on `codex/core-workflow-repair-v0.0.5` is the behaviour and data-contract source of truth.
- **Confirmed absence:** no new imagery, claims, content, or external services are required for this redesign.

## Product Principles

1. **Confirmed:** the stage, Slide rail, imagery, and current phase must be legible before secondary controls.
2. **Repository-derived assumption:** Story and stable Slide identity outrank visual experimentation.
3. **Confirmed:** selection reveals only relevant controls; advanced controls use progressive disclosure.
4. **Confirmed:** preserve one-click phase movement and keyboard-complete, scale-aware operation.
5. **Repository-derived assumption:** keep the product local, honest, deterministic, and explicit about unresolved work.

## Accessibility & Inclusion

- **Repository-derived assumption:** preserve semantic landmarks, labels, focus behaviour, keyboard operations, reduced-motion support, visible focus, and the existing Interface Scale range.
- **Confirmed for this redesign:** the shell must remain usable at 1440 × 900 and 1280 × 720 without hiding the primary task.
