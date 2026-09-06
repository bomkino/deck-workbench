# Layout finishing — 6 September 2026

Starting pending implementation: 413b54b5464438f5a91c9592fb2cd875f4281c75. Local source transfer snapshot: 268e0ac1382caea94fbf109779a691064a231920. Shipping baseline remains v0.1.1 until explicit promotion.

Goal: finish the pending slide-management release, repair connected layout behavior, reduce unnecessary redraw work, publish the exact inspected Mac artifact. No new platform, file schema, production typography or wholesale editor rewrite.

Work: custom-frame batch application; preset gradient resets; visible hit targets and reliable handles; complete guide edges; bounded relative nudges; text-layout reuse; direct interactive gradients; redundant scene-key calculation removed. Existing add/duplicate/rename/move/delete and captured copy editing remain in this combined release.

Proof: real command payloads, Undo and reopen; then the extracted Mac application's slide-editing/handoff journey with layout-frame copying, reset/Undo, text reuse and screen/export gradient comparison. Inspect actual generated PDFs. Never turn a successful compile into a blanket usability claim.

Publication: fast-forward main only after checking it has not moved; publish v0.1.2 from its successful exact-source artifact; retain older tags; remove only the completed branch. Update verification status from the actual receipt. Mac accessibility, large-library performance and unusual storage environments remain unmeasured.
