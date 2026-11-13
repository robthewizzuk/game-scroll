// Game Scroll API (Cloudflare Worker + D1): shared heart counts, protected by app attestation.
//
//   GET  /counts      -> { counts: { "<game id>": n, ... }, at }   cached ~60 s at the edge
//   GET  /challenge   -> { challenge }                              single use, valid 5 min
//   POST /session     body { device, platform: "ios"|"android", challenge, ... } -> { session, expires }
//                     iOS:     first time { keyId, attestation }, later { keyId, assertion }  (App Attest)
//                     Android: { token }                                                     (Play Integrity)
//   POST /heart       body { device, game, on } (+ "Authorization: Bearer <session>") -> { game, n }
//   POST /score, GET /board   leaderboards, all time and today, with quick fairness checks (see scores.js)
//   POST /brain, GET /brain   Tiny Brains shared learning: everyone's average brain (see brains.js)
//   POST /stats, GET /stats   anonymous play stats (see stats.js)
//   POST /perf, GET /perf, GET /perf/report[?game=<id>]   anonymous frame timing and crash reports (see perf.js)
//   GET  /robots.txt  keeps search engines off the API (the report pages link to a page per game)
//   play.game-scroll.com/<id> the page a shared game link opens (see sharepage.js)
//
// No accounts: each install sends a random anonymous device id; (game, device) is unique, so a phone
// counts once per game. A "session" (pass) proves the app is genuine. With ENFORCE = "off" hearts
// without a pass are still accepted, but under a much tighter per-address limit; with ENFORCE = "on"
// they are refused. Only games in the live catalogue are accepted.
import { newChallenge, checkChallenge, challengeExpiry, newSession, readSession } from './session.js';
import { verifyAttestation, verifyAssertion } from './appattest.js';
import { verifyIntegrity } from './playintegrity.js';
import { unb64, b64u } from './util.js';
import { cleanBatch, saveBatch, totals, prune } from './stats.js';
import { sharePage, shareGame, idFromPath } from './sharepage.js';
import { cleanPerf, savePerf, perfTotals, perfReport, prunePerf, perfPage, phoneKinds } from './perf.js';
import { kept, left, forget } from './kept.js';
import { cleanScore, cleanSecs, checkScore, saveScore, board, pruneScores } from './scores.js';
import { cleanBrain, saveBrain, sharedBrain, pruneBrains, NAME_RE, SHAPE_RE } from './brains.js';

// Browsers may call the API only from the app itself and the test website. (Not a security
// boundary on its own, since scripts outside a browser ignore CORS, but it stops other sites
// from using the API through their visitors.)
const ORIGINS = [
  /^capacitor:\/\/localhost$/,            // iOS app
  /^https?:\/\/localhost(:\d+)?$/,        // Android app, local dev
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,       // local dev
  /^https:\/\/robthewizzuk\.github\.io$/, // test website
  /^https:\/\/([a-z0-9-]+\.)?game-scroll\.com$/,
];
const COUNTS_TTL = 60;
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY = { '/heart': 512, '/score': 512, '/brain': 4096, '/session': 24_000, '/stats': 8_000, '/perf': 12_000 };
// How long the expensive answers are kept (seconds), in D1 for every location (kept.js) and at each
// location's edge. The app fetches play stats at most every 30 minutes; GET /perf is for the QA panel
// only; the report pages are what someone checks after trying a build, so they stay fresh.
const STATS_TTL = 1800, PERF_TTL = 1800, REPORT_TTL = 300, KINDS_TTL = 1800;
/** A keep time, or the tests' STATS_TTL (0: keep nothing). */
const keepFor = (env, ttl) => env.STATS_TTL !== undefined ? Math.min(ttl, Number(env.STATS_TTL)) : ttl;

function cors(req) {
  const o = req.headers.get('Origin');
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (o && ORIGINS.some(r => r.test(o))) h['Access-Control-Allow-Origin'] = o;
  return h;
}
const json = (req, body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...cors(req), ...extra } });
const ip = req => req.headers.get('CF-Connecting-IP') || 'unknown';

async function limited(binding, key) {
  if (!binding) return false;
  const { success } = await binding.limit({ key });
  return !success;
}

/** Read a small JSON body; null if it's too big or not JSON. */
async function body(req, max) {
  const n = Number(req.headers.get('Content-Length') || 0);
  if (n > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

/** The live catalogue as a Map id -> entry, fetched at most every 5 minutes per Worker location. */
let known = null, knownAt = 0;
async function gameIds(env) {
  if (!env.MANIFEST_URL) return null;   // tests: accept any well-formed id
  if (known && Date.now() - knownAt < 300_000) return known;
  try {
    const r = await fetch(env.MANIFEST_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const m = await r.json(); known = new Map((m.games || []).map(g => [g.id, g])); knownAt = Date.now(); }
  } catch (_) { /* keep the last list */ }
  return known;
}

async function counts(env, ctx, req) {
  const cache = caches.default, key = new Request(new URL('/counts', req.url).toString());
  let res = await cache.match(key);
  if (!res) {
    const { results } = await env.DB.prepare('SELECT game, n FROM counts WHERE n > 0').all();
    const out = {};
    for (const r of results) out[r.game] = r.n;
    res = new Response(JSON.stringify({ counts: out, at: Date.now() }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${COUNTS_TTL}` } });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  // CORS depends on the caller, so add it after the cache.
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(req))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

async function challenge(env, req) {
  if (!env.SESSION_SECRET) return json(req, { error: 'attestation not set up' }, 503);
  if (await limited(env.LIMIT_SESSION, 'c:' + ip(req))) return json(req, { error: 'slow down' }, 429);
  return json(req, { challenge: await newChallenge(env.SESSION_SECRET) }, 200, { 'Cache-Control': 'no-store' });
}

async function session(env, ctx, req) {
  if (!env.SESSION_SECRET) return json(req, { error: 'attestation not set up' }, 503);
  if (await limited(env.LIMIT_SESSION, 's:' + ip(req))) return json(req, { error: 'slow down' }, 429);
  const b = await body(req, MAX_BODY['/session']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  const { device, platform, challenge: ch } = b;
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return json(req, { error: 'bad device' }, 400);
  if (typeof ch !== 'string' || !(await checkChallenge(env.SESSION_SECRET, ch))) return json(req, { error: 'bad or expired challenge' }, 400);
  // Each challenge makes at most one pass, so one genuine phone's proof can't be replayed for many
  // made-up device ids. Spent even if the proof below fails; the app just asks for a new one.
  const used = await env.DB.prepare('INSERT OR IGNORE INTO used_challenges (challenge, expires) VALUES (?1, ?2)').bind(ch, challengeExpiry(ch)).run();
  if (!used.meta.changes) return json(req, { error: 'challenge already used' }, 400);
  if (Math.random() < .05) ctx.waitUntil(env.DB.prepare('DELETE FROM used_challenges WHERE expires < ?1').bind(Date.now()).run());
  try {
    if (platform === 'ios') {
      if (typeof b.keyId !== 'string' || b.keyId.length > 100) return json(req, { error: 'bad keyId' }, 400);
      const kid = b64u(unb64(b.keyId));
      if (typeof b.attestation === 'string') {
        const k = await verifyAttestation({ appId: env.APPLE_APP_ID, keyId: b.keyId, attestation: b.attestation, challenge: ch });
        if (k.env === 'development' && env.APPLE_ALLOW_DEV !== 'on') return json(req, { error: 'development build' }, 403);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO appattest_keys (key_id, public_key, counter, device, env, created) VALUES (?1, ?2, 0, ?3, ?4, ?5)')
          .bind(kid, k.publicKey, device, k.env, Date.now()).run();
        if (!r.meta.changes) return json(req, { error: 'key already attested' }, 409);
      } else if (typeof b.assertion === 'string') {
        const row = await env.DB.prepare('SELECT public_key, counter, device FROM appattest_keys WHERE key_id = ?1').bind(kid).first();
        if (!row) return json(req, { error: 'unknown key', reattest: true }, 404);
        // A key belongs to the install that attested it: it can't sign passes for other device ids.
        if (row.device !== device) return json(req, { error: 'key is for another device', reattest: true }, 403);
        const counter = await verifyAssertion({ appId: env.APPLE_APP_ID, publicKey: new Uint8Array(row.public_key), lastCounter: row.counter, assertion: b.assertion, challenge: ch });
        // Only move the counter forward, so two racing requests can't both reuse one value.
        const u = await env.DB.prepare('UPDATE appattest_keys SET counter = ?2 WHERE key_id = ?1 AND counter < ?2').bind(kid, counter).run();
        if (!u.meta.changes) return json(req, { error: 'replayed assertion' }, 403);
      } else return json(req, { error: 'attestation or assertion needed' }, 400);
    } else if (platform === 'android') {
      await verifyIntegrity({ saJson: env.GOOGLE_SERVICE_ACCOUNT, token: b.token, challenge: ch, allowSideloaded: env.ANDROID_ALLOW_SIDELOAD === 'on' });
    } else return json(req, { error: 'bad platform' }, 400);
  } catch (e) {
    if (e.attest) return json(req, { error: 'not verified', reason: e.message }, 403);
    throw e;
  }
  const s = await newSession(env.SESSION_SECRET, device, platform);
  return json(req, { session: s.token, expires: s.expires }, 200, { 'Cache-Control': 'no-store' });
}

async function postStats(env, req) {
  const b = await body(req, MAX_BODY['/stats']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  if (typeof b.device !== 'string' || !DEVICE_RE.test(b.device)) return json(req, { error: 'bad device' }, 400);
  if (await limited(env.LIMIT_STATS, 'st:' + ip(req)) || await limited(env.LIMIT_STATS, 'sd:' + b.device)) return json(req, { error: 'slow down' }, 429);
  const rows = cleanBatch(b.games, await gameIds(env));
  if (!rows) return json(req, { error: 'bad games' }, 400);
  await saveBatch(env.DB, rows);
  return json(req, { ok: true, saved: rows.length });
}

async function getStats(env, ctx, req) {
  const ttl = keepFor(env, STATS_TTL);
  const cache = caches.default, key = new Request(new URL('/stats', req.url).toString());
  let res = ttl > 0 ? await cache.match(key) : null;
  if (!res) {
    const { text, at } = await kept(env.DB, 'stats', ttl, async () => {
      if (Math.random() < 0.05) ctx.waitUntil(prune(env.DB));   // now and then, drop days past the window
      return JSON.stringify(await totals(env.DB));
    });
    res = new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${left(ttl, at)}` } });
    if (ttl > 0) ctx.waitUntil(cache.put(key, res.clone()));
  }
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(req))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

async function postPerf(env, req) {
  const b = await body(req, MAX_BODY['/perf']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  if (typeof b.device !== 'string' || !DEVICE_RE.test(b.device)) return json(req, { error: 'bad device' }, 400);
  if (await limited(env.LIMIT_STATS, 'pf:' + ip(req)) || await limited(env.LIMIT_STATS, 'pd:' + b.device)) return json(req, { error: 'slow down' }, 429);
  const batch = cleanPerf(b, await gameIds(env));
  if (!batch) return json(req, { error: 'bad batch' }, 400);
  await savePerf(env.DB, batch);
  return json(req, { ok: true, games: batch.games.length, errors: batch.errors.length });
}

/** GET /perf (JSON, for the app's QA panel) or /perf/report (a web page; ?game=<id> for one game's history), kept a few minutes. */
async function getPerf(env, ctx, req, page) {
  const ttl = keepFor(env, page ? REPORT_TTL : PERF_TTL);
  // One page per game in the catalogue and no other variants, so the cache (and the database behind it) can't be flooded with made-up addresses.
  const game = page ? new URL(req.url).searchParams.get('game') || '' : '';
  const titles = async () => (await gameIds(env)) || new Map();
  if (game && (!GAME_RE.test(game) || ((await titles()).size && !(await titles()).has(game)))) return new Response('No such game.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  const cache = caches.default, key = new Request(new URL(page ? '/perf/report' + (game ? '?game=' + game : '') : '/perf', req.url).toString());
  let res = ttl > 0 ? await cache.match(key) : null;
  if (!res) {
    if (game && await limited(env.LIMIT_PAGES, 'pg:' + ip(req))) return new Response('Slow down.', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' } });
    const { text, at } = await kept(env.DB, page ? 'report' + (game ? ':' + game : '') : 'perf', ttl, async () => {
      if (Math.random() < 0.05) ctx.waitUntil(Promise.all([prunePerf(env.DB), forget(env.DB)]));
      if (!page) return JSON.stringify(await perfTotals(env.DB));
      // What kind of machine each phone is reads both tables whole: kept longer, and shared by every page.
      const kinds = JSON.parse((await kept(env.DB, 'kinds', keepFor(env, KINDS_TTL), async () => JSON.stringify(await phoneKinds(env.DB)))).text);
      return perfPage(await perfReport(env.DB, Date.now(), game, kinds), await titles(), env.REPO_URL);
    });
    res = page
      ? new Response(text, { headers: {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${left(ttl, at)}`, 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } })
      : new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${left(ttl, at)}` } });
    if (ttl > 0) ctx.waitUntil(cache.put(key, res.clone()));
  }
  if (page) return res;
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(req))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

async function share(env, req) {
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const id = idFromPath(url.pathname);
  const cat = id ? await gameIds(env) : null;
  const game = shareGame(id && cat ? cat.get(id) : null);
  // The catalogue couldn't be read just now: the links keep the game, and the app works out whether it exists.
  return new Response(sharePage(game, { webUrl: env.WEB_PLAY_URL || '', id: id && !cat ? id : '' }), {
    status: id && !game && cat ? 404 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** Is this request allowed to write as device? null if so, else the error response. (Same rules as hearts.) */
async function writer(env, req, device, kind) {
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const s = auth && env.SESSION_SECRET ? await readSession(env.SESSION_SECRET, auth) : null;
  if (s && s.d === device) { if (await limited(env.LIMIT_VERIFIED, kind + 'd:' + device)) return json(req, { error: 'slow down' }, 429); }
  else if (env.ENFORCE === 'on') return json(req, { error: 'app not verified', session: true }, 401);
  else if (await limited(env.LIMIT, kind + 'h:' + ip(req))) return json(req, { error: 'slow down' }, 429);
  return null;
}

async function postScore(env, ctx, req) {
  const b = await body(req, MAX_BODY['/score']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  const { device, game } = b, score = cleanScore(b.score), secs = cleanSecs(b.secs);
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return json(req, { error: 'bad device' }, 400);
  if (typeof game !== 'string' || !GAME_RE.test(game)) return json(req, { error: 'bad game' }, 400);
  if (score == null) return json(req, { error: 'bad score' }, 400);
  if (secs == null) return json(req, { error: 'bad secs' }, 400);
  const no = await writer(env, req, device, 's'); if (no) return no;
  const ids = await gameIds(env);
  if (ids && !ids.has(game)) return json(req, { error: 'unknown game' }, 404);
  const why = await checkScore(env.DB, game, device, score, secs, ids?.get(game)?.meta || null);
  if (why) return json(req, { error: 'score not counted', why }, 422, { 'Cache-Control': 'no-store' });
  const res = await saveScore(env.DB, game, device, score);
  if (Math.random() < .01) ctx.waitUntil(pruneScores(env.DB));
  return json(req, res, 200, { 'Cache-Control': 'no-store' });
}

async function postBrain(env, ctx, req) {
  const b = await body(req, MAX_BODY['/brain']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  const { device, game } = b;
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return json(req, { error: 'bad device' }, 400);
  if (typeof game !== 'string' || !GAME_RE.test(game)) return json(req, { error: 'bad game' }, 400);
  const bad = cleanBrain(b); if (bad) return json(req, { error: bad }, 400);
  const no = await writer(env, req, device, 'n'); if (no) return no;
  const ids = await gameIds(env);
  if (ids && !ids.has(game)) return json(req, { error: 'unknown game' }, 404);
  await saveBrain(env.DB, game, device, b);
  if (Math.random() < .01) ctx.waitUntil(pruneBrains(env.DB));
  return json(req, { ok: true }, 200, { 'Cache-Control': 'no-store' });
}

async function getBrain(env, ctx, req) {
  const u = new URL(req.url), game = u.searchParams.get('game') || '', name = u.searchParams.get('name') || '', shape = u.searchParams.get('shape') || '';
  if (!GAME_RE.test(game) || !NAME_RE.test(name) || !SHAPE_RE.test(shape)) return json(req, { error: 'bad request' }, 400);
  if (await limited(env.LIMIT_SESSION, 'nb:' + ip(req))) return json(req, { error: 'slow down' }, 429);
  // the average changes slowly: keep it at the edge for an hour
  const cache = typeof caches !== 'undefined' ? caches.default : null, key = new Request(`https://cache.internal/brain/${game}/${name}/${shape}`);
  let hit = cache && await cache.match(key);
  if (!hit) {
    const r = await sharedBrain(env.DB, game, name, shape);
    hit = new Response(JSON.stringify(r || { error: 'none yet' }), { status: r ? 200 : 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' } });
    if (cache) ctx.waitUntil(cache.put(key, hit.clone()));
  }
  return json(req, await hit.json(), hit.status, { 'Cache-Control': 'public, max-age=600' });
}

async function getBoard(env, req) {
  const u = new URL(req.url), game = u.searchParams.get('game') || '', device = u.searchParams.get('device') || '';
  if (!GAME_RE.test(game)) return json(req, { error: 'bad game' }, 400);
  if (device && !DEVICE_RE.test(device)) return json(req, { error: 'bad device' }, 400);
  if (await limited(env.LIMIT_SESSION, 'b:' + ip(req))) return json(req, { error: 'slow down' }, 429);
  return json(req, await board(env.DB, game, u.searchParams.get('when'), device), 200, { 'Cache-Control': 'no-store' });
}

async function heart(env, ctx, req) {
  const b = await body(req, MAX_BODY['/heart']);
  if (!b) return json(req, { error: 'bad request' }, 400);
  const { device, game } = b, on = b.on === true;
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return json(req, { error: 'bad device' }, 400);
  if (typeof game !== 'string' || !GAME_RE.test(game)) return json(req, { error: 'bad game' }, 400);

  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const s = auth && env.SESSION_SECRET ? await readSession(env.SESSION_SECRET, auth) : null;
  if (s && s.d === device) {
    if (await limited(env.LIMIT_VERIFIED, 'd:' + device)) return json(req, { error: 'slow down' }, 429);
  } else if (env.ENFORCE === 'on') {
    return json(req, { error: 'app not verified', session: true }, 401);
  } else if (await limited(env.LIMIT, 'h:' + ip(req))) {
    return json(req, { error: 'slow down' }, 429);
  }

  const ids = await gameIds(env);
  if (ids && !ids.has(game)) return json(req, { error: 'unknown game' }, 404);

  const change = on
    ? env.DB.prepare('INSERT OR IGNORE INTO hearts (game, device, at) VALUES (?1, ?2, ?3)').bind(game, device, Date.now())
    : env.DB.prepare('DELETE FROM hearts WHERE game = ?1 AND device = ?2').bind(game, device);
  // Move the total by the rows the change touched (changes() is 1 or 0, in the same transaction), so a
  // tap costs one row read however many hearts the game has. A repeat tap changes nothing.
  const bump = env.DB.prepare(
    `INSERT INTO counts (game, n) VALUES (?1, MAX(0, ${on ? '' : '-'}changes())) ` +
    `ON CONFLICT(game) DO UPDATE SET n = MAX(0, n ${on ? '+' : '-'} changes()) RETURNING n`).bind(game);
  const [, res] = await env.DB.batch([change, bump]);
  // Drop this location's cached list so nearby players see the change soon (others within a minute).
  ctx.waitUntil(caches.default.delete(new Request(new URL('/counts', req.url).toString())));
  return json(req, { game, n: res.results[0]?.n ?? 0 });
}

export default {
  async fetch(req, env, ctx) {
    const { pathname, hostname } = new URL(req.url);
    if (hostname.startsWith('play.')) return await share(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (req.method === 'GET' && pathname === '/counts') return await counts(env, ctx, req);
      if (req.method === 'GET' && pathname === '/challenge') return await challenge(env, req);
      if (req.method === 'POST' && pathname === '/session') return await session(env, ctx, req);
      if (req.method === 'POST' && pathname === '/heart') return await heart(env, ctx, req);
      if (req.method === 'POST' && pathname === '/score') return await postScore(env, ctx, req);
      if (req.method === 'GET' && pathname === '/board') return await getBoard(env, req);
      if (req.method === 'POST' && pathname === '/brain') return await postBrain(env, ctx, req);
      if (req.method === 'GET' && pathname === '/brain') return await getBrain(env, ctx, req);
      if (req.method === 'POST' && pathname === '/stats') return await postStats(env, req);
      if (req.method === 'GET' && pathname === '/stats') return await getStats(env, ctx, req);
      if (req.method === 'POST' && pathname === '/perf') return await postPerf(env, req);
      if (req.method === 'GET' && (pathname === '/perf' || pathname === '/perf/report')) return await getPerf(env, ctx, req, pathname === '/perf/report');
      if (req.method === 'GET' && pathname === '/') return json(req, { ok: true, service: 'game-scroll-api', enforce: env.ENFORCE === 'on' });
      // Nothing here is for search engines, and a crawler walking the report's page per game read the database for each.
      if (req.method === 'GET' && pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      console.error(e);
      return json(req, { error: 'server error' }, 500);
    }
  },
};
