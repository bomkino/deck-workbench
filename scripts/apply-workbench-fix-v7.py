from pathlib import Path
import re

v6 = Path('scripts/apply-workbench-fix-v6.py')
if not v6.exists():
    raise SystemExit('final Workbench hardening script is missing')
exec(compile(v6.read_text(), str(v6), 'exec'))

for path in Path('.github/workflows').glob('*.y*ml'):
    source = path.read_text()
    if re.search(r'^name:\s*Workbench promotion finalizer\s*$', source, flags=re.M):
        path.unlink()
    elif re.search(r'^name:\s*Workbench fix quiesce\s*$', source, flags=re.M):
        path.unlink()

for path in Path('scripts').glob('apply-workbench-fix*.py'):
    path.unlink()
