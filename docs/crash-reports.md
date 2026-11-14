# Crash and stutter reports

The app reports crashes, script errors and frame drops from real phones to the API Worker
(`api.game-scroll.com`, same Worker and D1 database as hearts and play stats). Nothing identifies
the player, and it uses the same switch as play stats: **Settings → Share anonymous play stats and
crash reports**.

## Where to look

- **Web page:** <https://api.game-scroll.com/perf/report>. Who is reporting, crashes, script errors,
  then smoothness per phone and game. Last 14 days, refreshed every 5 minutes. A game's name opens
  its own page (`/perf/report?game=<id>`): that game's history by phone, day and build.
- **In the app:** tap the GAME SCROLL logo for the QA panel. Each game shows "this phone" and
  "everyone" fps / slow frames / freezes, there's a **Crashes & stutters ↗** link to the page above,
  and **Copy report** now includes the worst stutters and the top crashes and errors. Everyone's
  numbers are fetched when the panel opens (at most every 30 minutes), not when the app starts.
- **Raw JSON:** `GET https://api.game-scroll.com/perf` (worked out at most every 30 minutes).

## When did it happen, and is it already fixed?

Every row says when it was reported and by which build, so something an older build did isn't
mistaken for something that is still happening.

- **Build** reads `1.0.<build number> <commit>`. The commit links to the change the app was built
  from, which shows what was merged by then. (A build made from a pull request carries GitHub's
  temporary merge commit, so its link may lead nowhere.)
- **Times are UTC.** Reports from before the report kept times show only a day.
- **Crashes and script errors** show when each was first and last seen and the builds that reported
  it, newest first. **Still happening?** compares it with what the same phone model has done since:
  - *Yes*: the newest build that phone has run reported it.
  - *Probably not*: newer builds have played the same game on that phone without it, for the
    number of rounds shown beside it. A newer version of the game's file counts as a newer build,
    and for a crash any crash in that game counts as "it", however it was worded. A crash that
    comes and goes needs more than a round or two before it can be called gone.
  - *Can't tell*: that phone hasn't played the game on a newer build since.
- **Smoothness** shows, for each game on each phone, the newest build that played it beside the
  totals for every build in the last 14 days. A row in grey has not been played on that phone's
  newest build yet, so it may already be fixed: play it again, or open the game's page and read
  down its builds, newest first.

Games are streamed, so a fix to a game alone reaches phones without a new app build. Each report
therefore also carries the **version of the game's file** (the short hash from the catalogue), shown
under the build as `game file 9c41d2e0`, with "(current)" if that is the file in the catalogue now
and "(older)" if the game has changed since. Each version of a game gets its own rows, so a
game-only fix shows as a new row with the same app build. Reports from apps built before
13 November 2026 don't say which file it was.

## Who is reporting

The first table lists every phone model that has sent reports. Not all of them are someone playing:

| Label | What it is |
| --- | --- |
| phone | A real phone or tablet. |
| web browser | The test website, opened in a browser. Rows from before 13 November 2026 also include our own test scripts, as an "iPhone" at a few frames a second (they draw 3D without a graphics chip). Test builds, `npm run dev` and browsers driven by a script now count for themselves only and send nothing. |
| emulator | An Android emulator, such as `sdk_gphone64_arm64`. |
| test robot | The phone itself says a test robot is driving it. Google Play runs every build sent to a testing track on phones of its own (Firebase Test Lab), and Android lets an app ask. These are stored apart from the same phone model in someone's hand, and left out of the "everyone" numbers in the app's QA panel. Android only, and only from apps built after 13 November 2026. |
| probably a test robot | A robot from before the app could tell: a phone model that has run a dozen or more builds at six or more a day **and** crashed at least once for every build. A robot is stopped at the end of each run, which the app reports as "app closed while open" when it next starts. A phone that someone installs many builds on in a day has no such crashes, so it stays a phone. |

Test machines are folded shut in the smoothness section, and real phones come first.

## What the numbers mean

Frames are timed only while a round is playing (not while scrolling the feed or paused).

| Column | Meaning |
| --- | --- |
| Avg fps | Frames per second over all rounds. 60 is smooth on most phones; 120 Hz screens can go higher. |
| Slow | Share of frames that took 25 ms or more (under 40 fps). Over 3% shows amber, over 10% red. |
| Freezes | Frames of 70 ms or more: a hitch the player feels. Freezes/min over 2 is amber, over 6 red. One or two freezes in under a minute of play are shown in grey and don't colour the row: too little to go on. |
| Longest | The single worst frame. One big number at the start of a round is often 3D shaders compiling. |
| Busy | How much of each frame the game's own code and drawing took. High busy + low fps: the game is too heavy. Low busy + low fps: the GPU, heat or battery saver. |
| Heat | How much of that play was with the phone warm or hot, as the phone reports it: `hot 62%` (hot for 62% of the time), `warm 30%` (warm or hotter), `cool`, or `–` where the phone doesn't say (the web, and apps built before 13 November 2026). A hot phone slows itself down, so stutter on a hot row may not be the game's doing: compare it with a cool row of the same game. |
| Screen | `wide` is a tablet-sized screen (shortest side 600 px or more), like an unfolded Galaxy Z Fold. `phone` is everything else, so folded and unfolded show as separate rows. |

**Crash** means the app closed while it was on screen, or crashed. The report names the game that
was open and whether a round was playing. It is sent the next time the app starts. Crashes right
after installing a new build aren't counted.

How much it can say depends on the phone:

- **Android 11 and later:** the phone keeps its own record of why each app ended, and the app reads
  it at the next start (`plugins/app-health`, `src/exits.js`). The report gives the reason and the
  time it really happened:

  | What the report says | What happened |
  | --- | --- |
  | the web view was killed, usually for memory | The process that draws the games was killed by the system. For a big 3D game this is the usual way to run out of memory. |
  | the web view crashed | That process crashed by itself (a browser or graphics driver fault). |
  | the phone ran out of memory | The system killed the app itself for memory. |
  | the app crashed / native code crashed | A fault in the app's own Android code, or in native code it uses. |
  | the app stopped responding | The system closed it after it hung (an "isn't responding" dialog). |
  | killed by the system (signal 9) | Killed without a stated reason. On phones that don't report memory kills, this is usually one. |

  The app being **closed by its player** (swiped away, or Force stop) is not a crash and is not
  reported, even at a moment when the app can't tell the difference. Neither is the system quietly
  letting go of the app while it is in the background. The "Where" column carries the system's own
  short note (`android: lmk`).
- **iPhone, the web, Android 10 and older:** the app can only tell that it was not closed tidily:
  it keeps a small marker while it is on screen and finds it still there at the next start. That
  reads "App closed while playing" (or "while open") with no reason, and its time is when the app
  was next opened. Being swiped away within a second or two of leaving the app can be miscounted.

On every phone a crash report ends in **(memory was tight)**, **(memory was low)** or **(memory was
critical)** when the memory guard (`src/kit/memory.js`) had seen the phone short of memory at the time
(apps built from 13 November 2026). With "the web view was killed" it all but confirms memory was the
reason; on iPhone, which gives no reason, it is the best hint there is.

**Script error** means a game threw an error. The app ends that round and carries on. Streamed
games report as `games/<id>.js:<line>`, so the line points into that game's file.

**Graphics chip lost** means the WebGPU device went away while the app was open (apps built from
14 November 2026). A browser or graphics driver can take the device away at any time: the driver
was reset after a hang, the system wanted the chip's memory back, or the browser's graphics process
crashed. The app pauses the round under "The graphics restarted. Getting them back…", makes a new
device, builds the round's shaders again, and gives "Carry on" back once the round draws as before
(`src/kit/gpu.js` `lostGPU`, `src/main.js` `mendStep`). The message gives the reason the browser
named (`unknown` is the usual one for a crash, `test` is our own test script) and how it ended:

| Ending | What happened |
| --- | --- |
| back on WebGPU | A new device came, and the round went on with it. |
| WebGL from then on | The fourth loss in a session: the app stops asking for WebGPU and draws 3D with WebGL until it starts again, as a chip that keeps failing should be. |
| no 3D until the app restarted | The browser refused 3D altogether. Chrome blocks a page from WebGL and WebGPU once its graphics process has crashed twice on it; the Mac and Windows app turns that rule off, but Android's web view keeps it. The pause screen tells the player to restart the app. |

The "Where" column names the chip (as in the smoothness table) and the browser engine with its
version (`Adreno (TM) 830 · Chrome 142`), which is what a phone and driver steering rule would
match on. A game that loses its chip often on one kind of phone is the thing to look for here.

## Chips and phones to steer

Some phones, graphics chips, drivers and browser versions misbehave with one part of the engine:
WebGPU, an HDR screen, frame generation, ray traced reflections. The **steering list**
(`src/steer-list.js`; how it works: `src/steer.js`) turns that part off on those devices only, as
Unity 6.6's device filtering does. It is built into the app and sent out in the catalogue too, so a
new rule reaches phones with the next catalogue, from their next start, without a new app.

The report's **Chips and phones to steer** section groups the lost graphics chips above by chip and
browser engine, on real phones and computers (test machines left out), with how each one ended.
Where there were 3 or more, it writes a rule ready to paste into the list: that chip draws with
WebGL from then on, for that engine version and older ones:

```js
{ id: 'adreno-830-chrome-142-webgpu', why: 'WebGPU device lost 5 times in 2 games on Adreno (TM) 830 with Chrome 142 (2 phone models, the last 14 days to 2026-11-14)',
  when: { platform: 'android', chip: 'Adreno \\(TM\\) 830', engine: 'Chrome <=142' }, do: { webgpu: false } },
```

Before adding one:

- **Keep it as narrow as the reports show.** One phone model (`model: '^SM-F9'`) if only that one
  fails, a driver range on a computer (`driver: '<31.0.101.5186'`), one game (`game: 'long-shadow'`)
  if only it does. A rule for every Adreno takes WebGPU from millions of phones that never had trouble.
- **Turn off the least that fixes it.** `webgpu: false` is the big hammer; a crash that only comes
  with ray tracing on is `traced: false`, a hot phone stuck at 30 fps may want `fps: 60` or `tier: 1`.
- **Say why** in `why`: what the reports showed and when, so whoever reads the list later knows
  whether the trouble is still there.
- **Check it**: `node scripts/steer.mjs` (the PR check runs it) refuses a rule the app would not
  understand (a misspelt field or knob does nothing on a phone, silently), and
  `node scripts/steer.mjs --try platform=android chip="Adreno (TM) 830" engine="Chrome 142"` says
  which rules a device with those facts gets and what they set.
- **Take it out** once the reports show the trouble gone (a newer engine or driver), or the chip
  stays steered for good.

What a rule can match (all the fields given must match; a list matches any of its items):

| Field | Matches | Example |
| --- | --- | --- |
| `platform` | `android`, `ios`, `mac`, `windows`, `linux`, `web` | `'android'` |
| `model` | the phone model as the phone names it (a pattern, case ignored) | `'^SM-F9\\d\\dB$'`, `'^iPhone1[45],'` |
| `chip` | the graphics chip as WebGL names it, or the WebGPU adapter's vendor and architecture | `'Adreno \\(TM\\) 6\\d\\d'`, `'Mali-G7[12]'`, `'Intel.*UHD'`, `'apple metal-3'` |
| `os` | the system's version range | `'<14'`, `'>=13 <15'`, `'17.2'` (17.2 and its updates) |
| `engine` | the browser engine (the web view, the desktop app's Chrome) and a range | `'Chrome <130'`, `'Safari 26'` |
| `driver` | the graphics driver's version range (Mac and PC: the desktop app reads it) | `'<31.0.101.5186'` |
| `app` | the app's build number range | `'<420'` (builds before 1.0.420) |
| `game` | one game or a list: the knobs hold for those games only | `'long-shadow'` |

And what it can set (each only turns something off or down):

| Knob | Effect |
| --- | --- |
| `webgpu: false` | 3D draws with WebGL (for one game: that game's views) |
| `hdr: false` | no HDR screen, the usual 8-bit one |
| `klass: 'mid'` or `'low'` | the device counts as no better than that: frame rates, starting quality, what the kits turn on |
| `tier: 0`..`3` | the Next Gen quality tier goes no higher (0 low, 3 ultra) |
| `fps: 60` | no game runs faster than this (24 or more) |
| `frameGen: false` | no frame generation |
| `traced: false` | no ray traced reflections |
| `half: false` | the kit's passes stay in full precision |
| `pack: false` | textures made in code are not packed into the chip's compressed formats |
| `hide: true` | (with `game`) the game is not shown on this device |

The QA panel's report (tap the GAME SCROLL logo, then Copy report) says which rules matched this
phone and what they set; `__gs.steer()` in tests also gives what the app read about the device.
A rule with a field this app doesn't know matches nothing on it, so a rule for a newer app can go out without upsetting older ones.

## What is sent

About once a minute while the app is open (and when it goes to the background):

- phone model as the system reports it (e.g. `SM-F966B`, `iPhone17,1`), OS version, app build
  (`1.0.<CI run> <commit>`), `phone` or `wide`, and whether a test robot is driving the phone
- per game: the version of the game's file, rounds, frames, frame time, busy time, slow frames,
  freezes, longest frame, and how much of the frame time was with the phone warm or hot
- up to 10 errors: kind, game and the version of its file, message (160 characters, URLs cut down
  to the file name), file:line (for a lost graphics chip, the chip's name and the browser engine
  instead), and for a crash on Android the time the phone recorded

Only a real build sends: test builds, `npm run dev` and a browser driven by a test script count for
themselves (the QA panel still shows "this phone") and send nothing.

The random install id goes along only as a rate-limit key and isn't stored. The server keeps daily
totals per game, game file version, model, screen class and build, with the time each total was
first and last added to, and deletes anything older than 14 days.

For the App Store privacy label this is "Diagnostics: crash data, performance data, other
diagnostic data", **not linked** to the user and **not used for tracking**. On Google Play's data
safety form it's "App info and performance: crash logs, diagnostics", not shared, optional
(the Settings switch).

## Not covered

The stack trace of a native crash inside Android or iOS code (rare for this app, since everything
runs in the WebView): that shows up for free in the Play Console (Android vitals) and App Store
Connect / Xcode Organizer once the app is in the stores. On iPhone there is no record of why the
app ended that an app can read at once, so iPhone crashes stay "closed while playing".
