# Game Scroll for Mac and Windows

The same app as the phones, on a computer: `desktop/` wraps the web app (`npm run build`) in
[Electron](https://www.electronjs.org/). Electron carries its own Chromium, the engine Android's web view is
built on, so WebGPU, the shaders and the engine's speed tuning behave the same on every computer. (Tauri and
other system web views were the other way: on a Mac that is Safari's engine, with WebGPU only on the newest
macOS, animation frames held to 60 a second on 120 Hz screens, and a different shader compiler from the one
the engine is tuned on.) The cost is size: about 120 MB to download.

Games stream in from the games host as they do on the phones, so a game change needs no new desktop build.

## Downloads

Every push to `main` builds both and replaces the "Latest Mac and Windows builds" release
(`.github/workflows/desktop.yml`). The links never change:

| Computer | File |
| --- | --- |
| Mac with Apple silicon (M1 and later) | [Game-Scroll-mac-arm64.dmg](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-arm64.dmg) |
| Intel Mac | [Game-Scroll-mac-x64.dmg](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-mac-x64.dmg) |
| Windows | [Game-Scroll-windows-x64.exe](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-x64.exe) |
| Windows on Snapdragon | [Game-Scroll-windows-arm64.exe](https://github.com/robthewizzuk/game-scroll/releases/download/desktop-latest/Game-Scroll-windows-arm64.exe) |

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

## Keys

| | |
| --- | --- |
| Next / previous game | mouse wheel, ↓ / ↑, Page Down / Page Up |
| Start, pause | Space or Enter, Esc |
| Full screen | F11 (Windows), Ctrl+Cmd+F (Mac), or the ⛶ button on a Next Gen game |
| Frame lab (frame times, GPU, resolution) | F3 |
| Developer tools | Ctrl+Shift+I (Windows), Alt+Cmd+I (Mac) |

Game controllers work as they do on the phones (`gs.pad`).

## What is different on a computer

**Speed.** Before Chromium starts, `desktop/main.cjs` asks for the fast graphics chip on laptops with two
(`force_high_performance_gpu`), keeps the graphics chip where Chromium would turn an older driver down to
software (`ignore-gpu-blocklist`), draws 2D canvases on the graphics chip, and on Windows turns off the
"is this window covered?" guess that can freeze a window in plain view. The page keeps compiled code from its
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
  got hot and throttled on ultra. A computer may climb to ultra, and a `top` one starts there. Each tier also
  draws more of a big window's pixels before the upscaler fills in the rest (ultra about a 2560 x 1440
  window's worth, a phone's a little over 1080p).
- Crash and stutter reports say `mac` or `windows`, with the graphics chip as the model ("Apple M2 Pro").

**Where it runs.** The app is served from `https://localhost`, the Android app's own address, read straight
from the app's files (`protocol.handle` in `desktop/main.cjs`): the games host, the API and the page's security
policy already allow it, and saves belong to that address, so they stay put between versions. Saves live in
`~/Library/Application Support/Game Scroll` (Mac) and `%APPDATA%\Game Scroll` (Windows).

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
and Windows builds): it opens, streams its games from the games host and has no page errors.

## Not done yet

- Signing and notarising (a paid Apple Developer account, a Windows code signing certificate), so the
  computers stop asking.
- Updating itself: for now a newer build is downloaded and installed over the old one.
- Game Center and Play Games trophies and cloud saves are phone-only; on a computer, progress stays on that computer.
