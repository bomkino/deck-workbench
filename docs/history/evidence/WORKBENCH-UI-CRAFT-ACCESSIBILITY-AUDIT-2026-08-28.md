# Workbench UI craft and accessibility audit

Date: 2026-08-28

Historical scope note: this receipt describes the earlier exact-main tracer. Current phased-workspace measurements and claims are superseded by `WORKBENCH-UI-UX-RELEASE-PASS-2026-08-29.md`; target-machine assistive-technology acceptance for the phased candidate remains unverified.

This is the durable internal review record required before final packaging. It separates source inspection, rendered-pixel judgment, automated runtime evidence, and manual acceptance. Final installed-app evidence is recorded separately.

## pitch.dog illustration verdict

Verdict: **PROMOTE**

The canonical `workbench-mark.svg` was rendered and inspected at 1024, 128, 64, 32, and 16 pixels. The sparse desk-frame and coral cord remain recognisable at the smallest size; no gradients, masks, filter effects, illustrative clutter, fake material, or lettering are present. The same source is used by the workspace and Linux package. The macOS build now derives its complete `.icns` set from that source rather than introducing a second artwork.

The 16-pixel rendering is necessarily low-detail, but the core metaphor survives. That limitation does not justify a parallel micro-icon family in this release.

## Emil interaction review

| Before | After | Why |
|---|---|---|
| At 80% Interface Scale, a nominal 3.25 rem control became 41.6 pixels; the focusable Section row was shorter, WebKit ignored native Select `min-height`, and dense tool buttons could flex-shrink. | Control size is `max(3.25rem, 44px)`, Select owns an explicit height, Section rows inherit the floor, tool buttons cannot shrink below it, and native toolbar labels own a 44 by 44 pixel minimum. | Scale preference must not shrink frequent targets below the physical interaction floor. |
| The artboard used a visual transform while retaining its unscaled layout box. | A dedicated shell owns the scaled footprint and the artboard transforms from its top-left origin. | Zoom now tracks the projection’s real occupied space, so centring and scrolling remain truthful. |
| Artboard rem dimensions inherited Interface Scale. | Artboard geometry and local typographic bounds use fixed projection pixels; only its dedicated zoom changes the projection. | Interface Scale changes chrome, not slide design. |
| Low zoom could leave most of Stage unused with no recovery action. | `Fit Artboard to Stage` calculates the available Stage box and chooses the largest non-cropping slider step. | A common corrective action is immediate and interruptible. |
| The decorative SVG mark could surface its internal title in WebKit accessibility output. | The embedded brand image is explicitly presentational and hidden from the accessibility tree. | Decorative identity should not interrupt task navigation. |
| macOS had no bundle icon pipeline. | The build generates and packages a complete `.icns` from the canonical mark. | Finder and Dock now share the authored host identity without asset drift. |

No delayed confirmation animation or decorative choreography was added. Button press feedback remains a restrained 140 ms transform with a reduced-motion fallback; zoom and Fit remain direct functional updates.

## AppKit and WebKit accessibility audit

Priority meanings: P0 blocks independent use; P1 materially impairs a core journey; P2 is meaningful polish.

| Category | Finding | Priority | Evidence / disposition |
|---|---|---:|---|
| Semantics and labels | Native New, Open, Save, Close, and Export actions have textual labels and accessibility labels/help where ambiguity exists. Workspace regions, history buttons, zoom, Fit, sequence selection, reorder shortcuts, status, and composition are named. | — | Source inspection plus packaged tracer assertions. |
| Target size | Web controls and sequence targets are measured across all seven Interface Scale steps; the runtime gate rejects any visible target under 43.5 pixels in either dimension. Native toolbar action labels have a 44 by 44 pixel minimum. | — | Packaged WebKit tracer plus Swift source contract. |
| Keyboard | Menu commands expose standard shortcuts; Story commit/history and Sequence reordering preserve focus; the skip link targets the writing desk. | — | Packaged journey plus exact-main installed traversal through 35 ordered native/WebKit controls, keyboard-only open, scale adjustment and export/cancel. |
| Focus | Focus restoration after commit, undo, redo, and reorder is asserted. Focus rings use a three-pixel non-colour outline. | — | Packaged journey and CSS inspection. |
| Dynamic feedback | Durable state is a polite atomic live status; busy state is exposed on the workbench; typed errors are shown without silent mutation. | — | Packaged journey and controller tests. |
| Selection and contrast | Selected Slides use border, background, and `aria-current`, not colour alone. Forced-colours styles and reduced-motion styles exist. | — | Source inspection plus installed launch with Increase Contrast and Reduce Motion enabled; focus, selection and core controls remained visible. Core VoiceOver labels were traversed. |
| Decorative media | The brand mark is omitted from WebKit accessibility output. | — | Packaged tracer assertion. |
| Native document identity | macOS document and application icon metadata point to the packaged `.icns`. | — | Package inspection plus candidate Finder and exact-main Dock visual acceptance. |

Final installed-app audit state:

- P0: none found by source or packaged-tracer review.
- P1: none found by source or packaged-tracer review.
- P2: no blocking finding in the bounded installed-app pass. Exhaustive VoiceOver narration across every Inspector control remains broader assistive-technology acceptance, not a release blocker for this local build.

## Exact-main manual accessibility follow-up

The installed app at commit `dd9b2cef1a116330452116674712cb0e60da3d67`
was exercised without pointer input against the non-private revision-13 acceptance
Deck.

- `Command-O`, Go to Folder and Return opened the exact Deck through the native
  panel. Tab then reached New, Open, Save, Close, Export, Rename, Undo,
  Interface Scale, Artboard Zoom, Section/Slide creation and movement, Story,
  Fit, Design, alignment and crop/media controls in a coherent order.
- The Interface Scale keyboard commands changed 125% to 110% and restored 125%
  without changing the 0.35 Artboard Zoom. `Command-Shift-E` opened the native
  PDF panel and Escape cancelled it without changing revision 13.
- VoiceOver was enabled for a bounded core-control pass. Native and WebKit
  controls retained concrete names such as New Deck, Open Deck, Save, Apply
  crop, reference label and Assign / replace Primary. The decorative mark
  remained absent from the accessibility tree. VoiceOver was then quit and its
  original off state confirmed.
- Increase Contrast and Reduce Motion were enabled together, the exact installed
  Deck reopened at revision 13, and focus, selection, toolbar, Sequence, Story
  and scale controls remained present and usable. Both preferences were restored
  to their original disabled values after a clean close/quit.
- The canonical mark was visually confirmed in the live right-side Dock on the
  running then-main app. The historical local-only evidence crop (not tracked) is
  `artifacts/evidence/dock-workbench-icon-main-dd9b2cef.png`, SHA-256
  `c92c7d0a39a3887cffee375aabe6c39ff8e483debe79f274c6cd6cd5fc6e7210`.
- Final environment readback: `AppleKeyboardUIMode=2`, `reduceMotion=0`,
  `increaseContrast=0`, `voiceOverOnOffKey=0`; application and VoiceOver
  processes stopped; writer lock released.

## Manual test script

1. Enable Full Keyboard Access. Create, edit, commit, undo, redo, reorder, Fit, save, close, reopen, and export without a pointer; confirm visible focus never disappears.
2. Enable VoiceOver. Traverse native toolbar, Sequence, Story, Stage, and Inspector; confirm the decorative mark is silent, selected Slide state is announced, and save/error feedback is heard once.
3. Set Interface Scale to 80%, 100%, 125%, 150%, and 175%; confirm native and web controls remain reachable and Stage projection geometry is unchanged.
4. Enable Reduce Motion and Increase Contrast separately; confirm no required feedback disappears and selection/focus remains visible.
5. Inspect the exact installed application in Finder, Dock, and an open `.pitchdeck` document; confirm the canonical mark is used rather than the generic application icon.
