import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflows = [
  '.github/workflows/dw-t00-macos.yml',
  '.github/workflows/dw-g01-linux.yml',
]

test('both packaged operating-system gates verify the exact pull-request head', async () => {
  for (const path of workflows) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/)
    assert.equal(source.match(/ref: \$\{\{ env\.EXPECTED_SHA \}\}/g)?.length, 2)
    assert.equal(source.match(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/g)?.length, 2)
    assert.match(source, /name: deck-workbench-[^\n]*\$\{\{ env\.EXPECTED_SHA \}\}/)
    assert.doesNotMatch(source, /name: deck-workbench-[^\n]*\$\{\{ github\.sha \}\}/)
  }
})
