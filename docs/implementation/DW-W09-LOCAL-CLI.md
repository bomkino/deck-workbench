> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.

# DW-W09 — Bounded local CLI slice

Status: source-ready and covered by causal public-seam tests.

`apps/cli/deck-workbench.mjs` accepts one explicit `.pitchdeck` and one of four
operations: named query, named semantic command, undo or redo. It calls the same
`DurableDeckSession` and Deck kernel as the Linux utility process. Mutations use
the same prepare → durable journal append/fsync → commit/history order, and the
exclusive writer lock is released on normal exit.

There is no daemon, socket, automatic network, shell escape, arbitrary evaluator,
generic IPC or `@file` payload indirection. Opt-in MCP and command-palette work are
not part of this slice.
