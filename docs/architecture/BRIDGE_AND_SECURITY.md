# Native bridge and security contract

## Principle

The application receives the permissions required to do its work. The renderer does not receive a master key to the computer.

## T00 named methods

```text
deck.create
 deck.open
 deck.query
 deck.execute
 deck.undo
 deck.redo
 deck.exportPDF
 ui.getPreferences
 ui.setInterfaceScale
 ui.setArtboardZoom
```

Exact spelling may be generated from a typed contract, but there must be no generic `send(channel, payload)` public primitive.

## Later named methods

```text
asset.resolveRendition
asset.reveal
export.chooseDestination
export.start
export.cancel
job.query
workspace.setMode
```

## Never expose to workspace

```text
readFile(path)
writeFile(path, bytes)
deletePath(path)
runShell(command)
querySQL(text)
eval(code)
openArbitraryURL(url)
genericIPC(channel, payload)
```

## Resource schemes

Use app-owned local schemes rather than direct `file://` access:

```text
pitchdog-ui://app/...
pitchdog-asset://<library>/<asset>/<rendition>
pitchdog-attachment://<deck>/<attachment>
```

Every request validates identity, current document/session, resource kind and authorization.

## Renderer treatment

- no arbitrary navigation;
- restrictive content security policy;
- no remote scripts or fonts;
- no network client in application source;
- untrusted SVG/HTML is never injected as active application content;
- external links require explicit user action and native opening;
- bridge payloads are decoded and validated on both sides;
- stale revisions reject;
- unexpected bridge method rejects visibly.

## Electron future

- sandbox on;
- context isolation on;
- Node integration off;
- narrow preload bridge;
- validate sender and frame;
- custom protocol;
- utility process for kernel/package session;
- no hidden listening server.

## Threat cases

- malformed Deck document;
- oversized payload;
- forged Asset URL;
- path traversal;
- symlink escape;
- malicious SVG;
- stale renderer after document switch;
- duplicate command retry;
- renderer crash mid-command;
- host crash after fsync before UI acknowledgement;
- export destination permission revocation.

Each needs a named failure and a causal test when it crosses a public seam.
