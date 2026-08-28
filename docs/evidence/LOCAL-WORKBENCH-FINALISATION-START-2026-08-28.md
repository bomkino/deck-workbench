# Local Workbench finalisation starting receipt

- Captured: `2026-08-28T05:19:43Z`
- Handoff integrity: `VERIFY_HANDOFF.command` passed all 9 stages before repository edits
- Repository: `bomkino/deck-workbench`
- Branch: `codex/workbench-bold-interface`
- Local and remote candidate SHA: `56bf29c63109db52c6f0dc92f0f87a75f8dbefc3`
- Local and remote `main` SHA: `2722ebab28646ec1df99899520e579442b5d412e`
- Working tree before this receipt: clean
- Local safety ref: `safety/local-handoff-56bf29c`
- Live pull request: `#4`, open and mergeable at candidate SHA
- Candidate GitHub Actions: macOS run `33132254386` and Ubuntu run `33132254380`, both successful
- Host: macOS `27.0` (`26A5421a`), Apple Silicon `arm64`, Darwin `27.0.0`
- Active developer directory: Command Line Tools at `/Library/Developer/CommandLineTools`
- Apple SDK: `27.0`
- Swift: Apple Swift `6.4`, target `arm64-apple-macosx27.0.0`
- Full Xcode: unavailable through active developer directory; command-line Swift build path remains available
- Codex CLI: `/Users/kay/.local/bin/codex`, stable `0.150.1`
- Binding Node: Homebrew `node@24` `v24.20.0`; npm `11.19.0`
- Electron freshness: repository pin and latest stable both `44.0.0`
- GitHub Actions freshness audit: `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, and `actions/upload-artifact@v7.0.1` are current stable references; candidate still uses v4-era immutable pins
- UTM: `4.7.5`; one registered Garuda guest started for inspection
- Guest machine: QEMU `x86_64`, Q35, 2 vCPU, 2560 MB RAM, TCG emulation, shared e1000 network, VGA display
- Guest media: Garuda `260819` live ISO plus writable QCOW2 disk; QEMU guest agent was not running at capture time
- Guest UI at capture: Garuda boot sequence visible; distribution, desktop, display protocol, free disk and package manager runtime checks still pending

This receipt records starting state only. It does not claim source verification, target-machine acceptance, installation, merge, or final CI.
