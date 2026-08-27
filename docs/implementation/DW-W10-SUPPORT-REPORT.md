# DW-W10 — Privacy-safe support report slice

Status: source-ready and covered by causal privacy/containment tests.

`scripts/support/create-support-report.mjs` reads bounded structural document and
journal metadata through `packages/support-bundle`, writes deterministic JSON
outside the `.pitchdeck`, and refuses to overwrite an existing destination. It
does not mutate, lock, repair or upload the Deck.

The report excludes Story text, Deck/Section/Slide/Content IDs and titles, package
paths, usernames, environment values, tokens and credentials. Corruption is
reported as a bounded reason rather than echoed bytes. This is not telemetry and
introduces no network path.
