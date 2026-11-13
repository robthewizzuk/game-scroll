# Google Play listing (Play Console)

Copy each field into Play Console → Grow → Store presence → Main store listing, and the policy
answers into Policy → App content. Character counts are checked by `node scripts/check-listings.mjs`.

Test builds go to Play by themselves once set up: see `docs/google-play.md`.

## Main store listing

| Field | Value |
| --- | --- |
| App name (30) | Game Scroll: Mini Games Feed |
| Package | com.game_scroll.app (com.gamescroll.app was taken on Play; a package name can never change after the first upload) |
| Category | Game → Casual |
| Tags | Arcade, Casual, Puzzle, Retro, Single player (pick from the ones Play offers, up to 5) |
| Email | support@game-scroll.com |
| Website | https://game-scroll.com/ |
| Privacy policy | https://game-scroll.com/privacy/ |

### Short description (80)

<!-- field:short -->
A feed of quick, original mini games. Swipe up for the next one, tap to play.
<!-- /field -->

### Full description (4000)

<!-- field:full -->
Scroll games, not videos.

Game Scroll is a feed of quick mini games. Each one takes a second to learn and a minute to play. Like it? Play again and beat your best. Not feeling it? Swipe up, and the next game is already loaded.

★ A FEED THAT LEARNS
Heart the games you love and the feed brings you more like them. Tap Meh and you'll see fewer. Or pick a tab and stick to one style.

★ SEVEN STYLES, FROM PIXELS TO AR
• Casual: smooth, colourful phone games, puzzles and physics toys
• Pocket: four shades of green on a chunky dot-matrix screen
• Color: the bright colour handheld era
• Advance: wide-screen handheld adventures, racers and platformers
• Classic Console: cel-shaded 3D inspired by home consoles
• Next Gen: HD 3D with real lighting, shadows and particles
• AR · 3D: games in your real room through the camera. Zap saucers swooping past your sofa, flick paper balls into a bin on your floor, fly a drone through hoops

★ USES YOUR WHOLE PHONE
Tilt to steer, shake to roll, shout to launch, walk to explore, look through the camera, and feel every hit through vibration. Every game also plays with touch alone.

★ WIN CREDITS, UNLOCK STUFF
Win any game to earn credits, then spend them on boosts and unlocks. Earn achievements and climb leaderboards with Google Play Games, and keep your progress when you change phones.

★ NEW GAMES ALL THE TIME
Games stream into your feed as they're made, so new ones and fixes arrive without an app update. The goal: 1,000 games that each play differently.

★ BUILT FOR FOLDABLES
Games grow to fill the screen, from small phones to unfolded Galaxy Z Fold phones and tablets. Fold or unfold mid-game and keep playing.

★ MAKE YOUR OWN
Game Scroll is open to makers. Write a game, send it in, and once it's approved it appears in everyone's feed with your name on it. Find out how at game-scroll.com/make.

No ads between games. No account needed.
<!-- /field -->

## Graphics

| Asset | File | Size |
| --- | --- | --- |
| App icon | `android/app/src/main/res/` is the app; for the listing upload `public/icons/icon-512.png` | 512 × 512 |
| Feature graphic | `store/feature-graphic.png` | 1024 × 500 |
| Phone screenshots (2 to 8) | `store/screenshots/android-phone/` | 1080 × 1920 |
| 7" and 10" tablet screenshots (optional, recommended for foldables) | reuse `store/screenshots/ipad-13/` (Play accepts them) | 2064 × 2752 |

Regenerate with `npm run store-shots`.

## Release notes (first release, 500)

<!-- field:notes -->
The first release of Game Scroll: a feed of quick, original mini games. Swipe up, tap to play.
<!-- /field -->

## App content answers (Policy → App content)

| Section | Answer |
| --- | --- |
| Privacy policy | https://game-scroll.com/privacy/ |
| Ads | No, the app doesn't contain ads |
| App access | All functionality is available without special access (no login) |
| Content rating (IARC questionnaire) | Category: Game. Violence: cartoon/fantasy violence, mild, no blood. Fear: mildly scary scenes in a few games. No sex, language, drugs, gambling. Users can't interact or share content with each other; shares the user's location? No. Digital purchases? No. Expected rating: PEGI 7 / ESRB Everyone 10+ |
| Target audience | 13 and over (keeps the Families policy out of scope; the games are family friendly, but under-13 targeting needs extra review). Not "appeals to children" designed |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Data safety | See below |

## Data safety form

Matches https://game-scroll.com/privacy/.

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data is deleted? **No account, so no** (data is anonymous; uninstalling removes the random ID). Add the privacy page URL anyway.

| Data type | Collected | Shared | Optional? | Purpose |
| --- | --- | --- | --- | --- |
| Device or other IDs (random app-made ID, not the advertising ID) | Yes | No | Required for hearts | App functionality, fraud prevention/security |
| App interactions (anonymous per-game views, plays, skips, play time) | Yes | No | Optional (Settings) | Analytics, app functionality |
| Location | **No** (rounded and used on device only during play, never stored or sent) | | | |
| Photos/videos, audio | **No** (camera and mic processed on device only) | | | |
| App info and performance → Crash logs, Diagnostics (anonymous crash markers with Android's own reason the app last closed, game script errors, frame timings and how warm the phone was, phone model, OS, app and game file version; kept 14 days) | Yes | No | Optional (same Settings switch) | Analytics, app functionality |

Data processed only on the device and never sent off it doesn't need declaring (Google's definition of "collected").
Google Play Games data is handled by Google under its own policy.

## Permissions to explain if asked

| Permission | Why |
| --- | --- |
| Location (coarse and fine, foreground only) | A few games build their level from the player's area (rounded to about 1 km), and walk-around games use about 10 m. Asked only when the player starts such a game, only used during play, never in the background, never stored or sent. Games still play with a made-up spot if refused, and Settings has a switch to turn it off. |
| Camera | AR games show 3D objects over the camera picture, and a few games use it as a control. Nothing is saved or sent. |
| Microphone (record audio) | A few games react to loudness, like shouting to launch a rocket. Audio is never recorded or sent. |
| Vibrate | Haptic feedback in games. |
