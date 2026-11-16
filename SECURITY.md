# Security policy

Thanks for helping keep Game Scroll and its players safe.

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue, pull request or discussion.

- **Preferred:** [report a vulnerability](https://github.com/robthewizzuk/game-scroll/security/advisories/new)
  through GitHub's private vulnerability reporting (the repository's **Security** tab, then **Report a vulnerability**).
  Only the maintainers see it, and we can work on a fix with you there.
- **If you can't use GitHub:** email support@game-scroll.com with "Security" in the subject.

Please include what is affected (the app on which platform and build, a game, `api.game-scroll.com`,
`assets.game-scroll.com`, the website or a workflow), the steps to reproduce it, and what an attacker could do with it.
A short proof of concept helps; please don't send other people's data.

Game Scroll is made by a small team. We aim to reply within a week, to keep you posted while we fix it, and to
credit you when the fix is out unless you'd rather we didn't. There is no paid bug bounty.

## Supported versions

Fixes go into the latest version only. Players get them through the app's updates, and game fixes stream to every
phone within minutes with no update at all.

| What | Supported |
| --- | --- |
| Android app: the latest Google Play release and the latest build on the "Latest Android build" release | Yes |
| iOS app: the latest App Store release and the latest "Latest iOS build" | Yes |
| Mac and Windows app: the latest "Latest Mac and Windows builds" release (`desktop/`) | Yes |
| Games streamed from the current signed catalogue | Yes |
| `api.game-scroll.com`, `assets.game-scroll.com` and `game-scroll.com` as they run now | Yes |
| Older app builds | No: please update first and check it still happens |

## In scope

- **The app** (`src/`, `android/`, `ios/`, `desktop/`, the native plugins in `plugins/`): for example a way for a
  game or a downloaded file to reach the network beyond our two hosts, read another game's saves, run native code,
  get past the Content Security Policy, or read the camera, microphone or location outside a round or off the phone.
- **Streamed games and the signed catalogue** ([docs/catalogue-signing.md](docs/catalogue-signing.md)): a way to make
  the app run a game file or catalogue that wasn't signed in CI, or an older catalogue than the one it has.
- **Game code checks**: a game file that passes `scripts/game-lint.mjs` and `scripts/game-types.mjs` yet reaches
  storage, the network, `eval`, other windows or native features.
- **The API Worker** at `api.game-scroll.com` (`workers/hearts`): hearts, app attestation passes, play stats, and
  crash and speed reports ([docs/api-security.md](docs/api-security.md), [docs/crash-reports.md](docs/crash-reports.md)),
  for example faking passes, reading or changing other people's data, or getting round the limits it describes.
- **The website Worker** (`workers/site`) and the GitHub Actions workflows in `.github/workflows/` (for example a pull
  request from a fork that could reach a secret or publish games).

## Out of scope

- Bugs in how a game plays, unless they are also one of the above. Please open an ordinary issue for those.
- Denial of service by sheer volume, and findings that need a large amount of traffic to the live hosts.
- Things that are known and documented: hearts are accepted without an app pass until the store accounts exist
  (`ENFORCE = "off"`, see [docs/api-security.md](docs/api-security.md)); the Mac and Windows builds aren't signed yet;
  `android/app/debug.keystore` is the public key for debug builds only, and release builds are signed separately.
- Problems in Cloudflare, GitHub, Apple, Google or a library we use, unless Game Scroll uses it in an unsafe way.
  Please report those to the project concerned.
- Reports from automated scanners with no working example of the problem.

## Testing safely

Please test against your own copy where you can (`npm run dev`, or a Worker you deploy from `workers/hearts`), use
only accounts and devices you own, and stop and tell us if you come across anyone else's data. We won't take action
against research done in good faith within this policy.
