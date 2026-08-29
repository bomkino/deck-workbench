import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [macVerifier, linuxVerifier, macWorkflow, linuxWorkflow] = await Promise.all([
  readFile(new URL('../scripts/verify-packaged-macos.sh', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/linux/verify-packaged-linux.sh', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/dw-t00-macos.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/dw-g01-linux.yml', import.meta.url), 'utf8'),
])

test('packaged Curate hooks bind evidence to the exact package commit and platform', () => {
  assert.equal(
    macVerifier.includes('"$CURATE_RESULT" "$COMMIT_SHA" macos-arm64 app-zip \'extracted macOS app\''),
    true,
  )
  assert.match(linuxVerifier, /"\$COMMIT_SHA" ubuntu-x64 tarball 'extracted Linux tarball'/)
  assert.match(linuxVerifier, /"\$COMMIT_SHA" ubuntu-x64 appimage 'exact AppImage'/)
  assert.equal(linuxVerifier.match(/test -s "\$[^\n]*curate-journey-result\.json"/g)?.length, 2)
})

test('CI cannot silently claim Curate while native packaged tracers emit no result', () => {
  for (const verifier of [macVerifier, linuxVerifier]) {
    assert.match(verifier, /DW_REQUIRE_CURATE_JOURNEY:-0/)
    assert.match(verifier, /WB-F02 packaged Curate journey: UNVERIFIED/)
    assert.match(verifier, /curate-gate-status\.txt/)
  }
  for (const workflow of [macWorkflow, linuxWorkflow]) {
    assert.doesNotMatch(workflow, /DW_REQUIRE_CURATE_JOURNEY/)
  }
})
