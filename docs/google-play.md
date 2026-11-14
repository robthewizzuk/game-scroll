# Google Play test builds

The **Google Play** workflow (`.github/workflows/android-play.yml`) builds the store version of the
app, a signed and shrunk release app bundle (`.aab`), and uploads it to Play's **internal testing**
track. Testers then install and update it from the Play Store like any other app.

- **Pull requests:** builds the bundle unsigned, to catch a broken store build before merging. Nothing is uploaded.
- **Every push to main:** builds it signed and uploads it to internal testing.
- **Run workflow** (GitHub → Actions → Google Play): the same on demand, with a choice of track
  (internal, closed = `alpha`, open = `beta`) and of status (`completed` goes straight to testers,
  `draft` waits in Play Console for you to roll it out).
- **Version code** = the workflow's run number, so each upload is higher than the last. Version name = `1.0.<run number>`.
- The upload script (`scripts/play-upload.mjs`) uses only Node itself: no third-party code sees the Play key.
- Until the secrets below are in, the workflow still builds and just skips signing and uploading.

The GitHub APK (`android-apk.yml`, the "Latest Android build" release) carries on as before. The two
are signed with different keys, so a phone has one or the other: **uninstall the GitHub APK before
installing from Play** (progress saved only on the phone goes with it).

## One-time setup (Rob)

Steps 1 to 4 take about 20 minutes.

### 1. Make the upload key

The upload key proves a bundle came from you. Google keeps the real app signing key (Play App
Signing), so if this key is ever lost or leaked, Play Console can swap it for a new one.

On the Mac, in Terminal (`keytool` comes with Java and Android Studio; if it isn't found, use
`"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"`):

```bash
keytool -genkeypair -v -keystore game-scroll-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
```

It asks for a password (pick a long one) and a name; the rest can be left blank.

No Java on the Mac? The built-in openssl makes the same kind of key (it asks for the password at the end):

```bash
openssl req -x509 -newkey rsa:4096 -nodes -keyout upload.key -out upload.crt -days 10000 -subj "/CN=Your Name"
openssl pkcs12 -export -in upload.crt -inkey upload.key -name upload -out game-scroll-upload.jks \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 && rm upload.key upload.crt
```

Then copy the key as text:

```bash
base64 -i game-scroll-upload.jks | pbcopy
```

Keep `game-scroll-upload.jks` and its password somewhere safe (a password manager), **not** in the repository.

### 2. Put the key in GitHub

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**
(https://github.com/robthewizzuk/game-scroll/settings/secrets/actions). Add:

| Name | Value |
| --- | --- |
| `PLAY_UPLOAD_KEYSTORE_BASE64` | paste (the text `pbcopy` copied) |
| `PLAY_UPLOAD_STORE_PASSWORD` | the password from step 1 |

Only if you chose differently in step 1: `PLAY_UPLOAD_KEY_ALIAS` (default `upload`) and
`PLAY_UPLOAD_KEY_PASSWORD` (default: the same as the store password).

### 3. Testers, and the first rollout

Play takes uploads from the API even before the app's first release, but it keeps them as a **draft**
until a release has been rolled out once. The upload script saves that first one as a draft for you.

1. Play Console → Game Scroll → **Test and release → Testing → Internal testing → Testers** tab →
   **Create email list**, add the Google accounts of the phones you test on (yours first) → Save changes.
2. Once step 4 is done and a build has uploaded, open the **Releases** tab: the draft is there. Open
   it → **Next → Start rollout to Internal testing**. If Play lists tasks it needs first (privacy
   policy, app access, ads, content rating, target audience, data safety), the answers are all in
   `store/play-store.md`.
3. On the **Testers** tab, copy the **Join on the web** link and open it on the phone, signed in to
   the same Google account → **Accept** → **Download it on Google Play**. Uninstall the GitHub APK first.
   (A first internal build can take a few minutes to an hour to show up in the Play Store.)

(Or upload by hand: Actions → Google Play → Run workflow, download **game-scroll-aab** from the run,
and drop `game-scroll.aab` into **Create new release**.)

### 4. Let GitHub upload the next ones

1. Google Cloud console (https://console.cloud.google.com), signed in with the Play account. Use the
   project you link for Play Integrity (`docs/api-security.md`), or make one called *Game Scroll*.
2. **APIs & Services → Library**: search **Google Play Android Developer API** → **Enable**.
3. **IAM & Admin → Service accounts → Create service account**: name it `github-play-upload`,
   skip the optional roles → Done.
4. Open it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
5. Play Console (the account level, not inside the app) → **Users and permissions → Invite new users**.
   Email: the service account's address (`github-play-upload@<project>.iam.gserviceaccount.com`).
   **App permissions → Add app → Game Scroll**, tick **Release apps to testing tracks** (leave the
   rest off) → Apply → **Invite user**.
6. GitHub secrets (as in step 2): `PLAY_SERVICE_ACCOUNT_JSON` = the whole contents of the `.json`
   file (open it in TextEdit, copy all). Then delete the downloaded file.

Done: the next push to main (or Run workflow) uploads by itself, and testers' phones update from the
Play Store. Permissions can take up to a day to reach a brand new service account; if the first
automatic upload says it can't publish the app, run it again later.

## After the first upload

- **Play Games (trophies, cloud saves):** Play builds are signed with Google's key, not ours. In
  Play Console → **Test and release → App integrity → App signing**, copy the **SHA-1** of the
  *App signing key certificate* and add it as an Android credential for `com.game_scroll.app` in
  Play Games Services (`docs/game-services.md`). Keep the debug one too, for the GitHub APK.
- **Play Integrity (shared hearts):** link the Google Cloud project on the same **App integrity**
  page and turn on the Play Integrity API (`docs/api-security.md`). Play builds pass the
  "installed from Play" check that GitHub APKs fail.
- **Qualcomm NPU:** the Play build carries Qualcomm's NPU libraries for every phone (about 57 MB),
  because Play doesn't allow apps to download code. A later change moves them into a part that Play
  only sends to Snapdragon phones that can use it.

## Updates inside the app

A copy of the app installed from Google Play (internal testing included) asks Play for a newer version
a few seconds after it opens, and again when the player comes back to it (at most every 2 minutes).
It uses Google's in-app updates (`plugins/play-update`, `src/update.js`):

- **Normal update** (priority 0 to 3): Play's own sheet asks *Update available?* If the player says yes,
  Play downloads it in the background while they carry on, then a card at the bottom of the app says
  **New version ready · Later · Restart**. It never covers a round being played. *No thanks* isn't
  asked again for a day; Settings → Updates → **Check for updates** asks any time.
- **Must update** (priority 4 or 5, or the copy is older than the catalogue's minimum): Play's
  full-screen update straight away. Backing out of it leaves a *Time to update* card that can't be
  closed, only updated from (it goes by itself if Play has nothing newer).
- Nothing at all on the GitHub APK, iPhone, Mac/Windows or the web: Play can only update copies it installed.

Settings → Updates also shows the installed version (`1.0.<run number>`).

**Making an update a must:**

- *This upload:* Actions → **Google Play** → **Run workflow** → *Update priority* **5**. Or put
  `[urgent update]` in the merge commit's message (the PR title, for a squash merge). A release's
  priority can't be changed later, and Play reports the newest release's, so the next normal upload
  can lift it: for a must that lasts, also set the minimum below.
- *Everyone on at least version N, whatever comes after:* set `android.min` in
  `store/app-update.json` to that version code (each Google Play run's summary says its code) and merge.
  The games workflow publishes it in the signed catalogue, with no app build; `0` turns it off.

### Testing it on the internal testing track

In-app updates only work for a copy that Play installed for a tester account, so:

1. On the phone, uninstall the GitHub APK if it's there (different signature), open the internal
   testing opt-in link with your tester account, and install Game Scroll from the Play Store.
2. Get a newer version onto the track: merge anything to main, or **Run workflow** on Google Play.
   Wait until the run says the version is live.
3. Open the Play Store, find Game Scroll and leave its page open a moment (or **Manage apps & device**),
   so the Play Store learns of the new version. It caches this, so this step matters.
4. Open Game Scroll. After a few seconds Play's sheet offers the update. Say **Update**, keep
   playing, and when the download finishes the **New version ready** card appears: **Restart**.
   Settings → Updates shows the new version number afterwards.
5. The must-update path: **Run workflow** with *Update priority* **5**, repeat 3 and 4. Play's
   full-screen update appears instead; press back to see the *Time to update* card.

If nothing appears: Settings → Updates says *Couldn't reach Google Play* (Play Store signed out or
offline), or *didn't come from Google Play* (an APK copy). Said *No thanks* earlier? Use
**Check for updates** there.

## When something goes wrong

The run's log (Actions → Google Play → the run → *Upload to Google Play*) says what Play answered.

| Message | Fix |
| --- | --- |
| *No upload key in the repository secrets yet* | Step 2. |
| *No PLAY_SERVICE_ACCOUNT_JSON secret yet* | Step 4. |
| *The service account can't publish this app* (401/403) | Step 4.5, or wait a few hours for new permissions. |
| *Play doesn't know com.game_scroll.app yet* (404) | Step 3, or check the package name and that the API is on (step 4.2). |
| *Saving it as a draft* | Play hasn't rolled out a release yet: roll out the draft in Play Console once, then later uploads go straight to testers. |
| *Version code already used* | Click **Run workflow** for a fresh run (re-running an old run reuses its number). |
| *...is aligned to 0x1000, not 16 KB* | A native library won't run on 16 KB-page phones and Play will refuse the bundle: update the library that ships it. |
| The upload key password is wrong (`keystore password was incorrect`) | Fix `PLAY_UPLOAD_STORE_PASSWORD`. |
