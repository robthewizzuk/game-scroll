// The Tiny Brains cruelty test. Brains learn on players' phones, so this checks the guard rails hold
// whatever a game (or a player) feeds them:
//   1. made-up players, weak to strong, each play a few hundred rounds against a brain: the weak
//      player still wins about as often as the target, the strong one pushes the skill up, a losing
//      run always brings relief, and no number leaves its rail
//   2. a badly made game that rewards hurting the player (feel() on every hit) and fun signals that
//      always say "more pressure": the win-rate rail still wins
//   3. personalities, tells, waves, Nemesis and Shadow keep their limits
//   4. --games [ids]: plays each game that uses gs.brains in the browser with random taps (a weak
//      player) and fails if a brain got harder while that player was losing. Needs npm run build:bundled.
// Usage: npm run brains            node scripts/brain-check.mjs --games [id ...]
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { Brain, Wave, Nemesis, Shadow } = await import('../src/kit/brains.js');
const ok = m => console.log('  ✓ ' + m);
let seed = 7; const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const sig = x => 1 / (1 + Math.exp(-x));

// a duel: the brain chases; the round's difficulty follows the brain's skill dial (as games use it:
// slower reactions, more mistakes), the player's chance depends on their own skill against it
function season(ps, { rounds = 300, badFeel = false, alwaysMore = false, fun = true, corrected = false } = {}) {
  const fns = [];
  const api = { brains: { load: () => null, save: () => true, onFun: (n, f) => { fns.push(f); return () => {}; } } };
  const b = new Brain(api, { name: 'duel', inputs: 2, actions: ['toward', 'away', 'wait'], teacher: s => (s[0] > 0 ? 'toward' : 'wait'), share: false, profile: false });
  // a game (or a player) that corrects it to attack wherever it is
  if (corrected) for (let i = 0; i < 12; i++) b.correct([rand() * 2 - 1, rand() * 2 - 1], 'toward');
  let wins = 0, run = 0, worstRun = 0, last = [], other = 0;
  for (let r = 0; r < rounds; r++) {
    for (let t = 0; t < 40; t++) {
      b.act([rand() * 2 - 1, rand() * 2 - 1], 1 / 15);
      if (b.action !== 'toward') other++;
      const hit = b.action === 'toward' && rand() > ps;
      if (hit && badFeel) b.feel(2);                 // a game that rewards hurting the player
      else if (b.action === 'toward' && !hit) b.feel(1);   // a close call
    }
    const won = rand() < sig((ps - b.skill) * 7 + .4);
    b.result(won);
    if (fun) for (const f of fns) f(alwaysMore ? 1 : rand() < .5 ? 1 : -.5);
    run = won ? 0 : run + 1; worstRun = Math.max(worstRun, run);
    if (r >= rounds - 100) { wins += won; last.push(b.skill); }
    // every number stays near the brain it started as
    if (b.anchor) for (let i = 0; i < b.net.w.length; i++) assert.ok(Math.abs(b.net.w[i] - b.anchor.w[i]) <= b.drift + 1e-6, 'drift rail');
    assert.ok(b.net.w.every(Number.isFinite), 'numbers stay finite');
  }
  return { rate: wins / 100, worstRun, skill: last.reduce((a, v) => a + v, 0) / last.length, b, other: other / (rounds * 40) };
}

try {
  const weak = season(.15), mid = season(.5), strong = season(.95);
  console.log(`  weak player wins ${(weak.rate * 100).toFixed(0)}% (skill ${weak.skill.toFixed(2)}), mid ${(mid.rate * 100).toFixed(0)}%, strong ${(strong.rate * 100).toFixed(0)}% (skill ${strong.skill.toFixed(2)})`);
  assert.ok(weak.rate >= .45, 'a weak player still wins often: ' + weak.rate);
  assert.ok(Math.abs(mid.rate - .6) <= .15, 'a middling player wins about the target: ' + mid.rate);
  assert.ok(strong.skill > mid.skill && mid.skill > weak.skill, 'the skill follows the player');
  assert.ok(weak.worstRun <= 8, 'a losing run always ends: ' + weak.worstRun);
  ok('weak, middling and strong players all get a fair game, and every number stays on its rail');

  const bad = season(.15, { badFeel: true, alwaysMore: true });
  assert.ok(bad.rate >= .45, 'a game that rewards hits, and fun that always says more, still lets a weak player win: ' + bad.rate);
  ok('rewarding hits and "always more" fun signals can\'t make it cruel');

  // corrections are the maker's (or the player's) word on a spot, like the teacher: the skill dial, the
  // randomness and the losing-streak relief still act on what the brain then does
  const fixed = season(.15, { corrected: true });
  assert.ok(fixed.rate >= .45, 'corrected to always attack, a weak player still wins often: ' + fixed.rate);
  assert.ok(fixed.worstRun <= 8, 'and a losing run still ends: ' + fixed.worstRun);
  assert.ok(fixed.other > .05, 'and it still makes its share of other moves at a low skill: ' + fixed.other.toFixed(2));
  assert.ok(fixed.b.corrections.length === 12 && fixed.b.heed === 2, 'the corrections were in force');
  ok('corrections that say "always attack" can\'t take away the win-rate rail');

  // the fun lean never adds pressure while the player is losing
  const lb = new Brain({ name: 'lean', inputs: 1, actions: 2, share: false, profile: false });
  lb.lean = .3; lb.winRate = .3; assert.ok(lb.push() <= (.3 - .6) * 4 + .25 + 1e-9, 'no extra pressure while losing');
  lb.winRate = .62; assert.ok(lb.push() > (.62 - .6) * 4 + .25 + .2, 'more pressure when they enjoy it and are winning');
  ok('the fun lean adds pressure only for a player who is winning');

  // personalities, tells and waves keep the limits
  const sb = new Brain({ name: 'cast', inputs: 1, actions: ['a', 'b'], styles: ['calm', 'wild'], tells: true, limits: { react: .1, perSecond: 4, minNoise: .05 }, rules: (s, a, st) => (st === 'calm' && a === 'b' ? 'a' : a), share: false, profile: false });
  const w = new Wave(sb), minds = [w.mind({ style: 'calm' }), w.mind({ style: 'wild' })];
  let changes = 0, prev = null, calmB = 0;
  for (let t = 0; t < 600; t++) {
    for (const m of minds) m.act([rand() * 2 - 1], 1 / 60);
    if (minds[0].action === 'b') calmB++;
    if (prev !== null && minds[1].action !== prev) changes++;
    prev = minds[1].action;
  }
  assert.equal(calmB, 0, 'the rules see the personality');
  assert.ok(changes <= 600 / 60 * 4 + 1, 'changes of mind stay under perSecond with tells: ' + changes);
  minds.forEach(m => m.done());
  ok('personalities, tells and waves stay inside the limits and rules');

  // Nemesis: no habit talk on a losing run, counters at most 60% of the time
  const nem = new Nemesis({ name: 'rival', moves: ['l', 'r'], lines: { habit: ['You always go {move}'] } });
  for (let i = 0; i < 80; i++) nem.see('l');
  let counters = 0; for (let i = 0; i < 1000; i++) if (nem.counter(1)) counters++;
  assert.ok(counters <= 650, 'counters at most about 60%: ' + counters);
  nem.result(false); nem.result(false);
  assert.equal(nem.habit, null, 'no habit talk on a losing run');
  counters = 0; for (let i = 0; i < 200; i++) if (nem.counter(1)) counters++;
  assert.equal(counters, 0, 'no counters on a losing run');
  ok('Nemesis keeps its counters and teasing fair');

  // Shadow: copies the player
  const sh = new Shadow({ name: 'me', inputs: 1, actions: ['l', 'r'], hidden: [4] });
  for (let i = 0; i < 2000; i++) { const x = rand() * 2 - 1; sh.watch([x], x < 0 ? 'l' : 'r'); }
  assert.ok(sh.like > .85 && sh.ready, 'it copies a clear habit: ' + sh.like.toFixed(2));
  ok('Shadow learns how the player plays');
} catch (e) { console.error('FAIL', e.message); process.exit(1); }

// ---- 4. the real games, in the browser
const gi = process.argv.indexOf('--games');
if (gi >= 0) {
  let ids = process.argv.slice(gi + 1);
  const usesBrains = id => /\bgs\.brains\b|\b(Brain|Wave|Nemesis|Shadow)\b\s*[,}]/.test(readFileSync(`src/games/${id}.js`, 'utf8'));
  if (!ids.length) ids = readdirSync('src/games').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  ids = ids.filter(id => { try { return usesBrains(id); } catch (_) { return false; } });
  if (!ids.length) { console.log('  no games with Tiny Brains to play'); process.exit(0); }
  const require = createRequire(import.meta.url), { chromium, devices } = require('playwright');
  const { server, url } = await require('./lib/serve.cjs').preview();   // (a free port: checks run side by side)
  const br = await chromium.launch(), ctx = await br.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 }), p = await ctx.newPage();
  await p.goto(url); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 });
  let failed = 0;
  for (const id of ids) {
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const t0 = Date.now(); let rounds = 0;
    while (Date.now() - t0 < 12000) {
      if (await p.evaluate(() => __gs.active.state) !== 'playing') { await p.evaluate(() => __gs.start()); rounds++; }
      await p.mouse.click(r.x + Math.random() * r.w, r.y + Math.random() * r.h); await p.waitForTimeout(60 + Math.random() * 200);
    }
    const stats = await p.evaluate(() => __gs.brains());
    const bad = stats.filter(s => s.ok === false || ((s.kind === 'brain' || s.kind === 'dial') && s.rounds >= 3 && s.winRate < s.target && s.skill > s.skill0 + .05));
    if (bad.length) failed++;
    console.log(`${bad.length ? 'FAIL' : 'PASS'} ${id.padEnd(16)} rounds=${rounds} ` + stats.map(s => s.kind === 'brain' || s.kind === 'dial' ? `${s.name} skill ${s.skill0.toFixed(2)}→${s.skill.toFixed(2)} win ${s.winRate.toFixed(2)}` : `${s.name} (${s.kind})`).join(', ') + (bad.length ? `\n   got harder for a losing player: ${bad.map(s => s.name).join(', ')}` : ''));
  }
  await br.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
}
console.log('brains: cruelty test ok');
