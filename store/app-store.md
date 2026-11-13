# App Store listing (App Store Connect)

Copy each field into App Store Connect → your app → the version page / App Information.
Character counts are checked by `node scripts/check-listings.mjs`.

## App Information

| Field | Value |
| --- | --- |
| Name (30) | Game Scroll |
| Subtitle (30) | Scroll games, not videos |
| Bundle ID | com.gamescroll.app |
| Primary category | Games |
| Games subcategories | Casual, Arcade |
| Secondary category | Entertainment |
| Content rights | Does not contain, show or access third-party content (all games are original and reviewed before release) |
| Age rating | Answer the questionnaire as below → expected **9+** |

## Version page

### Promotional text (170)

<!-- field:promo -->
A feed of quick, original mini games. Swipe up for the next one, tap to play. New games stream in every week, no update needed.
<!-- /field -->

### Description (4000)

<!-- field:description -->
Scroll games, not videos.

Game Scroll is a feed of quick mini games. Each one takes a second to learn and a minute to play. Like it? Play again and beat your best. Not feeling it? Swipe up, and the next game is already loaded.

A FEED THAT LEARNS
Heart the games you love and the feed brings you more like them. Tap Meh and you'll see fewer. Or pick a tab and stick to one style.

SEVEN STYLES, FROM PIXELS TO AR
• Casual: smooth, colourful phone games, puzzles and physics toys
• Pocket: four shades of green on a chunky dot-matrix screen
• Color: the bright colour handheld era
• Advance: wide-screen handheld adventures, racers and platformers
• Classic Console: cel-shaded 3D inspired by home consoles
• Next Gen: HD 3D with real lighting, shadows and particles
• AR · 3D: games in your real room through the camera. Zap saucers swooping past your sofa, flick paper balls into a bin on your floor, fly a drone through hoops

USES YOUR WHOLE PHONE
Tilt to steer, shake to roll, shout to launch, walk to explore, look through the camera, and feel every hit through haptics. Every game also plays with touch alone.

WIN CREDITS, UNLOCK STUFF
Win any game to earn credits, then spend them on boosts and unlocks. Collect trophies and climb leaderboards in Game Center. Your progress syncs across your iPhone and iPad.

NEW GAMES ALL THE TIME
Games stream into your feed as they're made, so new ones and fixes arrive without an app update. The goal: 1,000 games that each play differently.

MADE FOR EVERY SCREEN
Games grow to fill the screen, from small iPhones to the big iPad display.

MAKE YOUR OWN
Game Scroll is open to makers. Write a game, send it in, and once it's approved it appears in everyone's feed with your name on it. Find out how at game-scroll.com/make.

No ads between games. No account needed.
<!-- /field -->

### Keywords (100, comma separated, no spaces)

<!-- field:keywords -->
mini games,arcade,retro,pixel,casual,puzzle,feed,swipe,quick,handheld,tilt,3d,fun,brain,ar
<!-- /field -->

| Field | Value |
| --- | --- |
| Support URL | https://game-scroll.com/support/ |
| Marketing URL | https://game-scroll.com/ |
| Privacy Policy URL | https://game-scroll.com/privacy/ |
| Copyright | 2026 Rob |
| Version | 1.0 |

### What's New (first release)

<!-- field:whatsnew -->
The first release of Game Scroll: a feed of quick, original mini games. Swipe up, tap to play.
<!-- /field -->

## Screenshots

Upload in this order (the first three show in search results):

| Display | Folder | Size |
| --- | --- | --- |
| iPhone 6.9" (required; App Store Connect scales it down for smaller iPhones) | `store/screenshots/iphone-6.9/` | 1320 × 2868 |
| iPad 13" (required, because the app runs on iPad) | `store/screenshots/ipad-13/` | 2064 × 2752 |

Regenerate with `npm run store-shots`.

## App Review notes

> Game Scroll is a vertical feed of small HTML5 mini games that run inside the app's web view (guideline 4.7).
> The catalogue and game files download from our own server (assets.game-scroll.com) so we can add games
> without app updates. They are plain JavaScript run by WebKit, use only the app's existing features, and
> every game is written or reviewed by us before release. No native code is downloaded.
> No login is needed. Location, camera and microphone are only optional game controls, processed on the
> device and never sent; every game also works with touch alone. To try them: Tilt Maze (motion), Shout
> Rocket (microphone), Saucer Swarm (camera and motion; AR · 3D), Street Lamps (location: the app asks
> only when you press Play, rounds the position to about 1 km, and uses a made-up spot if you say no;
> Settings → "Let games use my location" turns it off).

## App Privacy ("nutrition label")

Matches https://game-scroll.com/privacy/.

- **Data used to track you:** none.
- **Data linked to you:** none.
- **Data not linked to you:**
  - *Identifiers → Device ID*: a random ID the app creates (not the IDFA), used for hearts and app
    attestation. Purpose: App Functionality.
  - *Usage Data → Product Interaction*: anonymous per-game counts of views, plays, skips and play time.
    Purpose: Analytics, App Functionality. (Can be turned off in Settings.)
  - *Diagnostics → Crash Data, Performance Data, Other Diagnostic Data*: anonymous crash markers, game
    script errors, frame timings and how warm the phone was, with phone model, OS version, app build
    and game file version (kept 14 days).
    Purpose: App Functionality, Analytics. (Same Settings switch.) Details: docs/crash-reports.md.
- Location, camera, microphone: **not collected** (processed on device only, never sent; location is
  rounded to about 1 km, or 10 m for walk-around games, and only read while such a game is played).
- Game Center data is handled by Apple and doesn't count as collected by the app.

## Age rating questionnaire

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | Infrequent/Mild |
| Realistic violence | None |
| Sexual content, nudity | None |
| Profanity or crude humour | None |
| Alcohol, tobacco, drugs | None |
| Mature/suggestive themes | None |
| Horror/fear themes | Infrequent/Mild (there are a few spooky games) |
| Simulated gambling | None |
| Contests | None |
| Unrestricted web access | No |
| User-generated content / messaging | No (maker games are reviewed before release; there is no chat) |
| Medical, loot boxes, real-money | None |
