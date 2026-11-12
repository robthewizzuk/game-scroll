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
  and **Copy report** now includes the worst stutters and the top crashes and errors.
- **Raw JSON:** `GET https://api.game-scroll.com/perf`.

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
  - *Probably not*: newer builds have played the same game on that phone without it.
  - *Can't tell*: that phone hasn't played the game on a newer build since.
- **Smoothness** shows, for each game on each phone, the newest build that played it beside the
  totals for every build in the last 14 days. A row in grey has not been played on that phone's
  newest build yet, so it may already be fixed: play it again, or open the game's page and read
  down its builds, newest first.

Games are streamed, so a fix to a game alone reaches phones without a new app build. For that,
read the game's page by day: the build stays the same and the numbers change from one day to the next.

## Who is reporting

The first table lists every phone model that has sent reports. Not all of them are someone playing:

| Label | What it is |
| --- | --- |
| phone | A real phone or tablet. |
| web browser | The test website, opened in a browser. Rows from before 13 November 2026 also include our own test scripts, as an "iPhone" at a few frames a second (they draw 3D without a graphics chip). Test builds, `npm run dev` and browsers driven by a script now count for themselves only and send nothing. |
| emulator | An Android emulator, such as `sdk_gphone64_arm64`. |
| probably a test robot | A phone model that has run a dozen or more builds at six or more a day. Google Play runs every build sent to a testing track on a few phones of its own, and those robots report like anyone else. Their "app closed while open" crashes are the robot ending its run. |

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
| Screen | `wide` is a tablet-sized screen (shortest side 600 px or more), like an unfolded Galaxy Z Fold. `phone` is everything else, so folded and unfolded show as separate rows. |

**Crash** means the app closed or reloaded while it was on screen, without going to the background
first. On phones that's almost always the system killing it for memory (the WebView's GPU process,
for big 3D scenes). The report names the game that was open and whether a round was playing.
Crashes right after installing a new build aren't counted. A crash is sent the next time the app
starts, so its time is when the app was next opened, not when it closed.

**Script error** means a game threw an error. The app ends that round and carries on. Streamed
games report as `games/<id>.js:<line>`, so the line points into that game's file.

## What is sent

About once a minute while the app is open (and when it goes to the background):

- phone model as the system reports it (e.g. `SM-F966B`, `iPhone17,1`), OS version, app build
  (`1.0.<CI run> <commit>`), and `phone` or `wide`
- per game: rounds, frames, frame time, busy time, slow frames, freezes, longest frame
- up to 10 errors: kind, game, message (160 characters, URLs cut down to the file name), file:line

The random install id goes along only as a rate-limit key and isn't stored. The server keeps daily
totals per game, model, screen class and build, with the time each total was first and last added
to, and deletes anything older than 14 days.

For the App Store privacy label this is "Diagnostics: crash data, performance data, other
diagnostic data", **not linked** to the user and **not used for tracking**. On Google Play's data
safety form it's "App info and performance: crash logs, diagnostics", not shared, optional
(the Settings switch).

## Not covered

Native crashes inside Android or iOS code (rare for this app, since everything runs in the WebView)
show up for free in the Play Console (Android vitals) and App Store Connect / Xcode Organizer once
the app is in the stores.
