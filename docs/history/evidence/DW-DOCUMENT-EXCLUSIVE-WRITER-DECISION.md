# Deck package exclusive-writer decision

Date: 2026-08-27
Status: implemented and exercised by exact-commit packaged macOS and Linux CI

## Decision

Every writable `.pitchdeck` session owns exactly one package-local entry named
`.deck-workbench-writer.lock`. macOS, Linux/Electron, and the CLI use the same
protocol. Creation uses an atomic `O_CREAT | O_EXCL | O_NOFOLLOW` open. An
existing entry always rejects the contender with `DocumentBusy`.

The lock JSON has format `pitchdog.deck-writer-lock`, schema version `1`, an
opaque `ownerToken`, the diagnostic process ID, and creation time. The owner
token—not the process ID—controls release. Every mutation verifies ownership.
The lock is coordination metadata only: it is absent from the semantic Deck,
checkpoint, journal hash chain, manifest, projections, and exports.

Normal close checkpoints first and then removes and directory-fsyncs the lock.
Node also makes a best-effort synchronous release during normal process exit;
both stores make a best-effort release when their owner is destroyed. A forced
termination can leave the entry behind.

## Crash-stale policy

There is deliberately no age-, PID-, or hostname-based automatic takeover.
Those signals cannot prove that a writer on another session or machine is dead,
and silent takeover could permit two journal writers. A crash-stale entry stays
`DocumentBusy` until a future explicit recovery command verifies user intent
and archives the stale evidence before removing it.

Current UX gap: the native error names the stale-lock possibility, but v1 still
needs a user-confirmed “Recover Writer Lock” flow with lock-detail presentation
and evidence preservation. Manual deletion is possible for developers but is
not presented as a safe product workflow.

## Causal evidence

- `tests/document-writer-lock.test.mjs` starts same-process and child-process
  contenders and verifies `DocumentBusy` without semantic-byte changes.
- The child normal-exit case verifies best-effort cleanup.
- The `SIGKILL` case verifies that a stale lock is retained and never silently
  displaced.
- An injected journal-fsync failure verifies that ambiguous durability fences
  the live session until reopen and that replay recovers the durable record.
- The macOS packaged tracer checks that a competing open fails and that a
  corrupt candidate open leaves the active projection and history untouched.
