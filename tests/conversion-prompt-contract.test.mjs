import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../packages/workspace/app/workspace-conversion-prompt-v1.js', import.meta.url), 'utf8')
const build = await readFile(new URL('../scripts/build-workspace.mjs', import.meta.url), 'utf8')
const html = await readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8')
const ui = await readFile(new URL('../packages/workspace/app/workspace-writing-import-ui.js', import.meta.url), 'utf8')
const context = vm.createContext({})
vm.runInContext(`${source}\nglobalThis.__prompt = WORKBENCH_CONVERSION_PROMPT_V1`, context, {
  filename: 'workspace-conversion-prompt-v1.js',
})
const canonical = context.__prompt

test('conversion prompt v1 has one deterministic LF-only canonical identity', () => {
  assert.equal(canonical.version, 'workbench-conversion-prompt/1')
  assert.equal(canonical.text.includes('\r'), false)
  assert.equal(canonical.text.split('\n').length, 321)
  assert.equal(canonical.text.split('\n')[0], 'You are converting supplied pitch-deck writing into Workbench Markdown v1.')
  assert.equal(canonical.text.split('\n').at(-1), 'SOURCE WRITING END')
  assert.equal(Buffer.byteLength(canonical.text, 'utf8'), 7849)
  assert.equal(createHash('sha256').update(canonical.text).digest('hex'), 'c1163d4353faa1aa1e29bd9c31cf4120ff574fe7784e2ea69e11cff02ac2fb6b')
})

test('workspace build and copy UI consume the same canonical source', () => {
  assert.match(html, /workspace-conversion-prompt-v1\.js[\s\S]*workspace-writing-import-ui\.js/)
  assert.match(build, /'workspace-conversion-prompt-v1\.js'[\s\S]*'workspace-writing-import-ui\.js'/)
  assert.match(ui, /deckBridge\.copyText\(\{ text: WORKBENCH_CONVERSION_PROMPT_V1\.text \}\)/)
  assert.match(ui, /conversionPromptFallback\.value = WORKBENCH_CONVERSION_PROMPT_V1\.text/)
  assert.doesNotMatch(ui, /You are converting supplied pitch-deck writing/)
})
