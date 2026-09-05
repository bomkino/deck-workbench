"""One-time, checksum-verified import of the user's saved native repair."""
import base64, gzip, hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path

ROOT = Path.cwd()
assert os.environ.get('GITHUB_REPOSITORY') == 'bomkino/deck-workbench'
parts = ['ee79a73f7d81a60064c774dec4fbde37b37f0431', 'e50197235efb3d75294523e1be9822e1b2b0e7db', 'bddb072162a850d82d3ca722dd62ea76fe3883e5', 'e36696586511da5de6ea436f052844f378016edc', 'ffe6c4f5a869f6239fa9ee196f69166c87b67700', 'c4f97290c5df896637a2ecc8be5ae6da4fcc7d0f', 'ef258fc068e6fe1cccd7bd0491cdb0fe8aa92afb', '90758620dde4015042a7049ea19dd9b0264063cb', '09083a5147a6b44434ab1da543be78df70342039', 'ff797865990ee45c3fe60f1e150bbe225b0c8537']
if not Path('apps/macos/Sources/NativeMain.swift').exists():
    chunks = []
    for sha in parts:
        response = json.loads(subprocess.check_output(['gh', 'api', f'repos/bomkino/deck-workbench/git/blobs/{sha}']))
        chunk = base64.b64decode(response['content'])
        assert hashlib.sha1(b'blob ' + str(len(chunk)).encode() + b'\0' + chunk).hexdigest() == sha
        chunks.append(chunk)
    patch = gzip.decompress(b''.join(chunks))
    assert hashlib.sha256(patch).hexdigest() == 'eca1ed5bdc49363c5c60666f034906ef8835965e597cf0f5b9ec0ffd14818289'
    with tempfile.NamedTemporaryFile(suffix='.patch') as f:
        f.write(patch); f.flush()
        subprocess.run(['git', 'apply', '--check', f.name], check=True)
        subprocess.run(['git', 'apply', '--index', f.name], check=True)

# Preserve the authored icon independently of the retired generated web resources.
icon = Path('apps/macos/Resources/workbench-mark.svg')
if not icon.exists():
    shutil.copyfile('packages/workspace/app/workbench-mark.svg', icon)
p = Path('scripts/build-macos-icon.sh')
p.write_text(p.read_text().replace('Resources/Workspace/workbench-mark.svg', 'Resources/workbench-mark.svg'))

# Retire executable platform/UI paths, not the domain data or historical evidence.
for name in ['apps/linux', 'scripts/linux', 'packages/workspace', 'prototypes/phased-workbench', '.impeccable', 'apps/macos/Resources/Workspace']:
    p = Path(name)
    if p.is_symlink() or p.is_file(): p.unlink()
    elif p.exists(): shutil.rmtree(p)
for name in ['BridgeCoordinator', 'DeckSessionController', 'DeckWorkbenchApp', 'DeckWorkbenchMain', 'MediaAssetSchemeHandler', 'PackagedTracer', 'WorkspaceSchemeHandler', 'WorkspaceWebView', 'WritingImport']:
    Path(f'apps/macos/Sources/{name}.swift').unlink(missing_ok=True)
for name in ['build-workspace.mjs', 'build-phased-tracer.mjs', 'verify-phased-tracer.mjs', 'verify-source.mjs', 'verify-repository.mjs', 'write-evidence-receipt.mjs']:
    Path('scripts', name).unlink(missing_ok=True)
# This old import test depended on both removed product targets, not the native importer.
Path('tests/writing-import-kernel.test.mjs').unlink(missing_ok=True)

package = json.loads(Path('package.json').read_text())
package['version'] = '0.1.0'
package.pop('dependencies', None)
package['scripts'] = {
    'generate': 'node scripts/build-kernel.mjs',
    'build': 'scripts/build-native-macos.sh',
    'build:macos': 'scripts/build-native-macos.sh',
    'test': 'node scripts/test-native-kernel.mjs',
    'verify': 'npm test',
    'verify:package': 'scripts/verify-native-package.sh'
}
Path('package.json').write_text(json.dumps(package, indent=2) + '\n')
root = {k: package[k] for k in ['name', 'version', 'license', 'engines']}
Path('package-lock.json').write_text(json.dumps({'name': package['name'], 'version': package['version'], 'lockfileVersion': 3, 'requires': True, 'packages': {'': root}}, indent=2) + '\n')
for name, target in [('build-macos.sh', 'build-native-macos.sh'), ('verify-packaged-macos.sh', 'verify-native-package.sh')]:
    p = Path('scripts', name)
    p.write_text('#!/bin/bash\nset -euo pipefail\nexec "$(dirname "$0")/' + target + '" "$@"\n')
    p.chmod(0o755)
for p in [Path('scripts/build-native-macos.sh'), Path('scripts/verify-native-package.sh')]: p.chmod(0o755)

# Keep legal provenance for retained materials; remove retired runtime declarations.
p = Path('THIRD_PARTY.md')
lines = [line for line in p.read_text().splitlines() if not line.startswith(('| Electron |', '| appimagetool |', '| AppImage type-2 runtime |', 'Deck Workbench uses Electron only'))]
text = '\n'.join(lines).replace('Shared WebKit/Chromium workspace and native macOS shell', 'Native macOS application').replace('Shared workspace and native macOS shell', 'Native macOS application')
text += '\n\nSince v0.1.0, Linux/Electron and web distributions are retired. The Mac app uses Apple frameworks, a bundled local JavaScriptCore document kernel, and retained native font/icon assets. Historical web-font provenance remains under legal/; those WOFF2 assets are not shipped in the native app. Node.js is a build/development tool, not an application runtime.\n'
p.write_text(text)

readme = '''# Deck Workbench

A Mac-only tool for turning final copy and selected media into a clear prototype and designer handoff. It does not replace the designer.

## Current version: v0.1.0 — native Mac user-test build

The native repair is the active source and build path. This version is being promoted at the studio's explicit request without running the full acceptance suite. A published app archive means it compiled and was packaged; it does **not** mean that export appearance, migration, recovery, keyboard behaviour, performance or accessibility have been validated.

[Download v0.1.0](https://github.com/bomkino/deck-workbench/releases/tag/v0.1.0). Use the `.app.zip`, not the automatic GitHub source archive. Apple Silicon and macOS 26 or newer are required. The app is ad-hoc signed, not notarized. macOS may require approval through its security controls. Do not disable system security globally.

**Start with a duplicate of a deck and retain v0.0.6 as a fallback.** The first native edit upgrades the package's reader schema; v0.0.6 cannot reopen that upgraded working copy. The original v0.0.6 release remains available. Source media is not intentionally modified.

## Working flow

Import final copy, curate the images, suggest the arrangement, export the handoff. The two main workspaces are Curate and Assemble; notes and copy remain associated with each slide. New prototypes default to 2576 x 1080. Copy is protected by default, not a writing assignment to complete in the app.

The native source implements whole-deck Prototype.pdf, Prototype with notes.pdf, editable Copy.md, and original files grouped per slide under Approved Media and Shortlisted Media. Chosen assignments and shortlist membership are independent. Creative warnings do not veto an otherwise possible export. These behaviours still need the studio's hands-on testing.

Keyboard reference: Help > Keyboard Shortcuts, or Command-/. In Curate, arrows browse; Space opens preview; S shortlists; Shift-S removes shortlist membership; M chooses for the active role; X rejects; [ and ] switch slides. Shortcuts pause while editing text. Command-Shift-E opens Export Handoff.

## Build

On Apple-Silicon macOS 26+, with Xcode command-line tools and Node.js 24+:

```sh
npm run build
```

The archive and SHA-256 file are written under artifacts/. No Electron installation or web build is required.

Optional development checks (not release claims): `npm test` for document-kernel behaviour, and `npm run verify:package` for the scripted Mac package journey. The latter is not run by this user-test release workflow.

## Documentation

- [Mac workflow and handoff](docs/MAC_APP.md)
- [Known limitations and testing boundary](docs/KNOWN_LIMITATIONS.md)
- [Architecture and remaining work](docs/NATIVE_ARCHITECTURE.md)
- [Release notes](docs/RELEASE_NOTES.md)
- [Documentation index](docs/README.md)

Linux, Electron packaging and the web workspace are retired. Previous architecture/product/ticket documents are historical evidence, not current operating instructions. No account, cloud service, model or telemetry is required. Licensed under AGPL-3.0; see LICENSE, NOTICE and THIRD_PARTY.md.
'''
Path('README.md').write_text(readme)
Path('PRODUCT.md').write_text('# Product\n\nWorkbench is a Mac-only prototype and designer-handoff tool, not a final-production design application. Final copy plus image decisions and notes become rough slide direction and a portable folder for designers. Defaults: 2576 x 1080, full bleed, readable provisional text, a useful gradient. Curate and Assemble are working surfaces; import and export are actions. See docs/MAC_APP.md and docs/KNOWN_LIMITATIONS.md.\n')
Path('DESIGN.md').write_text('# Native interface direction\n\nPrefer stable native Mac controls, visible slide context, keyboard-complete curation, modest provisional type, and a dominant Assembly canvas. Preserve exact copy and image decisions; do not add a production typography system. Grid baseline: 2576 x 1080, 24 columns / 12 rows, margins 96 / 64 and gutters 16 / 8 canvas units. User layouts remain suggestions for designers. See docs/NATIVE_ARCHITECTURE.md.\n')
Path('CONTRIBUTING.md').write_text('# Contributing\n\nRead README.md, docs/NATIVE_ARCHITECTURE.md and docs/KNOWN_LIMITATIONS.md. Build the native app with npm run build on Apple-Silicon macOS 26+. Keep changes narrow and preserve existing decks. Do not commit client copy, media, local decks or credentials. Behavioural checks must prove a user-visible outcome, not a particular implementation shape. The September 2026 user-test promotion waives acceptance testing for that release only; do not silently generalise that waiver.\n')
Path('AGENTS.md').write_text('''# Workbench repository instructions

Read README.md, docs/MAC_APP.md, docs/NATIVE_ARCHITECTURE.md and docs/KNOWN_LIMITATIONS.md first. Old numbered product/architecture/implementation documents are historical.

Build only the native Mac application. Preserve the local document kernel, stable slide/asset identities, exact semantic copy, independent shortlist membership, undo, durable acknowledgement and recoverable user files. Native SwiftUI/AppKit owns interaction; JavaScriptCore hosts the internal kernel, not a web UI. Do not reintroduce Linux, Electron or a browser product.

Work on a codex/ branch. Record the exact starting SHA and inspect the diff. Never commit private decks, source media, credentials or build products. Never force-push, delete unrelated work or silently change existing user documents. Promotion/release requires explicit user authority.

The studio explicitly authorised promotion of v0.1.0 without full acceptance testing and will test it themselves. Label unverified behaviour honestly. Compilation/package integrity is distinct from functional verification. Do not claim the entire master plan is complete.

Test meaningful changed behaviour only. Preserve useful durability tests; do not add tests that only search function names. Keep documentation current and mark historical evidence as historical rather than rewriting past results. Preserve AGPL-3.0 and retained dependency notices.
''')
Path('docs').mkdir(exist_ok=True)
Path('docs/MAC_APP.md').write_text('''# Mac workflow

Import a UTF-8 Markdown/text file. Workbench Markdown v1 remains an intended input; plain Markdown uses `## Slide title` and optional `### Headline`, `### Body` and `### Notes` fields. Inspect the import preview. Arbitrary DOCX/PDF parsing is not implemented. New decks default to 2576 x 1080.

Curate keeps the current slide, locked copy and media context together. Attach media folders, choose an image for a role, and save additional candidates. Chosen assignments and shortlist membership are separate. Use Help > Keyboard Shortcuts (Command-/); Command-1/2 switches Curate/Assemble. Curation letters should not act while typing notes, copy or search text.

Assemble is for suggested image crops, text region, columns and gradients. Fit Copy adjusts provisional presentation without rewriting words. Complete text is retained separately when the rough slide cannot show it all. The renderer is shared with PDF output, and selection controls are not slide content.

Export Handoff (Command-Shift-E) offers Prototype.pdf, Prototype with notes.pdf, Copy.md, original-media folders Approved Media/ and Shortlisted Media/ grouped per slide, and a media index. Options may be selected separately. Exported source originals are copies, not cropped derivatives. Long notes continue outside the slide preview. Source/destination failures must be reported, not called success.

Before testing, duplicate the .pitchdeck in Finder while it is closed. First native editing upgrades its package reader schema and keeps a compatibility backup inside recovery/pre-native-0.0.6. That internal backup is not a substitute for an independent duplicate. Keep the old app away from the upgraded working copy. File > Recover Saved Copy creates a separate recovery destination; its behaviour is still awaiting hands-on verification.
''')
Path('docs/KNOWN_LIMITATIONS.md').write_text('''# Known limitations — v0.1.0

This is a user-test release, not a declaration that the master plan is complete. The studio explicitly waived full acceptance testing for promotion on 5 September 2026.

## Not established by a successful build

Actual PDF appearance and notes pagination; original-media folder correctness; existing-deck migration and fault recovery; fast keyboard/focus behaviour; scan cancellation and permissions across volumes; performance/memory on target hardware; VoiceOver and larger interface scales. Test a duplicate deck first.

## Scope and differences

Apple Silicon, macOS 26+ only. Ad-hoc signed, not notarized. No Linux, web or Electron product. Import is bounded Markdown/text, not a universal document converter. Ratings and project-wide picks are not fully exposed in the native UI; no complete legacy-feature parity claim. Provisional typography is intentionally modest. Very dense copy may overflow the suggested visual region; copy/notes outputs retain the complete writing. Some media may be copyable without a preview. Media scanning and export still have bounded resource limits.

The local kernel checks recorded in the previous handoff are historical evidence, not acceptance of this package. The build workflow deliberately does not run the optional native self-test. New failures should be fixed from the smallest reproducible user journey, without another broad test or architecture project.
''')
Path('docs/NATIVE_ARCHITECTURE.md').write_text('''# Active native architecture

NativeWorkbenchUI / NativeCanvas / NativeShortcuts are the working Mac surfaces. NativeWorkbenchController owns transient view state and queues intentions with captured slide/asset identity. NativeDocumentSession serialises the kernel and durable store. DeckKernelHost runs the bundled TypeScript-derived JavaScript in JavaScriptCore without a browser. PitchDeckDocumentStore owns checkpoints, journals, reader compatibility and recovery. MediaCatalogSession and NativeMediaIO own authorised source access and derived previews. NativeSlideRenderer resolves copy/images/gradients; NativeHandoffExporter uses that content for the designer package.

Build entry: scripts/build-native-macos.sh. It compiles Native*.swift plus the shared kernel host, catalog, store and failure types. The old WebKit application entry point and workspace are removed. scripts/build-macos.sh delegates to the native build. No npm production dependency is required.

Remaining proof is tracked in KNOWN_LIMITATIONS.md. Priorities after hands-on feedback: correct missing/wrong content first; then stable keyboard/focus, source/recovery failures, and measured responsiveness. Keep scope to prototype direction and handoff. Do not add production typography, universal file conversion, cloud collaboration, new runtimes or unrelated abstractions.
''')
Path('docs/RELEASE_NOTES.md').write_text('''# v0.1.0 — Native Mac user-test release

This release becomes the active Mac version at the studio's explicit request, without the full acceptance suite. The studio will test it hands-on. Successful compilation and packaging do not establish behavioural correctness.

The rebuild replaces the WebKit workspace with native Curate/Assemble surfaces. Source implements whole-deck and notes PDFs, complete copy and per-slide original-media handoff, independent shortlist membership, queued decisions, provisional text fitting, native image handling and saved-copy recovery. Linux/Electron/web distribution paths are retired and current documentation has been rewritten.

**Use a duplicate deck first.** First native editing upgrades the working package reader schema. Keep the original deck and v0.0.6 as a fallback. This build requires Apple-Silicon macOS 26+ and is ad-hoc signed, not notarized. Import, PDF appearance, media exports, migration/recovery, performance and accessibility remain unverified. The complete master plan is not claimed finished.

Download the .app.zip asset and retain its .sha256 checksum. Automatic GitHub source archives are not the installable app.
''')
Path('docs/README.md').write_text('''# Documentation index

Current: MAC_APP.md, NATIVE_ARCHITECTURE.md, KNOWN_LIMITATIONS.md and RELEASE_NOTES.md. Start with the root README for download/build commands.

The product/, architecture/, implementation/, evidence/ and 03-build/ directories preserve earlier specifications and evidence. Historical reports are not proof that v0.1.0 works. The active product is Mac-only, with native Curate/Assemble and a designer handoff rather than a production-design application.
''')
for folder in ['product', 'architecture', 'implementation', '03-build']:
    for p in Path('docs', folder).rglob('*.md'):
        text = p.read_text()
        if not text.startswith('> Historical document'):
            p.write_text('> Historical document: superseded for current product/build decisions by the documentation index in docs/README.md. Retained as history, not a v0.1.0 acceptance claim.\n\n' + text)
Path('docs/implementation/NATIVE_REPAIR_STATUS.md').write_text('# Native repair status\n\nThe saved implementation is now applied as active native source. On 5 September 2026 the studio explicitly authorised promotion without full acceptance testing and will test the version themselves. This supersedes the earlier gate in this file. Current behaviour and remaining uncertainty are documented in docs/KNOWN_LIMITATIONS.md. Source, compiled package and successful user testing are distinct claims.\n')
Path('docs/03-build/RELEASE_DEFINITION.md').write_text('# Release definition\n\nv0.1.0 is explicitly a user-test release. Promotion is authorised without the full acceptance suite. Distribution requires successful native compilation, bundle signing/integrity checks and a checksum, but those do not establish functional correctness. Release notes must disclose the waived checks and the working-copy schema upgrade. Do not treat this one-release waiver as a permanent quality policy.\n')
Path('scripts/promote-native.py').unlink()
print('Applied native repair and current Mac-only documentation. Acceptance testing intentionally not run.')
