// Play and watch: plays a game the way a player's taps would, for a few seconds, and gives back what an AI tool
// (or a person) needs to see whether a change did what was asked: a strip of frames across the play, and numbers
// (score over time, rounds and how long they lasted, how it ended, frame times, errors). With knob changes it
// plays twice from the same start and the same taps, before and after, so the two can be put side by side.
//
//   node scripts/watch.mjs <id>                         one play: watch/<id>.png and the numbers
//   node scripts/watch.mjs <id> speed*1.3 lives=1       before and after those knob changes (the file is not changed)
//   --seconds 12  --frames 6  --taps 1.5 (a second)  --seed 1  --out <dir> (default node_modules/.cache/gs-watch)
//   --json                                              the numbers (and the pictures' paths) as JSON
//   npm run watch <id> ...                              the same
// The picture is the game's card as on a phone (360 wide for a Phone game), frames left to right in time.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChanges, readKnobs } from './lib/knobs.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), JSONOUT = argv.includes('--json');
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const SECONDS = +opt('seconds', 12), FRAMES = Math.max(2, Math.min(12, +opt('frames', 6))), TAPS = +opt('taps', 1.5), SEED = +opt('seed', 1);
const OUT = resolve(ROOT, opt('out', 'node_modules/.cache/gs-watch'));
const valued = new Set(['--seconds', '--frames', '--taps', '--seed', '--out']);
const args = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const id = args.shift()?.replace(/^.*[\\/]/, '').replace(/\.js$/, '');
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { console.log('Usage: node scripts/watch.mjs <game-id> [knob=value | knob*factor ...] [--seconds 12] [--frames 6] [--json]'); process.exit(1); }
const file = join(ROOT, 'src', 'games', id + '.js');
if (!existsSync(file)) { console.error(`src/games/${id}.js doesn't exist`); process.exit(1); }
const knobs = readKnobs(readFileSync(file, 'utf8'));
const { changes, bad } = parseChanges(knobs, args);
if (bad.length) { console.error(`can't change: ${bad.join(', ')} (node scripts/knobs.mjs ${id} lists the knobs)`); process.exit(1); }

const port = 4188 + Math.floor(Math.random() * 40);
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, mode: 'bundled', server: { port, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] || `http://localhost:${port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
await page.goto(url); await page.waitForFunction(() => window.__gs, null, { timeout: 180000 });
await page.addStyleTag({ content: '.lil-gui { display: none !important }' });   // the dev sliders: not in the picture, not tapped

// one play: the same seeded randomness and taps each time, so before and after differ only by the knobs
async function play(values) {
  await page.evaluate(id => __gs.only(id), id); await page.waitForTimeout(300);
  for (let i = 0; i < 240 && await page.evaluate(() => !__gs.active || __gs.active.loading); i++) await page.waitForTimeout(250);
  await page.evaluate(([id, values]) => __gs.setKnobs?.(id, values), [id, values]);
  await page.evaluate(seed => {   // Math.random from a seed (mulberry32), from the round's start
    let a = seed >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const W = window.__watch = { ft: [], last: 0 };
    const tick = now => { if (W.last) W.ft.push(now - W.last); W.last = now; W.raf = requestAnimationFrame(tick); }; W.raf = requestAnimationFrame(tick);
  }, SEED);
  await page.evaluate(() => __gs.start());
  const box = await page.evaluate(() => { const r = __gs.active.el.getBoundingClientRect(); const c = __gs.active.canvas.getBoundingClientRect(); return { el: [r.x, r.y, r.width, r.height], c: [c.x, c.y, c.width, c.height] }; });
  let r = SEED * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const t0 = Date.now(), shots = [], scores = [], rounds = [];
  let nextShot = 0, nextTap = 0, roundAt = 0, state = 'playing';
  const shotEvery = SECONDS * 1000 / (FRAMES - 1);
  while (true) {
    const t = Date.now() - t0;
    const s = await page.evaluate(() => ({ score: __gs.active.score || 0, state: __gs.active.state }));
    scores.push([+(t / 1000).toFixed(2), s.score]);
    if (s.state !== 'playing' && state === 'playing') { rounds.push({ secs: +((t - roundAt) / 1000).toFixed(1), score: s.score, ended: s.state }); }
    if (s.state !== 'playing') { await page.evaluate(() => __gs.start()).catch(() => {}); roundAt = Date.now() - t0; }
    state = s.state === 'playing' ? 'playing' : 'restarted';
    if (t >= nextShot) {
      const [x, y, w, h] = box.c;
      shots.push({ t: +(t / 1000).toFixed(1), score: s.score, png: (await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64') });
      nextShot += shotEvery; if (shots.length >= FRAMES) break;
    }
    if (TAPS > 0 && t >= nextTap) {
      const [x, y, w, h] = box.c, px = x + (.1 + .8 * rnd()) * w, py = y + (.15 + .75 * rnd()) * h;
      await page.mouse.move(px, py); await page.mouse.down(); await page.waitForTimeout(40 + 160 * rnd()); await page.mouse.up();
      nextTap = t + 1000 / TAPS * (.5 + rnd());
    }
    await page.waitForTimeout(60);
  }
  const end = Date.now() - t0;
  if (state === 'playing') rounds.push({ secs: +((end - roundAt) / 1000).toFixed(1), score: scores[scores.length - 1][1], ended: 'still playing' });
  const ft = await page.evaluate(() => { cancelAnimationFrame(__watch.raf); return __watch.ft.slice(5); });
  const q = f => { const a = [...ft].sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(1) : 0; };
  await page.evaluate(id => __gs.setKnobs?.(id, null), id);
  return { knobs: values, rounds, best: Math.max(0, ...scores.map(s => s[1])), scores: scores.filter((x, i) => i === 0 || Math.floor(x[0]) > Math.floor(scores[i - 1][0])), frameMs: { p50: q(.5), p95: q(.95) }, shots };
}

// the frames side by side in one picture, each with its time and score
async function strip(shots, title) {
  return page.evaluate(async ([shots, title]) => {
    const imgs = await Promise.all(shots.map(s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s.png; })));
    const w = imgs[0].width, h = imgs[0].height, gap = 6, top = 22, c = document.createElement('canvas');
    c.width = imgs.length * (w + gap) - gap; c.height = h + top * 2;
    const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#eee'; x.font = 'bold 14px sans-serif'; x.fillText(title, 6, 16);
    imgs.forEach((im, i) => { x.drawImage(im, i * (w + gap), top); x.fillStyle = '#ccc'; x.font = '13px sans-serif'; x.fillText(`${shots[i].t} s · score ${shots[i].score}`, i * (w + gap) + 4, top + h + 16); });
    return c.toDataURL('image/png').split(',')[1];
  }, [shots, title]);
}

mkdirSync(OUT, { recursive: true });
const runs = [], tag = Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(' ');
const plays = Object.keys(changes).length ? [['before', {}], ['after', changes]] : [['play', {}]];
for (const [name, values] of plays) {
  const r = await play(values);
  const png = await strip(r.shots, `${id} · ${name === 'after' ? tag : name === 'before' ? 'as the file has it' : 'as the file has it'} · seed ${SEED}`);
  const path = join(OUT, `${id}${name === 'play' ? '' : '-' + name}.png`); writeFileSync(path, Buffer.from(png, 'base64'));
  delete r.shots; runs.push({ name, picture: path, ...r });
}
await browser.close(); await server.close();

const out = { id, seconds: SECONDS, seed: SEED, changes, runs, errors: [...new Set(errors)].slice(0, 10) };
if (JSONOUT) { console.log(JSON.stringify(out, null, 2)); process.exit(out.errors.length ? 1 : 0); }
for (const r of runs) {
  const done = r.rounds.filter(x => x.ended !== 'still playing'), avg = done.length ? (done.reduce((s, x) => s + x.secs, 0) / done.length).toFixed(1) + ' s a finished round' : 'no round finished';
  console.log(`${r.name}${r.name === 'after' ? ' (' + tag + ')' : ''}: best ${r.best}, ${r.rounds.length} round${r.rounds.length === 1 ? '' : 's'} (${r.rounds.map(x => `${x.secs} s → ${x.score}${x.ended === 'over' ? '' : ' ' + x.ended}`).join(', ')}), ${avg}; frames ${r.frameMs.p50} ms (95%: ${r.frameMs.p95} ms)`);
  console.log(`  score over time: ${r.scores.map(([t, s]) => `${t}s:${s}`).join(' ')}`);
  console.log(`  picture: ${r.picture}`);
}
if (out.errors.length) { console.log('errors:'); for (const e of out.errors) console.log('  ' + e); process.exit(1); }
