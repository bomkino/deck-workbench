# Third-party software

Record every production dependency and copied source fragment.

| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |
|---|---|---|---|---|---|---|
| actions/checkout | v4 (`11d5960a326750d5838078e36cf38b85af677262`) | https://github.com/actions/checkout | MIT | GitHub Actions only | Check out exact repository commit for verification | Unmodified action pinned by commit; not shipped in application |
| actions/setup-node | v4 (`49933ea5288caeca8642d1e84afbd3f7d6820020`) | https://github.com/actions/setup-node | MIT | GitHub Actions only | Select Node.js 24 for deterministic generators and portable tests | Unmodified action pinned by commit; not shipped in application |
| actions/upload-artifact | v4 (`ea165f8d65b6e75b540449e92b4886f43607fa02`) | https://github.com/actions/upload-artifact | MIT | GitHub Actions only | Retain packaged tracer and evidence artifacts | Unmodified action pinned by commit; not shipped in application |
| Electron | 44.0.0 | https://github.com/electron/electron/tree/v44.0.0 | MIT | Linux application runtime | Provide the sandboxed Chromium renderer, native Linux shell, typed preload boundary, and utility-process host | Unmodified upstream binaries are embedded in Linux packages; Electron and Chromium notices are retained in the distribution |
| appimagetool | 1.9.1 (`8c8c91f762b412a19f4e8d2c4b35afb98f2d7c81`) | https://github.com/AppImage/appimagetool/releases/tag/1.9.1 | MIT | Linux CI packaging only | Build the x86_64 AppImage from a prepared AppDir | Build-only binary; pinned release asset SHA-256 `ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0`; not shipped in the application |
| AppImage type-2 runtime | 20251108 (`dd6cebedcbddde9c82f89b011e8e1d40b6e43868`) | https://github.com/AppImage/type2-runtime/releases/tag/20251108 | MIT, with bundled component notices | Linux AppImage runtime | Mount or extract and start the packaged AppDir | Unmodified `runtime-x86_64` embedded in the AppImage; pinned release asset SHA-256 `2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d`; full upstream runtime licence and bundled component notice shipped in application legal files |

Deck Workbench uses Electron only for the Linux shell. The macOS tracer continues to use Apple operating-system frameworks and Node.js built-ins during development and verification.

Development-only tools should be recorded when their licence or distribution terms require it. Do not list operating-system frameworks as copied project code, but document platform requirements in the README.
