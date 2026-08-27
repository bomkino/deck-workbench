# Deck Workbench local CLI

This adapter opens one explicitly supplied `.pitchdeck` package and delegates every read and mutation to the shared Deck kernel and `DurableDeckSession`. It has no daemon, network transport, shell escape, evaluator, arbitrary file input, or independent mutation implementation.

The four operations are `query`, `command`, `undo`, and `redo`. JSON values are inline arguments; `@file` and similar file indirection are intentionally unsupported.

```sh
node apps/cli/deck-workbench.mjs query \
  --document /path/to/Deck.pitchdeck \
  --name story.document

node apps/cli/deck-workbench.mjs command \
  --document /path/to/Deck.pitchdeck \
  --name deck.rename \
  --expected-revision 0 \
  --command-id rename-1 \
  --payload '{"title":"A sharper story"}'

node apps/cli/deck-workbench.mjs undo --document /path/to/Deck.pitchdeck
node apps/cli/deck-workbench.mjs redo --document /path/to/Deck.pitchdeck
```

Success is one JSON object on stdout. A typed failure is one JSON object on stderr with a nonzero exit status. Queries are limited to `deck.summary`, `history.summary`, `story.document`, and `slide.activeProjection`. Commands are limited to the semantic command names implemented by the shared kernel.
