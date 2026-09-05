# Third-party software

Record every production dependency and copied source fragment.

| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |
|---|---|---|---|---|---|---|
| actions/checkout | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) | https://github.com/actions/checkout | MIT | GitHub Actions only | Check out exact repository commit for verification | Unmodified action pinned by commit; not shipped in application |
| actions/setup-node | v7.0.0 (`820762786026740c76f36085b0efc47a31fe5020`) | https://github.com/actions/setup-node | MIT | GitHub Actions only | Select Node.js 24 for deterministic generators and portable tests | Unmodified action pinned by commit; not shipped in application |
| actions/upload-artifact | v7.0.1 (`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`) | https://github.com/actions/upload-artifact | MIT | GitHub Actions only | Retain packaged tracer and evidence artifacts | Unmodified action pinned by commit; not shipped in application |
| FontBlind v13 font binaries | v13.0.0 (`786b4a2b671182319320f922b8de8f927ea3a002`) | https://github.com/bomkino/pitchdog-type-system/tree/v13.0.0 | CC0-1.0 | Native macOS application | Provide the pitch.dog Head, Body, alternate, italic, and Eyebrow families for application typography | Six source-identical WOFF2 binaries, one full-character-map Eyebrow WOFF2 axis instance, and three native Body OTF anchors are vendored with exact hashes; transform details, source hash, licence, and provenance ship under `legal/fontblind-v13/` |
| Phosphor Icons Web | 2.1.2 (`70854726d7bd82ae21f0dc81b5b5c35240a77066`) | https://github.com/phosphor-icons/web/tree/v2.1.2 | MIT | Native macOS application | Provide one coherent offline icon family for authored application actions | Unmodified regular WOFF2 and TTF files are vendored with exact hashes; licence and provenance ship under `legal/phosphor-icons/` |


Development-only tools should be recorded when their licence or distribution terms require it. Do not list operating-system frameworks as copied project code, but document platform requirements in the README.

Since v0.1.0, Linux/Electron and web distributions are retired. The Mac app uses Apple frameworks, a bundled local JavaScriptCore document kernel, and retained native font/icon assets. Historical web-font provenance remains under legal/; those WOFF2 assets are not shipped in the native app. Node.js is a build/development tool, not an application runtime.
