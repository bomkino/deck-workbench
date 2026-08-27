import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const startingSHA = '7ea90410287a5f90b44567ef5fc53e62736191ae'
const endingSHA = git('rev-parse', 'HEAD')
const branch = process.env.GITHUB_REF_NAME || git('branch', '--show-current') || 'detached'
const evidenceRoot = join(root, 'artifacts', 'evidence', 'linux')
const journeyPath = join(evidenceRoot, 'journey', 'journey-result.json')
const pdfPath = join(evidenceRoot, 'journey', 'tracer.pdf')
const appImageJourneyPath = join(evidenceRoot, 'appimage-journey', 'journey-result.json')
const appImagePDFPath = join(evidenceRoot, 'appimage-journey', 'tracer.pdf')
const archivePath = join(root, 'artifacts', `Deck-Workbench-linux-x64-${endingSHA}.tar.gz`)
const archPackagePath = join(root, 'artifacts', `deck-workbench-0.0.0.r${endingSHA.slice(0, 12)}-1-x86_64.pkg.tar.zst`)
const appImagePath = join(root, 'artifacts', `Deck-Workbench-0.0.0.r${endingSHA.slice(0, 12)}-x86_64.AppImage`)
const journey = JSON.parse(readFileSync(journeyPath, 'utf8'))
const appImageJourney = JSON.parse(readFileSync(appImageJourneyPath, 'utf8'))

const receipt = `# DW-G01 Ubuntu Linux package evidence receipt

## Identity

- Repository: \`bomkino/deck-workbench\`
- Branch: \`${branch}\`
- Starting SHA: \`${startingSHA}\`
- Ending SHA: \`${endingSHA}\`
- Host gate: \`ubuntu-24.04 x86_64 + Xvfb/X11\`
- Electron: \`44.0.0\`
- appimagetool: \`1.9.1\`, SHA-256 pinned before execution
- AppImage type-2 runtime: \`20251108\`, SHA-256 pinned before embedding
- Date: ${new Date().toISOString()}

## Verified surfaces

| Surface | Status | Direct evidence |
|---|---|---|
| Source and portable tests | verified | \`npm test\` and \`node scripts/verify-source.mjs\` passed in the workflow before packaging |
| Linux archive | verified | \`${relative(root, archivePath)}\`; SHA-256 \`${sha256(archivePath)}\` |
| Arch package structure | verified | \`${relative(root, archPackagePath)}\`; clean extraction, identity, x86_64 metadata, launcher target and expected install paths inspected; SHA-256 \`${sha256(archPackagePath)}\` |
| AppImage reproducibility | verified | Two builds from the same normalized AppDir and \`SOURCE_DATE_EPOCH\` were byte-identical; \`${relative(root, appImagePath)}\`; SHA-256 \`${sha256(appImagePath)}\` |
| AppImage extraction and identity | verified | The exact AppImage runtime performed a clean SquashFS extraction; the extracted inner executable, exact commit manifest and shipped runtime licence were inspected directly |
| Executable architecture | verified | Extracted executable is ELF 64-bit x86-64 |
| Exact source identity | verified | Tarball and AppImage extraction manifests name commit \`${endingSHA}\` and Electron 44.0.0 |
| Extracted tarball process journey | verified | Two distinct extracted Electron application processes completed create/edit/save/quit/reopen/undo/redo, persisted independent scale controls, and PDF; result SHA-256 \`${sha256(journeyPath)}\` |
| Exact AppImage process journey | verified | The exact hashed AppImage ran twice through its embedded runtime without FUSE, retained document/preferences across distinct processes, preserved the sandbox boundary, and exported PDF; result SHA-256 \`${sha256(appImageJourneyPath)}\` |
| PDF projection | verified | Both package lanes produced one page parsed by \`pdfinfo\`; tarball PDF SHA-256 \`${sha256(pdfPath)}\`; AppImage PDF SHA-256 \`${sha256(appImagePDFPath)}\` |

## Commands and results

| Command | Result |
|---|---|
| \`npm test\` | portable causal suite passed |
| \`node scripts/verify-source.mjs\` | source authority and dependency contract passed |
| \`npm run build:linux\` | exact-commit tarball, Arch package and byte-reproducible AppImage built |
| \`npm run verify:linux\` | checksums, extraction, x86-64 identity, legal files, two-process tarball/AppImage journeys and one-page PDFs passed |

## Third-party runtime and build inputs

| Component | Exact version / identity | Role |
|---|---|---|
| Electron | \`44.0.0\` | shipped sandboxed Linux runtime |
| appimagetool | \`1.9.1\`, commit \`8c8c91f762b412a19f4e8d2c4b35afb98f2d7c81\`, asset SHA-256 \`ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0\` | pinned CI packaging tool |
| AppImage type-2 runtime | \`20251108\`, commit \`dd6cebedcbddde9c82f89b011e8e1d40b6e43868\`, asset SHA-256 \`2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d\` | shipped AppImage runtime |

## Journey result

\`\`\`json
${JSON.stringify(journey, null, 2)}
\`\`\`

## AppImage journey result

\`\`\`json
${JSON.stringify(appImageJourney, null, 2)}
\`\`\`

## Honest status

- Ubuntu/X11 extracted tarball and AppImage tracers: **verified for this exact commit**, limited to the explicit results above.
- Full app-process quit/relaunch and persisted Interface Scale/artboard zoom: **verified under Ubuntu/Xvfb** with distinct process IDs and the same isolated XDG configuration home.
- Linux native Save/Close/Interface Scale menu commands: **source-ready, interactive acceptance unverified**. The non-interactive tracer does not exercise KDE menu interaction.
- Garuda/KDE Plasma/Wayland integration: **unverified external gate**. Ubuntu/Xvfb does not prove KWin/Wayland, KDE portals and native pickers, DBus integration, drag/drop/reveal, target fonts/codecs/GPU paths, or installation on Jenai's machine.
- Arch \`.pkg.tar.zst\`: **package structure verified, installation unverified**. Ubuntu archive inspection does not prove a successful \`pacman\` transaction or launch on Garuda.
- AppImage install/desktop integration outside CI: **unverified**. CI proves the exact AppImage's architecture, deterministic construction, clean extraction, direct launch and semantic journey; it does not prove KDE launcher or portal integration.
- Release/tag/merge/install: **not applicable to this CI evidence receipt**.
- Unsupported claims: production suitability, Garuda parity, KDE/Wayland integration, notarization, release distribution, broad editor behavior, full Pattern family, final PDF typography, PPTX and target-machine accessibility acceptance.

## Next exact gate

Run these same exact-SHA packages and semantic round trip on the target Garuda KDE/Wayland system, including pacman/AppImage desktop install, KDE portal, launcher and native interaction verification, without weakening the renderer sandbox.
`

writeFileSync(join(evidenceRoot, 'DW-G01-UBUNTU-EVIDENCE-RECEIPT.md'), receipt)
console.log(`Wrote Ubuntu Linux evidence receipt for ${basename(archivePath)}`)
