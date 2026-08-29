import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../apps/macos/Sources/BridgeCoordinator.swift', import.meta.url),
  'utf8',
)

const start = source.indexOf('func invokeForTracer(')
const end = source.indexOf('\n    private func receive(', start)
assert.ok(start >= 0 && end > start, 'invokeForTracer implementation is unavailable')
const invokeForTracer = source.slice(start, end)

test('packaged WebKit tracer establishes native focus before testing DOM focus contracts', () => {
  assert.match(invokeForTracer, /guard let window = webView\.window/)
  assert.match(invokeForTracer, /window\.makeKeyAndOrderFront\(nil\)/)
  assert.match(invokeForTracer, /guard window\.makeFirstResponder\(webView\)/)
  assert.ok(
    invokeForTracer.indexOf('makeFirstResponder(webView)')
      < invokeForTracer.indexOf('webView.callAsyncJavaScript'),
    'the WebView must be first responder before the tracer enters JavaScript',
  )
})
