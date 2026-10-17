# In-app updates

## Getting updates

Copies from v0.5.0 onward update themselves. **Settings → Updates** (from v1.0.0) has:

- **Check for updates automatically**: on unless you turn it off. Workbench looks once a day.
- **Download and install updates automatically**: off unless you turn it on, and only available while automatic checks are on. A new version downloads in the background and installs when you quit Workbench. Without it, Workbench shows the new version's notes and offers to install it.
- **Check for Updates…**: looks right away, like **Deck Workbench › Check for Updates…** in the app menu.

Installing quits Workbench the ordinary way, and every decision is already saved. An update never interrupts unfinished work: while a copy edit is open, actions are waiting to be saved or a handoff is exporting, Workbench refuses to quit and says why (notes that could not be saved are offered for discard first). Finish, then quit or choose Install again.

Workbench installs an update only when it carries pitch.dog's signature; a download that doesn't match is refused. v0.4.0 and earlier have no updater: replace them by hand once ([README](../README.md)).

## Releasing

Deck Workbench updates itself from this repository's GitHub releases through [Sparkle](https://sparkle-project.org) 2.10.0, the same way pitch.dog's Deck Beat, OOO, Drift, Galileo and Backdrop do. [OOO's UPDATES.md](https://github.com/bomkino/ooo/blob/main/docs/UPDATES.md) and [Deck Beat's](https://github.com/bomkino/deck-beat/blob/main/docs/UPDATES.md) explain the shared rules. The rest of this page is what is specific to Workbench.

No Apple Developer account is involved. Workbench is signed ad hoc. An update is trusted because it carries an EdDSA signature that only pitch.dog's private key can make, and Workbench has the matching public key built in.

### How it works

1. Every release carries `Deck-Workbench-apple-silicon-<commit>.app.zip` (the app, for people and for the updater), its `.sha256`, the `native-acceptance.json` receipt and `appcast.xml` (the update feed).
2. `apps/macos/Info.plist` names the feed `https://github.com/bomkino/deck-workbench/releases/latest/download/appcast.xml`. GitHub redirects that address to the `appcast.xml` of the release marked **Latest**.
3. Once a day, and whenever someone chooses **Check for Updates…**, Sparkle reads the feed. If it lists a newer version, Workbench shows that version's release notes and an Install button.
4. Sparkle downloads the ZIP, checks its signature against `SUPublicEDKey`, replaces the app and relaunches it. A ZIP that doesn't match is refused. Installing quits Workbench the ordinary way: an open deck closes as it always does, with every acknowledged change already in its journal. While a copy edit, unsaved notes, pending actions or an export are in progress, Workbench refuses to quit and says why, so an update never interrupts them.

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

Keeping the key on GitHub is the trade Deck Beat's UPDATES.md describes: releasing needs nobody at a Mac, but anyone who could push a workflow to `main`, or take over the account, could sign an update. Only the release job names the `release` environment; only its signing step receives the secret, and that step gets no GitHub token; it runs scripts from `main`'s checkout, never from the tagged commit, and deletes the key file straight after use.

### Making a release

Releases publish the exact CI artifact of a commit on `main`, never a rebuild. To release:

1. On `main`, raise the version (always upwards):
   - `npm version X.Y.Z --no-git-tag-version` sets it in `package.json` and `package-lock.json`.
   - In `apps/macos/Info.plist`, set `CFBundleShortVersionString` to `X.Y.Z` and `CFBundleVersion` to major × 10000 + minor × 100 + patch: 0.5.0 → 500, 1.0.0 → 10000, 1.4.2 → 10402. Minor and patch stay at 99 or below. The build refuses a mismatch, because Sparkle compares `CFBundleVersion`.
   - Add the version's section at the top of `docs/RELEASE_NOTES.md`, headed `# vX.Y.Z — Title`. The release is called **Deck Workbench vX.Y.Z — Title** (just **Deck Workbench vX.Y.Z** without a title), and its page and update window show only that section.
2. Let **Native Mac build** pass on that commit's push to `main` (it also runs the update test below). A later push never cancels a build on `main`, so every commit there keeps its artifact. CI artifacts expire after 90 days, so cut a release from a recent successful `main` build; if it has expired, push a new commit to `main` and release that.
3. In the Actions tab, run **Publish tagged Mac release** on `main` with the tag `vX.Y.Z`. Without an existing tag it uses `main`'s current commit, only if that commit carries the version, and publishing creates the tag; to release an earlier commit of `main`, push its tag first. A tag alone publishes nothing. The workflow:
   1. finds the successful push build of the tag's commit, checks the ZIP's checksum, the acceptance receipt (by the same rule as every build, `scripts/check-native-acceptance.py`), the code signature, the commit and version inside the app, that the app trusts pitch.dog's key and reads this repository's feed, and that `docs/RELEASE_NOTES.md` has the version's section;
   2. signs that ZIP into `appcast.xml` with `scripts/sign-release.sh`, with the version's notes for the update window, and checks the signature with the public key inside the app, as Sparkle will. A wrong or missing key stops here, before anything is published;
   3. publishes the release **without making it Latest**: its files can be downloaded, but installed copies still read the current Latest release's feed. It then checks the page as GitHub shows it: the title, only this version's notes, and the **Install:** line;
   4. runs `scripts/test-live-update.sh`: it downloads the current Latest release, opens it with `STUDIO_UPDATE_TEST=1` and `STUDIO_UPDATE_FEED` set to the new release's own `https://github.com/bomkino/deck-workbench/releases/download/vX.Y.Z/appcast.xml`, and waits for it to update itself and relaunch as the new version, as every installed copy will. The app runs without the workflow's GitHub token. A Latest release from before the updater is skipped;
   5. only then marks the release **Latest** and waits until `releases/latest/download/appcast.xml` names the new version. Only a version higher than every published one becomes Latest (the live test is skipped for any other), so publishing an older patch never rolls installed copies back.

**Rehearse** (a box in Run workflow) does steps 1 and 2 without publishing: the way to check the key and the artifact without releasing anything.

### If the live update test fails

The run fails and the release stays published but not Latest, so no installed copy is offered it; its files remain downloadable from its page. The step's log has the app's output. Fix the cause on `main`, then either delete that release and its tag (`gh release delete vX.Y.Z --cleanup-tag -R bomkino/deck-workbench`) and run the workflow again, or publish a patch version. Prefer the patch version if anyone may already have installed the failed one by hand.

### Things that break updates

- **The asset must be called exactly `appcast.xml`** and the release must be the **Latest** one (drafts and pre-releases don't count).
- **Versions only go up.** Sparkle compares `CFBundleVersion`.
- **Sign the ZIP that is published.** The workflow signs the artifact it publishes, never a rebuild.
- Don't delete the Latest release, or its `appcast.xml`.

### Copies from before the updater

v0.5.0 is the first release with the updater. v0.4.0 and earlier have none, so nothing reaches them: they are replaced by hand once (unzip the new release into Applications, then **Open Anyway** in System Settings → Privacy & Security). From v0.5.0 on, every newer release that becomes Latest arrives by itself.

### Testing

`scripts/test-update.sh` runs in **Native Mac build** for every change. It makes a throwaway key and two test copies of the packaged app, at 9.0.0 and 9.0.1, under another name and bundle identifier (`Deck Workbench Update Test`, `dog.pitch.deck-workbench.updatetest`) with no document types, trusting only that key. `scripts/sign-release.sh` signs the 9.0.1 ZIP into a local feed exactly as a release is signed. It passes when 9.0.0 installs 9.0.1, 9.0.1 starts as a new process, says it is running and is still running three seconds later, and when a ZIP with one changed byte is fetched and refused.

The test hooks are environment variables read only by the app at launch: `STUDIO_UPDATE_TEST` (check now and install as soon as an update is ready) and `STUDIO_UPDATE_FEED` (use another feed; every version from v0.5.0 honours it). A relaunch doesn't keep the environment, so the new version is told where to report by a default instead: with `UpdateTestReadyFile` set to a path, the app writes its version and process number there a second after it starts. The tests set it and remove it again, together with the `SUAutomaticallyUpdate` setting `STUDIO_UPDATE_TEST` turns on. A feed can't install anything unless it is signed with the key the app trusts.
