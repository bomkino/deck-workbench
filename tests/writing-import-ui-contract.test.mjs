import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8')
const ui = await readFile(new URL('../packages/workspace/app/workspace-writing-import-ui.js', import.meta.url), 'utf8')
const prompt = await readFile(new URL('../packages/workspace/app/workspace-conversion-prompt-v1.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8')
const mac = await readFile(new URL('../apps/macos/Sources/DeckSessionController.swift', import.meta.url), 'utf8')
const linux = await readFile(new URL('../apps/linux/main.mjs', import.meta.url), 'utf8')

test('Plan writing controls stay visible without a Deck and the paste surface starts empty', () => {
  assert.match(html, /id="copy-conversion-prompt"/)
  assert.match(html, /id="open-writing-import"/)
  assert.match(html, /<textarea id="writing-import-source"[^>]*><\/textarea>/)
  assert.doesNotMatch(html, /id="writing-import-source"[^>]*>[^<]+<\/textarea>/)
  assert.match(html, /Paste the contents of a Workbench Markdown `\.md` file here\. Workbench does not upload the file\./)
  assert.match(css, /\.plan-phase:has\(#plan-empty:not\(\[hidden\]\)\)[^{]*\{[^}]*grid-template-areas: "tools" "editor"/)
  assert.match(css, /\.plan-import-tools \{ grid-area: tools/)
})

test('preview is byte-locked, invalidated on input, reparsed before import and duplicate clicks are guarded', () => {
  assert.match(ui, /approvedWritingImportSource = result\.ok \? source : null/)
  assert.match(ui, /writingImportSource\.addEventListener\('input', \(\) => invalidateWritingImportPreview\(\)\)/)
  assert.match(ui, /const reparsed = WorkbenchWritingImport\.parse\(source\)/)
  assert.match(ui, /source !== approvedWritingImportSource/)
  assert.match(ui, /if \(writingImportBusy \|\| approvedWritingImportSource === null\) return/)
  assert.match(ui, /setWritingImportBusy\(true\)[\s\S]*await window\.deckBridge\.create/)
  assert.match(ui, /workspaceDraftSummary\(\)[\s\S]*drafts\.total > 0[\s\S]*before importing writing/)
})

test('preview and errors render as text, never unsafe HTML', () => {
  assert.match(ui, /node\.textContent = value/)
  assert.doesNotMatch(ui, /innerHTML/)
  assert.match(ui, /Line \$\{item\.line\}/)
})

test('native clipboard confirmation gates Copied and failure exposes the full selectable prompt', () => {
  const successCheck = ui.indexOf("result?.copied !== true")
  const copiedLabel = ui.indexOf("textContent = 'Copied'")
  assert.ok(successCheck >= 0 && copiedLabel > successCheck)
  assert.match(ui, /conversionPromptFallback\.value = WORKBENCH_CONVERSION_PROMPT_V1\.text/)
  assert.match(ui, /conversionPromptFallback\.select\(\)/)
  assert.match(ui, /copyText\(\{ text: WORKBENCH_CONVERSION_PROMPT_V1\.text \}\)/)
  assert.match(prompt, /version: 'workbench-conversion-prompt\/1'/)
  assert.match(mac, /NSPasteboard\.general[\s\S]*setString\(text, forType: \.string\)[\s\S]*string\(forType: \.string\) == text/)
  assert.match(linux, /clipboard\.writeText\(payload\.text\)[\s\S]*clipboard\.readText\(\) !== payload\.text/)
})
