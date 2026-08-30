import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, core, workspace, contract, preload, linux, macController, macBridge, macApp] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/bridge-contract/bridge.contract.json', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/preload.cjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/BridgeCoordinator.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/DeckWorkbenchApp.swift', import.meta.url), 'utf8'),
])

test('workbench offers Light, Dark, and System without changing layout geometry', () => {
  assert.match(html, /<html lang="en" data-theme="system" data-theme-effective="light">/)
  assert.match(html, /<select id="theme" aria-label="Theme">[\s\S]*value="system"[\s\S]*value="light"[\s\S]*value="dark"/)
  assert.match(styles, /:root\[data-theme-effective="dark"\]/)
  assert.match(styles, /color-scheme: dark/)
  assert.match(styles, /--paper: #171a1c/)
  assert.doesNotMatch(styles, /data-theme-effective="dark"[^}]*--(?:interface-scale|artboard-zoom|space-|control-size)/)
  assert.match(core, /function applyThemePreference\(preference\)/)
  assert.match(workspace, /themeMediaQuery\?\.addEventListener\('change'/)
})

test('theme preference crosses both narrow native bridges and native menus', () => {
  const methods = JSON.parse(contract).methods
  assert(methods.some((method) => method.name === 'ui.setTheme' && method.javascriptName === 'setTheme'))
  assert.match(preload, /setTheme: \(payload = \{\}\) => invoke\('ui\.setTheme', payload\)/)
  assert.match(linux, /case 'ui\.setTheme'/)
  assert.match(linux, /nativeTheme\.themeSource = preferences\.theme/)
  assert.match(macController, /func setTheme\(_ value: String\)/)
  assert.match(macController, /NSApplication\.shared\.appearance/)
  assert.match(macBridge, /case \.uiSetTheme:/)
  assert.match(macApp, /Menu\("Theme"\)/)
})
