# Third-party software

Record every production dependency and copied source fragment.

| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |
|---|---|---|---|---|---|---|
| actions/checkout | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) | https://github.com/actions/checkout | MIT | GitHub Actions only | Check out exact repository commit for verification | Unmodified action pinned by commit; not shipped in application |
| actions/setup-node | v7.0.0 (`820762786026740c76f36085b0efc47a31fe5020`) | https://github.com/actions/setup-node | MIT | GitHub Actions only | Select Node.js 24 for deterministic generators and portable tests | Unmodified action pinned by commit; not shipped in application |
| actions/upload-artifact | v7.0.1 (`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`) | https://github.com/actions/upload-artifact | MIT | GitHub Actions only | Retain packaged tracer and evidence artifacts | Unmodified action pinned by commit; not shipped in application |
| FontBlind v13 font binaries | v13.0.0 (`786b4a2b671182319320f922b8de8f927ea3a002`) | https://github.com/bomkino/pitchdog-type-system/tree/v13.0.0 | CC0-1.0 | Native macOS application | Provide the pitch.dog Head, Body, alternate, italic, and Eyebrow families for application typography | Six source-identical WOFF2 binaries, one full-character-map Eyebrow WOFF2 axis instance, three native Body OTF anchors and one native Head Medium TTF anchor are vendored with exact hashes; transform details, source hash, licence, and provenance ship under `legal/fontblind-v13/` |
| Phosphor Icons Web | 2.1.2 (`70854726d7bd82ae21f0dc81b5b5c35240a77066`) | https://github.com/phosphor-icons/web/tree/v2.1.2 | MIT | Native macOS application | Provide one coherent offline icon family for authored application actions | Unmodified regular WOFF2 and TTF files are vendored with exact hashes; licence and provenance ship under `legal/phosphor-icons/` |
| ag-psd | 31.0.2 (`387049670cb89b88fb8fe1b7c01aeacf98dd2e3b`) | https://github.com/Agamnentzar/ag-psd | MIT | Native PSD exporter through JavaScriptCore | Write embedded Smart Objects, layer masks and native guides | Unmodified pinned library, bundled at build time; an application-owned adapter registers ICC image resource 1039. No upstream sample imagery is included. Licence ships under `legal/psd-encoder/` |
| pako | 2.1.0 | https://github.com/nodeca/pako/tree/2.1.0 | MIT AND Zlib | Bundled ag-psd dependency | PSD compression/decompression primitives | Unmodified; MIT and retained zlib source notices ship under `legal/psd-encoder/` |
| base64-js | 1.5.1 | https://github.com/beatgammit/base64-js/tree/v1.5.1 | MIT | Bundled ag-psd dependency | Binary resource encoding helpers | Unmodified; licence ships under `legal/psd-encoder/` |
| esbuild | 0.28.2 | https://github.com/evanw/esbuild | MIT | Build only | Bundle the PSD encoder for offline JavaScriptCore execution | Unmodified pinned build dependency; executable is not shipped in the app. Licence retained under `legal/psd-encoder/` |


Development-only tools should be recorded when their licence or distribution terms require it. Do not list operating-system frameworks as copied project code, but document platform requirements in the README.

Since v0.1.0, Linux/Electron and web distributions are retired. The Mac app uses Apple frameworks, a bundled local JavaScriptCore document kernel, and retained native font/icon assets. Historical web-font provenance remains under legal/; those WOFF2 assets are not shipped in the native app. Node.js is a build/development tool, not an application runtime.

The portable starter kit includes the MIT-licensed Raycast text-scrambling algorithm pinned at `41aa46f190eeb9d414b342847000653f5759e49f`. The complete copyright and permission notice ships at `StarterKit/Notices/Raycast-MIT.txt`. Starter font references are retained; no Apple font binaries are bundled. Layout Kit PDFs are flattened previews; the original editable INDDs are included.
