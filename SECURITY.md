# Security policy

Deck Workbench processes local documents and media and exposes a privileged native shell around a sandboxed workspace. Security reports are welcome through a private GitHub security advisory when available.

Please include:

- affected commit/version;
- platform;
- reproduction;
- impact;
- whether untrusted Deck/media content is required.

Do not include private client material in reports.

High-priority areas include path traversal, symlink escape, malicious SVG/HTML, document migration, journal corruption, custom resource schemes, Electron preload/IPC, export staging and optional MCP/CLI permissions.
