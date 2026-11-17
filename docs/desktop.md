# Game Scroll for Mac, Windows and Linux (SteamOS handhelds too)

The same app as the phones, on a computer: `desktop/` wraps the web app (`npm run build`) in
[Electron](https://www.electronjs.org/). Electron carries its own Chromium, the engine Android's web view is
built on, so WebGPU, the shaders and the engine's speed tuning behave the same on every computer. (Tauri and
other system web views were the other way: on a Mac that is Safari's engine, with WebGPU only on the newest
macOS, animation frames held to 60 a second on 120 Hz screens, and a different shader compiler from the one
the engine is tuned on.) The cost is size: about 120 MB to download.

Games stream in from the games host as they do on the phones, so a game change needs no new desktop build.

## Downloads

Every push to `main` builds all three and replaces the "Latest Mac, Windows and Linux builds" release
(`.github/workflows/desktop.yml`). The links never change:

| Computer | File |
| --- | --- |
| Mac with Apple silicon (M1 and later) | [Game-Scroll-mac-arm64.dmg](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-arm64.dmg) |
| Intel Mac | [Game-Scroll-mac-x64.dmg](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-x64.dmg) |
| Windows | [Game-Scroll-windows-x64.exe](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-x64.exe) |
| Windows on Snapdragon | [Game-Scroll-windows-arm64.exe](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-arm64.exe) |
| SteamOS (ROG Ally, Steam Deck, Legion Go) and Linux | [Game-Scroll-linux-x64.AppImage](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-linux-x64.AppImage) |
| Linux on ARM | [Game-Scroll-linux-arm64.AppImage](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-linux-arm64.AppImage) |

A pull request that changes the desktop app builds them too, as run artifacts (Actions › the run › Artifacts).

## Opening a build that isn't signed

There is no paid Apple Developer account or Windows code signing certificate yet, so each computer asks once.

**Mac (macOS 15 and later):**
1. Open the `.dmg` and drag Game Scroll into Applications.
2. Open Game Scroll. macOS says it can't check it for malicious software: click **Done**.
3. Open **System Settings › Privacy & Security**, scroll down to "Game Scroll was blocked" and click **Open Anyway**,
   then **Open Anyway** again and your password.

It opens normally from then on. (Or, in Terminal: `xattr -dr com.apple.quarantine "/Applications/Game Scroll.app"`.)

**Windows:** run the `.exe`. When "Windows protected your PC" shows, click **More info**, then **Run anyway**. It
installs for you alone (no administrator needed), starts, and adds a Start menu and desktop shortcut.

Installing a newer build over an older one keeps your saves, best scores and credits.

## SteamOS (ROG Ally, Steam Deck) and Steam

Once, in Desktop Mode (hold the power button › **Switch to Desktop**):

1. Download `Game-Scroll-linux-x64.AppImage` (above) and move it somewhere it can stay, such as `~/Applications`.
2. In Dolphin, right-click it › **Properties › Permissions** › tick **Is executable**.
3. In Steam: **Games › Add a Non-Steam Game to My Library › Browse**, pick the AppImage, **Add Selected Programs**.
4. **Return to Gaming Mode**: Game Scroll is under **Library › Non-Steam**.

A newer build: download it over the old file (same name), and Steam starts the new one. Saves live in
`~/.config/Game Scroll` and stay.

**What changes on a handheld or in Steam's games mode** (`desktop/device.cjs`, read once at start):

- **Which handheld**, from the computer's own name for its model (`/sys/class/dmi/id`) and its processor: ROG Ally
  (Z1 or Z1 Extreme), ROG Ally X, ROG Xbox Ally and Ally X, Steam Deck and Steam Deck OLED, Legion Go, Go S and Go 2,
  MSI Claw, and others by their handheld chips (Z1, Z2). Its class comes from that (an AMD handheld's chip says only
  "AMD Radeon Graphics"): `top` for the Radeon 780M / 880M / 890M class (Ally, Ally X, Xbox Ally X, Legion Go), `mid`
  for the Steam Deck class (Steam Deck, Xbox Ally, Ally Z1).
- **Played as a computer, or as a phone** (`speed.handheld`, `bigHandheld()` in `src/kit/speed.js`, `PC` in
  `src/kit/hd3d.js`): a `top` handheld (an Ally) plays 3D games as a computer does, up to ultra, held near 60 frames a
  second with nothing made between (stepping down in whole refreshes, 60 to 40, where it can't hold it), and its
  battery is no reason to step down (it always is on one); it still steps down where its chips run hot (Linux heat
  reading, `src/kit/power.js`). Until 2026-11-17 it played as a phone, and Rob's Ally ran Parcel Dash at about 30
  with its processor and graphics a quarter busy. A `mid` handheld (a Steam Deck) plays as a phone: 3D at 60 with
  nothing made between, 30 with GSFG making the other 30 where it can't hold 60, never above high. 2D games run at
  the screen's rate (120 on an Ally). A low battery turns on GSFG's power saving as on a phone. Crash and stutter
  reports name the handheld ("ROG Ally X") as the model.
- **Console mode** (a handheld, or Steam's games mode: gamescope, `--gs-console`): the window opens full screen, and
  the app is drawn bigger to read from a hand's length or a sofa: the screen's height over 640, in quarter steps
  (1.75 on a 1080p Ally or a TV, 1.25 on a Steam Deck, as Valve's own browser shortcut does). A Steam launch option
  `GS_ZOOM=1.5 %command%` pins it. Docked to a TV, it follows the new screen. Settings has a **Quit** button. In
  gamescope the window opens at the screen's corner at the screen's size, and the app checks it against the X server
  (`desktop/x11.cjs`) and puts it right where they differ: a window that started smaller had the page laid out past
  its bottom edge.
- **Touch** in Steam's games mode: gamescope turns touches into mouse clicks unless the screen's root window says
  `STEAM_TOUCH_CLICK_MODE` 4 (passthrough), and Steam says 1 (left click) for a game that isn't one of its own. While
  the app has the screen it writes 4, so fingers reach it as touches, as on a phone (`desktop/x11.cjs`, a few
  X11 requests straight down the X server's socket). Gamescope runs an X server for Steam (`:0`) and one for games
  (`:1`) and goes by the newest write on either; Steam writes its own on `:0` after the game comes up (Rob's Ally kept
  the mouse with the app watching only its own), so the app hears every write on all of them and writes 4 again
  straight after, while gamescope's `GAMESCOPE_FOCUSED_WINDOW` is the app's window (and each second besides). The
  launch option `--gs-touch-mouse` leaves Steam's choice alone.
  Steam's own way, per game: the controller layout › Action Sets › the gear › Add Always-On command › System ›
  Touchscreen Native Support. Where touches still come as a mouse, a press and drag on the feed changes game as a
  swipe does (`src/handheld.js`), and there is no pointer arrow in gamescope.
- **On-screen controls**: `gs.controls` sticks and buttons aren't drawn in console mode (Rob, 2026-11-17: "hide any
  transparent controls like joystick etc as we will use the physical controls"); they show for a few seconds after a
  touch. `gs.controls.onScreen()` says which, for a game that draws its own.
- **Settings › Check this handheld** (`src/handheld.js`, the first thing in Settings there, with the app's version): plain lines, read on the handheld itself, on touch (real
  touches or a mouse; gamescope's mode on each X server), the screen (window and page against the screen), the graphics (WebGPU, the
  chip, Chromium's own WebGPU, Vulkan and Vulkan picture sharing status), how games are played, the rate frames reach
  the page, Steam's frame rate limit and refresh, each game played this run's frame rate and tier, and heat. A Steam
  screenshot (Steam + R1) of it is the report.

- **Controllers** (`src/padnav.js`; `src/kit/gamepad.js`): Steam Input stands in for the handheld's own controls with
  a controller of its own and tells games which real ones to leave alone (`SDL_GAMECONTROLLER_IGNORE_DEVICES`); a
  browser reads them all, so the app leaves those out itself, or each press would come twice. Rumble follows the
  app's haptics (the Sound & haptics sheet).
- **Graphics**: WebGPU through Vulkan (Mesa's RADV on an AMD handheld; Chromium keeps WebGPU on Linux behind a switch
  for AMD chips, which the app sets). In gamescope the app opens as an X11 window (`--ozone-platform=x11`). If 3D games
  show nothing on some driver, the launch option `--gs-webgl` keeps them on WebGL.
- If it doesn't start at all from Steam (a Linux without unprivileged user namespaces, which Chromium's sandbox
  needs; SteamOS has them), the launch option `--no-sandbox` starts it without that sandbox.

## Keys

| | |
| --- | --- |
| Next / previous game | mouse wheel, ↓ / ↑, Page Down / Page Up |
| Start, pause | Space or Enter, Esc |
| Full screen | F11 (Windows), Ctrl+Cmd+F (Mac), or the ⛶ button on a Next Gen game |
| Frame lab (frame times, GPU, resolution) | Cmd+Shift+L (Mac; or fn+F3), Ctrl+Shift+L or F3 (Windows), or View › Frame Lab |
| Developer tools | Ctrl+Shift+I (Windows), Alt+Cmd+I (Mac) |

## Controller

The whole app works with a controller alone (a ROG Ally's or Steam Deck's own controls, any Xbox, PlayStation or
Switch pad; `src/padnav.js`):

| | |
| --- | --- |
| Previous / next game | d-pad or left stick ↑ ↓ |
| Play, play again | A (or Menu) |
| ♥ the game / how to play | Y / X |
| Previous / next feed (For you, New...) | LB / RB |
| The top bar and the game's buttons (♥ My games, 🔊, ⚙, Share...) | View, then the d-pad, A to press, B to leave |
| Menus and Settings | d-pad or left stick to move, A to press, ← → on a slider, B (or Menu) back, right stick to scroll |
| Pause, carry on | Menu; while paused, ↑ ↓ leave for the previous or next game |
| In a game | its own buttons (`gs.pad`; the d-pad and left stick are the arrow keys, A is Space, B x, X z, Y c, LB q, RB e) |
| A game played by touch | a pointer: the left stick or d-pad moves it, A is the finger. L3 or R3 turns it on or off in any game |

The yellow ring shows which button the controller is on; a touch, the mouse or a key hides it. Settings › Controller
says the same on the device.

## What is different on a computer

**Speed.** Before Chromium starts, `desktop/main.cjs` asks for the fast graphics chip on laptops with two
(`force_high_performance_gpu`), keeps the graphics chip where Chromium would turn an older driver down to
software (`ignore-gpu-blocklist`), draws 2D canvases on the graphics chip, and on Windows turns off the
"is this window covered?" guess that can freeze a window in plain view. It also turns off Chromium's rule that a page gets
no 3D at all once the graphics process has crashed on it twice (`app.disableDomainBlockingFor3DAPIs()`), so a
computer whose driver resets more than once comes back each time (docs/webgpu-move.md, When the device is lost). The page keeps compiled code from its
first run, so later starts are quicker, and Chromium keeps the games' WebGPU shaders on disk (measured in the test app:
the feed came up in 1.3 s instead of 2.1 the second time, Long Shadow loaded in 9 s instead of 22).

Three more since 2026-11-16 (Rob's picks; each measured in `scripts/desktop-test.cjs`):

- **JavaScript's young space** starts at 32 MB (up to 64; `--min-semi-space-size`, `--max-semi-space-size`). V8 sweeps
  short-lived things out each time it fills, and it only grows where things live on: a 3D game's ~700 KB of garbage
  a frame was swept 4.6 times a second, now 0.7.
- **Shaders run without WebGPU's bounds checks** (Dawn's `disable_robustness`): Chromium clamps every read and write
  in a shader so one web page can't read what another left on the graphics chip; the app runs only its own games.
  WebGPU's checks of each call stay, as the engine tries a new effect inside them and turns it off if the chip
  refuses it. The launch option `--gs-safe-gpu` keeps the bounds checks (a game whose shader reads past an array's end).
- **The app's own files are read whole and kept in memory** (up to 160 MB) instead of streamed through the main
  process a piece at a time: 3.0 ms a file instead of 5.8, a burst of a game's modules 22% sooner with half the main
  process's work.

Chromium takes only the last `--enable-features` or `--disable-features` it is given: a new feature joins the list
already passed rather than adding another switch.

The engine reads `window.gsDesktop` (`src/desktop.js`) where a computer differs from a phone:

- **Its class** (`src/kit/speed.js`, `classifyDesktop`) comes from the graphics chip as a desktop browser names
  it: drawing in software is `low`, a chip built into an Intel or AMD processor `mid`, the rest `top` (Apple
  silicon, NVIDIA and AMD cards, Intel Arc cards, Snapdragon X). The phone rule read every Mac as a mid-range
  iPhone, because its chip name says "Apple".
- **The screen's rate** is measured up to 360 Hz (a phone's stop at 144). Auto runs 2D games at the screen's
  own rate, and 3D games too on a `top` computer (`mid`: the screen's rate divided down to near 60). A 3D game
  that can't keep up steps down a whole number of refreshes at a time (144, 72, 48, 36 on a 144 Hz screen),
  so its frames always land on refreshes; a phone steps 120, 60, 30.
- **Heat and battery** (`src/kit/power.js`, from `gsDesktop.power()`): macOS says how warm the computer is (its thermal
  state, as an iPhone does), macOS and Windows how far they slowed the processor, and whether a laptop is on its battery.
  A fanless laptop (a MacBook Air) warms under minutes of 3D and then slows itself; warm ("fair" on a Mac, or a slowed
  processor) it takes a hot phone's steps: the first resolution step at once, medium from the next round, Auto's frame
  generation where the screen has room. On its battery a laptop plays 3D games as a phone does (no higher than high,
  near 60 frames a second in Auto; 2D near 120), plugged in as a computer. The frame lab and Settings say why.
  Electron says neither on Linux, so there (SteamOS on a ROG Ally or a Steam Deck, any Linux PC) `desktop/device.cjs`
  reads the chips' temperatures from `/sys/class/hwmon` (`amdgpu`, `k10temp`, `coretemp`...) against the line each slows
  itself at (its own crit, else 100 C) as a headroom on Android's scale: warm at .85 (about 91 C), hot at 1. The heat
  plan (`src/kit/heat.js`) fits it as a phone's, so a handheld steps down a little before it gets there. The battery
  comes from `/sys/class/power_supply` (a controller's battery doesn't count).
- **More room before heat** (`src/kit/hd3d.js`): on a phone 3D games never climb above the high tier, because the Fold
  got hot and throttled on ultra. A computer starts where a phone of its class does, with a tier's pixels as a
  phone draws them, and may climb to ultra only when the chip's own times show room: on a 60 Hz screen, frames
  that keep up say nothing about how much more the chip could take. A Mac's chip times can't be used (below), so
  a Mac stays on high, as the Fold does, and steps down from there. A tier a game saved above its start is only
  taken up again when it was climbed to that way. The final picture (the upscaler and the
  effects after it) is at most about a phone screen's pixels (2.4 million) from the first frame, and the window
  stretches it: a Retina window has three to six times that, and those effects cost by the picture's size.
  (A first version started a `top` computer on ultra with half as many pixels again: a MacBook Air M5 played
  Long Shadow at 47 fps with a stutter every few frames. With that fixed it still started on ultra the next
  run, as the game had saved ultra the run before: 55.6 fps, 215 stutters a minute.)
- **The graphics chip's own times** (WebGPU timestamps) are checked against how long the frames take. Apple's
  chips time each pass from stage boundaries, so a chain of passes overlap and add up to far more than the
  frame (225 ms a 16.7 ms frame on the M5): where they don't fit, they're left alone, as on WebGL, and the
  quality steps go by frame times. The frame lab says so.
- **The quality steps' record**: a frame lab report of a 3D game has a "Quality steps" line: how many windows
  of frames were slow, ok or fast, what was stepped and when, and frames that weren't counted and why (under
  the loading screen, after a gap of 100 ms or more). The report's data keeps every window (`rec.steps`).
- Crash and stutter reports say `mac` or `windows`, with the graphics chip as the model ("Apple M2 Pro").
- **The steering list** (docs/crash-reports.md, Chips and phones to steer) sees a computer as `mac`,
  `windows` or `linux`, with its graphics chip as the model and the chip, and the graphics driver's version
  (`gsDesktop.gpuInfo()`, from Electron's `app.getGPUInfo('basic')`: the active chip's vendor and driver) for
  a rule's `driver` range, so a rule can steer one driver of one card (`driver: '<31.0.101.5186'`), as a
  phone rule steers one browser version.

**Its own voice.** Characters who speak (`gs.sound.say`) use a voice built into the app, the same on every
computer (and in the phone apps): Kyutai's Pocket TTS 7M with the decoder of their 100M model (`src/kit/talk.js`,
`pocket-tts.js`), a small speech model ported to plain JavaScript and WebAssembly and run in background workers, with 45 voices from speakers who gave them
under open licences (`src/kit/talk-files.js`; the credits are under Settings › Licence), and 421 more made between two
of them when a cast needs more. Its file (28.3 MB of 8-bit numbers, packed from Kyutai's own files by
`scripts/talk-pack.mjs`, which fetches only the decoder's part of the 100M model's 219 MB file) downloads from the
games host the first time a character speaks, is checked against its SHA-256 and stays in the cache. Where the device
has the threads, workers share each line as a production line (`pocket-tts.js` `cutsFor`; 4 threads: two, the text
half and the decoder's two layers | its steps to sound; 8 threads: three, flow and a layer | a layer and two steps |
the rest). The maths (`gemm.js`) reads each block of weights once and uses it for every row while it is close at
hand, with fused multiply-adds where WebAssembly has them, in tiles of 2 or 4 rows (timed on the device: 4 suits a
phone's 32 vector registers, 2 a PC's 16): in Chromium on a slow server's cores about 2.6 times faster than it plays
on one worker, 5 on two, 7 on three. A line comes back a piece at a time, its first sentence first, so it starts
playing about 0.3 s after the call while the rest is written; `gs.sound.prepare()` writes a line ahead (a cutscene does its actors' lines when it starts). It reads
numbers, money, times and dates as words first (`src/kit/say-words.js`), says a line the same way each time, and keeps
the last 400 lines it wrote (cache storage) so they start at once after the next launch. Word marks for lip sync come
from the sound's pauses (`voice-fx.js` `marksFrom`: about twice as close to a speech recogniser's timings as a guess by
word length). Every line plays through the mixer, as a shaped line does on the phones, resampled to the sound card's
rate by the app's own filter (`voice-fx.js` `resample`; the browser's own conversion mirrored the voice's top above
12 kHz as a metallic ring).

**Without the twang.** The 7M's own small decoder (latents to sound) adds a steady whine at 3.6 kHz, fainter tones
beside it and a faint 200 Hz buzz to every voice: the "robotic twang". The 18M model has the same decoder and the same
whine; the decoder Kyutai's 100M model speaks through hears the 7M's latents just as well (the same voice and pitch,
the words still right, the whine gone into the sound around it), for about 3.5 times the work, so that is the one
packed (the small one isn't shipped). Its weights have an 8-bit scale for every 64 numbers (half the error of one a
row). The first time the file is used on a device, the worker times a line of its own (kept, so once a file): a
device that writes speech less than 1.4 times faster than it plays keeps its own voices, as does a phone with under
4 GB. Until the file is in, for
languages other than English, on a phone saving data, and on a device too slow at the start or later (two lines in
a row written slower than they play), the device's own voices speak: on Linux Chromium only lists speech-dispatcher's voices with
`--enable-speech-dispatcher`, which `desktop/main.cjs` turns on (SteamOS has espeak-ng; of its ~100 variants a
language, only the plain voice and its numbered male and female ones are cast). `npm run talk-test` checks it
(`--browser`: in a page, through the workers and the mixer).

**Where it runs.** The app is served from `https://localhost`, the Android app's own address, read straight
from the app's files (`protocol.handle` in `desktop/main.cjs`): the games host, the API and the page's security
policy already allow it, and saves belong to that address, so they stay put between versions. Saves live in
`~/Library/Application Support/Game Scroll` (Mac), `%APPDATA%\Game Scroll` (Windows) and `~/.config/Game Scroll` (Linux).

**Links.** The `gamescroll://` links on shared-game pages ("Open in Game Scroll") open the desktop app at that
game, as on the phones. Links out of the app open in the browser; the window itself never leaves the app.

**Locked down.** The page has no Node.js (context isolation, a sandboxed renderer, a preload that hands it
`window.gsDesktop` and nothing else). It may ask for the camera and microphone, where you are, full screen,
holding the pointer and the clipboard (games with sensors keep their touch way round them); nothing else.
Electron's fuses are set when it is built: no running as Node, no `NODE_OPTIONS` or `--inspect`, cookies
encrypted, and the app's code only from its own archive, checked against its hash (Mac and Windows).

## Working on it

```bash
npm ci && npm ci --prefix desktop
npm run desktop          # build the web app (streamed games, as players get them) and open it in the desktop app
npm run desktop:dist     # package it for this computer into desktop/release/
npm run desktop:test     # the checks below, on a test build with every game built in (Linux: under xvfb-run)
```

`scripts/desktop-test.cjs` opens the app and checks its address, that nothing of Node reaches the page, that
files outside the app can't be read, the speed class and frame rate, that a 2D game plays with the mouse and a
Next Gen game draws, that a `gamescroll://` link opens its game, that links out go to the browser, and that the
window's size is kept. With `--app <the built program>` it checks a packaged app instead (CI runs it on the Mac
Windows and Linux builds): it opens, streams its games from the games host and has no page errors. On Linux the
check then opens the app again as a ROG Ally X in Steam's games mode (`GS_HANDHELD` stands in for the handheld's
model) and plays the feed, Settings and a touch game with a made-up controller (`--no-handheld` skips it).

## Not done yet

- Signing and notarising (a paid Apple Developer account, a Windows code signing certificate), so the
  computers stop asking.
- Updating itself: for now a newer build is downloaded and installed over the old one.
- Game Center and Play Games trophies and cloud saves are phone-only; on a computer, progress stays on that computer.
- On a handheld: reading how warm the chip is (the phones' heat model, `src/kit/heat.js`, has nothing to read on Linux
  yet), Steam artwork for the library, and crash reports that say `linux` (they say `web` for now, with the handheld's
  name as the model: the reports' server takes `linux` once its list of platforms has it).
