# DW-W11 — strict writing import

## Outcome

`01 Plan` always exposes **Copy conversion prompt** and **Import writing…**, even
without an open Deck. Conversion remains outside Workbench. The app makes no
model, network, account, telemetry or upload call.

The only canonical prompt source is the versioned
[`workspace-conversion-prompt-v1.js`](../../packages/workspace/app/workspace-conversion-prompt-v1.js).
The workspace build, copy action, fallback and packaged tracer consume that same
LF-only string; documentation does not maintain another copy.

## Format boundary

The renderer parses `Format: workbench-markdown/1` with a pure bounded parser.
It normalizes CRLF to LF only, accepts the six existing Canvas preset IDs, keeps
copy and order exact, and reports every warning or blocking error with a line
number. `Version:` is not a field. Structural-looking visible copy needs one
leading backslash, which the parser removes exactly once; an original backslash
before a reserved prefix therefore arrives doubled and reopens as one.

Preview is valid only for the exact textarea bytes that passed. Any edit revokes
approval. Import reparses before crossing the typed bridge. Native macOS and
Linux hosts independently validate the bounded payload.

## Document boundary

Import extends `deck.create` with one optional `writingImport` payload. It never
runs a command loop against the open Deck. The host generates fresh opaque IDs
once, the kernel constructs one complete schema-1 checkpoint at revision 0, and
the existing document store refuses replacement of an existing destination.
Every Slide gets a canonical Headline plus `workbench-plan` /
`workbench.plan.v1` metadata; Subheadline and Body blocks exist when their copy
state is `present`. Creation history is empty.

Pending workspace drafts block import before the save panel. Cancellation,
validation failure and destination refusal leave the active Deck and filesystem
unchanged. A candidate created by this operation is the only path eligible for
failure cleanup.

## Evidence

Focused contracts cover strict parsing, Unicode and Markdown copy, internal blank
paragraphs, reserved-marker escape, all copy states, non-default Canvas, bounds,
Preview invalidation, duplicate-click locking, native clipboard truthfulness,
revision-zero package creation, stable-ID reopen, and existing-destination
refusal. The packaged macOS writing-import tracer performs the installed journey
through the real native save panel with disposable Decks.
