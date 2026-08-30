# Third-party software

Record every production dependency and copied source fragment.

| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |
|---|---|---|---|---|---|---|
| actions/checkout | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) | https://github.com/actions/checkout | MIT | GitHub Actions only | Check out exact repository commit for verification | Unmodified action pinned by commit; not shipped in application |
| actions/setup-node | v7.0.0 (`820762786026740c76f36085b0efc47a31fe5020`) | https://github.com/actions/setup-node | MIT | GitHub Actions only | Select Node.js 24 for deterministic generators and portable tests | Unmodified action pinned by commit; not shipped in application |
| actions/upload-artifact | v7.0.1 (`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`) | https://github.com/actions/upload-artifact | MIT | GitHub Actions only | Retain packaged tracer and evidence artifacts | Unmodified action pinned by commit; not shipped in application |
| Electron | 44.0.0 | https://github.com/electron/electron/tree/v44.0.0 | MIT | Linux application runtime | Provide the sandboxed Chromium renderer, native Linux shell, typed preload boundary, and utility-process host | Unmodified upstream binaries are embedded in Linux packages; Electron and Chromium notices are retained in the distribution |
| appimagetool | 1.9.1 (`8c8c91f762b412a19f4e8d2c4b35afb98f2d7c81`) | https://github.com/AppImage/appimagetool/releases/tag/1.9.1 | MIT | Linux CI packaging only | Build the x86_64 AppImage from a prepared AppDir | Build-only binary; pinned release asset SHA-256 `ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0`; not shipped in the application |
| AppImage type-2 runtime | 20251108 (`dd6cebedcbddde9c82f89b011e8e1d40b6e43868`) | https://github.com/AppImage/type2-runtime/releases/tag/20251108 | MIT, with bundled component notices | Linux AppImage runtime | Mount or extract and start the packaged AppDir | Unmodified `runtime-x86_64` embedded in the AppImage; pinned release asset SHA-256 `2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d`; full upstream runtime licence and bundled component notice shipped in application legal files |
| FontBlind v13 font binaries | v13.0.0 (`786b4a2b671182319320f922b8de8f927ea3a002`) | https://github.com/bomkino/pitchdog-type-system/tree/v13.0.0 | CC0-1.0 | Shared WebKit/Chromium workspace and native macOS shell | Provide the pitch.dog Head, Body, alternate, italic, and Eyebrow families for application typography | Six source-identical WOFF2 binaries, one full-character-map Eyebrow WOFF2 axis instance, and three native Body OTF anchors are vendored with exact hashes; transform details, source hash, licence, and provenance ship under `legal/fontblind-v13/` |
| Phosphor Icons Web | 2.1.2 (`70854726d7bd82ae21f0dc81b5b5c35240a77066`) | https://github.com/phosphor-icons/web/tree/v2.1.2 | MIT | Shared workspace and native macOS shell | Provide one coherent offline icon family for authored application actions | Unmodified regular WOFF2 and TTF files are vendored with exact hashes; licence and provenance ship under `legal/phosphor-icons/` |

Deck Workbench uses Electron only for the Linux shell. The macOS tracer continues to use Apple operating-system frameworks and Node.js built-ins during development and verification.

Development-only tools should be recorded when their licence or distribution terms require it. Do not list operating-system frameworks as copied project code, but document platform requirements in the README.
