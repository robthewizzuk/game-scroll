# Game Scroll

A vertical feed of quick mini games: swipe up for the next one, tap to play. Built for iOS and Android with [Capacitor](https://capacitorjs.com), with every game written as a small HTML5 canvas module.

## Run it

```bash
npm install
npm run dev        # open the printed URL on your phone (same Wi-Fi) or in a desktop browser
```

Desktop keys: Space/Enter to start, arrows to steer, ↓ for the next game.

## Native apps

```bash
npx cap add ios        # first time only (needs a Mac with Xcode)
npx cap add android    # first time only (needs Android Studio)
npm run ios            # build, sync and open Xcode
npm run android        # build, sync and open Android Studio
```

### Android APK from GitHub

Every push to `main` builds a debug APK (`.github/workflows/android-apk.yml`) and publishes it as the "Latest Android build" release. On the phone, signed in to GitHub in the browser, open https://github.com/robthewizzuk/game-scroll/releases/latest and tap `game-scroll.apk`. Builds share one debug key (`android/app/debug.keystore`), so each new APK installs over the old one and keeps progress. To build without pushing, run the workflow by hand from the Actions tab.

### iPhone .ipa from GitHub

There is no paid Apple Developer account yet, so the `iOS IPA (unsigned)` workflow (`.github/workflows/ios-ipa.yml`) builds an unsigned `.ipa` that testers sideload with Sideloadly and a free Apple ID (reinstall every 7 days). Run it by hand from the Actions tab; it publishes to the "Latest iOS build" release. Install steps: [docs/ios-sideload.md](docs/ios-sideload.md).

### Mac and Windows app

The same app runs on Mac and Windows (`desktop/`, Electron, which carries the Chromium engine the Android app runs in, so WebGPU and the engine's tuning behave the same). Every push to `main` builds it (`.github/workflows/desktop.yml`) and publishes the "Latest Mac and Windows builds" release, with download links that never change:
[Mac (Apple silicon)](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-arm64.dmg) ·
[Mac (Intel)](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-x64.dmg) ·
[Windows](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-x64.exe) ·
[Windows on Snapdragon](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-arm64.exe).
They aren't signed yet, so each computer asks once before opening them. How to open them, run the app from source and what is tuned for computers: [docs/desktop.md](docs/desktop.md). (The web version on GitHub Pages was taken down when the desktop app came in.)

## Website and store listings

- `site/` is the website at https://game-scroll.com: landing page, a friendly [maker guide](https://game-scroll.com/make/), privacy policy and help. `npm run site` builds it into `dist-site/`; `.github/workflows/site.yml` deploys it on every push to `main` as a Cloudflare Worker (`workers/site`).
- `store/` has the App Store and Google Play listing texts, policy answers and screenshots. `npm run store-shots` remakes the screenshots from real games; `node scripts/check-listings.mjs` checks the text lengths.

## Adding a game

Anyone can add a game with a pull request: see **[CONTRIBUTING.md](CONTRIBUTING.md)** for the rules, the game API, the five styles (Phone, Dot matrix, Color, Advance, Console 3D) with screenshots, palettes, fluid sizes and how to test.

Every file in `src/games/` is one game and is picked up by the feed automatically. A game exports:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Casual · Timing',
  retro: false,          // true = pocket handheld frame + 4-shade LCD palette
  pal: 'moss',           // retro only: a key from src/palettes.js
  w: 360, h: 640,        // logical canvas size (pocket games use 160x160)
  hint: 'One sentence on how to play.',
  goal: 30,              // score that counts as a win and pays credits (required)
  make(api) {            // api.score(n), api.over()
    return { reset() {}, update(dt) {}, draw(ctx) {}, down(x, y) {}, move(x, y, pressed) {}, up(x, y) {}, key(k, isDown) {}, fx(dt) {} };
  },
};
```

`fx(dt)` is optional and keeps effects animating on the game-over screen.

## Streaming games (Cloudflare R2)

The app ships with no games inside: every game streams from a Cloudflare R2 bucket, so games can be
fixed or added without a new app release.

- `npm run games` builds every game in `src/games/` as its own file in `dist-games/` plus a `manifest.json` catalogue (title, hint, era... for each game).
- On every push to main, `.github/workflows/games-r2.yml` uploads them to R2 (needs the `CLOUDFLARE_API_TOKEN` repo secret).
- The app (`src/remote.js`) reads the catalogue from `VITE_GAMES_URL` (in `.env`), checks the catalogue at launch, on return to the app and every 5 minutes, keeps the next 5 games in the feed
  downloaded and ready, and saves the last 1000 played in IndexedDB so they open instantly and work offline.
  Settings (⚙) shows the cache and has a Clear cache button.
- A streamed game may only use shared exports (`src/util.js`, `src/sfx.js`, `src/kit/*.js`...) the installed app has;
  games that need newer shared code are left out of older apps.
- A game's file name must match its `id`.

**Local dev and tests build the games in** instead (`--mode bundled`, see `.env.bundled`), so a new game can be
tried before it is published: `npm run dev`, `npm run build:bundled && node scripts/smoke.cjs`. `npm run dev:stream`
runs against R2 like the real app.

## Phone features

`src/kit/device.js` gives games haptics (including short/long `buzz()` patterns), tilt, shake, face-down detection (`faceDown()`), compass heading, GPS location, the microphone and the camera. On web and desktop, or when the player refuses a permission, these calls do nothing or return `null`. That means every game needs a touch fallback (for example, drag instead of tilt). Call `want('motion')` in `make()` for tilt, shake or compass games: iOS asks for motion permission on the player's next tap. The usage strings for iOS and the permissions for Android are already set.

## Credits, trophies and cloud saves

Winning any game pays credits, which some games let you spend on items. Trophies, leaderboards and cloud saves go through Game Center on iOS and Play Games on Android. See [docs/game-services.md](docs/game-services.md) for the game fields (`goal`, `reward`, `shop`, `board`), the `api.win()` / `api.has()` hooks, and the store setup steps.

## Foldables

The app supports folding and unfolding mid-game (tested at Galaxy Z Fold 8 and iPhone Duo screen sizes). On wide screens, like the unfolded iPhone Duo or a tablet, the caption and buttons move to a side column. Android is configured not to restart on fold (`configChanges` and `resizeableActivity` in `AndroidManifest.xml`), and iOS allows every orientation. `npm run fold` simulates folding and unfolding during a game.

## Testing

`npm run smoke` builds the app and plays every game with random input on a phone-sized screen, failing if any game throws. Pass ids to test only some: `node scripts/smoke.cjs worm bricks`. Needs Playwright (`npm i -D playwright && npx playwright install chromium`).

## QA: finding and removing weak games

- **In the app**: every game has a 👎 *Meh* button next to the heart. Meh hides that game from your feed on that phone (with Undo). Tap the **GAME SCROLL** logo (or QA report in My games) to open the QA panel: every game with your rating, plays and time spent, Unhide buttons, **Copy report** to paste into chat, and **Phone test tour**: a bot plays every 3D game on that phone and every native plugin is asked whether it answers, with one report to copy ([docs/testing.md](docs/testing.md)).
- **My games** (♥ button in the top bar): your hearted and Meh'd games. Tap one to play it next, or un-heart / un-Meh it.
- **Bench a game for everyone** without deleting it: add its id to `BENCHED` in `src/qa.js`.
- **Bot play test**: `npm run qa` plays every game with an idle bot and a random-tap bot and writes `docs/qa/auto-report.md` (errors, how fast rounds end, games that score with no input).
- **Scored review**: `docs/qa/review.md` scores every game on fun, clarity, controls, length and uniqueness, weakest first.
- **More like this**: hearts, Meh and time played shape the feed on the device (`src/recommend.js`). Each game's traits come from its tag and hint (genre, controls, sensor, pocket/casual); a game can add its own with `traits: ['theme:space']`. On top of that, the feed brain (`src/feedbrain.js`) learns from what you play and skip, on the phone only: how much you follow each factor and which games you like at what time of day, nudging each game between 0.5x and 2x (Settings › For you resets it). Every game still shows once per cycle.
- **Sync with no server**: `ratingsSnapshot()` / `mergeRatings()` in `src/qa.js` are meant to ride inside the Game Center / Play Games cloud save.
- **Removing a game**: delete its file in `src/games/` and untick it in `docs/game-ideas.md`.

## Roadmap

Launch target is **1000 unique games** (distinct mechanics, not reskins), built in batches of about eight. There are 142 so far. Games can be fluid: set `maxW`/`maxH` (and optional `step`) and implement `resize(w, h)` to receive the extra space on tall or unfolded screens. The idea list lives in `docs/game-ideas.md`, with built games ticked.

## License

Game Scroll is source-available under the [PolyForm Shield License 1.0.0](LICENSE): you can read, run, fork and change the code and contribute games, but you can't use it to offer a product that competes with Game Scroll. Contributions are accepted under the terms in [CONTRIBUTING.md](CONTRIBUTING.md#licence-of-your-contribution).
