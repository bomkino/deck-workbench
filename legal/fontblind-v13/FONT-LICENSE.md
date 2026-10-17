# Font licence — CC0 1.0 Universal

The FontBlind v13 font binaries redistributed with Deck Workbench are dedicated to the public domain under **CC0 1.0 Universal** (`CC0-1.0`). They may be copied, modified, distributed, and used, including commercially, without an attribution requirement.

Legal code: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>

## Scope

This declaration applies only to the `.woff2` font binaries in `packages/workspace/app/fonts/v13/` and the `.otf` font binaries in `apps/macos/Resources/Fonts/`.

The type-system code, tokens, documentation, examples, artwork, and pitch.dog names and marks are not placed under CC0 by this declaration. Deck Workbench vendors only the declared font binaries, not the upstream private implementation materials.

CC0 does not require recipients to retain this notice. It is retained as a provenance best practice. This file records pitch.dog's declaration for the accepted v13 font release; it is not an independent chain-of-title audit.

---

## Maintainer note (not part of pitch.dog's declaration above)

Added for v1.0.0. The declaration above is reproduced unchanged; this note only records what the app actually ships.

The `packages/workspace/app/fonts/v13/` folder named in **Scope** no longer exists: the WOFF2 binaries belonged to the retired web build and are not vendored. Deck Workbench ships these files from `apps/macos/Resources/Fonts/` (`git ls-files apps/macos/Resources/Fonts`), each matching the size and SHA-256 recorded in `FONT-PROVENANCE.json`:

| File | Bytes | SHA-256 | Covered by |
|---|---|---|---|
| `pd-body-400.otf` | 63128 | `195288dfbb409db3624ebfc3ba167aa6309c6eedd321b8a09fcf834e05fdd688` | the declaration's `.otf` scope |
| `pd-body-600.otf` | 69524 | `dd46bb32b881122bd815befdb0af8a272ec648b654d878c38c975e8cb8429cd9` | the declaration's `.otf` scope |
| `pd-body-700.otf` | 69564 | `78a04f141bb723d746aa40802bc4a365277f489fab09e11eb78e9b591d90fdbc` | the declaration's `.otf` scope |
| `pd-head-medium.ttf` | 145840 | `5e7539a4e245509fd78e95bc754358dfaaa10d6f81351272cc12e011c286d7ba` | **to be confirmed by pitch.dog**: listed in `FONT-PROVENANCE.json` as part of the v13 release, but the Scope sentence names only `.woff2` and `.otf` files |

`Phosphor.ttf` in the same folder is not a FontBlind font; it is Phosphor Icons under MIT (`legal/phosphor-icons/`).
