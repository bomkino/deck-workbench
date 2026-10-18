# Security policy

Deck Workbench is a native Mac app that processes local documents and media. Its document kernel runs in JavaScriptCore inside the app, without a browser. Report privately through GitHub's Security tab → Report a vulnerability, or email hello@pitch.dog. Please don't open a public issue for a vulnerability.

Only the latest release is supported; fixes arrive as updates.

Please include:

- affected commit/version;
- platform;
- reproduction;
- impact;
- whether untrusted Deck/media content is required.

Do not include private client material in reports.

High-priority areas include path traversal, symlink escape, malicious media files, document migration, journal corruption, crash-recovery repairs, export staging, the Adobe automation scripts, and in-app updates: the signed update feed and the release signing key ([docs/UPDATES.md](docs/UPDATES.md)). Never include the private update key in a report.
