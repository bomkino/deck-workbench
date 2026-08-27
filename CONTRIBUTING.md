# Contributing

Deck Workbench is early and architecture-sensitive. Open an Issue before large scope changes.

## Development rules

- Work on a focused branch.
- Preserve the Workbench Constitution.
- Build vertical user capabilities rather than horizontal layers.
- Add tests only at public seams or for credible regressions.
- Run the real artifact before claiming completion.
- Record new production dependencies in `THIRD_PARTY.md`.
- Do not commit client decks, commercial fonts, private media, credentials or local exports.
- Keep Mac and Garuda document semantics aligned.

## Pull requests

Describe:

- user journey changed;
- public seam changed;
- evidence run;
- platform status;
- migration/recovery impact;
- third-party additions;
- known gaps.

Routine pull requests use squash merging. A maintainer may fast-forward an intact,
already-verified release lineage when the repository owner explicitly authorizes
that promotion. Do not merge work without the required authority and evidence.
