# Third-party software

Record every production dependency and copied source fragment.

| Component | Version/commit | Source | Licence | Used by | Purpose | Modifications / notices |
|---|---|---|---|---|---|---|
| actions/checkout | v4 | https://github.com/actions/checkout | MIT | GitHub Actions only | Check out exact repository commit for verification | Unmodified action; not shipped in application |
| actions/setup-node | v4 | https://github.com/actions/setup-node | MIT | GitHub Actions only | Select Node.js 24 for deterministic generators and portable tests | Unmodified action; not shipped in application |
| actions/upload-artifact | v4 | https://github.com/actions/upload-artifact | MIT | GitHub Actions only | Retain packaged tracer and evidence artifacts | Unmodified action; not shipped in application |

Deck Workbench currently has no third-party production runtime dependencies. It uses Apple operating-system frameworks and Node.js built-ins during development and verification.

Development-only tools should be recorded when their licence or distribution terms require it. Do not list operating-system frameworks as copied project code, but document platform requirements in the README.
