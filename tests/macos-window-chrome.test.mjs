import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, webView, coordinator, styles] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/WorkspaceWebView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/BridgeCoordinator.swift', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
])

test('macOS uses one full-content window frame with native traffic lights and a bounded native drag zone', () => {
  assert.match(app, /\.windowStyle\(\.hiddenTitleBar\)/)
  assert.match(app, /\.ignoresSafeArea\(\.container, edges: \.top\)/)
  assert.doesNotMatch(app, /\.windowBackgroundDragBehavior\(\.enabled\)/)
  assert.match(webView, /window\.styleMask\.insert\(\.fullSizeContentView\)/)
  assert.match(webView, /window\.titleVisibility = \.hidden/)
  assert.match(webView, /window\.titlebarAppearsTransparent = true/)
  assert.match(webView, /window\.titlebarSeparatorStyle = \.none/)
  assert.match(webView, /window\.isMovableByWindowBackground = true/)
  assert.match(webView, /final class WorkbenchWebContainer: NSView/)
  assert.match(webView, /WorkbenchWindowDragRegion/)
  assert.match(webView, /addSubview\(dragRegion, positioned: \.above, relativeTo: webView\)/)
  assert.match(webView, /dragRegion\.topAnchor\.constraint\(equalTo: topAnchor\)/)
  assert.match(webView, /dragRegion\.widthAnchor\.constraint\(equalToConstant: 32\)/)
  assert.match(webView, /dragRegion\.heightAnchor\.constraint\(equalToConstant: 48\)/)
  assert.match(webView, /final class WorkbenchWebContainer: NSView \{[\s\S]*override var mouseDownCanMoveWindow: Bool \{ true \}/)
  assert.match(webView, /final class WorkbenchWindowDragRegion: NSView \{[\s\S]*override var mouseDownCanMoveWindow: Bool \{ true \}/)
  assert.match(webView, /final class WorkbenchWKWebView: WKWebView \{[\s\S]*override var mouseDownCanMoveWindow: Bool \{ false \}/)
  assert.match(webView, /window\.standardWindowButton\(\$0\)/)
  assert.match(webView, /container\.convert\(\$0\.bounds, from: \$0\)\.maxX/)
  assert.match(webView, /--macos-window-controls-inset/)
  assert.match(coordinator, /webView\.superview as\? WorkbenchWebContainer/)
  assert.match(coordinator, /WorkbenchWindowChrome\.synchronizeWindowControlInset\(for: container\)/)
})

test('the native host marks macOS before revealing the web workspace and reserves traffic-light space only there', () => {
  assert.match(webView, /document\.documentElement\.dataset\.workspaceHost = 'macos'/)
  assert.match(webView, /injectionTime: \.atDocumentStart/)
  assert.match(styles, /html\[data-workspace-host="macos"\] \.brand-cluster \{ padding-inline-start: calc\(var\(--macos-window-controls-inset, 76px\) \+ 40px\); \}/)
  assert.match(styles, /html\[data-workspace-host="macos"\] \.brand-mark \{ display: none; \}/)
  assert.doesNotMatch(styles, /:root[^}]*--macos-window-controls-inset/)
})
