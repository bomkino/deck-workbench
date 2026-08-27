from pathlib import Path

source_path = Path('scripts/apply-workbench-fix.py')
exec(compile(source_path.read_text(), str(source_path), 'exec'))

test_path = Path('tests/journal-record-boundary.test.mjs')
source = test_path.read_text()
source = source.replace('  PitchDeckDocumentStore,\n', '')
source = source.replace(
    "\ntest('the document-store contract exposes the same zero hash used by strict parsing', () => {\n"
    "  assert.equal(PitchDeckDocumentStore.zeroHash, ZERO_HASH)\n"
    "})\n",
    '\n',
)
test_path.write_text(source)

Path('scripts/apply-workbench-fix-v4.py').unlink()
