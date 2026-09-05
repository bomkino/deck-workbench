# Known limitations — v0.1.0

This is a user-test release, not a declaration that the master plan is complete. The studio explicitly waived full acceptance testing for promotion on 5 September 2026.

## Not established by a successful build

Actual PDF appearance and notes pagination; original-media folder correctness; existing-deck migration and fault recovery; fast keyboard/focus behaviour; scan cancellation and permissions across volumes; performance/memory on target hardware; VoiceOver and larger interface scales. Test a duplicate deck first.

## Scope and differences

Apple Silicon, macOS 26+ only. Ad-hoc signed, not notarized. No Linux, web or Electron product. Import is bounded Markdown/text, not a universal document converter. Ratings and project-wide picks are not fully exposed in the native UI; no complete legacy-feature parity claim. Provisional typography is intentionally modest. Very dense copy may overflow the suggested visual region; copy/notes outputs retain the complete writing. Some media may be copyable without a preview. Media scanning and export still have bounded resource limits.

The local kernel checks recorded in the previous handoff are historical evidence, not acceptance of this package. The build workflow deliberately does not run the optional native self-test. New failures should be fixed from the smallest reproducible user journey, without another broad test or architecture project.
