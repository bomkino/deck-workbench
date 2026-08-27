# Linux shell tracer

`main.mjs` is the Electron main-process entrypoint. It serves the existing minimal
Workspace from `apps/macos/Resources/Workspace`, removes the WebKit-only generated
bridge script, and supplies the same ten-method contract through a sandboxed
preload.

Runtime resources required in `resources/app`:

- `apps/linux/**`
- `apps/macos/Resources/Workspace/{index.html,styles.css,workspace.js}`
- `build/generated/deck-kernel.js`
- `packages/bridge-contract/bridge.contract.json`
- `packages/document-store/**`

The proving package seam is two fresh processes using the same `XDG_CONFIG_HOME`:

```sh
deck-workbench --run-packaged-tracer-create /absolute/output/directory
deck-workbench --run-packaged-tracer-reopen /absolute/output/directory
```

Both are suitable for `xvfb-run`. The create phase writes
`journey-create-result.json` and `tracer.pitchdeck`. The reopen phase verifies a
different process ID, persisted Interface Scale and artboard zoom, post-reopen
undo/redo, then writes `journey-result.json` and `tracer.pdf`. Any failed
assertion or runtime error exits nonzero. `--run-packaged-tracer` remains a
single-process compatibility seam and labels that limitation in its result.
Target-desktop picker, portal, drag/drop and reveal acceptance still requires
Garuda KDE/Wayland.
