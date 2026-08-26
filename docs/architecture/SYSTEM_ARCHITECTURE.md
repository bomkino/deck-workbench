# System architecture contract

## Authority map

```text
Native desktop shell
├── application/document lifecycle
├── permissions and native pickers
├── durable journal/checkpoints
├── privileged file operations
├── exports and packaging
├── menus/recent documents/reveal
└── optional CLI/MCP host
        │ named typed bridge
        ▼
Workspace
├── Editorial Desk / Focus Stage / Reference Strip
├── Story and Review projections
├── DOM Composition projection
├── selection, guides, crop and Inspector
└── transient interaction state
        │ commands and queries
        ▼
Deck kernel
├── schema and migrations
├── semantic reducer
├── command validation
├── undo/redo
├── Layout Pattern instantiation
├── deterministic Preflight
└── export planning
```

## Canonical ownership

| Data | Owner |
|---|---|
| Story, Slides, Design Options, assignments, Design System | Deck kernel |
| document package, fsync, permissions, recovery | native shell |
| hover, open popovers, pointer preview, selection | workspace |
| durable history | Deck kernel semantics + host journal |
| thumbnails/renditions | derived cache/background jobs |
| export files | native export job executing kernel plan |

## Shared Deck kernel

Working language: TypeScript compiled to a small platform-neutral JavaScript bundle. It imports no DOM, Electron, Swift, filesystem, network or model SDK.

```ts
interface DeckKernel {
  open(snapshot: DeckSnapshot): DeckState
  query(state: DeckState, query: DeckQuery): DeckProjection
  prepare(state: DeckState, command: DeckCommand): PreparedChange
  commit(state: DeckState, prepared: PreparedChange): DeckState
  prepareUndo(state: DeckState): PreparedChange
  prepareRedo(state: DeckState): PreparedChange
  preflight(state: DeckState, profile?: ExportProfile): PreflightIssue[]
  planExport(state: DeckState, request: ExportRequest): ExportPlan
  migrate(input: unknown): MigrationResult
}
```

The kernel prepares without mutating live state. The host persists the operation before commit/acknowledgement.

## Mac deployment hypothesis

- Apple Silicon, macOS 26+;
- SwiftUI shell;
- WebKit workspace;
- serial `DeckKernelHost` adapter outside WebView;
- first tracer should try bundled kernel through JavaScriptCore because it is the smallest local deployment;
- if JavaScriptCore proves weak in performance, debugging or packaging, replace only the adapter with one supervised local helper;
- Swift owns document file descriptors, package writes, custom resource authorization and PDF/export destinations.

The tracer decides deployment, not document semantics.

## Linux deployment hypothesis

- Electron main owns windows, protocols and native integration;
- utility process owns Deck kernel and package session;
- renderer sandboxed;
- context isolation on;
- Node integration off;
- narrow preload API;
- Arch/Garuda package first.

Linux work begins in its own tracer after the Mac contract is real.

## Workspace

Production candidate:

```text
React + TypeScript
DOM scene graph
SVG for lines/shapes/masks
Moveable transforms
Selecto selection
ProseMirror constrained rich text
virtualized rail and Review contact sheet
```

`DW-T00` should not integrate these dependencies. Use a minimal DOM workspace to prove the shell/kernel/document contract. The editor-dependency tracer owns production dependency selection.

## Geometry

Element geometry uses Deck units. One viewport transform maps Deck units to CSS pixels. Interface Scale is never an input to that transform.

## Gesture flow

```text
pointer move
    → transient workspace preview
pointer up
    → one coalesced command
kernel prepare
    → host journal append + fsync
host commit
    → acknowledged projection
```

## Background jobs

Persisted/cancellable jobs include thumbnails, image probes, poster frames, PDF, PPTX, handoff and PNG. Every job records source document revision, progress, result or named failure.

## Architecture reopen triggers

Reopen the Mac kernel-host decision if:

- 100-Slide command/projection performance misses budget;
- debugging the JSCore adapter hides failures;
- package/signing becomes brittle;
- crash isolation is inadequate;
- the same workaround appears in two independent subsystems.

Reopen DOM editor selection if the real dependency tracer cannot meet text editing, IME, accessibility, direct manipulation or export mapping requirements in both WebKit and Chromium.
