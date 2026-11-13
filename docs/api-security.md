# API and assets security

Game Scroll talks to two Cloudflare hosts:

- **assets.game-scroll.com**: the public R2 bucket of game files and the catalogue (`manifest.json`).
  It holds nothing secret. The risk there is cost, because R2 charges per read that isn't served from cache.
  It also matters what's in it: the app only runs games from a catalogue signed in CI
  ([catalogue-signing.md](catalogue-signing.md)), so a file swapped in R2 won't run.
- **api.game-scroll.com**: the Worker in `workers/hearts`, which stores shared heart counts in D1.
  The risks there are fake hearts and cost.

The app also has a Content Security Policy (`vite.config.js`): code in the app, including every
game, can only connect to these two hosts, so a game can't send data anywhere else.

## What the API does

| Protection | Where |
| --- | --- |
| One heart per device per game; un-hearting takes it back | D1 primary key |
| Only games in the live catalogue are accepted | `gameIds()` |
| Request bodies capped (512 B for hearts, 24 KB for passes); strict id formats | `body()`, regexes |
| Browsers allowed only from the app (`capacitor://localhost`, `https://localhost`), the test site and game-scroll.com | `ORIGINS` (CORS) |
| Hearts without a pass: 10 a minute per address. With a pass: 60 a minute per device | `[[ratelimits]]` in `wrangler.toml` |
| Challenges and passes: 10 a minute per address | `LIMIT_SESSION` |
| Counts list cached 60 s at the edge, so D1 is read at most about once a minute per location | `counts()` |
| Play stats and perf totals (30 min) and the crash report pages (5 min) are worked out once for every location and kept in D1 (`snapshots`), so another location reads one row, not the whole tables. `cd workers/hearts && node reads.mjs` measures rows read per request | `kept()` in `src/kept.js` |
| Search engines are kept off the API (`/robots.txt`), since the report links to a page per game | `index.js` |

### Passes (app attestation)

1. The app calls `GET /challenge` and gets a signed challenge, valid for 5 minutes. Each challenge makes one pass at most (spent ones are kept in `used_challenges` until they expire), so one genuine phone's proof can't be replayed for many device ids.
2. The phone proves the app is genuine, using the native plugin call `integrity()` in `plugins/game-services`:
   - **iOS, App Attest:** on first use the phone makes a Secure Enclave key and Apple attests it. After that, the phone signs each challenge with that key. The Worker checks Apple's certificate chain (root CA built in, and checked against apple.com in CI), the app id, the nonce, a counter that must always go up, and that the key belongs to the device id asking (otherwise the app makes a new key).
   - **Android, Play Integrity:** Google issues a token for the challenge. The Worker has Google decode it, then checks the package name, the nonce, how fresh the token is, that the app was installed from Play (`PLAY_RECOGNIZED`), and that the device is genuine (`MEETS_DEVICE_INTEGRITY`).
3. `POST /session` returns a pass valid for 24 hours. The app sends it with each heart as `Authorization: Bearer …`.

Passes are off until the store accounts exist. While `ENFORCE = "off"`, hearts without a pass are still accepted, under the tighter limit. The web test site never gets a pass, so once enforcement is on it can show counts but can't add hearts.

## Switching it on (needs the store accounts)

**iOS (paid Apple Developer account):**
1. In Xcode, add the **App Attest** capability to the App target. It adds `com.apple.developer.devicecheck.appattest-environment = production` to the entitlements.
2. In `workers/hearts/wrangler.toml`, set `APPLE_APP_ID = "<TeamID>.com.gamescroll.app"`.

**Android (Play Console):**
1. Play Console → the app → **App integrity** → link a Google Cloud project, and turn on the Play Integrity API.
2. In that Cloud project, create a service account and download its JSON key.
3. In the Cloudflare dashboard, open Workers → `game-scroll-hearts` → Settings → Variables and Secrets. Add the secret **`GOOGLE_SERVICE_ACCOUNT`** with the whole JSON as its value. Never commit it.

**Then:** set `ENFORCE = "on"` in `wrangler.toml` and push. From then on, only genuine store installs can add hearts.

For testing before release, `APPLE_ALLOW_DEV = "on"` accepts Xcode development builds and `ANDROID_ALLOW_SIDELOAD = "on"` accepts debug APKs on genuine phones. Turn both off for release.

`SESSION_SECRET`, the key that signs challenges and passes, is created by the deploy workflow on its first run. To revoke every pass at once, replace it with `wrangler secret put SESSION_SECRET`.

## Cloudflare dashboard settings (Rob, one-off)

1. **R2 → game-scroll → Settings → Public access:** turn off the `r2.dev` URL, so every read goes through assets.game-scroll.com, where it can be cached and protected.
2. **Caching → Cache Rules:** when the hostname equals `assets.game-scroll.com`, set it eligible for cache and respect the origin's cache headers. Game files are `immutable` for a year and the catalogue is cached for 60 s, so repeat downloads never reach R2.
3. **Security → WAF → Rate limiting rules** (the free plan has one): when the hostname is in `{api.game-scroll.com assets.game-scroll.com}`, block an IP that sends more than 100 requests in 10 s. This is a global backstop on top of the Worker's own limits.
4. **Workers & Pages → Plans:** stay on **Free**. Over the free limits (100k requests and 100k D1 writes a day), requests fail until the next day instead of being billed. Also set a billing notification under **Notifications**.
5. **API token** for GitHub (`CLOUDFLARE_API_TOKEN`): limit it to this account and the game-scroll.com zone. It needs Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit (account), plus Workers Routes Edit, Zone Read and DNS Edit (zone).
