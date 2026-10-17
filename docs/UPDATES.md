# In-app updates

Deck Workbench updates itself from this repository's GitHub releases through [Sparkle](https://sparkle-project.org) 2.10.0, the same way pitch.dog's Deck Beat, OOO, Drift, Galileo and Backdrop do. [OOO's UPDATES.md](https://github.com/bomkino/ooo/blob/main/docs/UPDATES.md) and [Deck Beat's](https://github.com/bomkino/deck-beat/blob/main/docs/UPDATES.md) explain the shared rules. This page is what is specific to Workbench.

No Apple Developer account is involved. Workbench is signed ad hoc. An update is trusted because it carries an EdDSA signature that only pitch.dog's private key can make, and Workbench has the matching public key built in.

## How it works

1. Every release carries `Deck-Workbench-apple-silicon-<commit>.app.zip` (the app, for people and for the updater), its `.sha256`, the `native-acceptance.json` receipt and `appcast.xml` (the update feed).
2. `apps/macos/Info.plist` names the feed `https://github.com/bomkino/deck-workbench/releases/latest/download/appcast.xml`. GitHub redirects that address to the `appcast.xml` of the release marked **Latest**.
3. Once a day, and whenever someone chooses **Deck Workbench › Check for Updates…**, Sparkle reads the feed. If it lists a newer version, Workbench shows that version's release notes and an Install button.
4. Sparkle downloads the ZIP, checks its signature against `SUPublicEDKey`, replaces the app and relaunches it. A ZIP that doesn't match is refused. Installing quits Workbench the ordinary way: an open deck closes as it always does, with every acknowledged change already in its journal. While a copy edit, unsaved notes, pending actions or an export are in progress, Workbench refuses to quit and says why, so an update never interrupts them; finish them and choose Install again.

Only the interactive app starts the updater. `--native-self-test` and the parity probe never check for updates.

| | |
|---|---|
| Public key (`SUPublicEDKey` in `apps/macos/Info.plist`) | `P43E8I+FgVyAW3QkS4J9bnDRRhAnsS4y3dT2WDce1lQ=` |
| Private key, for CI | The `SPARKLE_PRIVATE_KEY` secret of this repository's `release` environment, which only `main` may use |
| Private key, on the release Mac | `~/Library/Application Support/pitch.dog/Release Keys/sparkle-ed25519-private.key`, backed up in the team's password manager |
| Sparkle | `scripts/fetch-sparkle.sh` downloads the 2.10.0 release once into `build/vendor/`, checks its SHA-256 and gives the build its framework and the release its signing tools |

**Never commit the private key, paste it into chat, or print it.** It is used only through Sparkle's `--ed-key-file`, by `scripts/sign-release.sh`.

### One-time setup

Until this repository's `release` environment holds the key, the release workflow stops before publishing. On the Mac that holds the key, with a signed-in GitHub CLI:

```sh
bash scripts/auto-signing-setup.sh
```

It creates the `release` environment, open only to workflows running on `main`, and sets `SPARKLE_PRIVATE_KEY` from the key file without printing it. Running it again is harmless. To undo it: `gh secret delete SPARKLE_PRIVATE_KEY --env release -R bomkino/deck-workbench`. If the key leaks, follow the rotation steps in Deck Beat's UPDATES.md; all of pitch.dog's apps share this key.

Keeping the key on GitHub is the trade Deck Beat's UPDATES.md describes: releasing needs nobody at a Mac, but anyone who could push a workflow to `main`, or take over the account, could sign an update. Only the release job names the `release` environment; only its signing step receives the secret; it runs scripts from `main`'s checkout, never from the tagged commit, and deletes the key file straight after use.

## Making a release

Releases still publish the exact CI artifact of a commit on `main`, never a rebuild. To release:

1. On `main`, raise the version (always upwards) in `package.json`, `CFBundleShortVersionString` and `CFBundleVersion` in `apps/macos/Info.plist`, and add its `# vX.Y.Z — …` section at the top of `docs/RELEASE_NOTES.md`. `CFBundleVersion` follows the version: 0.5.0 → 500, 1.4.2 → 10402. The build refuses a mismatch, because Sparkle compares `CFBundleVersion`.
2. Let **Native Mac build** pass on that commit's push to `main` (it also runs the update test below), then push the tag `vX.Y.Z` on that commit. A tag alone publishes nothing.
3. In the Actions tab, run **Publish tagged Mac release** on `main` with that tag. It:
   1. finds the successful push build of the tag's commit, checks the ZIP's checksum, the acceptance receipt, the code signature, the commit and version inside the app, that the app trusts pitch.dog's key and reads this repository's feed, and that `docs/RELEASE_NOTES.md` has the version's section;
   2. signs that ZIP into `appcast.xml` with `scripts/sign-release.sh`, with the version's notes for the update window, and checks the signature with the public key inside the app, as Sparkle will. A wrong or missing key stops here, before anything is published;
   3. publishes the release. Only a version higher than every published one is marked **Latest**, so publishing an older patch never rolls installed copies back. It then waits until `releases/latest/download/appcast.xml` names the new version;
   4. runs `scripts/test-live-update.sh`: it downloads the release before, opens it against the live feed with `STUDIO_UPDATE_TEST=1`, and waits for it to update itself to the new version, as every installed copy will. Releases from before the updater are skipped.

**Rehearse** (a box in Run workflow) does steps 1 and 2 without publishing: the way to check the key and the artifact without releasing anything.

Things that break updates:

- **The asset must be called exactly `appcast.xml`** and the release must be the **Latest** one (drafts and pre-releases don't count).
- **Versions only go up.** Sparkle compares `CFBundleVersion`.
- **Sign the ZIP that is published.** The workflow signs the artifact it publishes, never a rebuild.
- Don't delete the newest release, or its `appcast.xml`.

## The first release with updates

v0.5.0 is the first release with updates. v0.4.0 and earlier have no updater, so nothing reaches them: everyone installs v0.5.0 by hand once (unzip it into Applications, then **Open Anyway** in System Settings › Privacy & Security). Every version after that arrives by itself. The first release's own feed names only itself, so it offers nothing until the next one.

## Testing

`scripts/test-update.sh` runs in **Native Mac build** for every change. It makes a throwaway key and two test copies of the packaged app, at 9.0.0 and 9.0.1, under another name and bundle identifier (`Deck Workbench Update Test`, `dog.pitch.deck-workbench.updatetest`) with no document types, trusting only that key. `scripts/sign-release.sh` signs the 9.0.1 ZIP into a local feed exactly as a release is signed. It passes when 9.0.0 installs 9.0.1, 9.0.1 starts as a new process, says it is running and is still running three seconds later, and when a ZIP with one changed byte is fetched and refused.

The test hooks are environment variables read only by the app at launch: `STUDIO_UPDATE_TEST` (check now and install as soon as an update is ready) and `STUDIO_UPDATE_FEED` (use another feed). A relaunch doesn't keep the environment, so the new version is told where to report by a default instead: with `UpdateTestReadyFile` set to a path, the app writes its version and process number there a second after it starts. The tests set it and remove it again. A feed can't install anything unless it is signed with the key the app trusts.
