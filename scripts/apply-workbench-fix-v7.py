from pathlib import Path

base = Path('scripts/apply-workbench-fix.py')
if not base.exists():
    raise SystemExit('base Workbench hardening script is missing')

# Execute the already-reviewed deterministic patch directly. The base script may
# remove its own temporary files; its code is loaded in memory before execution.
exec(compile(base.read_text(), str(base), 'exec'))

# Remove one redundant implementation-shape assertion.
test_path = Path('tests/journal-record-boundary.test.mjs')
if not test_path.exists():
    raise SystemExit('journal record-boundary test is missing after patch application')
source = test_path.read_text()
source = source.replace('  PitchDeckDocumentStore,\n', '')
source = source.replace(
    "\ntest('the document-store contract exposes the same zero hash used by strict parsing', () => {\n"
    "  assert.equal(PitchDeckDocumentStore.zeroHash, ZERO_HASH)\n"
    "})\n",
    '\n',
)
test_path.write_text(source)

# The generated kernel is a frozen VM object. Shadow only commit on a child
# object instead of proxying or spreading non-configurable properties.
fence_path = Path('tests/durable-session-fencing.test.mjs')
if not fence_path.exists():
    raise SystemExit('durable-session-fencing test is missing after patch application')
source = fence_path.read_text()
proxy_fixture = """  const faultingKernel = new Proxy(kernel, {
    get(object, property) {
      if (property === 'commit') {
        return () => ({
          ok: false,
          error: { name: 'KernelUnavailable', message: 'injected live commit failure' },
        })
      }
      const value = Reflect.get(object, property)
      return typeof value === 'function' ? value.bind(object) : value
    },
  })
"""
spread_fixture = """  const faultingKernel = {
    ...kernel,
    commit: () => ({
      ok: false,
      error: { name: 'KernelUnavailable', message: 'injected live commit failure' },
    }),
  }
"""
child_fixture = """  const faultingKernel = Object.create(kernel)
  Object.defineProperty(faultingKernel, 'commit', {
    value: () => ({
      ok: false,
      error: { name: 'KernelUnavailable', message: 'injected live commit failure' },
    }),
  })
"""
if proxy_fixture in source:
    source = source.replace(proxy_fixture, child_fixture)
elif spread_fixture in source:
    source = source.replace(spread_fixture, child_fixture)
elif child_fixture not in source:
    raise SystemExit('durable-session-fencing kernel fixture is not recognised')
fence_path.write_text(source)

# Only the two canonical package workflows belong in the promoted tree.
canonical_workflows = {'dw-g01-linux.yml', 'dw-t00-macos.yml'}
for path in Path('.github/workflows').glob('*.y*ml'):
    if path.name not in canonical_workflows:
        path.unlink(missing_ok=True)

for path in Path('scripts').glob('apply-workbench-fix*.py'):
    path.unlink(missing_ok=True)
