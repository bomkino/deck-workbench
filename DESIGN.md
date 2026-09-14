# Native interface direction

Prefer stable native Mac controls, visible slide context, keyboard-complete curation, and a dominant Assembly canvas. Preserve exact copy and image decisions. Slide typography is editable through the starter roles and remains independent of application typography. Grid baseline: 2576 x 1080, 24 columns / 12 rows, margins 96 / 64 and gutters 16 / 8 canvas units. User layouts remain suggestions for designers. See docs/NATIVE_ARCHITECTURE.md.

## Application typography

The UI uses the existing FontBlind v13.0.0 pin (`786b4a2b671182319320f922b8de8f927ea3a002`): Body 400 for reading and input, Body 600 for labels and functional emphasis, Body 700 for page titles, Head Medium only for the welcome display. `NativeUIRole` owns the native mapping; Interface size scales owned UI text, including sheets and captions, without changing the deck.

Native consumer adaptation: the upstream roles describe browser dimensions, not macOS points and intrinsic control geometry. Workbench retains compact desktop sizing and native button/menu geometry across its workspace and dialogs. Numeric and literal-code roles retain system monospace because v13 Eyebrow has conflicting native names. System menus, window chrome and SF Symbols keep platform typography. This is a permanent platform adaptation until the canonical system provides a native contract and collision-free Eyebrow names. Long labels, non-Latin fallback, large Interface size and small windows require visual review. Do not copy private upstream tokens or documentation into this repository.

Canvas font pairs are explicit choices. New York + SF Pro uses the system serif and sans designs, without redistributing Apple fonts. pitch.dog Head + Body uses bundled anchors. Choosing a pair changes only fonts; size steps, alignment, colours and existing decks are preserved until Apply.
