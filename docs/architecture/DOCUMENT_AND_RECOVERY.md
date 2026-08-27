# `.pitchdeck` document and recovery contract

## Container

```text
My Project.pitchdeck/
├── manifest.json
├── checkpoint.json
├── journal.ndjson
├── attachments/
└── recovery/
    └── previous-checkpoint.json    # optional bounded recovery copy
```

Derived thumbnails, WebView state and render caches live outside the canonical package.

## Manifest

```json
{
  "format": "pitchdog.deck-package",
  "schemaVersion": 1,
  "deckId": "uuid",
  "title": "Hillish",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "checkpointRevision": 42,
  "checkpointHash": "sha256",
  "journalHeadHash": "sha256",
  "canvasPreset": "cinemascope-2576x1080"
}
```

## Checkpoint

Complete semantic Deck snapshot at one revision. It contains Story, Design System, assignments, Design Options, Compositions, Pattern snapshots, acknowledgements and attachment references.

It excludes renderer DOM, selection, hover, open panels, cache paths, platform file descriptors and font binaries by default.

## Journal record

```json
{
  "revision": 43,
  "operation": "command",
  "command": {
    "commandId": "uuid",
    "expectedRevision": 42,
    "type": "content.update",
    "payload": {},
    "source": {"kind": "ui"}
  },
  "previousHash": "sha256",
  "recordHash": "sha256"
}
```

Every non-empty journal is newline-terminated and contains exactly one JSON object per physical line. Blank lines are corruption. Readers must reject them rather than silently filtering evidence.

## Acknowledgement order

```text
validate expected revision
    ↓
prepare next state privately
    ↓
create hash-chained record
    ↓
append journal
    ↓
fsync
    ↓
commit prepared state
    ↓
acknowledge workspace
```

If append/fsync fails, live state remains unchanged and the user sees a named persistence error.

If the durable append succeeds but the live kernel commit cannot complete, the session is fenced against further mutation. Read-only projection remains available; Close releases the writer lock without overwriting the durable tail; reopen replays the journal before editing resumes.

## Idempotency and stale state

- same command ID retry returns the original result;
- different command with stale expected revision rejects;
- query operations never advance revision;
- invalid commands never enter journal;
- journal records must match the hash chain;
- unsupported future schema opens read-only recovery or rejects clearly; never silently downgrades.

## Checkpoint

1. write sibling temporary checkpoint;
2. fsync temporary file;
3. atomically rename;
4. update manifest durably;
5. compact journal only after checkpoint is valid;
6. retain prior valid checkpoint until replacement is confirmed.

## Undo/redo

Undo and redo are semantic history operations. Their effects survive restart. A drag or text session coalesces into one history entry. External CLI/MCP mutations enter the same history.

## T00 document scope

The first tracer may contain one Deck, one Section, one Slide and one headline Content Block, but it must use the real package/revision/journal shape. Do not build a throwaway persistence path that later needs replacement.

## Portability gate before freeze

Exercise create/open/save/rename/move/ZIP/unzip/crash/Unicode/read-only/external-drive and Mac → Garuda → Mac round-trip before declaring schema 1 stable.
