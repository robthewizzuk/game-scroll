// How many D1 rows each kind of request reads, on a local database filled to about the size of the
// live one, so a change to a query or a cache can be checked before it reaches the bill (D1 charges by
// rows read; Miniflare's local D1 counts them the same way).
//
//   cd workers/hearts && npm run reads [-- scale]
//
// The data is shaped like the live crash and stutter report on 13 Nov 2026 (9 phone models, about 3,800
// rounds and 260 crashes in the last 14 days, play stats for 280 games); scale 5 makes five times as
// much. Each request is made as if its Cloudflare location had nothing cached: "worked out" is the
// first location to ask, "kept" any other location while the kept answer is fresh (src/kept.js).
import { getPlatformProxy } from 'wrangler';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './src/index.js';
import { savePerf } from './src/perf.js';
import { saveBatch } from './src/stats.js';

const SCALE = Number(process.argv[2] || 1);
const proxy = await getPlatformProxy({ configPath: 'wrangler.toml', persist: false });
const raw = proxy.env.DB;
for (const f of readdirSync('migrations').sort())
  for (const s of readFileSync('migrations/' + f, 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await raw.prepare(s).run();

// ---- data
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
const GAMES = Array.from({ length: 280 }, (_, i) => 'game-' + i), vers = Object.fromEntries(GAMES.map(g => [g, [hex(8), hex(8), hex(8)]]));
const now = Date.now();
// [platform, model, builds, rounds, crashes] over 14 days, as on the live report
const PHONES = [['android', 'SM-F971B', 43, 440, 0], ['android', 'Pixel 10a', 1, 35, 0], ['android', 'Pixel 9', 1, 11, 0], ['android', 'OnePlus8Pro', 104, 1270, 281],
  ['android', 'sdk_gphone64_arm64', 17, 140, 10], ['web', 'X11', 42, 42, 0], ['web', 'iPhone', 78, 1768, 5], ['web', 'Macintosh', 10, 96, 0], ['web', 'Windows NT 10.0', 2, 3, 0]];
let run = 1;
for (const [platform, model, b, r, c] of PHONES) {
  const builds = Math.ceil(b * SCALE), per = Math.max(1, Math.round(r / b)), crashes = c / b;
  for (let i = 0; i < builds; i++) {
    const t = now - Math.floor(rnd() * 13 * 864e5), app = `1.0.${run++} ${hex(7)}`;
    const games = Array.from({ length: per }, () => { const g = pick(GAMES); return [g, 1, 2000, 40000, 20000, 30, 3, 120, pick(vers[g]), 40000, 1000, 0]; });
    const errors = [];
    for (let k = 0; k < crashes + rnd() - .5; k++) errors.push(['crash', pick(GAMES), pick(['App closed while open', 'App closed while playing']), '', 1, '', Math.floor(t / 1000)]);
    if (rnd() < .3) errors.push(['error', pick(GAMES), 'TypeError: x is undefined ' + Math.floor(rnd() * 30), 'game.js:' + Math.floor(rnd() * 900), 1, '', 0]);
    await savePerf(raw, { info: { platform, model, os: '14', app, form: rnd() < .3 ? 'wide' : 'phone' }, games, errors }, t);
  }
}
for (let d = 0; d < 30; d++) await saveBatch(raw, GAMES.filter(() => rnd() < .35).map(g => [g, 3, 2, 1, 60]), now - d * 864e5);
const count = async t => (await raw.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n;
console.log(`D1 rows read per request, scale ${SCALE}: perf ${await count('perf')} rows, crashes ${await count('crashes')}, play_stats ${await count('play_stats')}\n`);

// ---- a database that adds up what it reads, and a location with nothing in its edge cache
let read = 0;
const counted = r => { for (const x of [].concat(r)) read += x?.meta?.rows_read || 0; return r; };
const stmt = s => ({ bind: (...a) => stmt(s.bind(...a)), all: async () => counted(await s.all()), run: async () => counted(await s.run()),
  first: async () => (counted(await s.all())).results[0] ?? null, raw: s });
const DB = { prepare: q => stmt(raw.prepare(q)), batch: async qs => counted(await raw.batch(qs.map(q => q.raw))) };
globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => {} } };
const env = { DB, MANIFEST_URL: '', REPO_URL: '' };
async function cost(path) {
  read = 0;
  const waits = [], res = await worker.fetch(new Request('https://api.game-scroll.com' + path), env, { waitUntil: p => waits.push(p) });
  const text = await res.text(); await Promise.all(waits);
  if (res.status !== 200) throw new Error(`${path}: ${res.status} ${text.slice(0, 200)}`);
  return { read, text };
}
const rows = [['GET /counts', '/counts'], ['GET /stats', '/stats'], ['GET /perf', '/perf'], ['GET /perf/report', '/perf/report'], ['GET /perf/report?game=', '/perf/report?game=game-3']];
console.log('request'.padEnd(26), 'worked out'.padStart(12), 'kept'.padStart(8));
// (a game's page reuses the phone kinds the main page kept, as it does live)
for (const [name, path] of rows) {
  await raw.prepare(path.includes('?game=') ? "DELETE FROM snapshots WHERE key LIKE 'report:%'" : 'DELETE FROM snapshots').run();
  const a = await cost(path), b = await cost(path);
  if (path !== '/counts' && a.text !== b.text) throw new Error(path + ': the kept answer differs from the one worked out');   // (counts carry the time)
  console.log(name.padEnd(26), String(a.read).padStart(12), String(b.read).padStart(8));
}
await proxy.dispose();
