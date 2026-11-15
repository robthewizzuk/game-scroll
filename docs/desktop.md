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
- **Played as a phone** (`speed.handheld` in `src/kit/speed.js`, `PC` in `src/kit/hd3d.js`): it runs on a battery and
  warms in the hands, so 3D games aim for 60 frames a second with nothing made between, and draw 30 with GSFG making
  the other 30 where they can't hold 60 (the phones' rule since 2026-11-15); 2D games run at the screen's rate (120 on
  an Ally). 3D starts on high (`top`) or medium (`mid`) and never climbs to ultra: high draws about 1.3 million pixels
  and GSSR makes the Ally's 1920 × 1080 from them. A low battery (Chromium reads it through UPower) turns on GSFG's
  power saving as on a phone. Crash and stutter reports name the handheld ("ROG Ally X") as the model.
- **Console mode** (a handheld, or Steam's games mode: gamescope, `--gs-console`): the window opens full screen, and
  the app is drawn bigger to read from a hand's length or a sofa: the screen's height over 640, in quarter steps
  (1.75 on a 1080p Ally or a TV, 1.25 on a Steam Deck, as Valve's own browser shortcut does). A Steam launch option
  `GS_ZOOM=1.5 %command%` pins it. Docked to a TV, it follows the new screen. Settings has a **Quit** button.
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
first run, so later starts are quicker.

The engine reads `window.gsDesktop` (`src/desktop.js`) where a computer differs from a phone:

- **Its class** (`src/kit/speed.js`, `classifyDesktop`) comes from the graphics chip as a desktop browser names
  it: drawing in software is `low`, a chip built into an Intel or AMD processor `mid`, the rest `top` (Apple
  silicon, NVIDIA and AMD cards, Intel Arc cards, Snapdragon X). The phone rule read every Mac as a mid-range
  iPhone, because its chip name says "Apple".
- **The screen's rate** is measured up to 360 Hz (a phone's stop at 144). Auto runs 2D games at the screen's
  own rate, and 3D games too on a `top` computer (`mid`: the screen's rate divided down to near 60). A 3D game
  that can't keep up steps down a whole number of refreshes at a time (144, 72, 48, 36 on a 144 Hz screen),
  so its frames always land on refreshes; a phone steps 120, 60, 30.
- **No heat cap** (`src/kit/hd3d.js`): on a phone 3D games never climb above the high tier, because the Fold
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
