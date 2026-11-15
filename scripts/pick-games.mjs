// Picks the games a PR check plays when shared code changes: from each style (Phone, Pocket, Color,
// Advance, Console, Next Gen, AR) the N games that use the most parts of gs, so engine changes are
// played where they matter without playing every game. Prints the ids, one line.
// Usage: node scripts/pick-games.mjs [N=3]
//        node scripts/pick-games.mjs --deal <shards> <id> ...   deals the games out to that many PR check jobs,
//        one line of ids a job, so each job takes about as long (--why prints each job's rough seconds).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const N = +process.argv[2] || 3, dir = new URL('../src/games/', import.meta.url);
// How long a game takes in the play checks, in rough seconds: smoke, streamed and fold each play it once (a
// 3D style costs more than a flat one, a big file more than a small one, and the kits that build a lot as a round
// loads (cities, sculpted people and animals, big worlds) most), and a Console game is swept as well (about a
// minute each). Measured on 2026-11-15: Long Shadow ~40 s a step, Parcel Dash ~25 s, most games 1 to 5 s, sweep
// ~55 s a Console game.
const ERA = { nextgen: 8, ar: 4, board: 4, console: 4 }, SWEPT = { console: 55 };
const weight = id => {
  const f = new URL(id + '.js', dir); if (!existsSync(f)) return 6;
  const src = readFileSync(f, 'utf8'), era = (src.match(/\bera:\s*'(\w+)'/) || [])[1];
  const step = (ERA[era] || 2) + src.length / 10000 + 10 * ['city', 'models', 'regions', 'outdoors'].filter(k => new RegExp(`\\bgs\\.${k}\\b`).test(src)).length;
  return 3 * step + (SWEPT[era] || 0);
};
if (process.argv[2] === '--deal') {
  // (the heaviest first, each to the job with least to play so far)
  const n = Math.max(1, +process.argv[3] || 1), ids = [...new Set(process.argv.slice(4).filter(a => !a.startsWith('--')))];
  const jobs = Array.from({ length: n }, () => ({ w: 0, ids: [] }));
  for (const [id, w] of ids.map(id => [id, weight(id)]).sort((a, b) => b[1] - a[1])) {
    const j = jobs.reduce((a, b) => b.w < a.w ? b : a);
    j.ids.push(id); j.w += w;
  }
  for (const j of jobs) console.log(j.ids.join(' '));
  if (process.argv.includes('--why')) for (const j of jobs) console.error(j.w.toFixed(0).padStart(5), 's', j.ids.join(' '));
  process.exit(0);
}
const by = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  const era = (src.match(/\bera:\s*'(\w+)'/) || [])[1] || (/\bretro:\s*true/.test(src) ? 'pocket' : 'phone');
  // Parts used: gs.<part> plus what is pulled out of them (const { Feel } = gs.effects).
  const parts = new Set([...src.matchAll(/\bgs\.(\w+)(?:\.(\w+))?/g)].flatMap(m => m[2] ? [m[1], m[1] + '.' + m[2]] : [m[1]]));
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*gs\.(\w+)/g)) for (const k of m[1].split(',')) { const n = k.trim().split(/[:\s]/)[0]; if (n) parts.add(m[2] + '.' + n); }
  (by[era] ||= []).push({ id: f.slice(0, -3), n: parts.size });
}
const ids = Object.keys(by).sort().flatMap(e => by[e].sort((a, b) => b.n - a.n).slice(0, N).map(g => g.id));
console.log(ids.join(' '));
if (process.argv.includes('--why')) for (const e of Object.keys(by).sort()) console.error(e.padEnd(8), by[e].sort((a, b) => b.n - a.n).slice(0, N).map(g => `${g.id}(${g.n})`).join(' '));
