# Native interface direction

Prefer stable native Mac controls, visible slide context, keyboard-complete curation, and a dominant Assembly canvas. Preserve exact copy and image decisions. Slide typography is editable through the starter roles and remains independent of application typography. Grid baseline: 2576 x 1080, 24 columns / 12 rows, margins 96 / 64 and gutters 16 / 8 canvas units. User layouts remain suggestions for designers. See docs/NATIVE_ARCHITECTURE.md.

## Interface system

The deck's work carries the colour; chrome stays quiet. `NativeDesign` holds the shared tokens and pieces:

- **Pasteboard.** Slides and media sit on a neutral pasteboard (light grey in Light mode, near-black in Dark) so light and dark slides both keep their edges. The slide casts a soft shadow; Review deck runs on black.
- **Cards.** Grouped content, media tiles and recent decks use rounded cards with a hairline stroke. Focus is a 3 pt accent ring; hover lifts slightly and reveals quick actions.
- **Floating controls.** Canvas, preview and review controls float in material capsules over the work instead of taking fixed bars.
- **Readiness.** A slide is ready when every image slot has a chosen image (or it is text only); it needs an image otherwise, and excluded slides are marked and not counted. The navigator, editing bar and deck progress use the same states and colours (green ready, orange attention, grey neutral).
- **Keys at the point of action.** Curation buttons show their single-key shortcuts as keycaps.
- **One sheet frame.** Every sheet has a titled header with an icon, a scrolling body (grouped forms where there are settings) and a footer with its decisions.
- **Navigator thumbnails** are drawn by the canvas renderer itself, so they match the slide and the export.

`--native-ui-gallery <folder>` renders every main screen and sheet (light, dark, compact and large text) from a realistic generated deck; CI uploads the images for visual review.

## Application typography

The UI uses the existing FontBlind v13.0.0 pin (`786b4a2b671182319320f922b8de8f927ea3a002`): Body 400 for reading and input, Body 600 for labels and functional emphasis, Body 700 for page titles, Head Medium only for the welcome display. `NativeUIRole` owns the native mapping; Interface size scales owned UI text, including sheets and captions, without changing the deck.

Native consumer adaptation: the upstream roles describe browser dimensions, not macOS points and intrinsic control geometry. Workbench retains compact desktop sizing and native button/menu geometry across its workspace and dialogs. Numeric and literal-code roles retain system monospace because v13 Eyebrow has conflicting native names. System menus, window chrome and SF Symbols keep platform typography. This is a permanent platform adaptation until the canonical system provides a native contract and collision-free Eyebrow names. Long labels, non-Latin fallback, large Interface size and small windows require visual review. Do not copy private upstream tokens or documentation into this repository.

Canvas font pairs are explicit choices. New York + SF Pro uses the system serif and sans designs, without redistributing Apple fonts. pitch.dog Head + Body uses bundled anchors. Choosing a pair changes only fonts; size steps, alignment, colours and existing decks are preserved until Apply.
