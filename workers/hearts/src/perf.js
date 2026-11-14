// Anonymous performance and crash reports from real phones.
//
//   POST /perf  body { device, info: { platform, model, os, app, form, robot },
//                      games: { "<id>": { r, f, ms, w, sl, h, x, hk, hw, hh, v } },   per game, since the last batch
//                      errors: [ { kind, game, msg, place, n, v, at } ] }             at most 10
//                      (kind: 'crash', 'error' (a script error), or 'gpu': the graphics chip was lost; its place
//                      is the chip and the browser engine, "Adreno (TM) 830 · Chrome 142")
//   GET  /perf  -> { days, games: [...], errors: [...] }                       last 14 days, cached 5 min
//   GET  /perf/report -> a web page: who is reporting, crashes, script errors, then smoothness per
//                        phone, each row with the build it was last seen on and when
//   GET  /perf/report?game=<id> -> one game's history by phone, day and build, newest first
//
// Game fields: r rounds, f frames, ms frame time, w work time, sl slow frames (>= 25 ms),
// h hitches (>= 70 ms), x the longest frame; hk frame time with the phone's heat known, hw of it
// warm, hh hot; v the version of the game's file (its short hash in the catalogue: games are
// streamed, so a game can change without the app build changing). An error's `at` is when it
// happened (seconds since 1970) where the phone knows and it isn't now: a crash is told at the next
// start. info.robot: the phone says a test robot is driving it; those are stored as "android-robot".
//
// Like play stats, nothing is stored per person: the device id is only a rate-limit key, and rows are
// added up per day, game, phone model, app build and game version. Each row also keeps when it was
// first and last added to (first_at, last_at), so the report can tell what is still happening from
// what an older build did.

export const PERF_DAYS = 14;
const MAX_GAMES = 40, MAX_ERRORS = 10;
const CAP = { r: 50, f: 200_000, ms: 3_600_000, w: 3_600_000, sl: 200_000, h: 50_000, x: 60_000 };
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/, VER_RE = /^[0-9a-f]{6,16}$/;
const PLATFORMS = new Set(['ios', 'android', 'web', 'mac', 'windows']);   // (mac, windows: the desktop app)
const FORMS = new Set(['phone', 'wide']);
const ROBOT = '-robot';

const day = (t = Date.now()) => Math.floor(t / 86400000);
const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
/** Short printable text only (no control characters), trimmed to max. */
const txt = (v, max) => typeof v === 'string' ? v.replace(/[^\x20-\x7e -ɏ]/g, '').trim().slice(0, max) : '';
const ver = v => typeof v === 'string' && VER_RE.test(v) ? v : '';

/** Clean a client batch. Returns { info, games: [[...]], errors: [[...]] } or null if it's malformed. */
export function cleanPerf(b, known, t = Date.now()) {
  if (!b || typeof b !== 'object') return null;
  const i = b.info || {};
  const platform = PLATFORMS.has(i.platform) ? i.platform : 'web';
  const info = {
    platform: i.robot === true && platform !== 'web' ? platform + ROBOT : platform,
    model: txt(i.model, 40) || 'unknown',
    os: txt(i.os, 40),
    app: txt(i.app, 40) || 'unknown',
    form: FORMS.has(i.form) ? i.form : 'phone',
  };
  const g = b.games ?? {}, e = b.errors ?? [];
  if (typeof g !== 'object' || Array.isArray(g) || !Array.isArray(e)) return null;
  const games = [];
  for (const [id, c] of Object.entries(g)) {
    if (games.length >= MAX_GAMES) break;
    if (!GAME_RE.test(id) || (known && !known.has(id)) || !c || typeof c !== 'object') continue;
    const f = n(c.f, CAP.f), ms = n(c.ms, CAP.ms);
    if (!f || !ms) continue;
    // Keep the numbers consistent with each other: no more slow frames than frames, and so on.
    const sl = Math.min(n(c.sl, CAP.sl), f), h = Math.min(n(c.h, CAP.h), sl);
    const hk = Math.min(n(c.hk, CAP.ms), ms), hh = Math.min(n(c.hh, CAP.ms), hk), hw = Math.min(n(c.hw, CAP.ms), hk - hh);
    games.push([id, n(c.r, CAP.r), f, ms, Math.min(n(c.w, CAP.w), ms), sl, h, Math.min(n(c.x, CAP.x), ms), ver(c.v), hk, hw, hh]);
  }
  const errors = [], now = Math.floor(t / 1000);
  for (const x of e.slice(0, MAX_ERRORS)) {
    if (!x || typeof x !== 'object') continue;
    const kind = x.kind === 'crash' || x.kind === 'gpu' ? x.kind : 'error';
    const game = typeof x.game === 'string' && GAME_RE.test(x.game) && (!known || known.has(x.game)) ? x.game : '';
    const msg = txt(x.msg, 160);
    if (!msg) continue;
    // When it happened, if the phone says and it is believable: within the days kept, and not in the future.
    const at = n(x.at, 4e9), when = at > now - PERF_DAYS * 86400 && at <= now + 300 ? Math.min(at, now) : 0;
    errors.push([kind, game, msg, txt(x.place, 80), Math.max(1, n(x.n, 50)), game ? ver(x.v) : '', when]);
  }
  return { info, games, errors };
}

export async function savePerf(db, { info, games, errors }, t = Date.now()) {
  const d = day(t), at = Math.floor(t / 1000), { platform, model, os, app, form } = info;
  const q = [
    ...games.map(([g, r, f, ms, w, sl, h, x, v, hk, hw, hh]) => db.prepare(
      'INSERT INTO perf (day, game, platform, model, form, app, ver, rounds, frames, ms, work_ms, slow, hitches, worst_ms, first_at, last_at, heat_ms, warm_ms, hot_ms) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16, ?17, ?18) ON CONFLICT(day, game, platform, model, form, app, ver) DO UPDATE SET ' +
      'rounds = rounds + ?8, frames = frames + ?9, ms = ms + ?10, work_ms = work_ms + ?11, slow = slow + ?12, hitches = hitches + ?13, worst_ms = MAX(worst_ms, ?14), last_at = ?15, ' +
      'heat_ms = heat_ms + ?16, warm_ms = warm_ms + ?17, hot_ms = hot_ms + ?18'
    ).bind(d, g, platform, model, form, app, v, r, f, ms, w, sl, h, x, at, hk, hw, hh)),
    // An error that says when it happened is filed under that day and time, not under when it was told.
    ...errors.map(([kind, g, msg, place, cnt, v, when]) => db.prepare(
      'INSERT INTO crashes (day, kind, game, msg, place, platform, model, os, app, ver, n, first_at, last_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12) ' +
      'ON CONFLICT(day, kind, game, msg, place, platform, model, os, app, ver) DO UPDATE SET n = n + ?11, last_at = MAX(last_at, ?12), ' +
      'first_at = CASE WHEN first_at = 0 THEN 0 ELSE MIN(first_at, ?12) END'
    ).bind(when ? Math.floor(when / 86400) : d, kind, g, msg, place, platform, model, os, app, v, cnt, when || at)),
  ];
  if (q.length) await db.batch(q);
}

/** Totals for the last PERF_DAYS days: smoothness per game and phone, and the most common errors. Test robots are left out. */
export async function perfTotals(db, t = Date.now()) {
  const since = day(t) - PERF_DAYS;
  const [g, e] = await db.batch([
    db.prepare(
      'SELECT game, platform, model, form, SUM(rounds) rounds, SUM(frames) frames, SUM(ms) ms, SUM(work_ms) work, ' +
      `SUM(slow) slow, SUM(hitches) hitches, MAX(worst_ms) worst FROM perf WHERE day > ?1 AND platform NOT LIKE '%${ROBOT}' ` +
      'GROUP BY game, platform, model, form ORDER BY SUM(slow) * 1.0 / SUM(frames) DESC LIMIT 500').bind(since),
    db.prepare(
      'SELECT kind, game, msg, place, SUM(n) n, MAX(day) last, GROUP_CONCAT(DISTINCT model) models, GROUP_CONCAT(DISTINCT app) apps ' +
      `FROM crashes WHERE day > ?1 AND platform NOT LIKE '%${ROBOT}' GROUP BY kind, game, msg, place ORDER BY SUM(n) DESC LIMIT 200`).bind(since),
  ]);
  return {
    days: PERF_DAYS,
    games: g.results.map(r => ({ ...r, fps: r.ms ? Math.round(10 * 1000 * r.frames / r.ms) / 10 : 0 })),
    errors: e.results.map(r => ({ ...r, last: new Date(r.last * 86400000).toISOString().slice(0, 10) })),
  };
}

export const prunePerf = (db, t = Date.now()) => db.batch([
  db.prepare('DELETE FROM perf WHERE day <= ?1').bind(day(t) - PERF_DAYS - 1),
  db.prepare('DELETE FROM crashes WHERE day <= ?1').bind(day(t) - PERF_DAYS - 1),
]);

/* ---------- the report page ---------- */

const MIN_FRAMES = 300;   // fewer frames than this say nothing about smoothness
// The build that reported most recently first. Rows from before times were kept only have a day,
// so those fall back to the day, then to the run number in "1.0.<run> <commit>".
const NEWEST = 't1 DESC, d1 DESC, CAST(substr(app, 5) AS INTEGER) DESC, app DESC, ver DESC';
const SUMS = 'SUM(rounds) rounds, SUM(frames) frames, SUM(ms) ms, SUM(work_ms) work, SUM(slow) slow, SUM(hitches) hitches, MAX(worst_ms) worst, SUM(heat_ms) heat, SUM(warm_ms) warm, SUM(hot_ms) hot';
const counts = (r, p = '') => ({ rounds: r[p + 'rounds'], frames: r[p + 'frames'], ms: r[p + 'ms'], work: r[p + 'work'], slow: r[p + 'slow'], hitches: r[p + 'hitches'], worst: r[p + 'worst'],
  heat: r[p + 'heat'] || 0, warm: r[p + 'warm'] || 0, hot: r[p + 'hot'] || 0 });
const pk = r => r.platform + '|' + r.model;   // one kind of reporter: a phone model, apart from the same model driven by a test robot

/**
 * What kind of machine a reporter is: '' (a phone), 'robot' (the phone itself says a test robot is
 * driving it), 'browser', 'emulator', or 'likely' (it looks like a robot from before the app could
 * tell). A robot is given every build and is stopped at the end of each run, which the app reports
 * as a crash when it next starts: so it changes build many times a day and crashes at least as
 * often as it changes build. Someone trying their own builds changes build as often, without those.
 * builds, d0, d1, crashes: over everything that phone model has reported, not one game.
 */
function phoneKind({ platform, model, builds = 0, d0 = 0, d1 = 0, crashes = 0 }) {
  if (String(platform).endsWith(ROBOT)) return 'robot';
  if (platform === 'web') return 'browser';
  if (platform === 'mac' || platform === 'windows') return 'computer';
  if (/^sdk_|emulator|^generic|android sdk built/i.test(model)) return 'emulator';
  return builds >= 12 && builds / (d1 - d0 + 1) >= 6 && crashes >= builds ? 'likely' : '';
}

// What kind of machine each phone model is (phoneKind), from everything it has reported: in one game
// alone a robot looks like any other phone. It reads both tables whole, so the Worker keeps the answer
// a while (phoneKinds) and hands it to perfReport, which would otherwise read them again for every page.
const KINDS_SQL = `SELECT p.platform, p.model, p.builds, p.d0, p.d1, COALESCE(c.crashes, 0) crashes
   FROM (SELECT platform, model, COUNT(DISTINCT app) builds, MIN(day) d0, MAX(day) d1 FROM perf WHERE day > ?1 GROUP BY platform, model) p
   LEFT JOIN (SELECT platform, model, SUM(n) crashes FROM crashes WHERE day > ?1 AND kind = 'crash' GROUP BY platform, model) c
     ON c.platform = p.platform AND c.model = p.model`;

/** [{ platform, model, builds, d0, d1, crashes }] for every phone model that reported in the last PERF_DAYS days. */
export async function phoneKinds(db, t = Date.now()) {
  return (await db.prepare(KINDS_SQL).bind(day(t) - PERF_DAYS).all()).results;
}

/**
 * Everything the report page shows, for the last PERF_DAYS days. With a game id: that game alone,
 * with its history by phone, day and build (cheap: it reads only that game's rows).
 *
 *   phones   who reports: { platform, model, kind, app (the build it reported most recently), d0, d1, t1, builds, rounds, ms, crashes }
 *   games    per game, phone and screen: { ..., builds, d0, all: counts over every build, app, ver, d1, t1, now: counts on the newest build }
 *   history  (one game) per phone, screen, day and build: { platform, model, form, app, ver, day, t0, t1, ...counts }
 *   errors   crashes and script errors: { kind, game, msg, place, n, d0, d1, t0, t1, phones: [{ platform, model }], apps: [{ app, ver }] (newest first),
 *            state: 'now' (on that phone's newest build) | 'gone' (newer builds played the game without it) | 'unknown',
 *            newer (how many such builds), rounds (how many rounds they played) }
 *
 * A "build" is an app build together with the version of the game's file (ver), since a game can
 * change without the app changing. d0/d1 are day numbers and t0/t1 seconds since 1970 (0 where a
 * row is from before times were kept).
 *
 * kinds: phoneKinds() worked out a little earlier, if the caller keeps it; otherwise it is read here.
 */
export async function perfReport(db, t = Date.now(), game = '', kinds = null) {
  const since = day(t) - PERF_DAYS, one = game ? ' AND game = ?2' : '';
  const q = sql => game ? db.prepare(sql).bind(since, game) : db.prepare(sql).bind(since);
  const [er, nw, ...rest] = await db.batch([
    // Crashes and script errors, per phone model and build (added up per error below).
    q(`SELECT kind, game, msg, place, platform, model, app, ver, SUM(n) n, MIN(day) d0, MAX(day) d1, MIN(NULLIF(first_at, 0)) t0, MAX(last_at) t1
       FROM crashes WHERE day > ?1${one} GROUP BY kind, game, msg, place, platform, model, app, ver ORDER BY d1 DESC, t1 DESC LIMIT 5000`),
    // For each error and phone model: how many other builds have played that game since it was last seen,
    // without it, and for how many rounds. For a crash, without any crash in that game: its wording
    // differs with what the phone could say about it, and "closed while playing" is the same trouble as
    // "out of memory while playing". "Since": by the time where both have one. A row with no time is
    // from before times were kept, so anything with a time was reported after it; otherwise by the day.
    q(`WITH ea AS (SELECT kind, game, msg, place, platform, model, app, ver, MAX(day) d1, MAX(last_at) t1 FROM crashes WHERE day > ?1 AND game != ''${one} GROUP BY kind, game, msg, place, platform, model, app, ver),
       e AS (SELECT kind, game, msg, place, platform, model, MAX(d1) d1, MAX(t1) t1 FROM ea GROUP BY kind, game, msg, place, platform, model),
       p AS (SELECT game, platform, model, app, ver, MAX(day) d1, MAX(last_at) t1, SUM(rounds) rounds FROM perf WHERE day > ?1${one} GROUP BY game, platform, model, app, ver)
       SELECT e.kind, e.game, e.msg, e.place, e.platform, e.model, COUNT(*) newer, SUM(p.rounds) rounds FROM e
       JOIN p ON p.game = e.game AND p.platform = e.platform AND p.model = e.model
         AND (CASE WHEN e.t1 > 0 AND p.t1 > 0 THEN p.t1 > e.t1 WHEN p.t1 > 0 THEN p.d1 >= e.d1 ELSE p.d1 > e.d1 END)
       WHERE NOT EXISTS (SELECT 1 FROM ea x WHERE x.kind = e.kind AND x.game = e.game AND x.platform = e.platform AND x.model = e.model AND x.app = p.app AND x.ver = p.ver
                         AND (e.kind = 'crash' OR (x.msg = e.msg AND x.place = e.place)))
       GROUP BY e.kind, e.game, e.msg, e.place, e.platform, e.model`),
    // What kind of machine each phone model is (phoneKind), unless the caller has it already.
    ...(kinds ? [] : [db.prepare(KINDS_SQL).bind(since)]),
    ...(game ? [
      // One game: every day and build it was played on, on every phone, newest first.
      q(`SELECT platform, model, form, app, ver, day, day d1, first_at t0, last_at t1, rounds, frames, ms, work_ms work, slow, hitches, worst_ms worst, heat_ms heat, warm_ms warm, hot_ms hot
         FROM perf WHERE day > ?1 AND game = ?2 ORDER BY ${NEWEST} LIMIT 2000`),
    ] : [
      // Who reports: each phone model, the build it reported most recently and how many builds it has run.
      q(`WITH b AS (SELECT platform, model, app, '' ver, MIN(day) d0, MAX(day) d1, MAX(last_at) t1, SUM(rounds) rounds, SUM(ms) ms FROM perf WHERE day > ?1 GROUP BY platform, model, app),
           r AS (SELECT b.*, ROW_NUMBER() OVER (PARTITION BY platform, model ORDER BY ${NEWEST}) rn, COUNT(*) OVER p builds, MIN(d0) OVER p a_d0, SUM(rounds) OVER p a_rounds, SUM(ms) OVER p a_ms
                 FROM b WINDOW p AS (PARTITION BY platform, model))
           SELECT platform, model, app, a_d0 d0, d1, t1, builds, a_rounds rounds, a_ms ms FROM r WHERE rn = 1 ORDER BY t1 DESC, d1 DESC LIMIT 200`),
      // Smoothness per game, phone and screen: the newest build that played it, beside the totals for every build.
      q(`WITH b AS (SELECT game, platform, model, form, app, ver, MIN(day) d0, MAX(day) d1, MAX(last_at) t1, ${SUMS} FROM perf WHERE day > ?1 GROUP BY game, platform, model, form, app, ver),
       r AS (SELECT b.*, ROW_NUMBER() OVER (PARTITION BY game, platform, model, form ORDER BY ${NEWEST}) rn, COUNT(*) OVER p builds, MIN(d0) OVER p a_d0,
                    SUM(rounds) OVER p a_rounds, SUM(frames) OVER p a_frames, SUM(ms) OVER p a_ms, SUM(work) OVER p a_work, SUM(slow) OVER p a_slow, SUM(hitches) OVER p a_hitches, MAX(worst) OVER p a_worst
             FROM b WINDOW p AS (PARTITION BY game, platform, model, form))
       SELECT * FROM r WHERE rn = 1 ORDER BY a_slow * 1.0 / a_frames DESC LIMIT 500`),
    ]),
  ]);

  const kd = kinds ? { results: kinds } : rest.shift(), [ph, gm] = rest;
  const run = a => parseInt(String(a.app).slice(4), 10) || 0;
  const later = (a, b) => (a.t1 || 0) - (b.t1 || 0) || a.d1 - b.d1 || run(a) - run(b);   // > 0: a was reported after b
  const history = game ? ph.results : [];
  const kindBy = new Map(kd.results.map(r => [pk(r), { kind: phoneKind(r), crashes: r.crashes }]));
  const kindOf = p => kindBy.get(pk(p)) || { kind: phoneKind(p), crashes: 0 };
  const phones = game ? [] : ph.results.map(r => ({ ...r, ...kindOf(r) }));
  // The build each phone model ran most recently, to tell which errors are on it.
  const newest = new Map(phones.map(p => [pk(p), p]));
  if (game) {
    // One game: its phones are whoever played it, and "newest build" is the newest that ran this game.
    const seen = new Map();
    for (const r of history) {   // newest first
      const p = seen.get(pk(r));
      if (!p) seen.set(pk(r), { platform: r.platform, model: r.model, app: r.app, d0: r.day, d1: r.day, t1: r.t1, apps: new Set([r.app]), rounds: r.rounds, ms: r.ms });
      else { p.d0 = Math.min(p.d0, r.day); p.apps.add(r.app); p.rounds += r.rounds; p.ms += r.ms; }
    }
    for (const { apps, ...p } of seen.values()) phones.push({ ...p, builds: apps.size, ...kindOf(p) });
    for (const p of phones) if (!newest.has(pk(p)) || later(p, newest.get(pk(p))) > 0) newest.set(pk(p), p);
  }
  // A build that only got as far as an error counts as a build that phone ran.
  for (const r of er.results) if (!newest.has(pk(r)) || later(r, newest.get(pk(r))) > 0) newest.set(pk(r), r);

  const games = (gm?.results || []).map(r => ({ game: r.game, platform: r.platform, model: r.model, form: r.form, builds: r.builds, d0: r.a_d0,
    all: counts(r, 'a_'), app: r.app, ver: r.ver, d1: r.d1, t1: r.t1, now: counts(r) }));

  // Errors: add the per-phone, per-build rows up into one entry per error, and say whether it is still happening.
  const newer = new Map(nw.results.map(r => [[r.kind, r.game, r.msg, r.place, pk(r)].join('\n'), r]));
  const byErr = new Map();
  for (const r of er.results) {
    const k = [r.kind, r.game, r.msg, r.place].join('\n');
    let e = byErr.get(k);
    if (!e) byErr.set(k, e = { kind: r.kind, game: r.game, msg: r.msg, place: r.place, n: 0, d0: r.d0, d1: r.d1, t0: 0, t1: 0, phones: new Map(), apps: new Map() });
    e.n += r.n; e.d0 = Math.min(e.d0, r.d0); e.d1 = Math.max(e.d1, r.d1); e.t1 = Math.max(e.t1, r.t1 || 0);
    if (r.t0) e.t0 = e.t0 ? Math.min(e.t0, r.t0) : r.t0;
    const ph = e.phones.get(pk(r)) || e.phones.set(pk(r), { platform: r.platform, model: r.model, apps: new Set() }).get(pk(r));
    ph.apps.add(r.app);
    const a = e.apps.get(r.app + '\n' + r.ver);
    if (!a) e.apps.set(r.app + '\n' + r.ver, { app: r.app, ver: r.ver, d1: r.d1, t1: r.t1 || 0 }); else { a.d1 = Math.max(a.d1, r.d1); a.t1 = Math.max(a.t1, r.t1 || 0); }
  }
  const errors = [...byErr.values()].sort((a, b) => b.n - a.n).slice(0, 200).map(e => {
    let now = false, gone = 0, rounds = 0;
    for (const [k, ph] of e.phones) {
      const p = newest.get(k), hit = newer.get([e.kind, e.game, e.msg, e.place, k].join('\n')), since = hit?.newer || 0;
      // The app sends a crash only from the build that crashed, so "on the newest build" is exact. A
      // newer version of the game's file that has played since without it comes first, though: the
      // app build is the same, and the game is not.
      if (p && ph.apps.has(p.app) && !since) now = true;
      if (since > gone) { gone = since; rounds = hit.rounds || 0; }
    }
    return { kind: e.kind, game: e.game, msg: e.msg, place: e.place, n: e.n, d0: e.d0, d1: e.d1, t0: e.t0, t1: e.t1,
      phones: [...e.phones.values()].map(({ platform, model }) => ({ platform, model, kind: kindOf({ platform, model }).kind })),
      apps: [...e.apps.values()].sort((a, b) => later(b, a)), state: now ? 'now' : gone ? 'gone' : 'unknown', newer: now ? 0 : gone, rounds: now ? 0 : rounds };
  });
  return { days: PERF_DAYS, at: Math.floor(t / 1000), game, phones, games, history, errors };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = v => String(v).padStart(2, '0');
const dayText = d => { const x = new Date(d * 86400000); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const clock = s => { const x = new Date(s * 1000); return `${two(x.getUTCHours())}:${two(x.getUTCMinutes())}`; };
/** "12 Nov 21:44" (UTC) where the time on that day is known, else just the day. (The earliest time kept can be later than the first day.) */
const when = (d, t) => t && Math.floor(t / 86400) === d ? `${dayText(d)} ${clock(t)}` : dayText(d);
const plat = p => esc(String(p).replace(ROBOT, ''));

/** A build label ("1.0.233 2eeb6bb") with its commit linked to the repository. */
function build(app, repo) {
  const m = /^(?:(.*)\s)?([0-9a-f]{7,12})$/.exec(app || '');
  if (!m || !/^https:\/\//.test(repo || '')) return `<span class=t>${esc(app)}</span>`;
  return `<span class=t>${esc(m[1] || '')} <a href="${esc(repo.replace(/\/+$/, ''))}/commit/${m[2]}" rel="noopener noreferrer">${m[2]}</a></span>`;
}

const rate = c => ({ slow: c.frames ? c.slow / c.frames : 0, perMin: c.ms ? c.hitches / (c.ms / 60000) : 0, fps: c.ms ? Math.round(10 * 1000 * c.frames / c.ms) / 10 : 0 });
// One or two freezes in a few seconds of play make a huge "a minute" figure that means nothing, so
// freezes only count towards a row's colour and place once there are three, or a minute of play.
const enough = c => c.hitches >= 3 || c.ms >= 60000;
const fair = c => enough(c) ? rate(c).perMin : 0;
/** bad / warn / ok for a set of counts, or '' when there are too few frames to say. */
function mark(c) {
  if (c.frames < MIN_FRAMES) return '';
  const slow = rate(c).slow, perMin = fair(c);
  return slow > 0.1 || perMin > 6 ? 'bad' : slow > 0.03 || perMin > 2 ? 'warn' : 'ok';
}
const worse = c => Math.max(rate(c).slow / 0.1, fair(c) / 6);
/** How warm the phone was for that play: "hot 62%", "warm 30%" (warm or hotter), "cool", or – where the phone doesn't say. */
function heat(c) {
  if (!c.heat) return '<td class="n mute">–</td>';
  const hot = c.hot / c.heat, warm = (c.warm + c.hot) / c.heat;
  return hot >= 0.05 ? `<td class="n warn">hot ${Math.round(100 * hot)}%</td>` : warm >= 0.05 ? `<td class=n>warm ${Math.round(100 * warm)}%</td>` : '<td class="n ok">cool</td>';
}
/** Table cells for a set of counts: rounds, fps, slow, freezes, freezes a minute, longest, busy, heat. */
function cells(c) {
  const cls = mark(c), r = rate(c);
  return `<td class=n>${c.rounds}</td><td class="n ${cls}">${r.fps}</td><td class="n ${cls}">${pct(c.slow, c.frames)}</td><td class=n>${c.hitches}</td>` +
    `<td class="n ${enough(c) ? cls : 'mute'}">${r.perMin.toFixed(1)}</td><td class=n>${c.worst} ms</td><td class=n>${pct(c.work, c.ms)}</td>${heat(c)}`;
}
const COUNT_HEADS = '<th class=n>Rounds</th><th class=n>Avg fps</th><th class=n>Slow</th><th class=n>Freezes</th><th class=n>Freezes/min</th><th class=n>Longest</th><th class=n>Busy</th><th class=n>Heat</th>';
const KINDS = { browser: 'web browser', computer: 'computer (the Mac and Windows app)', emulator: 'emulator (a test machine)', robot: 'test robot', likely: 'probably a test robot' };

/**
 * The report as a plain web page (no scripts), for reading on a computer or phone.
 * titles: the catalogue (id -> { hash, meta: { title } }); repo: the repository's address, for links to each build's commit.
 */
export function perfPage({ days, at, game = '', phones = [], games = [], history = [], errors = [] }, titles = new Map(), repo = '') {
  const title = id => esc(titles.get(id)?.meta?.title || titles.get(id)?.title || id);
  // A game's name, linked to its own page (only games in the catalogue have one).
  const name = id => !id ? '<i>feed</i>' : game || (titles.size && !titles.has(id)) ? title(id) : `<a href="?game=${esc(id)}">${title(id)}</a>`;
  const phoneOf = new Map(phones.map(p => [pk(p), p]));
  const kindOf = p => p.kind ?? phoneOf.get(pk(p))?.kind ?? phoneKind(p);
  const tag = p => { const k = kindOf(p); return k ? ` <small>(${esc(k === 'likely' ? 'test robot?' : k === 'robot' ? 'test robot' : k)})</small>` : ''; };
  // The version of a game's file, and whether it is the one in the catalogue now.
  const file = (ver, id) => { const cur = titles.get(id)?.hash; return ver ? ` <small class=t>game file ${esc(ver.slice(0, 8))}${cur ? (cur === ver ? ' (current)' : ' (older)') : ''}</small>` : ''; };
  const STATE = {
    now: () => `<span class=bad>Yes: on the newest build ${game ? 'that ran this game on that phone' : 'that phone has run'}</span>`,
    gone: e => `<span class=ok>Probably not: ${e.newer} newer build${e.newer === 1 ? ' has' : 's have'} played it since without this</span> <small>(${e.rounds > 0 ? `${e.rounds} round${e.rounds === 1 ? '' : 's'}` : 'less than a round'})</small>`,
    unknown: () => '<span class=mute>Can’t tell: not played on a newer build since</span>',
  };
  const errTable = list => list.length ? `<table><tr><th>Game</th><th class=n>Times</th><th>What</th><th>Where</th><th>Phones</th><th>Builds</th><th>First</th><th>Last</th><th>Still happening?</th></tr>
    ${list.map(e => `<tr><td>${name(e.game)}</td><td class=n>${e.n}</td><td><code>${esc(e.msg)}</code></td><td><code>${esc(e.place)}</code></td><td>${e.phones.map(p => esc(p.model) + tag(p)).join(', ')}</td>
<td>${e.apps.length ? build(e.apps[0].app, repo) + file(e.apps[0].ver, e.game) : ''}${e.apps.length > 1 ? `<details><summary>and ${e.apps.length - 1} older</summary>${e.apps.slice(1).map(a => build(a.app, repo) + file(a.ver, e.game)).join('<br>')}</details>` : ''}</td>
<td class=t>${when(e.d0, e.t0)}</td><td class=t>${when(e.d1, e.t1)}</td><td>${STATE[e.state](e)}</td></tr>`).join('')}</table>`
    : '<p class=ok>None reported.</p>';
  const crashes = errors.filter(r => r.kind === 'crash'), scripts = errors.filter(r => r.kind === 'error'), chips = errors.filter(r => r.kind === 'gpu');
  const total = list => list.reduce((a, r) => a + r.n, 0);

  // Real phones first, then test machines; within each, whoever reported most recently.
  const order = [...phones].sort((a, b) => !!a.kind - !!b.kind || b.t1 - a.t1 || b.d1 - a.d1);
  const what = p => !p.kind ? 'phone' : esc(KINDS[p.kind]) + (p.kind === 'likely' ? `: ${p.builds} builds in ${p.d1 - p.d0 + 1} day${p.d1 > p.d0 ? 's' : ''}, ${p.crashes} crash${p.crashes === 1 ? '' : 'es'}` : p.kind === 'robot' ? ' (the phone says so)' : '');
  const phoneTable = order.length ? `<table><tr><th>Phone</th><th>What it is</th><th>Newest build</th><th>Last report</th><th class=n>Builds</th><th class=n>Rounds</th><th class=n>Played</th></tr>
${order.map(p => `<tr><td>${esc(p.model)} <small>${plat(p.platform)}</small></td><td>${what(p)}</td>
<td>${build(p.app, repo)}</td><td class=t>${when(p.d1, p.t1)}</td><td class=n>${p.builds}</td><td class=n>${p.rounds}</td><td class=n>${Math.round(p.ms / 60000)} min</td></tr>`).join('')}</table>` : '<p>No reports yet.</p>';

  // Smoothness: one block per phone. A phone's rows on its newest build come first, worst first; then the rest, most recent first.
  const rows = games.filter(r => r.all.frames >= MIN_FRAMES);
  const blocks = order.map(p => {
    const mine = rows.filter(r => pk(r) === pk(p));
    if (!mine.length) return '';
    const cur = r => r.app === p.app;
    mine.sort((a, b) => cur(b) - cur(a) || (cur(a) ? worse(b.now) - worse(a.now) : b.t1 - a.t1 || b.d1 - a.d1 || worse(b.all) - worse(a.all)));
    return `<details${p.kind ? '' : ' open'}><summary><b>${esc(p.model)}</b> <small>${plat(p.platform)}${p.kind ? ', ' + esc(KINDS[p.kind]) : ''}</small> · newest build ${build(p.app, repo)} · last report ${when(p.d1, p.t1)} · ${mine.length} row${mine.length === 1 ? '' : 's'}</summary>
<div class=wrap><table><tr><th colspan=4></th><th colspan=8 class=g>On the newest build that played it</th><th colspan=5 class="g sep">Every build, last ${days} days</th></tr>
<tr><th>Game</th><th>Screen</th><th>Build</th><th>Last report</th>${COUNT_HEADS}<th class="n sep">Builds</th><th class=n>Rounds</th><th class=n>Avg fps</th><th class=n>Slow</th><th class=n>Freezes/min</th></tr>
${mine.map(r => {
      const cls = mark(r.all), a = rate(r.all);
      return `<tr${cur(r) ? '' : ' class=old'}><td>${name(r.game)}</td><td>${esc(r.form)}</td><td>${build(r.app, repo)}${cur(r) ? '' : ' <small>older build</small>'}${file(r.ver, r.game)}</td><td class=t>${when(r.d1, r.t1)}</td>${cells(r.now)}
<td class="n sep">${r.builds}</td><td class=n>${r.all.rounds}</td><td class="n ${cls}">${a.fps}</td><td class="n ${cls}">${pct(r.all.slow, r.all.frames)}</td><td class="n ${enough(r.all) ? cls : 'mute'}">${a.perMin.toFixed(1)}</td></tr>`;
    }).join('')}</table></div></details>`;
  }).join('');

  // One game: its history per phone and screen, a row per day and build, newest first.
  const groups = new Map();
  for (const r of history) { const k = pk(r) + '|' + r.form; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const span = r => !r.t1 ? '' : r.t0 && clock(r.t0) !== clock(r.t1) ? `${clock(r.t0)} to ${clock(r.t1)}` : clock(r.t1);
  const past = [...groups.values()].sort((a, b) => !!kindOf(a[0]) - !!kindOf(b[0]) || b[0].t1 - a[0].t1 || b[0].day - a[0].day)
    .map(list => { const k = kindOf(list[0]);
      return `<details${k ? '' : ' open'}><summary><b>${esc(list[0].model)}</b> <small>${plat(list[0].platform)}${k ? ', ' + esc(KINDS[k]) : ''}</small> · ${esc(list[0].form)} screen · ${list.length} row${list.length === 1 ? '' : 's'}</summary>
<div class=wrap><table><tr><th>Day</th><th>Build</th><th>Reports</th>${COUNT_HEADS}</tr>
${list.map(r => `<tr><td class=t>${dayText(r.day)}</td><td>${build(r.app, repo)}${file(r.ver, game)}</td><td class=t>${span(r)}</td>${cells(r)}</tr>`).join('')}</table></div></details>`; }).join('');

  return `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Game Scroll performance${game ? ': ' + title(game) : ''}</title><meta name=robots content="noindex, nofollow">
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#16181d;--mute:#667;--line:#dde;--bad:#c62828;--warn:#a15c00;--good:#2e7d32}
@media (prefers-color-scheme:dark){:root{--bg:#0c0e12;--fg:#e8eaf0;--mute:#99a;--line:#2a2e38;--bad:#ff6b6b;--warn:#ffb74d;--good:#81c784}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1300px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}p{margin:4px 0;color:var(--mute)}a{color:inherit}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:600;white-space:nowrap}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.t{white-space:nowrap}
.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}.ok{color:var(--good)}.mute,small{color:var(--mute)}code{font-size:12px;word-break:break-word}
.g{text-align:center;border-bottom:0}.sep{border-left:1px solid var(--line)}.old td{color:var(--mute)}
details{margin:6px 0}summary{cursor:pointer;padding:4px 0}td details{margin:2px 0 0}td summary{padding:0;color:var(--mute)}
</style>
<h1>Game Scroll performance${game ? ': ' + title(game) : ''}</h1>
${game ? '<p><a href="/perf/report">← All games</a></p>' : ''}
<p>Anonymous reports from phones with play stats switched on, last ${days} days, as of ${when(Math.floor(at / 86400), at)} UTC. All times are UTC; a date with no time is from before times were recorded.
A build reads “1.0.&lt;build number&gt; &lt;commit&gt;”, and the commit links to the change it was built from. Games update without the app, so a build may also name the version of the game’s file, and whether that is the current one.</p>
${game ? '' : `<h2>Who is reporting</h2>
<p>Every phone model that has sent reports, and the build it reported most recently. Test machines are labelled: a test robot (Google Play tries every build on phones of its own, and a phone can tell the app so), a web browser, an emulator, or a phone that looks like a robot from before the app could tell: it runs a new build many times a day and closes without warning at least once for every build.</p>
<div class=wrap>${phoneTable}</div>`}
<h2>Crashes (${total(crashes)})</h2>
<p>The app closed while it was open on screen, or crashed. On Android 11 and later the phone’s own record says why (out of memory, crashed, stopped responding) and when, and the app being closed by its player is not counted. Elsewhere the app can only tell that it was not closed tidily, and the time is when it was next opened.</p>
<div class=wrap>${errTable(crashes)}</div>
<h2>Graphics chip lost (${total(chips)})</h2>
<p>The phone’s or computer’s graphics chip went away mid-game (its driver restarted, or the browser’s graphics process crashed) and the app made a new one. “Where” is the chip and the browser engine; the end of “What” says whether WebGPU came back or the app drew with WebGL from then on. A chip or driver that shows up here often is one to steer away from in the steering list.</p>
<div class=wrap>${errTable(chips)}</div>
<h2>Script errors (${total(scripts)})</h2>
<p>A game threw an error. The app ends that round and carries on.</p>
<div class=wrap>${errTable(scripts)}</div>
<p>“Still happening?” compares each one with what the same phones have done since. Yes: it was reported by the newest build ${game ? 'that ran this game on that phone' : 'that phone has run'}. Probably not: newer builds, of the app or of the game’s file, have played the same game on that phone without it, for the number of rounds shown. A crash that comes and goes needs more than a round or two to be called gone.</p>
<h2>Smoothness${game ? ' by phone, day and build' : ' by phone and game'}</h2>
<p>Frames are timed only while a round is playing. “Slow” frames took 25 ms or more (under 40 fps); “freezes” took 70 ms or more and are what players feel as a stutter (a grey “Freezes/min” figure comes from too little play to mean much). “Wide” is a tablet-sized screen such as an unfolded Fold.
“Heat” is how much of that play was with the phone warm or hot: a hot phone slows itself down, so stutter there may not be the game’s doing (– where the phone doesn’t say).
${game ? 'One row per day and build, newest first, so a fix shows as a change from one build to the next.'
    : `Each row shows the newest build that played the game on that phone, beside the totals for every build. A greyed row has not been played on that phone’s newest build yet, so it may already be fixed. Rows with fewer than ${MIN_FRAMES} frames are left out. A game’s name opens its history by day and build.`}</p>
${game ? past || '<p>No reports yet.</p>' : blocks || '<p>No reports yet.</p>'}
<p style="margin-top:20px">“Busy” is how much of each frame the app spent running the game’s code and drawing. High busy with low fps means the game’s code or drawing is too heavy; low busy with low fps points at the GPU or the phone itself (heat, battery saver).</p>
</html>`;
}
